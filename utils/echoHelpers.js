// utils/echoHelpers.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const { db, addDbStat, getCache } = require('./firebase');

const publicBoardIntro = "🎉 **歡迎來到迴響預約中心！**\n為了出團順暢，請提早預約您的專屬迴響時段。\n👇 請點擊下方 **【📝 預約迴響時間】** 快速排單，系統將會為您登記並通知審核！";
const reserveBtnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_reserve').setLabel('📝 預約迴響時間').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_refresh_board').setLabel('🔄 手動刷新看板').setStyle(ButtonStyle.Secondary)
);

function getTaiwanTime() {
    const now = new Date();
    const twDate = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    return {
        yyyy: twDate.getUTCFullYear(), mm: String(twDate.getUTCMonth() + 1).padStart(2, '0'),
        dd: String(twDate.getUTCDate()).padStart(2, '0'), hh: String(twDate.getUTCHours()).padStart(2, '0'),
        min: String(twDate.getUTCMinutes()).padStart(2, '0')
    };
}

function formatDateTimeStr(dateStr, timeStr) {
    let parts = dateStr.replace(/\//g, '-').split('-');
    if (parts.length === 3) { parts[1] = parts[1].padStart(2, '0'); parts[2] = parts[2].padStart(2, '0'); dateStr = parts.join('-'); }
    if (timeStr.length === 4 && timeStr.indexOf(':') === 1) timeStr = '0' + timeStr;
    const dt = new Date(`${dateStr}T${timeStr}:00+08:00`);
    return { formattedDate: dateStr, formattedTime: timeStr, parsedDate: dt };
}

function isWeekend(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const day = new Date(Date.UTC(y, m - 1, d, 4, 0, 0)).getUTCDay();
    return day === 0 || day === 6;
}

function isTimeFrozen(timeStr, frozenSlots, dateStr) {
    if (!frozenSlots || frozenSlots.length === 0) return false;
    const [h, m] = timeStr.split(':').map(Number);
    const tMins = h * 60 + m;
    const isWknd = isWeekend(dateStr);
    for (const slot of frozenSlots) {
        const sType = slot.type || 'all'; 
        if (sType === 'weekday' && isWknd) continue;
        if (sType === 'weekend' && !isWknd) continue;
        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        const startMins = sh * 60 + sm; const endMins = eh * 60 + em;
        if (startMins <= endMins) { if (tMins >= startMins && tMins <= endMins) return true; } 
        else { if (tMins >= startMins || tMins <= endMins) return true; }
    }
    return false;
}

function getFrozenTextForDateStr(frozenSlots, dateStr) {
    if (!frozenSlots || frozenSlots.length === 0) return "無暫停時段";
    const isWknd = isWeekend(dateStr);
    let applicable = frozenSlots.filter(s => {
        const sType = s.type || 'all';
        if (sType === 'weekday' && isWknd) return false;
        if (sType === 'weekend' && !isWknd) return false;
        return true;
    });
    if (applicable.length === 0) return "無暫停時段";
    return applicable.map(s => {
        const [sh, sm] = s.start.split(':').map(Number);
        const [eh, em] = s.end.split(':').map(Number);
        const startMins = sh * 60 + sm; const endMins = eh * 60 + em;
        if (startMins > endMins) return `於 \`${s.start}\` 至明日 \`${s.end}\` 暫停系統預約`;
        else return `於 \`${s.start}\` 至 \`${s.end}\` 暫停系統預約`;
    }).join('、');
}

async function addViolation(discordId) {
    const userRef = db.collection('users').doc(discordId);
    const doc = await userRef.get();
    addDbStat('read');
    let points = 1; let bannedUntil = null;
    if (doc.exists) points = (doc.data().violationPoints || 0) + 1;
    if (points >= 3) { bannedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000; points = 0; }
    await userRef.set({ violationPoints: points, bannedUntil: bannedUntil }, { merge: true });
    addDbStat('write');
    return { points, bannedUntil };
}

async function checkIsAgent(userId, member) {
    if (member && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const doc = await db.collection('users').doc(userId).get();
    addDbStat('read');
    return (doc.exists && doc.data().isAgent === true);
}

async function broadcastToManagementAreas(client, payload) {
    const { appSettings } = getCache();
    const doc = appSettings['managementArea'];
    if (!doc) return [];
    const channels = doc.channels || []; let sentMsgs = [];
    for (const chId of channels) {
        const dChannel = await client.channels.fetch(chId).catch(() => null);
        if (dChannel) {
            const msg = await dChannel.send(payload).catch(() => null);
            if (msg) sentMsgs.push({ channelId: chId, messageId: msg.id });
        }
    }
    return sentMsgs;
}

async function syncManagementMessages(client, msgRefs, newEmbed, newComponents = []) {
    if (!msgRefs || !Array.isArray(msgRefs)) return;
    for (const m of msgRefs) {
        try {
            const ch = await client.channels.fetch(m.channelId).catch(() => null);
            if (ch) {
                const msg = await ch.messages.fetch(m.messageId).catch(() => null);
                if (msg) await msg.edit({ embeds: [newEmbed], components: newComponents });
            }
        } catch (e) {}
    }
}

async function bumpManagementMessages(client, msgRefs, newEmbed, newComponents = []) {
    if (!msgRefs || !Array.isArray(msgRefs)) return [];
    let newRefs = [];
    for (const m of msgRefs) {
        try {
            const ch = await client.channels.fetch(m.channelId).catch(() => null);
            if (ch) {
                const oldMsg = await ch.messages.fetch(m.messageId).catch(() => null);
                if (oldMsg) await oldMsg.delete().catch(() => null); 
                const newMsg = await ch.send({ embeds: [newEmbed], components: newComponents }); 
                newRefs.push({ channelId: ch.id, messageId: newMsg.id });
            }
        } catch (e) {}
    }
    return newRefs;
}

async function editUserDM(client, discordId, messageId, payload) {
    if (!messageId) return;
    try {
        const user = await client.users.fetch(discordId);
        const dmChannel = await user.createDM();
        const msg = await dmChannel.messages.fetch(messageId);
        if (msg) await msg.edit(payload);
    } catch (e) {}
}

function buildTicketPayload(docId, data) {
    let embed = new EmbedBuilder(); let components = []; let row = new ActionRowBuilder();
    const playerNameDisplay = data.discordName ? ` (${data.discordName})` : '';
    const baseDesc = `**單號**：\`${docId}\`\n**玩家**：<@${data.discordId}>${playerNameDisplay} (遊戲ID: ${data.gameId})\n**地點**：${data.location}\n**頻道**：${data.channel || '-'}\n**預約時間**：\`${data.date} ${data.time}\`\n**備註**：${data.notes || '無'}\n\n**📋 訂單時間線**：\n`;
    let timeline = '';

    if (data.status === 'pending') {
        embed.setColor(0xFFA500).setTitle('🚨 新訂單待審核'); timeline += `> 🟡 審核等待中...\n`;
        row.addComponents(
            new ButtonBuilder().setCustomId(`approve_${docId}`).setLabel('✅ 審核通過').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${docId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger)
        );
    } else if (data.status === 'rejected') {
        embed.setColor(0xFF0000).setTitle('❌ 訂單已拒絕'); timeline += `> 🔴 已拒絕 (審核：<@${data.reviewer}>)\n`;
        if (data.rejectReason) timeline += `> 📝 原因：${data.rejectReason}\n`;
    } else if (data.status === 'expired') {
        embed.setColor(0x808080).setTitle('⏳ 申請已過期失效'); timeline += `> ⚪ 未審核，開打時間已過自動失效\n`;
    } else if (data.status === 'canceled') {
        embed.setColor(0x808080).setTitle('🚫 玩家已自行取消'); timeline += `> ⚪ 玩家已取消\n`;
    } else {
        timeline += `> ✅ 審核通過 (審核：<@${data.reviewer || '管理員'}>)\n`;
        if (data.status === 'approved') {
            if (!data.reminded) {
                embed.setColor(0x00FF00).setTitle('🟢 訂單已排程');
                if (!data.takenBy) {
                    timeline += `> 🟡 審核通過，開放專員提前接單！\n> ⏳ 等待鬧鐘發送...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`takeOrder_${docId}`).setLabel('✋ 我來接單').setStyle(ButtonStyle.Primary));
                } else {
                    timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n> ⏳ 等待鬧鐘發送...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`release_${docId}`).setLabel('🔄 釋出轉單').setStyle(ButtonStyle.Secondary));
                }
            } else if (data.reminded && !data.postChecked) {
                if (!data.takenBy) {
                    embed.setColor(0xFFA500).setTitle('🚨 準備出團 (等待接單)'); timeline += `> 🟡 鬧鐘已響，等待專員接單...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`takeOrder_${docId}`).setLabel('✋ 我來接單').setStyle(ButtonStyle.Primary));
                } else {
                    embed.setColor(0x00FF00).setTitle('🟢 專員已接單'); timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n> ⏳ 等待出團與結案...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`release_${docId}`).setLabel('🔄 釋出轉單').setStyle(ButtonStyle.Secondary));
                }
            } else if (data.postChecked) {
                embed.setColor(0x8A2BE2).setTitle('🟣 等待結案回報');
                if (data.takenBy) {
                    timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n> 🟡 等待專員回報結案...\n`;
                    if (data.dmFailed) { timeline += `> ⚠️ 無法私訊專員，請在此直接結案！\n`; } else { timeline += `> 💡 已發送結案私訊給專員。若專員無回應，管理員可在此代為結案。\n`; }
                    row.addComponents(new ButtonBuilder().setCustomId(`complete_${docId}`).setLabel('⭕ 順利完成').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`free_${docId}`).setLabel('🎁 免單').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`fail_${docId}`).setLabel('❌ 未完成/取消').setStyle(ButtonStyle.Danger));
                } else {
                    timeline += `> 🔴 警告：此單無人接手！\n> 🟡 等待任何專員幫忙補結案...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`complete_${docId}`).setLabel('⭕ 順利完成').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`free_${docId}`).setLabel('🎁 免單').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`fail_${docId}`).setLabel('❌ 未完成/取消').setStyle(ButtonStyle.Danger));
                }
            }
        } else if (data.status === 'completed') {
            embed.setColor(0x00FF00).setTitle('⭕ 訂單已結案 (順利完成)'); if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`; timeline += `> ⭕ 順利完成 (確認：<@${data.closer || data.takenBy}>)\n`;
        } else if (data.status === 'free') {
            embed.setColor(0xFFD700).setTitle('🎁 訂單已結案 (免單)'); if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`; timeline += `> 🎁 免單 (確認：<@${data.closer || data.takenBy}>)\n`;
        } else if (data.status === 'failed') {
            embed.setColor(0xFF0000).setTitle('❌ 訂單已結案 (未完成/取消)'); if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`; timeline += `> ❌ 未完成/取消 (確認：<@${data.closer || data.takenBy || '系統'}>)\n`;
        }
    }
    embed.setDescription(baseDesc + timeline); if (row.components.length > 0) components.push(row);
    return { embeds: [embed], components };
}

function calculateOrderPrice(order) {
    const { appSettings, allReservations } = getCache();
    const prices = appSettings['prices'] || {};
    const vipRules = appSettings['vipRules'] || {};
    if (order.status === 'free') return 0;
    if (order.status !== 'completed') return 0;
    let price = prices[order.location] || 0;
    const rule = vipRules[order.location];
    if (rule && rule.buy > 0) {
        const userHistory = allReservations
            .filter(r => r.discordId === order.discordId && r.location === order.location && (r.status === 'approved' || r.status === 'completed' || r.status === 'free'))
            .sort((a, b) => a.timestamp - b.timestamp);
        const orderIndex = userHistory.findIndex(r => r.id === order.id);
        if (orderIndex !== -1) {
            const cycle = rule.buy + rule.free;
            if ((orderIndex % cycle) >= rule.buy) price = 0; 
        }
    }
    return price;
}

function buildAgentStatMessage(agentId) {
    const { allReservations } = getCache();
    const agentIds = [...new Set(allReservations.filter(r => r.takenBy && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')).map(r => r.takenBy))];
    const currentIndex = agentIds.indexOf(agentId);
    const tw = getTaiwanTime(); const currentMonthPrefix = `${tw.yyyy}-${tw.mm}`;
    let total = 0, month = 0, totalFree = 0, monthFree = 0, failed = 0, totalRevenue = 0, monthRevenue = 0;

    allReservations.forEach(r => {
        if (r.takenBy === agentId && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')) {
            const isCurrentMonth = r.date.startsWith(currentMonthPrefix);
            if (r.status === 'completed') {
                total++; if (isCurrentMonth) month++;
                const price = calculateOrderPrice(r);
                totalRevenue += price; if (isCurrentMonth) monthRevenue += price;
            } else if (r.status === 'free') { totalFree++; if (isCurrentMonth) monthFree++; } 
            else if (r.status === 'failed') { failed++; }
        }
    });

    const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(`📊 迴響專員接單績效 (${currentIndex + 1} / ${agentIds.length})`)
        .setDescription(`**專員**：<@${agentId}>\n> 本月完成：\`${month}\` 次 (總計 \`${total}\`)\n> 本月免單招待：\`${monthFree}\` 次 (總計 \`${totalFree}\`)\n> 失敗/取消數：\`${failed}\` 次\n>\n> 💰 本月收益：\`${monthRevenue}\` 萬\n> 💰 總計收益：\`${totalRevenue}\` 萬`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`agent_nav_prev_${agentId}`).setLabel('◀ 上一位').setStyle(ButtonStyle.Secondary).setDisabled(currentIndex <= 0),
        new ButtonBuilder().setCustomId(`agent_details_${agentId}_1`).setLabel('📋 查看訂單明細').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`agent_nav_next_${agentId}`).setLabel('下一位 ▶').setStyle(ButtonStyle.Secondary).setDisabled(currentIndex >= agentIds.length - 1 || currentIndex === -1)
    );
    return { embed, components: [row] };
}

function buildAgentDetailsMessage(agentId, page) {
    const { allReservations } = getCache();
    const orders = allReservations.filter(r => r.takenBy === agentId && (r.status === 'completed' || r.status === 'free' || r.status === 'failed')).sort((a, b) => b.timestamp - a.timestamp);
    const ITEMS_PER_PAGE = 8; const totalPages = Math.max(1, Math.ceil(orders.length / ITEMS_PER_PAGE)); const p = Math.max(1, Math.min(page, totalPages));
    const startIdx = (p - 1) * ITEMS_PER_PAGE; const pageItems = orders.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    let desc = `**專員**：<@${agentId}> 的歷史訂單紀錄\n\n`;
    if (pageItems.length === 0) { desc += "尚無訂單明細。"; } else {
        pageItems.forEach(o => {
            let statusIcon = '⭕'; let priceStr = '';
            if (o.status === 'completed') { const pAmt = calculateOrderPrice(o); priceStr = pAmt === 0 ? `(💎 VIP免單)` : `(${pAmt}萬)`; } 
            else if (o.status === 'free') { statusIcon = '🎁'; priceStr = `(招待)`; } 
            else if (o.status === 'failed') { statusIcon = '❌'; priceStr = `(失敗/取消)`; }
            const pName = o.discordName ? o.discordName.substring(0, 8) : '未知';
            desc += `\`${o.date} ${o.time}\` ${statusIcon} **${o.location}** ${priceStr}\n> 👤: ${pName} | 單號: ${o.id.substring(0,6)}\n`;
        });
    }

    const embed = new EmbedBuilder().setColor(0x0099FF).setTitle(`📋 訂單明細 (第 ${p} / ${totalPages} 頁)`).setDescription(desc);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`agent_details_${agentId}_${p - 1}`).setLabel('◀ 上一頁').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
        new ButtonBuilder().setCustomId(`agent_nav_curr_${agentId}`).setLabel('↩ 返回統計摘要').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`agent_details_${agentId}_${p + 1}`).setLabel('下一頁 ▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages)
    );
    return { embed, components: [row] };
}

function generateScheduleEmbed(reservations, isAdmin = false, page = 1, isCommand = false) {
    const { appSettings } = getCache();
    const now = Date.now(); const tw = getTaiwanTime(); const todayStr = `${tw.yyyy}-${tw.mm}-${tw.dd}`; const currentMonthPrefix = `${tw.yyyy}-${tw.mm}`;
    const stats = {};
    reservations.forEach(r => {
        if (r.status !== 'approved' && r.status !== 'completed' && r.status !== 'free') return;
        if (!stats[r.discordId]) stats[r.discordId] = { total: 0, month: 0 };
        stats[r.discordId].total += 1;
        if (r.date.startsWith(currentMonthPrefix)) stats[r.discordId].month += 1;
    });

    let futureRes = reservations.filter(res => res.status === 'approved' && res.timestamp >= now).sort((a, b) => a.timestamp - b.timestamp);
    if (!isAdmin) futureRes = futureRes.filter(res => res.date === todayStr);

    const ITEMS_PER_PAGE = isCommand ? 8 : 30; 
    const totalItems = futureRes.length; const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE)); const p = Math.max(1, Math.min(page, totalPages));
    let scheduleText = '';

    if (totalItems === 0) { scheduleText += isAdmin ? '目前沒有任何已通過的未來預約喔！\n\n' : '本日目前沒有已通過的預約喔！\n\n';
    } else {
        const startIdx = (p - 1) * ITEMS_PER_PAGE; const pageItems = futureRes.slice(startIdx, startIdx + ITEMS_PER_PAGE); const grouped = {};
        pageItems.forEach(res => { if (!grouped[res.date]) grouped[res.date] = []; grouped[res.date].push(res); });

        for (const [date, items] of Object.entries(grouped)) {
            scheduleText += `**📅 ${date}**\n\n`;
            items.forEach((res) => {
                const noteText = res.notes && res.notes !== '無' ? ` | 備註：${res.notes}` : '';
                let channelDisplay = ''; let playerInfo = '';
                const playerNameDisplay = res.discordName ? ` (${res.discordName})` : '';
                if (isAdmin) {
                    const userStats = stats[res.discordId] || { month: 0, total: 0 };
                    channelDisplay = ` | 頻道：${res.channel || '當日決定'}`;
                    playerInfo = `ID：${res.gameId} | <@${res.discordId}>${playerNameDisplay} | 本月：${userStats.month}次 | 總：${userStats.total}次`;
                } else { channelDisplay = ''; playerInfo = `👤 🔒 匿名玩家`; }
                scheduleText += `🕒 \`${res.time}\` ── **【${res.location}】**\n └─ ${playerInfo}${channelDisplay}${noteText}\n\n`;
            });
        }
        if (!isCommand && totalItems > ITEMS_PER_PAGE) scheduleText += `\n⚠️ **由於篇幅限制，看板僅顯示近期 ${ITEMS_PER_PAGE} 筆預約。**\n*(管理員可使用 \`/查詢預約\` 指令進行分頁檢視)*\n\n`;
    }

    if (!isCommand) {
        const opMode = appSettings['operationMode'] || {}; const fSlots = opMode.frozenSlots || [];
        if (fSlots.length > 0 && !isAdmin) {
            const todayFrozenText = getFrozenTextForDateStr(fSlots, todayStr);
            if (todayFrozenText !== "無暫停時段") scheduleText += `\n⚠️ **【今日系統預約限制】**\n${todayFrozenText}\n\n`;
        }
        scheduleText += `🔄 **最後刷新時間**：\`${tw.yyyy}-${tw.mm}-${tw.dd} ${tw.hh}:${tw.min}\``;
    }

    const embed = new EmbedBuilder().setColor(isAdmin ? 0xFF0000 : 0x0099FF).setDescription(scheduleText);
    if (isAdmin) embed.setTitle(isCommand ? `👑【管理員】王團自動排班表 (第 ${p}/${totalPages} 頁)` : '👑【管理員】王團自動排班表');
    return { embed, totalPages, currentPage: p };
}

async function updateBoard(client) {
    try {
        const { allReservations, appSettings } = getCache();
        const reservations = allReservations;
        const boardContent = getBoardContentWithTime();

        const pubDoc = appSettings['publicBoards'] || {}; let pubList = pubDoc.list || []; let validPubList = []; let pubChanged = false;
        for (let b of pubList) {
            try {
                const ch = await client.channels.fetch(b.channelId).catch(() => null);
                if (ch) {
                    const msg = await ch.messages.fetch(b.messageId).catch(() => null);
                    if (msg) {
                        const { embed } = generateScheduleEmbed(reservations, false, 1, false);
                        await msg.edit({ content: boardContent, embeds: [embed], components: [reserveBtnRow] });
                        validPubList.push(b);
                    } else {
                        const { embed } = generateScheduleEmbed(reservations, false, 1, false);
                        const newMsg = await ch.send({ content: boardContent, embeds: [embed], components: [reserveBtnRow] });
                        validPubList.push({ channelId: ch.id, messageId: newMsg.id }); pubChanged = true;
                    }
                } else pubChanged = true;
            } catch (e) { pubChanged = true; }
        }
        if (pubChanged || pubList.length !== validPubList.length) { await db.collection('settings').doc('publicBoards').set({ list: validPubList }); addDbStat('write'); }

        const admDoc = appSettings['adminBoards'] || {}; let admList = admDoc.list || []; let validAdmList = []; let admChanged = false;
        for (let b of admList) {
            try {
                const ch = await client.channels.fetch(b.channelId).catch(() => null);
                if (ch) {
                    const msg = await ch.messages.fetch(b.messageId).catch(() => null);
                    if (msg) {
                        const { embed } = generateScheduleEmbed(reservations, true, 1, false);
                        await msg.edit({ content: null, embeds: [embed] }); validAdmList.push(b);
                    } else {
                        const { embed } = generateScheduleEmbed(reservations, true, 1, false);
                        const newMsg = await ch.send({ embeds: [embed] });
                        validAdmList.push({ channelId: ch.id, messageId: newMsg.id }); admChanged = true;
                    }
                } else admChanged = true;
            } catch (e) { admChanged = true; }
        }
        if (admChanged || admList.length !== validAdmList.length) { await db.collection('settings').doc('adminBoards').set({ list: validAdmList }); addDbStat('write'); }
    } catch (e) { console.log('看板更新失敗', e); }
}

async function processRejection(client, docId, reason, reviewerId, interaction) {
    const { allReservations } = getCache();
    const docRef = db.collection('reservations').doc(docId);
    let data = allReservations.find(r => r.id === docId);
    if (!data) return interaction.editReply({ content: '❌ 訂單已不存在', components: [] });
    if (data.status !== 'pending') return interaction.editReply({ content: '❌ 訂單已被處理過囉', components: [] });

    data.status = 'rejected'; data.reviewer = reviewerId; data.rejectReason = reason;
    await docRef.update({ status: 'rejected', reviewer: reviewerId, rejectReason: reason }); addDbStat('write');

    const payload = buildTicketPayload(docId, data);
    await syncManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);

    const dmEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle('🚫 預約未通過')
        .setDescription(`管理員退回了您的申請。\n**地點**：${data.location}\n**時間**：${data.date} ${data.time}\n**原因**：${reason}`);
    await editUserDM(client, data.discordId, data.userDmMsgId, { embeds: [dmEmbed], components: [] });

    await interaction.editReply({ content: '✅ 訂單已拒絕，並已通知玩家。', components: [] });
}

module.exports = {
    getTaiwanTime, formatDateTimeStr, isTimeFrozen, getFrozenTextForDateStr, addViolation, checkIsAgent,
    broadcastToManagementAreas, syncManagementMessages, bumpManagementMessages, editUserDM,
    buildTicketPayload, buildAgentStatMessage, buildAgentDetailsMessage, generateScheduleEmbed, updateBoard, processRejection
};
