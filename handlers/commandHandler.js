// handlers/commandHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { db, addDbStat, getCache } = require('../utils/firebase');
const { config, getAgentRoleId } = require('../config/constants');
const { generateMemberLeaderboard, generateFriendLeaderboard, updateNickname } = require('../utils/guildHelpers');
const { getTaiwanTime, updateBoard, checkIsAgent, buildAgentStatMessage, generateScheduleEmbed, broadcastToManagementAreas } = require('../utils/echoHelpers');

async function handleCommand(interaction, client) {
    const cmd = interaction.commandName;
    const { allReservations, appSettings, stickers } = getCache();
    
    const isOwner = interaction.user.id === interaction.guild?.ownerId; 
    const hasAdminRole = interaction.member?.roles?.cache?.hasAny(...config.roles.adminRoles); 
    const hasAdminPerm = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator); 

    // ------------------------------------------
    // 🎨 【貼圖系統指令區】
    // ------------------------------------------
    if (['貼圖', '新增貼圖', '刪除貼圖'].includes(cmd)) {
        
        if (cmd === '新增貼圖') {
            if (!isOwner && !hasAdminRole && !hasAdminPerm) return interaction.reply({ content: '❌ 很抱歉，新增貼圖僅限幹部使用。', flags: MessageFlags.Ephemeral });
            
            const name = interaction.options.getString('標題');
            const url = interaction.options.getString('圖片網址');
            const desc = interaction.options.getString('描述') || '';
            const emoji = interaction.options.getString('表情符號') || '';
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await db.collection('stickers').doc(name).set({ name, url, description: desc, emoji, timestamp: Date.now() });
            addDbStat('write');
            return interaction.editReply(`✅ **貼圖新增成功！**\n名稱：\`${name}\`\n現在大家都可以使用 \`/貼圖\` 呼叫它囉！`);
        }

        if (cmd === '刪除貼圖') {
            if (!isOwner && !hasAdminRole && !hasAdminPerm) return interaction.reply({ content: '❌ 很抱歉，刪除貼圖僅限幹部使用。', flags: MessageFlags.Ephemeral });
            const name = interaction.options.getString('標題');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await db.collection('stickers').doc(name).delete();
            addDbStat('write');
            return interaction.editReply(`🗑️ **貼圖已刪除：** \`${name}\``);
        }

        if (cmd === '貼圖') {
            if (!stickers || stickers.length === 0) {
                return interaction.reply({ content: '❌ 目前圖庫空空如也，請管理員使用 `/新增貼圖` 來建立吧！', flags: MessageFlags.Ephemeral });
            }

            // 取前 25 個貼圖 (Discord 選單限制)
            const options = stickers.slice(0, 25).map(s => {
                const opt = new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.name);
                if (s.description) opt.setDescription(s.description);
                if (s.emoji) opt.setEmoji(s.emoji);
                return opt;
            });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('select_sticker').setPlaceholder('請選擇要發送的貼圖...').addOptions(options)
            );
            return interaction.reply({ content: '🖼️ **打開專屬貼圖圖庫：**', components: [row], flags: MessageFlags.Ephemeral });
        }
    }


    // ------------------------------------------
    // 💎 【公會系統指令區】
    // ------------------------------------------
    if (['解鎖權限', '發布小指南', '查詢目前公會成員', '查詢目前親友團', '同步更名', '清除資料', '清除訊息', '星光紅毯設定'].includes(cmd)) {
        
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
    // 👑 【迴響預約系統指令區】 (略過未修改的部分以節省版面，保持你原有的完整邏輯)
    // ------------------------------------------
    if (['預約', '我的紀錄', '接單統計', '查詢預約', '刷新看板', '註冊迴響專員', '指定迴響專員', '刪除迴響專員', '清理訊息', '設定公開看板', '設定管理看板', '迴響管理區', '價格', '迴響鬧鐘', '優惠設定', '同時段最大接單數', '系統狀態', '營運設定', '玩家管理', '刪除訂單'].includes(cmd)) {
        
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

        // ... [保留你原有的迴響指令邏輯，完全不動] ...
        // (為了避免字數超過限制，下方原有迴響邏輯請直接接續你的原版程式碼即可，以上已經涵蓋了貼圖的新增與核心邏輯)
