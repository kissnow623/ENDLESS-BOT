// handlers/componentHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { db, admin, addDbStat, getCache } = require('../utils/firebase');
const { config, getAgentRoleId, classOptionsList, welcomeMessages, welcomeFriendMessages } = require('../config/constants');
const { updateNickname } = require('../utils/guildHelpers');
const { getTaiwanTime, formatDateTimeStr, isTimeFrozen, getFrozenTextForDateStr, addViolation, checkIsAgent, broadcastToManagementAreas, syncManagementMessages, bumpManagementMessages, editUserDM, buildTicketPayload, buildAgentStatMessage, buildAgentDetailsMessage, generateScheduleEmbed, updateBoard, processRejection } = require('../utils/echoHelpers');

async function handleComponent(interaction, client) {
    const { allReservations, appSettings } = getCache();

    // ===================================
    // 👉 Buttons (按鈕互動)
    // ===================================
    if (interaction.isButton()) {
        
        if (interaction.customId === 'btn_member' || interaction.customId === 'btn_friend') {
            const isMember = interaction.customId === 'btn_member';
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_class_${isMember ? 'member' : 'friend'}`)
                .setPlaceholder('請選擇您的遊戲職業 (可多選)...')
                .setMinValues(1)
                .setMaxValues(12) 
                .addOptions(classOptionsList);
            return interaction.reply({ 
                content: isMember ? '您選擇了「公會成員」，請選擇您的職業 (可多選)：' : '您選擇了「親友團」，請選擇您的職業 (可多選)：', 
                components: [new ActionRowBuilder().addComponents(selectMenu)],
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_')) {
            const parts = interaction.customId.split('_');
            const action = parts[0]; 

            if ( (action === 'approve' && parts.length >= 3) || (action === 'reject' && /^\d+$/.test(parts[1])) ) {
                const targetUserId = parts[1];
                if (action === 'approve') {
                    const targetClassesStr = parts[2]; 
                    const requestedClasses = targetClassesStr.split('-');
                    await interaction.deferUpdate(); 
                    
                    try {
                        const originalEmbed = interaction.message.embeds[0];
                        const gameName = originalEmbed.fields.find(f => f.name.includes('遊戲名稱'))?.value.replace(/`/g, '') || '未知';
                        const gameLevel = originalEmbed.fields.find(f => f.name.includes('等級'))?.value.replace(/`/g, '').replace('LV.', '').trim() || '未知';
                        const gameCode = originalEmbed.fields.find(f => f.name.includes('代碼'))?.value.replace(/`/g, '') || '未知';
                        const tracker = await db.collection('inviteTracking').doc(targetUserId).get();
                        const referrer = tracker.exists ? tracker.data().inviter : '無法追蹤 / 未知';

                        const member = await interaction.guild.members.fetch(targetUserId);
                        const docRef = db.collection('members').doc(targetUserId);
                        const doc = await docRef.get();
                        
                        let finalClasses = [...requestedClasses];
                        await member.roles.remove(config.roles.familyFriend).catch(() => {});

                        let rolesToAdd = [config.roles.guildMember];
                        finalClasses.forEach(cls => { if (config.roles.classes[cls]) rolesToAdd.push(config.roles.classes[cls]); });
                        await member.roles.add(rolesToAdd).catch(() => {});

                        await docRef.set({
                            discordId: targetUserId, discordTag: member.user.tag, gameName: gameName,
                            gameClasses: finalClasses, gameLevel: gameLevel, gameCode: gameCode, referrer: referrer, role: '公會成員', 
                            joinDate: doc.exists && doc.data().joinDate ? doc.data().joinDate : admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });

                        await updateNickname(member, gameName, '公會成員', finalClasses);
                        const passedMsg = `🎉 **太棒了！狂賀！** 🎉\n你的申請已經正式通過啦！歡迎成為 ENDLESS 大家庭的一份子！🥳\n現在，伺服器裡的所有專屬頻道都已經為你解鎖囉！趕快進去跟大家打個招呼、找人一起練功打王吧！衝呀～～🚀`;
                        await member.send(passedMsg).catch(() => {});

                        const updatedEmbed = EmbedBuilder.from(originalEmbed).setColor('#00FF00').setTitle('✅ 審核已通過').setFooter({ text: `由 ${interaction.user.tag} 批准`, iconURL: interaction.user.displayAvatarURL() });
                        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

                        await db.collection('inviteTracking').doc(targetUserId).delete().catch(()=>{});

                        try {
                            const welcomeChannel = await client.channels.fetch(config.channels.welcome);
                            if (welcomeChannel) {
                                const randomMsg = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)](targetUserId);
                                await welcomeChannel.send(randomMsg);
                            }
                        } catch (err) {}

                    } catch (error) { 
                        return interaction.followUp({ content: '❌ 處理失敗，請確認機器人權限。', flags: MessageFlags.Ephemeral }); 
                    }
                } 
                else if (action === 'reject') {
                    const msgId = interaction.message.id; 
                    const reasonSelect = new StringSelectMenuBuilder()
                        .setCustomId(`select_reject_reason_${targetUserId}_${msgId}`)
                        .setPlaceholder('請選擇退回原因...')
                        .addOptions([
                            { label: '等級未達標', description: '未達公會招收門檻', value: '你目前的等級還未達到公會的招收門檻喔，請繼續加油！期待你變得更強後再來申請！', emoji: '📈' },
                            { label: '資料填寫錯誤', description: '遊戲名稱或代碼有誤', value: '你填寫的資料似乎有點小錯誤（可能是遊戲名稱或代碼），請確認過後重新申請一次唷！', emoji: '📝' },
                            { label: '查無此人 / 資格不符', description: '遊戲內查無此人或黑名單', value: '幹部們在遊戲內暫時查無此帳號，或是資格有點疑慮。如果有誤會，歡迎找幹部確認喔！', emoji: '🚫' },
                            { label: '✍️ 自行輸入理由...', description: '手動輸入其他原因', value: 'custom' }
                        ]);
                    return interaction.reply({ content: '請選擇要退回該申請的原因：', components: [new ActionRowBuilder().addComponents(reasonSelect)], flags: MessageFlags.Ephemeral });
                }
                return;
            }
        }

        if (interaction.customId === 'btn_refresh_board') {
            await interaction.deferUpdate().catch(() => {}); 
            await updateBoard(client); 
        }

        else if (interaction.customId.startsWith('agent_nav_') || interaction.customId.startsWith('agent_details_')) {
            await interaction.deferUpdate().catch(() => {});
            const parts = interaction.customId.split('_');
            const agentIds = [...new Set(allReservations.filter(r => r.takenBy && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')).map(r => r.takenBy))];
            
            if (interaction.customId.startsWith('agent_nav_')) {
                const action = parts[2]; const currentAgentId = parts[3];
                let currIdx = agentIds.indexOf(currentAgentId);
                if (currIdx === -1) currIdx = 0; 
                if (action === 'prev') currIdx = Math.max(0, currIdx - 1);
                if (action === 'next') currIdx = Math.min(agentIds.length - 1, currIdx + 1);
                const targetAgentId = agentIds[currIdx];
                const { embed, components } = buildAgentStatMessage(targetAgentId);
                return interaction.editReply({ embeds: [embed], components });
            }
            
            if (interaction.customId.startsWith('agent_details_')) {
                const agentId = parts[2]; const page = parseInt(parts[3]);
                const { embed, components } = buildAgentDetailsMessage(agentId, page);
                return interaction.editReply({ embeds: [embed], components });
            }
        }

        else if (interaction.customId.startsWith('page_nav_')) {
            await interaction.deferUpdate().catch(() => {});
            const targetPage = parseInt(interaction.customId.split('_')[3]);
            const { embed, totalPages, currentPage } = generateScheduleEmbed(allReservations, true, targetPage, true);
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`page_nav_prev_${currentPage - 1}`).setLabel('◀ 上一頁').setStyle(ButtonStyle.Secondary).setDisabled(currentPage <= 1),
                new ButtonBuilder().setCustomId(`page_nav_next_${currentPage + 1}`).setLabel('下一頁 ▶').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages)
            );
            await interaction.editReply({ embeds: [embed], components: [navRow] });
        }

        else if (interaction.customId === 'btn_reserve') {
            const userDoc = await db.collection('users').doc(interaction.user.id).get();
            addDbStat('read');
            if (userDoc.exists && userDoc.data().bannedUntil > Date.now()) {
                return interaction.reply({ content: `💡 **溫馨提醒**：您近期「臨時調整」達上限，權限暫停中喔！`, ephemeral: true });
            }
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('select_location').setPlaceholder('請選擇要預約的地點')
                .addOptions([ { label: '闇黑龍王', value: '闇黑龍王' }, { label: '艾畢奈亞', value: '艾畢奈亞' }, { label: '道館', value: '道館' }, { label: '其他', value: '其他' } ])
            );
            await interaction.reply({ content: '👇 **請選擇您要預約的地點：**', components: [row], ephemeral: true });
        }

        else {
            const parts = interaction.customId.split('_');
            const action = parts[0]; const docId = parts[1];

            if (!docId) return; 

            if (action === 'approveAgent') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ 權限不足', ephemeral: true });
                await db.collection('users').doc(docId).set({ isAgent: true, agentStatus: 'approved' }, { merge: true }); addDbStat('write');
                await interaction.message.edit({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ 專員申請已通過').setDescription(`<@${docId}> 已正式成為認證專員 (審核者：<@${interaction.user.id}>)`)], components: [] });
                try { const member = await interaction.guild.members.fetch(docId); const roleId = getAgentRoleId(interaction.guildId); if (member && roleId) await member.roles.add(roleId); } catch (e) { }
                try { const targetUser = await client.users.fetch(docId); await targetUser.send('🎉 **恭喜！管理員已通過您的申請，您現在正式成為【迴響專員】囉！**\n您可以開始至頻道接單了！'); } catch(e) {}
                return interaction.reply({ content: '✅ 審核完成，已配發身分組。', ephemeral: true });
            }

            if (action === 'rejectAgent') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ 權限不足', ephemeral: true });
                await db.collection('users').doc(docId).set({ isAgent: false, agentStatus: 'rejected' }, { merge: true }); addDbStat('write');
                await interaction.message.edit({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ 專員申請已拒絕').setDescription(`<@${docId}> 的申請已被拒絕 (審核者：<@${interaction.user.id}>)`)], components: [] });
                try { const targetUser = await client.users.fetch(docId); await targetUser.send('🚫 **抱歉，管理員退回了您的【迴響專員】申請。**'); } catch(e) {}
                return interaction.reply({ content: '✅ 已拒絕。', ephemeral: true });
            }

            if (action === 'edit') {
                const docRef = db.collection('reservations').doc(docId);
                const doc = await docRef.get(); addDbStat('read');
                if (!doc.exists) return interaction.reply({ content: '❌ 找不到此訂單。', ephemeral: true });
                const data = doc.data();
                
                const modal = new ModalBuilder().setCustomId(`submitEdit_${docId}`).setTitle('變更登記資料');
                const channelInput = new TextInputBuilder().setCustomId('channel').setLabel("幸運頻道").setStyle(TextInputStyle.Short).setRequired(false);
                if (data.channel) channelInput.setValue(data.channel);
                const notesInput = new TextInputBuilder().setCustomId('notes').setLabel("備註").setStyle(TextInputStyle.Short).setRequired(false);
                if (data.notes && data.notes !== '無') notesInput.setValue(data.notes);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('newDate').setLabel("日期").setStyle(TextInputStyle.Short).setValue(data.date).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('newTime').setLabel("時間 (24小時制)").setStyle(TextInputStyle.Short).setValue(data.time).setMaxLength(5).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gameId').setLabel("預約者遊戲ID").setStyle(TextInputStyle.Short).setValue(data.gameId).setRequired(true)),
                    new ActionRowBuilder().addComponents(channelInput),
                    new ActionRowBuilder().addComponents(notesInput)
                );
                return interaction.showModal(modal);
            }

            if (action === 'reject') {
                let data = allReservations.find(r => r.id === docId);
                if (!data || data.status !== 'pending') return interaction.reply({ content: '❌ 訂單已不存在或被處理過囉！', ephemeral: true });
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`rejectReason_${docId}`).setPlaceholder('請選擇拒絕這筆訂單的原因')
                    .addOptions([
                        { label: '時段衝突 (該時段已有安排)', value: '時段衝突，該時段已有其他安排' },
                        { label: '專員人力不足', value: '該時段專員人力不足' },
                        { label: '遊戲維護/連線不穩', value: '遊戲維護或伺服器連線不穩' },
                        { label: '✍️ 自訂其他原因...', value: 'custom' }
                    ])
                );
                return interaction.reply({ content: '請選擇拒絕這筆訂單的原因：', components: [row], ephemeral: true });
            }

            if (['takeOrder', 'approve', 'release', 'complete', 'free', 'fail', 'cancel'].includes(action)) {
                await interaction.deferUpdate().catch(() => {});
                const docRef = db.collection('reservations').doc(docId);

                if (action === 'takeOrder') {
                    const isAuthorized = await checkIsAgent(interaction.user.id, interaction.member);
                    if (!isAuthorized) {
                        return interaction.followUp({ content: '❌ **權限不足！** 您尚未註冊成為「迴響專員」，請先使用 `/註冊迴響專員` 送出申請並等待審核。', ephemeral: true });
                    }

                    try {
                        let finalData = null;
                        await db.runTransaction(async (t) => {
                            const doc = await t.get(docRef);
                            addDbStat('read');
                            if (!doc.exists) throw new Error('NOT_FOUND');
                            const data = doc.data();
                            if (data.takenBy) throw new Error('TAKEN'); 
                            
                            t.update(docRef, { takenBy: interaction.user.id });
                            finalData = data;
                        });
                        addDbStat('write');
                        
                        const latestDoc = await docRef.get();
                        addDbStat('read');
                        const data = { id: latestDoc.id, ...latestDoc.data() };
                        const payload = buildTicketPayload(docId, data);
                        await syncManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);

                        // 🌟 新增：如果訂單已經是「可結案狀態」，專員接手時自動補發結案私訊！
                        let extraMsg = '';
                        if (data.postChecked) {
                            try {
                                const adminUser = await client.users.fetch(interaction.user.id);
                                const row = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder().setCustomId(`complete_${docId}`).setLabel('⭕ 順利完成').setStyle(ButtonStyle.Success),
                                    new ButtonBuilder().setCustomId(`free_${docId}`).setLabel('🎁 免單').setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder().setCustomId(`fail_${docId}`).setLabel('❌ 未完成/取消').setStyle(ButtonStyle.Danger)
                                );
                                const displayChannel = data.channel ? data.channel : '-';
                                await adminUser.send({ embeds: [new EmbedBuilder().setColor(0x8A2BE2).setTitle('⏱️ 訂單結案確認').setDescription(`**玩家**：<@${data.discordId}>\n**地點**：${data.location}\n**頻道**：${displayChannel}\n**預約時間**：\`${data.date} ${data.time}\`\n\n*請問順利完成了嗎？*`)], components: [row] });
                                await docRef.update({ dmFailed: false }); addDbStat('write');
                                extraMsg = '\n📩 **已為您補發結案確認私訊！**';
                            } catch (err) {}
                        }
                        
                        return interaction.followUp({ content: `✅ 成功接單！${extraMsg}`, ephemeral: true });
                        
                    } catch (error) {
                        if (error.message === 'TAKEN') return interaction.followUp({ content: '❌ 慢了一步，已經被其他人接走囉！', ephemeral: true });
                        return interaction.followUp({ content: '❌ 找不到訂單或發生錯誤。', ephemeral: true });
                    }
                }

                const doc = await docRef.get();
                addDbStat('read');
                if (!doc.exists) return interaction.followUp({ content: '❌ 找不到此訂單（可能已被刪除）。', ephemeral: true });
                let data = doc.data(); data.id = doc.id;

                if (action === 'approve') {
                    if (data.status !== 'pending') return interaction.followUp({ content: '❌ 訂單已處理過囉！', ephemeral: true });
                    data.status = 'approved'; data.reviewer = interaction.user.id;
                    await docRef.update({ status: data.status, reviewer: data.reviewer }); addDbStat('write');
                    
                    const payload = buildTicketPayload(docId, data);
                    await syncManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);
                    
                    const dmEmbed = new EmbedBuilder().setColor(0x00FF00).setTitle('✅ 預約已通過').setDescription(`**地點**：${data.location}\n**時間**：${data.date} ${data.time}`);
                    const btnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`edit_${docId}`).setLabel('✏️ 變更登記資料').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`cancel_${docId}`).setLabel('🗑️ 取消預約').setStyle(ButtonStyle.Danger)
                    );
                    await editUserDM(client, data.discordId, data.userDmMsgId, { embeds: [dmEmbed], components: [btnRow] });
                    updateBoard(client);
                    return;
                }

                if (action === 'release') {
                    if (data.postChecked) {
                        return interaction.followUp({ content: '❌ 訂單已經進入結案確認階段，無法釋出轉單，請直接結案！(若找不到私訊，請直接在看板點選結案)', ephemeral: true });
                    }
                    if (data.takenBy !== interaction.user.id) return interaction.followUp({ content: '❌ 只有目前的接單專員可以釋出此訂單！', ephemeral: true });
                    
                    data.takenBy = null;
                    await docRef.update({ takenBy: null }); addDbStat('write');
                    
                    const payload = buildTicketPayload(docId, data);
                    const newRefs = await bumpManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);
                    await docRef.update({ ticketMsgs: newRefs }); addDbStat('write');
                    return interaction.followUp({ content: '✅ 已成功釋出訂單，等待其他專員接手。', ephemeral: true });
                }

                if (action === 'complete' || action === 'fail' || action === 'free') {
                    if (data.status === 'completed' || data.status === 'failed' || data.status === 'free') return interaction.followUp({ content: '❌ 已經結案過了！', ephemeral: true });
                    if (data.takenBy && data.takenBy !== interaction.user.id) return interaction.followUp({ content: `❌ 只有專員 <@${data.takenBy}> 才能確認結案！`, ephemeral: true });

                    if (action === 'complete') data.status = 'completed'; else if (action === 'free') data.status = 'free'; else data.status = 'failed';
                    data.closer = interaction.user.id;
                    if (!data.takenBy) data.takenBy = interaction.user.id;

                    await docRef.update({ status: data.status, closer: data.closer, takenBy: data.takenBy }); addDbStat('write');
                    
                    const payload = buildTicketPayload(docId, data);
                    await syncManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);
                    try { await interaction.editReply({ components: [] }); } catch(e){}

                    if (action === 'complete') {
                        const blessingEmbed = new EmbedBuilder().setColor(0xFFD700).setTitle('🎊 【訂單圓滿完成】').setDescription(`**地點**：${data.location}\n**時間**：${data.date} ${data.time}\n\n感謝您的惠顧！\n祝您這趟王團 **寶物大豐收、掉寶順利** 🍀\n期待下次再為您服務喔～`);
                        await editUserDM(client, data.discordId, data.userDmMsgId, { embeds: [blessingEmbed], components: [] });
                    } else if (action === 'free') {
                        const freeEmbed = new EmbedBuilder().setColor(0xFFD700).setTitle('🎁 【專員招待！本次免單】').setDescription(`**地點**：${data.location}\n**時間**：${data.date} ${data.time}\n\n專員為您標記了本次服務為 **免單招待**！🎉\n祝您武運昌隆，期待下次再見！`);
                        await editUserDM(client, data.discordId, data.userDmMsgId, { embeds: [freeEmbed], components: [] });
                    }
                    updateBoard(client);
                    return;
                }

                if (data.timestamp < Date.now()) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x808080).setTitle('📜 歷史紀錄').setDescription(`預約時間已過。`)], components: [] });
                
                if (action === 'cancel') {
                    const isLastMinute = (data.timestamp - Date.now()) <= 30 * 60 * 1000;
                    const wasApproved = data.status === 'approved';
                    
                    data.status = 'canceled';
                    await docRef.update({ status: 'canceled' }); addDbStat('write');
                    
                    const payload = buildTicketPayload(docId, data);
                    await syncManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);

                    let replyText = '✅ **訂單已取消**。';
                    if (isLastMinute && wasApproved) {
                        const { points, bannedUntil } = await addViolation(data.discordId);
                        if (bannedUntil) replyText += `\n💡 系統通知：暫停預約權限 7 天。`;
                        else replyText += `\n💡 溫馨提醒：已記錄一次臨時調整（目前：${points}/3）。`;
                    }
                    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('🚫 訂單已取消').setDescription(`**地點**：${data.location}\n**時間**：${data.date} ${data.time}`)], components: [] });
                    await interaction.followUp({ content: replyText, ephemeral: true });
                    updateBoard(client);
                }
            }
        }

    }

    // ===================================
    // 👉 C. String Select Menus (下拉式選單)
    // ===================================
    else if (interaction.isStringSelectMenu()) {
        
        if (interaction.customId === 'select_user_action') {
            const action = interaction.values[0];
            
            if (action === 'action_update') {
                const modal = new ModalBuilder().setCustomId('modal_update_data').setTitle('更新遊戲資料');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('update_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('update_level').setLabel("遊戲等級").setStyle(TextInputStyle.Short).setRequired(false))
                );
                return interaction.showModal(modal);
            }

            if (action === 'action_add_class') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const doc = await db.collection('members').doc(interaction.user.id).get();
                if (!doc.exists) return interaction.editReply('❌ 找不到您的資料，請先申請加入！');
                const addSelect = new StringSelectMenuBuilder().setCustomId(`add_extra_class_${config.guildId}`).setPlaceholder('請選擇要新增的職業...').addOptions(classOptionsList);
                return interaction.editReply({ content: '➕ **請選擇您要新增的職業分身：**', components: [new ActionRowBuilder().addComponents(addSelect)] });
            }

            if (action === 'action_remove_class') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const doc = await db.collection('members').doc(interaction.user.id).get();
                if (!doc.exists) return interaction.editReply('❌ 找不到您的資料，請先申請加入！');
                const data = doc.data();
                let classes = data.gameClasses || (data.gameClass ? [data.gameClass] : []);
                if (classes.length === 0) return interaction.editReply('❌ 您目前沒有登記任何職業！');
                if (classes.length === 1) return interaction.editReply('⚠️ 您目前只有登記一個主職業，無法刪除！如果想更換主職業請聯繫幹部。');

                const removeOptions = classes.map(c => new StringSelectMenuOptionBuilder().setLabel(c).setValue(c));
                const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_remove_class`).setPlaceholder('請選擇要刪除的職業...').addOptions(removeOptions);
                return interaction.editReply({ content: '🗑️ **請選擇您要刪除的職業分身：**\n*(注意：刪除後將會同步移除您的該職業身分組)*', components: [new ActionRowBuilder().addComponents(selectMenu)] });
            }
        }

        if (interaction.customId === 'select_remove_class') {
            await interaction.deferUpdate();
            const classToRemove = interaction.values[0];
            const docRef = db.collection('members').doc(interaction.user.id);
            const doc = await docRef.get(); const data = doc.data();
            let classes = data.gameClasses || (data.gameClass ? [data.gameClass] : []);
            
            classes = classes.filter(c => c !== classToRemove);
            const roleId = config.roles.classes[classToRemove];
            if (roleId) await interaction.member.roles.remove(roleId).catch(() => {});
            await docRef.update({ gameClasses: classes, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
            const newNick = await updateNickname(interaction.member, data.gameName, data.role, classes);
            return interaction.editReply({ content: `✅ 成功刪除 **${classToRemove}**！\n您的暱稱已更新為：**${newNick}**`, components: [] });
        }

        if (interaction.customId.startsWith('add_extra_class_')) {
            await interaction.deferUpdate();
            const selectedClass = interaction.values[0];
            const docRef = db.collection('members').doc(interaction.user.id);
            const doc = await docRef.get(); const data = doc.data();
            let classes = data.gameClasses || (data.gameClass ? [data.gameClass] : []);

            if (classes.includes(selectedClass)) return interaction.editReply({ content: `⚠️ 您已經擁有 **${selectedClass}** 的職業囉！`, components: [] });
            classes.push(selectedClass);
            if (config.roles.classes[selectedClass]) await interaction.member.roles.add(config.roles.classes[selectedClass]).catch(() => {});
            
            await docRef.update({ gameClasses: classes, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
            const newNick = await updateNickname(interaction.member, data.gameName, data.role, classes);
            return interaction.editReply({ content: `✅ 成功新增 **${selectedClass}**！\n您的暱稱已更新為：**${newNick}** 😎`, components: [] });
        }

        if (interaction.customId.startsWith('select_class_')) {
            const isMember = interaction.customId === 'select_class_member';
            const selectedClassesStr = interaction.values.join('-'); 
            const modal = new ModalBuilder().setCustomId(`modal_${isMember ? 'member' : 'friend'}_${selectedClassesStr}`).setTitle(isMember ? '公會成員資料' : '親友團資料');

            if (isMember) {
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_level').setLabel("遊戲等級").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_code').setLabel("遊戲代碼").setStyle(TextInputStyle.Short))
                );
            } else {
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short)));
            }
            return interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('select_reject_reason_')) {
            const parts = interaction.customId.split('_');
            const targetUserId = parts[3]; const msgId = parts[4]; const reason = interaction.values[0];

            if (reason === 'custom') {
                const modal = new ModalBuilder().setCustomId(`modal_reject_custom_${targetUserId}_${msgId}`).setTitle('填寫退回原因');
                const reasonInput = new TextInputBuilder().setCustomId('reject_reason').setLabel("請輸入溫暖的退回原因").setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                return interaction.showModal(modal);
            } else {
                await interaction.deferUpdate();
                try {
                    const member = await interaction.guild.members.fetch(targetUserId);
                    const rejectMsg = `💌 嗨嗨～這裡是 ENDLESS 審核中心。\n非常抱歉，你剛才送出的申請暫時未通過審核喔 🥺\n\n**幹部留給你的悄悄話 / 退回原因：**\n💬 *${reason}*\n\n別灰心！只要調整一下，隨時歡迎你再次送出申請！我們的大門永遠為你敞開，期待你準備好後再次回來找我們玩喔！💪✨`;
                    await member.send(rejectMsg).catch(() => {});
                    
                    const channel = await client.channels.fetch(config.channels.approval);
                    const originalMsg = await channel.messages.fetch(msgId);
                    const updatedEmbed = EmbedBuilder.from(originalMsg.embeds[0]).setColor('#FF0000').setTitle('❌ 申請已退回').setFooter({ text: `由 ${interaction.user.tag} 退回`, iconURL: interaction.user.displayAvatarURL() });
                    await originalMsg.edit({ embeds: [updatedEmbed], components: [] });

                    return interaction.editReply({ content: `✅ 已退回申請並發送通知給該成員。`, components: [] });
                } catch (error) { 
                    return interaction.editReply({ content: '❌ 無法發送私訊通知該成員。', components: [] }); 
                }
            }
        }

        // ------------------------------------------
        // 👑 【迴響系統選單】
        // ------------------------------------------
        if (interaction.customId === 'select_location') {
            const location = interaction.values[0];
            const timesRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(`select_times_${location}`).setPlaceholder('請選擇連續施放次數 (預設1次)')
                .addOptions([
                    { label: '1 次 (單場施放)', value: '1' },
                    { label: '2 次 (共 80 分鐘)', value: '2' },
                    { label: '3 次 (共 120 分鐘)', value: '3' },
                    { label: '4 次 (共 160 分鐘)', value: '4' },
                    { label: '5 次 (共 200 分鐘)', value: '5' },
                    { label: '6 次 (共 240 分鐘)', value: '6' }
                ])
            );
            return interaction.update({ content: `👇 **已選擇【${location}】。請接著選擇要連續施放的「次數」：**`, components: [timesRow] });
        }

        if (interaction.customId.startsWith('select_times_')) {
            const location = interaction.customId.split('_')[2];
            const times = interaction.values[0];
            const tw = getTaiwanTime();
            
            const modal = new ModalBuilder().setCustomId(`reserve_${location}_${times}`).setTitle(`📝 預約：${location} (連續 ${times} 次)`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel("首場日期 (可修改)").setStyle(TextInputStyle.Short).setValue(`${tw.yyyy}-${tw.mm}-${tw.dd}`).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time').setLabel("首場時間 (24小時制)").setStyle(TextInputStyle.Short).setValue(`${tw.hh}:${tw.min}`).setMaxLength(5).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gameId').setLabel("預約者遊戲ID").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel("幸運頻道").setStyle(TextInputStyle.Short).setRequired(false)), 
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel("備註").setStyle(TextInputStyle.Short).setRequired(false))
            );
            await interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('rejectReason_')) {
            const docId = interaction.customId.split('_')[1];
            const reason = interaction.values[0];

            if (reason === 'custom') {
                const modal = new ModalBuilder().setCustomId(`submitReject_${docId}`).setTitle('輸入自訂拒絕原因');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel("拒絕原因").setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            await interaction.deferUpdate().catch(() => {});
            await processRejection(client, docId, reason, interaction.user.id, interaction);
        }

        if (interaction.customId === 'select_delete_order') {
            await interaction.deferUpdate().catch(() => {});
            const docId = interaction.values[0];
            const targetOrder = allReservations.find(r => r.id === docId);
            
            await db.collection('reservations').doc(docId).delete(); addDbStat('write');
            
            if (targetOrder && targetOrder.ticketMsgs) {
                for (const m of targetOrder.ticketMsgs) {
                    try {
                        const ch = await client.channels.fetch(m.channelId).catch(() => null);
                        if (ch) { const msg = await ch.messages.fetch(m.messageId).catch(() => null); if (msg) await msg.delete().catch(() => null); }
                    } catch (e) {}
                }
            }
            setTimeout(() => { updateBoard(client); }, 1500); 
            return interaction.editReply({ content: `✅ 已成功從資料庫徹底刪除該筆訂單紀錄！`, components: [] });
        }
    }

    // ===================================
    // 👉 D. Modal Submit (彈出式表單提交)
    // ===================================
    else if (interaction.isModalSubmit()) {
        
        if (interaction.customId.startsWith('modal_member_')) {
            const selectedClassesStr = interaction.customId.replace('modal_member_', '');
            const classesForDisplay = selectedClassesStr.replace(/-/g, '｜');
            const name = interaction.fields.getTextInputValue('game_name');
            const level = interaction.fields.getTextInputValue('game_level');
            const code = interaction.fields.getTextInputValue('game_code');
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

            const inviteTrackerDoc = await db.collection('inviteTracking').doc(interaction.user.id).get();
            const systemDetectedReferrer = inviteTrackerDoc.exists ? inviteTrackerDoc.data().inviter : '無法追蹤 / 未知';

            const sendToApprovalChannel = async (attachment = null, timeoutNote = false) => {
                try {
                    const channel = await client.channels.fetch(config.channels.approval);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setTitle('🛡️ ENDLESS | 新成員入會申請')
                            .setDescription(`**<@${interaction.user.id}>** (${interaction.user.tag}) 提交了公會成員申請，請幹部進行審核。`)
                            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                            .addFields(
                                { name: '👾 Discord 帳號', value: `\`${interaction.user.tag}\``, inline: true },
                                { name: '👤 遊戲名稱', value: `\`${name}\``, inline: true },
                                { name: '📈 等級', value: `\`LV. ${level}\``, inline: true },
                                { name: '⚔️ 職業', value: `\`${classesForDisplay}\``, inline: true }, 
                                { name: '🔑 遊戲代碼', value: `\`${code}\``, inline: true },
                                { name: '🤝 引薦人', value: `${systemDetectedReferrer}`, inline: true }
                            )
                            .setColor('#FFD700')
                            .setTimestamp()
                            .setFooter({ text: 'ENDLESS 審核系統', iconURL: client.user.displayAvatarURL() });

                        const messageOptions = { embeds: [embed] };
                        if (attachment) { embed.setImage(`attachment://${attachment.name}`); messageOptions.files = [attachment]; }
                        if (timeoutNote) embed.addFields({ name: '⚠️ 備註', value: '玩家未在 5 分鐘內附上截圖。' });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`approve_${interaction.user.id}_${selectedClassesStr}`).setLabel('✅ 審核通過').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('❌ 拒絕/退回').setStyle(ButtonStyle.Danger)
                        );
                        messageOptions.components = [row];
                        await channel.send(messageOptions);
                    }
                } catch (error) { console.error("❌ 送出審核表單失敗：", error); }
            };

            try {
                const dmChannel = await interaction.user.createDM();
                await interaction.editReply({ content: `✅ 第一步完成！\n\n📸 **請麻煩去查看我給你的私訊**，並直接把你的遊戲截圖傳送給我，才能完成最後的申請步驟喔！🏃‍♂️💨` });
                await dmChannel.send(`👋 嗨嗨！你剛剛填寫了 ENDLESS 的入會申請，距離加入我們只差最後一步啦！🏃‍♂️💨\n\n📸 **請在 5 分鐘內，直接將你的「角色資料截圖」傳送在這個聊天室喔！**\n*(這張帥氣的截圖會附在你的申請單上，讓公會好好認識你！)*`);

                const filter = m => m.author.id === interaction.user.id;
                const collector = dmChannel.createMessageCollector({ filter, time: 5 * 60 * 1000, max: 1 });

                collector.on('collect', async m => {
                    let uploadedAttachment = null;
                    if (m.attachments.size > 0) {
                        uploadedAttachment = m.attachments.first();
                        await m.reply(`✅ 完美！收到你的帥氣截圖啦！✨\n你的專屬申請單已經搭乘火箭🚀 完整送達公會審核中心囉！幹部們正在火速為你處理，請稍坐片刻、靜候佳音，我們超期待你的加入！🥰`);
                    } else { await m.reply(`✅ 收到指示！已略過截圖步驟，你的申請單已經送出給幹部審核囉！請靜候佳音。`); }
                    await sendToApprovalChannel(uploadedAttachment, false);
                });
                collector.on('end', async (collected, reason) => {
                    if (reason === 'time') {
                        await dmChannel.send(`⚠️ 5 分鐘時間到！系統已自動將「無截圖」的申請單送出給幹部審核。`);
                        await sendToApprovalChannel(null, true);
                    }
                });
            } catch (error) {
                await interaction.editReply({ content: `✅ 資料已送出，請靜候幹部審核！\n*(⚠️ 備註：因為您關閉了 Discord 的私訊功能，系統無法向您索取截圖，已自動跳過此步驟)*` });
                await sendToApprovalChannel(null, false);
            }
        }

        if (interaction.customId.startsWith('modal_friend_')) {
            const selectedClassesStr = interaction.customId.replace('modal_friend_', '');
            const finalClasses = selectedClassesStr.split('-');
            const nameInput = interaction.fields.getTextInputValue('game_name');
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
            try {
                let rolesToAdd = [config.roles.familyFriend];
                finalClasses.forEach(cls => { if (config.roles.classes[cls]) rolesToAdd.push(config.roles.classes[cls]); });
                await interaction.member.roles.add(rolesToAdd);
                
                await db.collection('members').doc(interaction.user.id).set({
                    discordId: interaction.user.id, discordTag: interaction.user.tag, gameName: nameInput,
                    gameClasses: finalClasses, gameLevel: 'N/A', gameCode: 'N/A', role: '親友團', joinDate: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                await updateNickname(interaction.member, nameInput, '親友團', finalClasses);
                const passedMsg = `🎉 **太棒了！狂賀！** 🎉\n歡迎成為 ENDLESS 大家庭的一份子！🥳\n現在，伺服器裡的所有專屬頻道都已經為你解鎖囉！趕快進去跟大家打個招呼、找人一起練功打王吧！衝呀～～🚀`;
                await interaction.member.send(passedMsg).catch(() => {});

                try {
                    const welcomeChannelFriend = await client.channels.fetch(config.channels.welcomeFriend);
                    if (welcomeChannelFriend) {
                        const randomFriendMsg = welcomeFriendMessages[Math.floor(Math.random() * welcomeFriendMessages.length)](interaction.user.id);
                        await welcomeChannelFriend.send(randomFriendMsg);
                    }
                } catch (err) {}

                return interaction.editReply({ content: `✅ 登記成功！身分組已發放，歡迎加入！` });
            } catch (error) { return interaction.editReply({ content: '❌ 處理失敗，請確認機器人身分組階級是否在親友團之上。' }); }
        }

        if (interaction.customId.startsWith('modal_reject_custom_')) {
            const parts = interaction.customId.split('_');
            const targetUserId = parts[3]; const msgId = parts[4]; const reason = interaction.fields.getTextInputValue('reject_reason');
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const member = await interaction.guild.members.fetch(targetUserId);
                const rejectMsg = `💌 嗨嗨～這裡是 ENDLESS 審核中心。\n非常抱歉，你剛才送出的申請暫時未通過審核喔 🥺\n\n**幹部留給你的悄悄話 / 退回原因：**\n💬 *${reason}*\n\n別灰心！只要調整一下，隨時歡迎你再次送出申請！我們的大門永遠為你敞開，期待你準備好後再次回來找我們玩喔！💪✨`;
                await member.send(rejectMsg).catch(() => {});

                const channel = await client.channels.fetch(config.channels.approval);
                const originalMsg = await channel.messages.fetch(msgId);
                const updatedEmbed = EmbedBuilder.from(originalMsg.embeds[0]).setColor('#FF0000').setTitle('❌ 申請已退回').setFooter({ text: `由 ${interaction.user.tag} 退回`, iconURL: interaction.user.displayAvatarURL() });
                await originalMsg.edit({ embeds: [updatedEmbed], components: [] });

                return interaction.editReply({ content: `✅ 已完成退回通知。` });
            } catch (error) { return interaction.editReply({ content: '❌ 無法發送私訊通知該成員。' }); }
        }

        if (interaction.customId === 'modal_update_data') {
            const newName = interaction.fields.getTextInputValue('update_name');
            const newLevel = interaction.fields.fields.get('update_level') ? interaction.fields.getTextInputValue('update_level') : 'N/A';
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
            try {
                const doc = await db.collection('members').doc(interaction.user.id).get();
                if (!doc.exists) return interaction.editReply({ content: '❌ 找不到您的資料。可能是您還沒申請，或是幹部尚未審核通過喔！' });
                
                const userData = doc.data();
                const classes = userData.gameClasses || (userData.gameClass ? [userData.gameClass] : []);
                const roleType = userData.role; 
                
                const updateData = { gameName: newName, lastUpdated: admin.firestore.FieldValue.serverTimestamp() };
                if (newLevel && newLevel !== 'N/A') updateData.gameLevel = newLevel;
                await db.collection('members').doc(interaction.user.id).update(updateData);
                
                const newNick = await updateNickname(interaction.member, newName, roleType, classes);
                return interaction.editReply({ content: `✅ 資料更新成功！您的暱稱已同步更新為：**${newNick}**` });
            } catch (error) { return interaction.editReply({ content: '❌ 更新失敗，請稍後再試。' }); }
        }

        // ------------------------------------------
        // 👑 【迴響系統表單】
        // ------------------------------------------
        if (interaction.customId.startsWith('reserve_')) {
            await interaction.deferReply({ ephemeral: true });
            
            if (interaction.message && interaction.message.flags.has(64)) {
                await interaction.message.delete().catch(() => {});
            }

            const parts = interaction.customId.split('_');
            const location = parts[1];
            const times = parseInt(parts[2] || '1', 10);

            let date = interaction.fields.getTextInputValue('date');
            let time = interaction.fields.getTextInputValue('time');
            const gameId = interaction.fields.getTextInputValue('gameId');
            const channel = interaction.fields.getTextInputValue('channel') || ''; 
            const baseNotes = interaction.fields.getTextInputValue('notes') || '無';
            
            const { formattedDate, formattedTime, parsedDate } = formatDateTimeStr(date, time);
            const newDateTime = parsedDate;

            if (isNaN(newDateTime.getTime())) return interaction.editReply({ content: '❌ **日期或時間格式錯誤**，請確認格式（例如：2026-08-18 14:30）。' });
            if (newDateTime.getTime() <= Date.now()) return interaction.editReply({ content: '❌ **無法預約過去的時間**。' });

            const opMode = appSettings['operationMode'] || {};
            const frozenSlots = opMode.frozenSlots || [];
            const autoApprove = opMode.autoApprove || false;
            // 🌟 核心升級：讀取最大接單上限設定，如果沒有設定預設為 1
            const maxConcurrent = opMode.maxConcurrentOrders || 1; 

            let scheduledSlots = [];
            for (let i = 0; i < times; i++) {
                const targetTimeMs = newDateTime.getTime() + (i * 40 * 60 * 1000);
                const targetObj = new Date(targetTimeMs + 8 * 60 * 60 * 1000); 
                
                const tDate = `${targetObj.getUTCFullYear()}-${String(targetObj.getUTCMonth()+1).padStart(2,'0')}-${String(targetObj.getUTCDate()).padStart(2,'0')}`;
                const tTime = `${String(targetObj.getUTCHours()).padStart(2,'0')}:${String(targetObj.getUTCMinutes()).padStart(2,'0')}`;

                if (isTimeFrozen(tTime, frozenSlots, tDate)) {
                    const frozenMsg = getFrozenTextForDateStr(frozenSlots, tDate);
                    return interaction.editReply({ content: `❌ **系統凍結時段**：第 ${i+1} 場（${tDate} \`${tTime}\`）為暫不開放預約時段！\n📌 該日暫停時段說明：${frozenMsg}\n請重新選擇首場時間喔！` });
                }

                // 🌟 核心升級：改用「計算同時段單量」取代原本的「有單就擋」
                const conflictingOrders = allReservations.filter(res => res.location === location && Math.abs(targetTimeMs - res.timestamp) < 10 * 60 * 1000 && res.status === 'approved');
                if (conflictingOrders.length >= maxConcurrent) {
                    return interaction.editReply({ content: `❌ **時段衝突**：第 ${i+1} 場（${tTime}）前後10分鐘已達最大接單上限 (${maxConcurrent}單)，無法完成連續預約。` });
                }

                scheduledSlots.push({ targetTimeMs, tDate, tTime });
            }

            let dmEmbedDesc = "";
            
            for (let i = 0; i < times; i++) {
                const slot = scheduledSlots[i];
                const notes = times > 1 ? `${baseNotes} (連放 ${i+1}/${times})` : baseNotes;

                const data = {
                    discordId: interaction.user.id, 
                    discordName: interaction.user.displayName || interaction.user.username,
                    gameId, date: slot.tDate, time: slot.tTime, location, channel, notes,
                    timestamp: slot.targetTimeMs, 
                    createdAt: Date.now(), 
                    reminded: false, takenBy: null, postChecked: false, userDmMsgId: null, buttonsRemoved: false, dmFailed: false,
                    status: autoApprove ? 'approved' : 'pending',
                    reviewer: autoApprove ? '系統自動' : null
                };
                
                const docRef = await db.collection('reservations').add(data);
                addDbStat('write');
                data.id = docRef.id;

                const payload = buildTicketPayload(docRef.id, data);
                const sentMsgs = await broadcastToManagementAreas(client, payload);
                await docRef.update({ ticketMsgs: sentMsgs });
                addDbStat('write');

                dmEmbedDesc += `> 第 ${i+1} 場：\`${slot.tDate} ${slot.tTime}\`\n`;

                if (times === 1) {
                    const btnRow = autoApprove 
                        ? new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`edit_${docRef.id}`).setLabel('✏️ 變更登記資料').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`cancel_${docRef.id}`).setLabel('🗑️ 取消預約').setStyle(ButtonStyle.Danger)
                        )
                        : new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cancel_${docRef.id}`).setLabel('🗑️ 取消預約').setStyle(ButtonStyle.Danger));
                    
                    const dmEmbed = new EmbedBuilder()
                        .setColor(autoApprove ? 0x00FF00 : 0xFFA500)
                        .setTitle(autoApprove ? '✅ 預約已自動通過' : '⏳ 預約等待審核中')
                        .setDescription(autoApprove ? `系統已自動審核通過您的訂單！\n**地點**：${location}\n**時間**：${date} ${time}` : `您的訂單已送出，等待審核通過後才會加入排班表喔！\n**地點**：${location}\n**時間**：${date} ${time}`);
                    
                    try {
                        const dmMsg = await interaction.user.send({ embeds: [dmEmbed], components: [btnRow] });
                        await docRef.update({ userDmMsgId: dmMsg.id }); addDbStat('write');
                    } catch (e) {}
                }
            }

            if (times > 1) {
                const batchEmbed = new EmbedBuilder()
                    .setColor(autoApprove ? 0x00FF00 : 0xFFA500)
                    .setTitle(autoApprove ? `✅ 連續預約已自動通過 (共 ${times} 場)` : `⏳ 連續預約等待審核中 (共 ${times} 場)`)
                    .setDescription(`**地點**：${location}\n\n**施放時段**：\n${dmEmbedDesc}\n\n*(💡 註：連續預約將拆分為獨立訂單發包，若需取消或變更請聯繫管理員處理)*`);
                
                try { await interaction.user.send({ embeds: [batchEmbed] }); } catch (e) {}
            }

            const replyMsg = autoApprove 
                ? `✅ **預約成功！** 共產生 ${times} 筆訂單，系統已自動審核通過，請查看 DM 確認。`
                : `✅ 預約已送出！共 ${times} 筆訂單，請查看 DM 等待審核結果。`;
            
            await interaction.editReply({ content: replyMsg });
            if (autoApprove) updateBoard(client);
        }

        if (interaction.customId.startsWith('submitReject_')) {
            await interaction.deferUpdate().catch(() => {});
            const docId = interaction.customId.split('_')[1];
            const reason = interaction.fields.getTextInputValue('reason');
            await processRejection(client, docId, reason, interaction.user.id, interaction);
        }

        if (interaction.customId.startsWith('submitEdit_')) {
            await interaction.deferUpdate().catch(() => {}); 
            
            const docId = interaction.customId.split('_')[1];
            let newDate = interaction.fields.getTextInputValue('newDate');
            let newTime = interaction.fields.getTextInputValue('newTime');
            const newGameId = interaction.fields.getTextInputValue('gameId');
            const newChannel = interaction.fields.getTextInputValue('channel') || '';
            const newNotes = interaction.fields.getTextInputValue('notes') || '無';
            
            const { formattedDate, formattedTime, parsedDate } = formatDateTimeStr(newDate, newTime);
            newDate = formattedDate; newTime = formattedTime; const newDateTime = parsedDate;

            if (isNaN(newDateTime.getTime())) return interaction.followUp({ content: '❌ 格式錯誤，請確認日期格式。', ephemeral: true });
            if (newDateTime.getTime() <= Date.now()) return interaction.followUp({ content: '❌ 無法改為過去的時間。', ephemeral: true });

            const opMode = appSettings['operationMode'] || {};
            const frozenSlots = opMode.frozenSlots || [];
            const autoApprove = opMode.autoApprove || false;
            const maxConcurrent = opMode.maxConcurrentOrders || 1;

            if (isTimeFrozen(newTime, frozenSlots, newDate)) {
                const frozenMsg = getFrozenTextForDateStr(frozenSlots, newDate);
                return interaction.followUp({ content: `❌ **系統凍結時段**：此時段（${newTime}）為暫不開放預約時段！\n📌 該日暫停時段說明：${frozenMsg}\n請選擇其他時間喔！`, ephemeral: true });
            }

            const currentDoc = await db.collection('reservations').doc(docId).get();
            addDbStat('read');
            if (!currentDoc.exists) return interaction.followUp({ content: '❌ 找不到此訂單。', ephemeral: true });
            let data = currentDoc.data();
            const timeChanged = data.timestamp !== newDateTime.getTime();

            if (timeChanged) {
                // 🌟 核心升級：編輯時間也要判斷同時段是否大於上限
                const conflictingOrders = allReservations.filter(res => res.id !== docId && res.location === data.location && Math.abs(newDateTime.getTime() - res.timestamp) < 10 * 60 * 1000 && res.status === 'approved');
                if (conflictingOrders.length >= maxConcurrent) {
                    return interaction.followUp({ content: `❌ 申請時間前後10分鐘已達最大接單上限 (${maxConcurrent}單)，無法更改至此時段。`, ephemeral: true });
                }
            }

            const isLastMinute = (data.timestamp - Date.now()) <= 30 * 60 * 1000;
            let replyText = autoApprove ? `✅ **資料已更新，系統已自動審核通過。**` : `✅ **資料已更新，並已推進置底等待審核。**`;
            
            if (timeChanged && isLastMinute && data.status === 'approved') {
                const { points, bannedUntil } = await addViolation(interaction.user.id);
                if (bannedUntil) replyText += `\n💡 **系統通知**：因近期臨時調整達上限，暫停預約權限 7 天。`;
                else replyText += `\n💡 **溫馨小提醒**：距離原本開打不到 30 分鐘更改時間，已記錄一次臨時調整（目前：${points}/3）。`;
            }

            data.discordName = interaction.user.displayName || interaction.user.username;
            data.date = newDate; data.time = newTime; data.gameId = newGameId; data.channel = newChannel; data.notes = newNotes;
            data.timestamp = newDateTime.getTime(); 
            data.status = autoApprove ? 'approved' : 'pending'; 
            data.reviewer = autoApprove ? '系統自動' : null;
            data.reminded = false; data.postChecked = false; data.takenBy = null; data.dmFailed = false; data.buttonsRemoved = false;

            const payload = buildTicketPayload(docId, data);
            const newRefs = await bumpManagementMessages(client, data.ticketMsgs, payload.embeds[0], payload.components);

            await db.collection('reservations').doc(docId).update({ 
                discordName: data.discordName, date: newDate, time: newTime, gameId: newGameId, channel: newChannel, notes: newNotes,
                timestamp: newDateTime.getTime(), reminded: false, status: data.status, reviewer: data.reviewer, takenBy: null, postChecked: false, dmFailed: false, buttonsRemoved: false, ticketMsgs: newRefs 
            });
            addDbStat('write');

            await interaction.followUp({ content: replyText, ephemeral: true });
            
            const dmEmbed = new EmbedBuilder().setColor(autoApprove ? 0x00FF00 : 0xFFA500).setTitle(autoApprove ? '✅ 預約已自動通過' : '⏳ 預約變更待審核中')
                .setDescription(autoApprove ? `系統已自動審核通過！\n**地點**：${data.location}\n**時間**：${newDate} ${newTime}` : `資料已變更，等待管理員重新審核。\n**地點**：${data.location}\n**時間**：${newDate} ${newTime}`);
            const btnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`edit_${docId}`).setLabel('✏️ 變更登記資料').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`cancel_${docId}`).setLabel('🗑️ 取消預約').setStyle(ButtonStyle.Danger)
            );
            await interaction.editReply({ embeds: [dmEmbed], components: [btnRow] });

            updateBoard(client);
        }
    }
}

module.exports = { handleComponent };
