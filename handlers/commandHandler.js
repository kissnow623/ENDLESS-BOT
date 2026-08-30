// handlers/commandHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { db, addDbStat, getCache } = require('../utils/firebase');
const { config, getAgentRoleId } = require('../config/constants');
const { checkAndThankBooster, generateMemberLeaderboard, generateFriendLeaderboard, updateNickname } = require('../utils/guildHelpers');
const { getTaiwanTime, updateBoard, checkIsAgent, buildAgentStatMessage, generateScheduleEmbed, broadcastToManagementAreas } = require('../utils/echoHelpers');

async function handleCommand(interaction, client) {
    const cmd = interaction.commandName;
    const { allReservations, appSettings } = getCache();
    
    const isOwner = interaction.user.id === interaction.guild?.ownerId; 
    const hasAdminRole = interaction.member?.roles?.cache?.hasAny(...config.roles.adminRoles); 
    const hasAdminPerm = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator); 

    // ------------------------------------------
    // 💎 【公會系統指令區】
    // ------------------------------------------
    if (['解鎖權限', '發布小指南', '查詢目前公會成員', '查詢目前親友團', '同步更名', '檢查補發感謝', '測試感謝卡', '重播感謝卡', '清除資料', '清除訊息', '星光紅毯設定'].includes(cmd)) {
        
        if (cmd === '星光紅毯設定') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (!interaction.member.premiumSince) {
                return interaction.editReply('❌ 很抱歉，這個酷炫的功能是 **Server Booster (伺服器加成者)** 專屬的特權喔！趕快贊助伺服器解鎖吧！✨');
            }
            const status = interaction.options.getString('狀態');
            const optOut = status === 'off';
            await db.collection('boosterSettings').doc(interaction.user.id).set({ optOut: optOut }, { merge: true });
            if (optOut) return interaction.editReply('🔕 設定成功！已為您關閉每日首次出場的浮誇歡迎。您現在可以低調地潛水了！🥷');
            return interaction.editReply('✨ 設定成功！已為您開啟浮誇紅毯模式！明天在綜合大廳發言時就會為您鋪上紅毯囉！🌹');
        }

        if (!isOwner && !hasAdminRole && !hasAdminPerm) return interaction.reply({ content: '❌ 很抱歉，此指令僅限幹部使用。', flags: MessageFlags.Ephemeral });

        if (cmd === '測試感謝卡') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const boostChannel = await interaction.guild.channels.fetch(config.channels.boostThanks).catch(() => null);
            await checkAndThankBooster(interaction.member, boostChannel, 'test', interaction);
            return;
        }

        if (cmd === '重播感謝卡') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
            const targetUser = interaction.options.getUser('玩家');
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) return interaction.editReply('❌ 找不到該成員，他可能已經離開伺服器了。');
            if (!targetMember.premiumSince) return interaction.editReply(`❌ <@${targetUser.id}> 目前**不是**伺服器加成者喔！無法發送感謝卡。`);
            const boostChannel = await interaction.guild.channels.fetch(config.channels.boostThanks).catch(() => null);
            if (!boostChannel) return interaction.editReply('❌ 找不到感謝卡發佈頻道，請檢查設定。');
            const success = await checkAndThankBooster(targetMember, boostChannel, 'replay', interaction);
            if (success) return interaction.editReply(`✅ **大成功！** 已經在 <#${config.channels.boostThanks}> 重新為 <@${targetUser.id}> 舉辦盛大的感謝典禮囉！🎉`);
            return interaction.editReply('❌ 重播失敗，發生了未知的錯誤。');
        }

        if (cmd === '檢查補發感謝') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await interaction.editReply('⏳ 正在掃描伺服器加成者名單，請稍候...');
            try {
                const boostChannel = await interaction.guild.channels.fetch(config.channels.boostThanks).catch(() => null);
                if (!boostChannel) return interaction.editReply('❌ 找不到感謝卡發布頻道！');
                let count = 0;
                const members = await interaction.guild.members.fetch();
                for (const [id, member] of members) {
                    if (member.premiumSince) {
                        const wasThanked = await checkAndThankBooster(member, boostChannel, 'normal');
                        if (wasThanked) count++;
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
                return interaction.editReply(`✅ **掃描補發完畢！**\n✨ 本次總共為 **${count}** 位錯過的乾爹乾媽補發了精美感謝卡片！🎉`);
            } catch (err) { return interaction.editReply('❌ 執行掃描時發生錯誤。'); }
        }

        if (cmd === '解鎖權限') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_member').setLabel('公會成員').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_friend').setLabel('親友團').setStyle(ButtonStyle.Success)
            );
            return interaction.reply({ content: "🎈 **叮咚！歡迎光臨 ENDLESS！** 🎈\n終於等到你啦！為了讓你能在伺服器裡暢通無阻地跟大家聊天，請先偷偷告訴我們，你是我們的……？\n👇（點擊下方按鈕選擇身分唷！）", components: [row] });
        }

        if (cmd === '發布小指南') {
            const guideEmbed = new EmbedBuilder()
                .setTitle('📌 【 ENDLESS 實用功能小指南 】 📌')
                .setDescription('🔸 **更新資料**：更改你的遊戲名稱或最新等級！\n🔸 **新增職業**：新增額外的職業，並配發身份組，更新名稱識別。\n🔸 **刪除職業**：不小心點錯分身職業，或是不玩該職業時可以一鍵刪除！\n\n👇 **請點擊下方選單，選擇您要使用的服務：**')
                .setColor('#FFB6C1');
            const actionSelect = new StringSelectMenuBuilder().setCustomId('select_user_action').setPlaceholder('請選擇功能...').addOptions([
                { label: '更新資料', description: '更改遊戲名稱或最新等級', value: 'action_update', emoji: '📝' },
                { label: '新增職業', description: '新增雙修/其他職業分身', value: 'action_add_class', emoji: '➕' },
                { label: '刪除職業', description: '移除不玩的職業身分', value: 'action_remove_class', emoji: '🗑️' }
            ]);
            await interaction.reply({ content: '✅ 小指南發布成功！', flags: MessageFlags.Ephemeral });
            return interaction.channel.send({ embeds: [guideEmbed], components: [new ActionRowBuilder().addComponents(actionSelect)] });
        }

        if (cmd === '同步更名') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await interaction.editReply('⏳ 開始同步伺服器成員暱稱，如果人數較多這會需要幾十秒的時間，請稍候...');
            try {
                const snapshot = await db.collection('members').get();
                if (snapshot.empty) return interaction.editReply('❌ 目前資料庫中沒有成員紀錄。');
                let successCount = 0, failCount = 0;
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    try {
                        const member = await interaction.guild.members.fetch(data.discordId).catch(() => null);
                        if (member) {
                            const classes = data.gameClasses || (data.gameClass ? [data.gameClass] : []);
                            await updateNickname(member, data.gameName, data.role, classes);
                            successCount++;
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } else { failCount++; }
                    } catch (err) { failCount++; }
                }
                return interaction.followUp({ content: `✅ **同步更名作業已完成！**\n✨ 成功更新：**${successCount}** 人\n⚠️ 無法更新/已離開：**${failCount}** 人`, flags: MessageFlags.Ephemeral });
            } catch (error) { return interaction.editReply('❌ 執行同步更名時發生資料庫錯誤。'); }
        }

        if (cmd === '查詢目前公會成員') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
            const embed = await generateMemberLeaderboard();
            return interaction.editReply(embed && typeof embed !== 'string' ? { embeds: [embed] } : embed || '❌ 查詢錯誤。');
        }

        if (cmd === '查詢目前親友團') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
            const embed = await generateFriendLeaderboard();
            return interaction.editReply(embed && typeof embed !== 'string' ? { embeds: [embed] } : embed || '❌ 查詢錯誤。');
        }

        if (cmd === '清除資料') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const targetUser = interaction.options.getUser('目標');
            if (!targetUser) return interaction.editReply('❌ 找不到該成員。');
            try {
                await db.collection('members').doc(targetUser.id).delete();
                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (member) {
                    const rolesToRemove = [config.roles.guildMember, config.roles.familyFriend, ...Object.values(config.roles.classes)];
                    await member.roles.remove(rolesToRemove).catch(() => {});
                }
                return interaction.editReply(`✅ **重置成功！**\n已完全清除 <@${targetUser.id}> 的紀錄與身分組。`);
            } catch (err) { return interaction.editReply('❌ 清除資料失敗。'); }
        }

        if (cmd === '清除訊息') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const amount = interaction.options.getInteger('數量');
            try {
                const deleted = await interaction.channel.bulkDelete(amount, true);
                return interaction.editReply(`✅ 成功清除了 **${deleted.size}** 則訊息！`);
            } catch (err) { return interaction.editReply('❌ 清除失敗，請確認訊息是否超過 14 天。'); }
        }
    }

    // ------------------------------------------
    // 👑 【迴響預約系統指令區】
    // ------------------------------------------
    if (['預約', '我的紀錄', '接單統計', '查詢預約', '刷新看板', '註冊迴響專員', '指定迴響專員', '刪除迴響專員', '清理訊息', '設定公開看板', '設定管理看板', '迴響管理區', '價格', '迴響鬧鐘', '優惠設定', '系統狀態', '營運設定', '玩家管理', '刪除訂單'].includes(cmd)) {
        
        if (cmd === '預約') {
            const location = interaction.options.getString('地點');
            const tw = getTaiwanTime();
            const modal = new ModalBuilder().setCustomId(`reserve_${location}_1`).setTitle(`📝 預約：${location}`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel("日期 (可修改)").setStyle(TextInputStyle.Short).setValue(`${tw.yyyy}-${tw.mm}-${tw.dd}`).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time').setLabel("時間 (24小時制)").setStyle(TextInputStyle.Short).setValue(`${tw.hh}:${tw.min}`).setMaxLength(5).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gameId').setLabel("預約者遊戲ID").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel("幸運頻道").setStyle(TextInputStyle.Short).setRequired(false)), 
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel("備註").setStyle(TextInputStyle.Short).setRequired(false))
            );
            return interaction.showModal(modal);
        }

        await interaction.deferReply({ ephemeral: true });

        if (cmd === '系統狀態') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const { getDbStats } = require('../utils/firebase');
            const stats = getDbStats();
            const uptimeHours = (process.uptime() / 3600).toFixed(2);
            const embed = new EmbedBuilder().setColor(0x3498db).setTitle('🤖 系統運作與資料庫狀態')
                .setDescription(`此數據為機器人自本日 00:00 以來的「估算」用量。\n*(註：若機器人重啟，此數據會歸零重新計算)*`)
                .addFields({ name: '📖 本日讀取 (Reads)', value: `約 ${stats.reads} 次`, inline: true }, { name: '✍️ 本日寫入 (Writes)', value: `約 ${stats.writes} 次`, inline: true }, { name: '🕒 機器人已持續運作', value: `${uptimeHours} 小時`, inline: false });
            return interaction.editReply({ embeds: [embed] });
        }
        else if (cmd === '刷新看板') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            await updateBoard(client);
            return interaction.editReply({ content: '✅ 所有預約看板已手動強制刷新完畢！' });
        }
        else if (cmd === '註冊迴響專員') {
            const userRef = db.collection('users').doc(interaction.user.id);
            const userDoc = await userRef.get();
            addDbStat('read');
            let ud = userDoc.exists ? userDoc.data() : { violationPoints: 0, bannedUntil: null };
            
            if (ud.agentStatus === 'rejected' || ud.agentStatus === 'removed') return interaction.editReply('❌ 您的申請先前已被拒絕或移除，無法重複送出。若有疑問請聯繫管理員！');
            if (ud.isAgent) return interaction.editReply('✅ 您已經是認證的迴響專員囉！可以開始接單服務了。');
            if (ud.agentStatus === 'pending') return interaction.editReply('⏳ 您的專員申請正在審核中，請耐心等候管理員通知！');

            ud.agentStatus = 'pending';
            await userRef.set(ud, { merge: true });
            addDbStat('write');

            const payload = {
                embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('📝 新專員認證申請').setDescription(`玩家 <@${interaction.user.id}> 申請註冊成為 **迴響專員**！\n請審核是否賦予接單權限：`)],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approveAgent_${interaction.user.id}`).setLabel('✅ 通過認證').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`rejectAgent_${interaction.user.id}`).setLabel('❌ 拒絕申請').setStyle(ButtonStyle.Danger))]
            };
            await broadcastToManagementAreas(client, payload);
            return interaction.editReply('✅ **申請已送出！** 請等待管理員進行審核，審核結果將會私訊通知您。');
        }
        else if (cmd === '指定迴響專員') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const targetUser = interaction.options.getUser('玩家');
            await db.collection('users').doc(targetUser.id).set({ isAgent: true, agentStatus: 'approved' }, { merge: true });
            addDbStat('write');
            try {
                const member = await interaction.guild.members.fetch(targetUser.id);
                if (member) await member.roles.add(getAgentRoleId(interaction.guildId));
            } catch (e) {}
            try { await targetUser.send('🎉 **恭喜！管理員已直接指定您為【迴響專員】囉！**\n您可以開始至頻道接單了！'); } catch (e) {}
            return interaction.editReply(`✅ 已成功指定 <@${targetUser.id}> 為迴響專員，並已自動配發身分組。`);
        }
        else if (cmd === '刪除迴響專員') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const targetUser = interaction.options.getUser('玩家');
            await db.collection('users').doc(targetUser.id).set({ isAgent: false, agentStatus: 'removed' }, { merge: true });
            addDbStat('write');
            try {
                const member = await interaction.guild.members.fetch(targetUser.id);
                if (member) await member.roles.remove(getAgentRoleId(interaction.guildId));
            } catch (e) {}
            return interaction.editReply(`✅ 已成功移除 <@${targetUser.id}> 的迴響專員身分，並已自動撤銷身分組。`);
        }
        else if (cmd === '刪除訂單') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const targetUser = interaction.options.getUser('玩家');
            const targetId = interaction.options.getString('訂單id');

            if (targetId) {
                const docId = targetId.trim();
                const targetOrder = allReservations.find(r => r.id === docId);
                if (!targetOrder) return interaction.editReply({ content: `❌ 找不到 ID 為 \`${docId}\` 的訂單。` });
                await db.collection('reservations').doc(docId).delete();
                addDbStat('write');
                if (targetOrder.ticketMsgs) {
                    for (const m of targetOrder.ticketMsgs) {
                        try {
                            const ch = await client.channels.fetch(m.channelId).catch(() => null);
                            if (ch) { const msg = await ch.messages.fetch(m.messageId).catch(() => null); if (msg) await msg.delete().catch(() => null); }
                        } catch (e) {}
                    }
                }
                setTimeout(() => { updateBoard(client); }, 1500); 
                return interaction.editReply({ content: `✅ 已成功從資料庫徹底刪除訂單 \`${docId}\`！` });
            }

            let userOrders = targetUser ? allReservations.filter(r => r.discordId === targetUser.id).sort((a, b) => b.timestamp - a.timestamp).slice(0, 25) : allReservations.sort((a, b) => b.timestamp - a.timestamp).slice(0, 25);
            let displayMsg = targetUser ? `🗑️ **刪除訂單系統**\n請在下方選擇要刪除 <@${targetUser.id}> 的歷史訂單：` : `🗑️ **刪除訂單系統 (近期所有紀錄)**\n請在下方選擇要刪除的歷史訂單：`;

            if (userOrders.length === 0) return interaction.editReply({ content: `❌ 目前沒有找到任何訂單紀錄。` });

            const options = userOrders.map(o => {
                let statusTw = '其他';
                if (o.status === 'approved') statusTw = '排程中'; if (o.status === 'completed') statusTw = '完成'; if (o.status === 'free') statusTw = '免單';
                if (o.status === 'failed') statusTw = '失敗'; if (o.status === 'canceled') statusTw = '取消'; if (o.status === 'pending') statusTw = '待審核';
                const pName = o.discordName ? o.discordName.substring(0, 6) : '未知';
                return { label: `[${o.date}] ${o.location} - 玩家:${pName}`, description: `狀態: ${statusTw} | ID: ${o.id}`, value: o.id };
            });
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_delete_order').setPlaceholder('請選擇要從資料庫徹底刪除的訂單').addOptions(options));
            return interaction.editReply({ content: `${displayMsg}\n*(注意：刪除後將無法恢復，並會自動修正報表統計)*`, components: [row] });
        }
        else if (cmd === '玩家管理') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const targetUser = interaction.options.getUser('玩家');
            const action = interaction.options.getString('動作');
            const userRef = db.collection('users').doc(targetUser.id);
            const userDoc = await userRef.get(); addDbStat('read');
            let ud = userDoc.exists ? userDoc.data() : { violationPoints: 0, bannedUntil: null };

            if (action === 'unban') { ud.bannedUntil = null; }
            else if (action === 'clear_points') { ud.violationPoints = 0; }
            else if (action === 'add_point') {
                ud.violationPoints = (ud.violationPoints || 0) + 1;
                if (ud.violationPoints >= 3) { ud.bannedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000; ud.violationPoints = 0; }
            } else if (action === 'remove_point') { ud.violationPoints = Math.max(0, (ud.violationPoints || 0) - 1); }
            
            await userRef.set(ud, { merge: true }); addDbStat('write');
            return interaction.editReply(`✅ 操作成功！違規點數目前為: ${ud.violationPoints || 0}`);
        }
        else if (cmd === '查詢預約') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const { embed, totalPages } = generateScheduleEmbed(allReservations, true, 1, true);
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('page_nav_prev_1').setLabel('◀ 上一頁').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('page_nav_next_2').setLabel('下一頁 ▶').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1)
            );
            return interaction.editReply({ embeds: [embed], components: [navRow] });
        }
        else if (cmd === '營運設定') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const sub = interaction.options.getSubcommand();
            const docRef = db.collection('settings').doc('operationMode');
            let opData = appSettings['operationMode'] || { autoApprove: false, autoRefreshBoard: false, frozenSlots: [] };

            if (sub === '自動審核' || sub === '自動更新看板') {
                const state = interaction.options.getString('狀態') === 'true';
                if (sub === '自動審核') opData.autoApprove = state; else opData.autoRefreshBoard = state;
                await docRef.set(opData, { merge: true }); addDbStat('write');
                return interaction.editReply(`✅ 設定為：**${state ? '🟢 開啟' : '🔴 關閉'}**`);
            } else if (sub === '新增凍結時段') {
                const type = interaction.options.getString('類型'); const start = interaction.options.getString('開始時間'); const end = interaction.options.getString('結束時間');
                if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return interaction.editReply('❌ 格式錯誤，請輸入例如 `02:00` 的格式喔！');
                if (!opData.frozenSlots) opData.frozenSlots = []; opData.frozenSlots.push({ type, start, end });
                await docRef.set(opData, { merge: true }); addDbStat('write'); return interaction.editReply(`✅ 已新增凍結時段。`);
            } else if (sub === '清空凍結時段') {
                opData.frozenSlots = []; await docRef.set(opData, { merge: true }); addDbStat('write'); return interaction.editReply(`✅ 已清空所有凍結時段。`);
            } else if (sub === '查看目前設定') {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x0099FF).setTitle('⚙️ 營運模式設定').setDescription(`**自動審核狀態**：${opData.autoApprove ? '🟢 開啟' : '🔴 關閉'}\n**自動更新看板**：${opData.autoRefreshBoard ? '🟢 開啟' : '🔴 關閉'}\n\n**目前凍結時段**：共 ${(opData.frozenSlots||[]).length} 組`)] });
            }
        }
        else if (cmd === '清理訊息') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            try { await interaction.channel.bulkDelete(interaction.options.getInteger('數量'), true); return interaction.editReply({ content: `✅ 成功清理！` }); } catch (e) { return interaction.editReply({ content: `❌ 清理失敗。` }); }
        }
        else if (['設定公開看板', '設定管理看板', '迴響管理區'].includes(cmd)) {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const field = cmd === '設定公開看板' ? 'publicBoards' : (cmd === '設定管理看板' ? 'adminBoards' : 'managementArea');
            let doc = appSettings[field] || (field === 'managementArea' ? { channels: [] } : { list: [] });
            const targetArr = field === 'managementArea' ? doc.channels : doc.list;
            const exists = field === 'managementArea' ? targetArr.includes(interaction.channelId) : targetArr.findIndex(b => b.channelId === interaction.channelId) !== -1;
            
            if (exists) {
                if (field === 'managementArea') doc.channels = targetArr.filter(id => id !== interaction.channelId); else doc.list = targetArr.filter(b => b.channelId !== interaction.channelId);
                await db.collection('settings').doc(field).set(doc); addDbStat('write'); return interaction.editReply({ content: '✅ 已移除設定。' });
            } else {
                if (field === 'managementArea') { doc.channels.push(interaction.channelId); } 
                else {
                    const ReserveBtnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_reserve').setLabel('📝 預約迴響時間').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('btn_refresh_board').setLabel('🔄 手動刷新看板').setStyle(ButtonStyle.Secondary));
                    const msg = await interaction.channel.send({ content: '載入中...', components: field === 'publicBoards' ? [ReserveBtnRow] : [] });
                    doc.list.push({ channelId: interaction.channelId, messageId: msg.id });
                }
                await db.collection('settings').doc(field).set(doc); addDbStat('write');
                if (field !== 'managementArea') updateBoard(client);
                return interaction.editReply({ content: '✅ 設定成功！' });
            }
        }
        else if (['價格', '迴響鬧鐘', '優惠設定'].includes(cmd)) {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            if (cmd === '價格') { await db.collection('settings').doc('prices').set({ [interaction.options.getString('地點')]: interaction.options.getInteger('價格') }, { merge: true }); }
            else if (cmd === '迴響鬧鐘') { await db.collection('settings').doc('alarm').set({ leadTime: interaction.options.getInteger('分鐘') }, { merge: true }); }
            else { await db.collection('settings').doc('vipRules').set({ [interaction.options.getString('地點')]: { buy: interaction.options.getInteger('滿幾次'), free: interaction.options.getInteger('送幾次') } }, { merge: true }); }
            addDbStat('write'); return interaction.editReply({ content: '✅ 設定成功！' });
        }
        else if (cmd === '我的紀錄') {
            const tw = getTaiwanTime(); const currentMonthPrefix = `${tw.yyyy}-${tw.mm}`;
            let total = 0, month = 0;
            allReservations.forEach(d => { if (d.discordId === interaction.user.id && (d.status === 'approved' || d.status === 'completed' || d.status === 'free')) { total++; if (d.date.startsWith(currentMonthPrefix)) month++; } });
            const userDoc = await db.collection('users').doc(interaction.user.id).get(); addDbStat('read');
            let points = 0; let banStatus = '🟢 正常';
            if (userDoc.exists) {
                const ud = userDoc.data(); points = ud.violationPoints || 0;
                if (ud.bannedUntil && ud.bannedUntil > Date.now()) banStatus = `🔴 預約休息中`;
            }
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle(`📊 ${interaction.user.username} 的預約數據`).addFields({ name: '本月排單', value: `${month} 次`, inline: true }, { name: '近期總單', value: `${total} 次`, inline: true }, { name: '臨時調整', value: `${points} / 3 次`, inline: false }, { name: '帳號狀態', value: banStatus, inline: false })] });
        }
        else if (cmd === '接單統計') {
            const isAuthorized = await checkIsAgent(interaction.user.id, interaction.member);
            if (!isAuthorized) return interaction.editReply({ content: '❌ 權限不足，僅限管理員或專員查詢喔！' });
            const agentIds = [...new Set(allReservations.filter(r => r.takenBy && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')).map(r => r.takenBy))];
            if (agentIds.length === 0) return interaction.editReply({ content: '目前無專員結案紀錄喔！' });
            const { embed, components } = buildAgentStatMessage(agentIds[0]);
            await interaction.editReply({ embeds: [embed], components });
        }
    }
}

module.exports = { handleCommand };
