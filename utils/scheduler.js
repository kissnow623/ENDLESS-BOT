// utils/scheduler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, addDbStat, getCache } = require('./firebase');
const { config } = require('../config/constants');
const { 
    getTaiwanTime, editUserDM, buildTicketPayload, 
    bumpManagementMessages, syncManagementMessages, broadcastToManagementAreas, updateBoard 
} = require('./echoHelpers');
const { generateMemberLeaderboard, generateFriendLeaderboard } = require('./guildHelpers');

let lastLeaderboardMonth = -1;

function startScheduler(client) {
    setInterval(async () => {
        const now = Date.now();
        const twTime = new Date(now + 8 * 3600000);
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

                // 處理過期
                if (data.status === 'pending' && data.timestamp < now) {
                    await db.collection('reservations').doc(data.id).update({ status: 'expired' });
                    addDbStat('write'); needsSync = true;
                    await editUserDM(client, data.discordId, data.userDmMsgId, { embeds: [new EmbedBuilder().setColor(0x808080).setTitle('⏳ 預約已過期失效').setDescription(`您的預約因超過開打時間未審核，已自動失效。\n**地點**：${data.location}\n**時間**：${data.date} ${data.time}`)], components: [] });
                }

                // 發送提醒鬧鐘
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

                // 拔除舊 DM 按鈕
                if (data.status === 'approved' && !data.buttonsRemoved && now >= data.timestamp) {
                    await editUserDM(client, data.discordId, data.userDmMsgId, { components: [] });
                    await db.collection('reservations').doc(data.id).update({ buttonsRemoved: true });
                    addDbStat('write');
                }

                // 詢問專員是否結案 (出團 10 分鐘後)
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

                // 系統強制結案 (12 小時未處理)
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

    }, 60 * 1000); 
}

module.exports = { startScheduler };
