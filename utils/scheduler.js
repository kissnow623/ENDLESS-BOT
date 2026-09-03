// utils/scheduler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, addDbStat, getCache } = require('./firebase');
const { config } = require('../config/constants');
const { 
    getTaiwanTime, editUserDM, buildTicketPayload, 
    bumpManagementMessages, syncManagementMessages, broadcastToManagementAreas, updateBoard 
} = require('./echoHelpers');
const { generateMemberLeaderboard, generateFriendLeaderboard } = require('./guildHelpers');
const { updateMarketData, getAllMarketItems } = require('./marketHelpers'); // 🌟 引入爬蟲與市場快取

let lastLeaderboardMonth = -1;
let lastMorningReportDay = -1;

const GUILD_CHANNEL_ID = '1539971422842261601'; // 晨間報表/巨鯨 發布目標：公會頻道
const FRIEND_CHANNEL_ID = '1544604459085070346'; // 晨間報表/巨鯨 發布目標：親友閒聊

function startScheduler(client) {
    // 🌟 機器人開機時先抓取一次最新物價
    updateMarketData();

    // 🌟 設定每 2 小時爬取一次更新 (減少對網站負擔)
    setInterval(() => {
        updateMarketData();
    }, 2 * 60 * 60 * 1000); 

    setInterval(async () => {
        const now = Date.now();
        const twTime = new Date(now + 8 * 3600000); // 轉換為台灣時間
        const { allReservations, appSettings } = getCache();

        // ------------------------------------------
        // A. 迴響系統：檢查訂單、鬧鐘、看板
        // ------------------------------------------
        try {
            const prices = appSettings['prices'] || {};
            const alarmLeadTime = appSettings['alarm']?.leadTime || 15;
            const vipRules = appSettings['vipRules'] || {};
            const opMode = appSettings['operationMode'] || {};
            
            for (let data of allReservations) {
                const timeDiff = data.timestamp - now;
                let needsSync = false;
                let needsBump = false;
                const displayChannel = data.channel ? data.channel : '-'; 

                if (data.status === 'pending' && data.timestamp < now) {
                    await db.collection('reservations').doc(data.id).update({ status: 'expired' });
                    addDbStat('write'); needsSync = true;
                    await editUserDM(client, data.discordId, data.userDmMsgId, { embeds: [new EmbedBuilder().setColor(0x808080).setTitle('⏳ 預約已過期失效').setDescription(`您的預約因超過開打時間未審核，已自動失效。\n**地點**：${data.location}\n**時間**：${data.date} ${data.time}`)], components: [] });
                }

                if (data.status === 'approved' && !data.reminded && timeDiff <= alarmLeadTime * 60 * 1000 && timeDiff > 0) {
                    await db.collection('reservations').doc(data.id).update({ reminded: true });
                    addDbStat('write'); needsBump = true; 

                    let finalPriceStr = `${prices[data.location] || '未設定'}萬`;
                    const rule = vipRules[data.location];
                    if (rule && rule.buy > 0) {
                        const userHistory = allReservations.filter(r => r.discordId === data.discordId && r.location === data.location && (r.status === 'approved' || r.status === 'completed' || r.status === 'free')).sort((a, b) => a.timestamp - b.timestamp);
                        const orderIndex = userHistory.findIndex(r => r.id === data.id);
                        if (orderIndex !== -1) {
                            const cycle = rule.buy + rule.free;
                            if ((orderIndex % cycle) >= rule.buy) finalPriceStr = `0萬 (💎 VIP滿件優惠)`;
                        }
                    }

                    const pre5MinTime = data.timestamp - 5 * 60 * 1000;
                    const twPre5Obj = new Date(pre5MinTime + 8 * 60 * 60 * 1000);
                    const pre5MinStr = String(twPre5Obj.getUTCHours()).padStart(2, '0') + ':' + String(twPre5Obj.getUTCMinutes()).padStart(2, '0');

                    try {
                        const user = await client.users.fetch(data.discordId);
                        await user.send(`🔔 **王團預約提醒鬧鐘**\n您預約的【${data.location}】將在 ${alarmLeadTime} 分鐘後（\`${data.date} ${data.time}\`）於 \`${displayChannel}\` 頻道施放迴響！\n*(請備妥 ${finalPriceStr} 楓幣給專員)*`);
                    } catch (e) {}

                    if (data.takenBy) {
                        try {
                            const adminUser = await client.users.fetch(data.takenBy);
                            await adminUser.send(`🔔 **王團預約提醒鬧鐘**\n<@${data.discordId}> 與您預約的【${data.location}】須於 ${alarmLeadTime} 分鐘後（\`${data.date} ${data.time}\`）於 \`${displayChannel}\` 頻道施放迴響！\n請記得於（\`${data.date} ${pre5MinStr}\`）上線並準備施放 **英雄的迴響** 喔！`);
                        } catch (e) {}
                    } else {
                        await broadcastToManagementAreas(client, { content: `🚨 **【緊急派單通知】**\n<@${data.discordId}> 預約的【${data.location}】將在 ${alarmLeadTime} 分鐘後出團，目前**尚未有專員接單**！\n請盡速點擊下方卡片的「✋ 我來接單」！` });
                    }
                }

                if (data.status === 'approved' && !data.buttonsRemoved && now >= data.timestamp) {
                    await editUserDM(client, data.discordId, data.userDmMsgId, { components: [] });
                    await db.collection('reservations').doc(data.id).update({ buttonsRemoved: true });
                    addDbStat('write');
                }

                if (data.status === 'approved' && data.reminded && !data.postChecked && now - data.timestamp >= 10 * 60 * 1000) {
                    let dmFailed = false;
                    if (data.takenBy) {
                        try {
                            const adminUser = await client.users.fetch(data.takenBy);
                            const row = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`complete_${data.id}`).setLabel('⭕ 順利完成').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId(`free_${data.id}`).setLabel('🎁 免單').setStyle(ButtonStyle.Primary),
                                new ButtonBuilder().setCustomId(`fail_${data.id}`).setLabel('❌ 未完成/取消').setStyle(ButtonStyle.Danger)
                            );
                            await adminUser.send({ embeds: [new EmbedBuilder().setColor(0x8A2BE2).setTitle('⏱️ 訂單結案確認').setDescription(`**玩家**：<@${data.discordId}>\n**地點**：${data.location}\n**頻道**：${displayChannel}\n**預約時間**：\`${data.date} ${data.time}\`\n\n*請問順利完成了嗎？*`)], components: [row] });
                        } catch (e) { dmFailed = true; }
                    }
                    await db.collection('reservations').doc(data.id).update({ postChecked: true, dmFailed });
                    addDbStat('write'); needsBump = true; data.postChecked = true; data.dmFailed = dmFailed;
                }

                if (data.status === 'approved' && data.postChecked && now - data.timestamp >= 12 * 60 * 60 * 1000) {
                    await db.collection('reservations').doc(data.id).update({ status: 'failed', closer: '系統自動結案' });
                    addDbStat('write'); needsSync = true; data.status = 'failed'; data.closer = '系統自動結案';
                }

                if (needsBump) {
                    const payload = buildTicketPayload(data.id, data);
                    const newRefs = await bumpManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);
                    await db.collection('reservations').doc(data.id).update({ ticketMsgs: newRefs }); addDbStat('write');
                } else if (needsSync) {
                    const payload = buildTicketPayload(data.id, data);
                    await syncManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);
                }
            }
            
            if (opMode.autoRefreshBoard === true) {
                updateBoard(client);
            }
        } catch (error) { console.error(error); }

        // ------------------------------------------
        // B. 公會系統：每月發布排行榜
        // ------------------------------------------
        try {
            const currentMonth = twTime.getUTCMonth();
            if (twTime.getUTCDate() === 1 && twTime.getUTCHours() === 0 && currentMonth !== lastLeaderboardMonth) {
                lastLeaderboardMonth = currentMonth;
                const guild = client.guilds.cache.get(config.guildId);
                if (guild) {
                    const targetChannel = await client.channels.fetch(config.channels.leaderboardChannel).catch(() => null);
                    if (targetChannel) {
                        const memberEmbed = await generateMemberLeaderboard();
                        const friendEmbed = await generateFriendLeaderboard();
                        if (memberEmbed) await targetChannel.send({ embeds: [memberEmbed] });
                        if (friendEmbed) await targetChannel.send({ embeds: [friendEmbed] });
                    }
                }
            }
        } catch (error) { console.error('❌ 自動發佈排行榜時發生錯誤：', error); }

        // ------------------------------------------
        // 📈 C. 市場系統：自動推播價格警報 (每分鐘檢查)
        // ------------------------------------------
        try {
            const allItems = getAllMarketItems() || [];
            if (allItems.length > 0) {
                const snapshot = await db.collection('priceAlerts').get();
                if (!snapshot.empty) {
                    snapshot.forEach(async doc => {
                        const alert = doc.data();
                        const marketItem = allItems.find(i => i.name === alert.itemName);
                        if (!marketItem) return;

                        // 將價格統一換算為「萬」來比對
                        const currentPriceInWan = (marketItem.rawPrice || 0) / 10000;
                        if (currentPriceInWan <= 0) return;

                        let triggered = false;
                        if (alert.condition === '低於' && currentPriceInWan <= alert.targetPrice) triggered = true;
                        if (alert.condition === '高於' && currentPriceInWan >= alert.targetPrice) triggered = true;

                        if (triggered) {
                            try {
                                const user = await client.users.fetch(alert.userId);
                                const embed = new EmbedBuilder()
                                    .setColor(0x10B981)
                                    .setTitle(`🚨 專屬觸價警報：【${alert.itemName}】`)
                                    .setDescription(`**您設定的條件已達成！**\n\n🎯 目標條件：${alert.condition} \`${alert.targetPrice} 萬\`\n💰 當前報價：\`${currentPriceInWan.toFixed(2)} 萬\`\n📉 走勢：${marketItem.trend}`)
                                    .setFooter({ text: '此筆單次警報已自動從資料庫刪除', iconURL: client.user.displayAvatarURL() });

                                await user.send({ embeds: [embed] });
                                // 觸發後自動刪除該筆設定
                                await db.collection('priceAlerts').doc(doc.id).delete();
                            } catch (e) {
                                console.error(`無法私訊用戶 ${alert.userId} 價格警報`, e);
                            }
                        }
                    });
                }
            }
        } catch (error) { console.error('❌ 檢查價格警報時發生錯誤：', error); }

        // ------------------------------------------
        // 🌅 D. 市場系統：每日晨間大盤報表 (每天 08:00)
        // ------------------------------------------
        try {
            const currentDay = twTime.getUTCDate();
            if (twTime.getUTCHours() === 8 && twTime.getUTCMinutes() === 0 && currentDay !== lastMorningReportDay) {
                lastMorningReportDay = currentDay;
                
                const allItems = getAllMarketItems() || [];
                let validItems = allItems.filter(i => i.rawTrend !== 0 && !isNaN(i.rawTrend)).sort((a, b) => b.rawTrend - a.rawTrend);
                
                if (validItems.length >= 6) {
                    let pText = validItems.slice(0, 3).map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📈 \`+${i.rawTrend.toFixed(2)}%\` (${i.price})`).join('\n');
                    let dText = validItems.slice(-3).reverse().map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📉 \`${i.rawTrend.toFixed(2)}%\` (${i.price})`).join('\n');

                    // 簡易計算市場總體氛圍
                    let totalTrend = 0;
                    validItems.forEach(i => totalTrend += i.rawTrend);
                    const avgTrend = totalTrend / validItems.length;
                    let marketMood = "⚖️ 震盪盤整區間";
                    if (avgTrend > 2) marketMood = "🔥 強勢偏多格局";
                    if (avgTrend < -2) marketMood = "🥶 弱勢空頭殺盤";

                    const embed = new EmbedBuilder()
                        .setColor(0xF59E0B)
                        .setTitle(`🌅 Artale 楓之股｜每日晨間大盤速報`)
                        .setDescription(`早安！為您總結過去 24H 內的市場行情。\n\n**🤖 總體市場氛圍**：\n> ${marketMood}`)
                        .addFields(
                            { name: '🔥 【強勢上漲 Top 3】', value: pText, inline: true },
                            { name: '🧊 【弱勢下跌 Top 3】', value: dText, inline: true }
                        )
                        .setFooter({ text: '投資有風險，請保持獨立判斷，審慎評估', iconURL: client.user.displayAvatarURL() });

                    const gChannel = await client.channels.fetch(GUILD_CHANNEL_ID).catch(() => null);
                    if (gChannel) await gChannel.send({ embeds: [embed] });
                    const fChannel = await client.channels.fetch(FRIEND_CHANNEL_ID).catch(() => null);
                    if (fChannel) await fChannel.send({ embeds: [embed] });
                }
            }
        } catch (error) { console.error('❌ 發送晨間報表時發生錯誤：', error); }

        // ------------------------------------------
        // 🐳 E. 市場系統：巨鯨大戶異動警報 (每小時的 0 分檢查)
        // ------------------------------------------
        try {
            // 每小時的 00 分執行 (可容許一點時間誤差，例如 0分)
            if (twTime.getUTCMinutes() === 0) {
                const allItems = getAllMarketItems() || [];
                // 找出振幅超過 15% 的異常標的
                const whales = allItems.filter(i => Math.abs(i.rawTrend) >= 15 && i.rawPrice > 0).sort((a, b) => Math.abs(b.rawTrend) - Math.abs(a.rawTrend));

                if (whales.length > 0) {
                    let desc = whales.map(i => `**${i.name}**\n└ ${i.rawTrend > 0 ? '🚀 【大戶掃貨暴漲】' : '🩸 【大戶倒貨暴跌】'} \`${i.trend}\` (現價: ${i.price})`).join('\n\n');
                    
                    const embed = new EmbedBuilder()
                        .setColor(0xEC4899)
                        .setTitle('🚨 巨鯨大戶異動警報 (過去24H變化)')
                        .setDescription(`系統偵測到市場出現異常波動標的：\n\n${desc}`)
                        .setFooter({ text: '※ 此為系統每小時自動背景偵測廣播', iconURL: client.user.displayAvatarURL() });

                    const gChannel = await client.channels.fetch(GUILD_CHANNEL_ID).catch(() => null);
                    if (gChannel) await gChannel.send({ embeds: [embed] });
                }
            }
        } catch (error) { console.error('❌ 檢查巨鯨大戶異動時發生錯誤：', error); }

    }, 60 * 1000); // 每 60 秒執行一次主排程迴圈
}

module.exports = { startScheduler };
