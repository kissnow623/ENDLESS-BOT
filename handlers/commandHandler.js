// handlers/commandHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { db, addDbStat, getCache } = require('../utils/firebase');
const { config, getAgentRoleId, MARKET_CHANNEL_ID } = require('../config/constants');
const { generateMemberLeaderboard, generateFriendLeaderboard, updateNickname } = require('../utils/guildHelpers');
const { getTaiwanTime, updateBoard, checkIsAgent, buildAgentStatMessage, generateScheduleEmbed, broadcastToManagementAreas } = require('../utils/echoHelpers');
const { sendStickerViaWebhook } = require('../utils/stickerHelpers');
const { getMarketItem, getAllMarketItems } = require('../utils/marketHelpers'); 

const cashItemWcPrices = {
    "AP初始化卷軸": 400, "SP初始化卷軸": 300, "高級瞬移之石": 36.36, "突襲額外獎勵票券": 171.42, "飄雪結晶": 27.27, "凍結加持器": 40.91, "高效能喇叭UP": 127.28, "戒指精選卷軸轉蛋券": 190,
    "神祕背包": 250, "幸運滿滿轉蛋券": 190, "仲夏假期轉蛋券": 190
};

// 🌟 指定的頻道 ID
const ALLOWED_MARKET_CHANNEL_ID = '1544604459085070346'; // 市場功能限定使用頻道
const GUILD_CHANNEL_ID = '1539971422842261601'; // 發布目標：公會頻道
const FRIEND_CHANNEL_ID = '1544604459085070346'; // 發布目標：親友閒聊

async function handleCommand(interaction, client) {
    const { allReservations, appSettings, stickers, emotes } = getCache();
    
    const isOwner = interaction.user.id === interaction.guild?.ownerId; 
    const hasAdminRole = interaction.member?.roles?.cache?.hasAny(...config.roles.adminRoles); 
    const hasAdminPerm = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator); 

    // 🌟 身分組驗證：判斷是否為公會成員 (決定是否有權限發布到公會頻道)
    const isGuildMember = interaction.member?.roles?.cache?.has(config.roles.guildMember) || interaction.member?.roles?.cache?.some(r => r.name.includes('公會'));

    // ==========================================
    // 🌟 【市場看板：元件攔截處理區】 (選單、表單、按鈕)
    // ==========================================
    if (interaction.isStringSelectMenu()) {
        
        // 1️⃣ 處理主看板選單
        if (interaction.customId === 'select_market_action') {
            if (interaction.channelId !== ALLOWED_MARKET_CHANNEL_ID) {
                return interaction.reply({ content: `❌ 市場看板功能請移駕至 <#${ALLOWED_MARKET_CHANNEL_ID}> 頻道使用喔！`, flags: MessageFlags.Ephemeral });
            }

            const action = interaction.values[0];

            if (action === 'market_price') {
                const modal = new ModalBuilder().setCustomId('modal_market_price').setTitle('🔍 即時查價系統 (支援關鍵字)');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('item_name').setLabel("請輸入想找的物品關鍵字 (例如: 詛咒/30%)").setStyle(TextInputStyle.Short).setRequired(true)
                ));
                return interaction.showModal(modal);
            }

            if (action === 'market_arbitrage') {
                // 自動重置選單狀態
                interaction.message.edit({ components: interaction.message.components }).catch(() => {});

                const allItems = getAllMarketItems();
                let validItems = allItems.filter(i => i.rawTrend !== 0 && !isNaN(i.rawTrend)).sort((a, b) => b.rawTrend - a.rawTrend);
                
                let pText = validItems.slice(0, 5).map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📈 \`+${i.rawTrend.toFixed(2)}%\` (${i.price})`).join('\n\n');
                let dText = validItems.slice(-5).reverse().map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📉 \`${i.rawTrend.toFixed(2)}%\` (${i.price})`).join('\n\n');

                const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle('🎯 市場行情套利雷達')
                    .addFields({ name: '🔥 【溢價急漲區】(建議出售)', value: pText || '無', inline: true }, { name: '🧊 【折價超跌區】(建議掃貨)', value: dText || '無', inline: true });

                const publishBtn = new ActionRowBuilder();
                if (isGuildMember) publishBtn.addComponents(new ButtonBuilder().setCustomId('arbitrage_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
                publishBtn.addComponents(new ButtonBuilder().setCustomId('arbitrage_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

                return interaction.reply({ embeds: [embed], components: [publishBtn], flags: MessageFlags.Ephemeral });
            }

            if (action === 'market_cash') {
                const modal = new ModalBuilder().setCustomId('modal_market_cash').setTitle('💳 課金指南試算');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('twd_amount').setLabel("預計投入台幣金額 (TWD)").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('wc_rate').setLabel("點數比值 (不填預設為 6.63)").setStyle(TextInputStyle.Short).setRequired(false).setValue('6.63'))
                );
                return interaction.showModal(modal);
            }

            if (action === 'market_scroll') {
                // 自動重置選單狀態
                interaction.message.edit({ components: interaction.message.components }).catch(() => {});
                return interaction.reply({ 
                    content: '🧮 **衝卷試算** 包含多階混卷、純白救援等高階參數，Discord 的下拉表單無法容納這麼多欄位。\n👉 **請直接在對話框輸入 `/衝卷試算` 來呼叫完整版 AI 計算機！**', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            if (action === 'market_alert_set') {
                const modal = new ModalBuilder().setCustomId('modal_market_alert').setTitle('🚨 設定價格推播警報');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel("物品名稱").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_price').setLabel("目標觸發價格 (萬)").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel("觸發條件 (請填 高於 或 低於)").setStyle(TextInputStyle.Short).setRequired(true).setValue('低於'))
                );
                return interaction.showModal(modal);
            }

            // 🌟 加入完整的我的警報查詢與「刪除機制」
            if (action === 'market_alert_list') {
                // 自動重置選單狀態
                interaction.message.edit({ components: interaction.message.components }).catch(() => {});
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                try {
                    const snapshot = await db.collection('priceAlerts').where('userId', '==', interaction.user.id).get();
                    if (snapshot.empty) {
                        return interaction.editReply('📭 您目前沒有設定任何價格警報喔！');
                    }
                    
                    let desc = '🚨 **您的專屬價格推播警報清單**\n\n';
                    const deleteOptions = [];
                    
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        desc += `🔹 **${data.itemName}** ➔ 當 ${data.condition} \`${data.targetPrice} 萬\` 時通知\n`;
                        
                        // 建立刪除選項
                        deleteOptions.push(new StringSelectMenuOptionBuilder()
                            .setLabel(`刪除: ${data.itemName.substring(0, 50)}`)
                            .setDescription(`條件: ${data.condition} ${data.targetPrice}萬`)
                            .setValue(doc.id) // 用資料庫的文檔 ID 當作值，確保精準刪除
                        );
                    });
                    
                    const embed = new EmbedBuilder().setColor(0xEF4444).setDescription(desc);
                    const components = [];
                    
                    if (deleteOptions.length > 0) {
                        components.push(new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('select_delete_alert')
                                .setPlaceholder('🗑️ 點擊這裡選擇要刪除的警報...')
                                .addOptions(deleteOptions.slice(0, 25))
                        ));
                    }
                    
                    return interaction.editReply({ embeds: [embed], components });
                } catch (error) {
                    return interaction.editReply('❌ 無法連線至警報資料庫，請稍後再試。');
                }
            }

            return interaction.reply({ content: '🛠️ 此功能正在連線調整中，即將開放！', flags: MessageFlags.Ephemeral });
        }

        // 🌟 新增：處理刪除警報的下拉選單
        if (interaction.customId === 'select_delete_alert') {
            const alertId = interaction.values[0];
            try {
                await db.collection('priceAlerts').doc(alertId).delete();
                return interaction.update({ content: '✅ **指定的警報已成功刪除！** 不會再被打擾囉！', embeds: [], components: [] });
            } catch (err) {
                return interaction.reply({ content: '❌ 刪除警報時發生錯誤，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
        }

        // 2️⃣ 處理查價結果的二次下拉選單 (智能模糊搜尋結果選擇)
        if (interaction.customId === 'select_market_price_result') {
            const itemName = interaction.values[0];
            const itemData = getMarketItem(itemName);
            
            if (!itemData) return interaction.reply({ content: `🔍 找不到 **${itemName}** 的報價！`, flags: MessageFlags.Ephemeral });

            const displayChartUrl = isGuildMember ? itemData.chartUrl : (itemData.chartUrl1Day || itemData.chartUrl);
            const viewLevelText = isGuildMember ? '全區間線圖 (公會權限)' : '24小時線圖 (親友權限)';

            const embed = new EmbedBuilder().setColor(0x0f172a).setTitle(`📊 ${itemData.name}`)
                .setDescription(`**最新價格：** \`${itemData.price}\`\n**近一次波動：** ${itemData.trend}`)
                .setTimestamp()
                .setFooter({ text: `價格走勢 [${viewLevelText}] • 資料來源: Artale 楓之股`, iconURL: client.user.displayAvatarURL() });

            if (displayChartUrl) embed.setImage(displayChartUrl);

            const btnRow = new ActionRowBuilder();
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId(`price_pubG_${itemData.name}`).setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(
                new ButtonBuilder().setCustomId(`price_pubF_${itemData.name}`).setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setLabel('🌐 網頁查看').setStyle(ButtonStyle.Link).setURL('https://artalestock.netlify.app/') 
            );

            return interaction.update({ content: '✅ 查詢成功！', embeds: [embed], components: [btnRow] });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_market_price') {
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            
            const allItems = getAllMarketItems() || [];
            
            // 🌟 終極防當機：過濾資料並「強制去除重複名稱」，確保 API 建立選單時不會崩潰
            const uniqueItems = [];
            const seenNames = new Set();
            for (const item of allItems) {
                const name = item.name || '';
                if (name && name.toLowerCase().includes(query) && !seenNames.has(name)) {
                    seenNames.add(name);
                    uniqueItems.push(item);
                }
            }
            
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到包含 **${query}** 的任何物品報價！`, flags: MessageFlags.Ephemeral });
            
            if (uniqueItems.length > 1) {
                const options = uniqueItems.slice(0, 25).map(r => {
                    const safeName = r.name.substring(0, 100); 
                    const safeDesc = `目前報價: ${r.price || '無報價'}`.substring(0, 100);
                    return new StringSelectMenuOptionBuilder().setLabel(safeName).setValue(safeName).setDescription(safeDesc);
                });
                
                const dropdownRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_market_price_result').setPlaceholder('找到多個結果，請下拉選擇精確物品...').addOptions(options)
                );
                
                return interaction.reply({ content: `🔍 找到 **${uniqueItems.length}** 個包含「${query}」的物品，請從下方選單點擊查看：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
            }

            const itemData = uniqueItems[0];
            const displayChartUrl = isGuildMember ? itemData.chartUrl : (itemData.chartUrl1Day || itemData.chartUrl);
            const viewLevelText = isGuildMember ? '全區間線圖 (公會權限)' : '24小時線圖 (親友權限)';

            const embed = new EmbedBuilder().setColor(0x0f172a).setTitle(`📊 ${itemData.name}`)
                .setDescription(`**最新價格：** \`${itemData.price}\`\n**近一次波動：** ${itemData.trend}`)
                .setTimestamp()
                .setFooter({ text: `價格走勢 [${viewLevelText}] • 資料來源: Artale 楓之股`, iconURL: client.user.displayAvatarURL() });

            if (displayChartUrl) embed.setImage(displayChartUrl);

            const btnRow = new ActionRowBuilder();
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId(`price_pubG_${itemData.name}`).setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(
                new ButtonBuilder().setCustomId(`price_pubF_${itemData.name}`).setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setLabel('🌐 網頁查看').setStyle(ButtonStyle.Link).setURL('https://artalestock.netlify.app/') 
            );

            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'modal_market_cash') {
            const twd = parseInt(interaction.fields.getTextInputValue('twd_amount')) || 0;
            const rate = parseFloat(interaction.fields.getTextInputValue('wc_rate')) || 6.63;
            const totalWc = twd * rate;
            
            const allItems = getAllMarketItems();
            let results = [];

            for (const item of allItems) {
                const cleanName = item.name.replace("[商城道具]", "").trim();
                const wcPrice = cashItemWcPrices[item.name] || cashItemWcPrices[cleanName];
                if (wcPrice > 0 && item.rawPrice > 0) {
                    const totalMesos = (totalWc / wcPrice) * item.rawPrice;
                    results.push({ name: cleanName, mesos: totalMesos, efficiency: Math.floor(item.rawPrice / wcPrice) });
                }
            }

            if (results.length === 0) return interaction.reply({ content: '❌ 無法取得商城道具的報價資料。', flags: MessageFlags.Ephemeral });

            results.sort((a, b) => b.mesos - a.mesos);
            const topResults = results.slice(0, 3);

            let descText = `**預計投入台幣：** \`${twd.toLocaleString()}\` TWD\n**轉換點數：** \`${totalWc.toLocaleString()}\` WC (匯率 ${rate})\n\n🏆 **最高效率方案 Top 3：**\n\n`;
            topResults.forEach((res, i) => {
                const mesoStr = res.mesos >= 100000000 ? `${(res.mesos / 100000000).toFixed(2)} 億` : `${Math.floor(res.mesos / 10000).toLocaleString()} 萬`;
                descText += `**${i+1}. 買【${res.name}】去賣**\n└ 預估可得楓幣：💰 **\`${mesoStr}\`** (效率: ${res.efficiency.toLocaleString()} 楓幣/WC)\n\n`;
            });

            const embed = new EmbedBuilder().setColor(0xF59E0B).setTitle('💳 台幣 (TWD) ➡️ 楓幣 最佳化轉換試算').setDescription(descText);
            
            const btnRow = new ActionRowBuilder();
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId(`cash_pubG_0`).setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(new ButtonBuilder().setCustomId(`cash_pubF_0`).setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'modal_market_alert') {
            const item = interaction.fields.getTextInputValue('item_name');
            const price = interaction.fields.getTextInputValue('target_price');
            const condition = interaction.fields.getTextInputValue('condition');
            
            await db.collection('priceAlerts').add({
                userId: interaction.user.id,
                userName: interaction.user.username,
                itemName: item,
                targetPrice: Number(price),
                condition: condition, 
                createdAt: Date.now()
            });

            return interaction.reply({ content: `✅ **警報寫入成功！**\n資料庫已記錄：當【${item}】${condition} \`${price} 萬\` 時，將啟動背景推播私訊通知您！`, flags: MessageFlags.Ephemeral });
        }
    }

    // 🌟 雙按鈕智慧路由發布系統
    if (interaction.isButton() && interaction.customId) {
        const cId = interaction.customId;
        
        if (cId.includes('_pubG_') || cId.includes('_pubF_')) {
            const isGuildChannel = cId.includes('_pubG_');
            const targetChannelId = isGuildChannel ? GUILD_CHANNEL_ID : FRIEND_CHANNEL_ID;
            const channelName = isGuildChannel ? '🥳｜公會頻道' : '👄｜親友閒聊relax';

            const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
            if (!targetChannel) return interaction.reply({ content: `❌ 找不到目標頻道 (${targetChannelId})，無法發布。`, flags: MessageFlags.Ephemeral });

            // 處理查價發布 (需重抓資料)
            if (cId.startsWith('price_')) {
                const parts = cId.split('_'); 
                const itemName = parts.slice(2).join('_');
                const itemData = getMarketItem(itemName);
                
                if (!itemData) return interaction.reply({ content: '資料已過期，無法發布。', flags: MessageFlags.Ephemeral });

                const displayChartUrl = isGuildChannel ? itemData.chartUrl : (itemData.chartUrl1Day || itemData.chartUrl);
                const viewLevelText = isGuildChannel ? '全區間線圖 (公會權限)' : '24小時線圖 (親友權限)';

                const embed = new EmbedBuilder().setColor(0x0f172a).setTitle(`📊 ${itemData.name} (由 ${interaction.user.username} 分享)`)
                    .setDescription(`**最新價格：** \`${itemData.price}\`\n**近一次波動：** ${itemData.trend}`)
                    .setTimestamp()
                    .setFooter({ text: `價格走勢 [${viewLevelText}] • 資料來源: Artale 楓之股`, iconURL: client.user.displayAvatarURL() });

                if (displayChartUrl) embed.setImage(displayChartUrl);

                try {
                    await targetChannel.send({ embeds: [embed] });
                    return interaction.update({ content: `✅ 已成功將查價資訊分享至 ${channelName}！`, components: [] });
                } catch (err) {
                    console.error('發送分享失敗:', err);
                    return interaction.reply({ content: `❌ 發布失敗，機器人可能沒有該頻道的發言權限。`, flags: MessageFlags.Ephemeral });
                }
            }

            // 處理其他系統發布 (直接轉傳原 Embed)
            if (cId.startsWith('arbitrage_') || cId.startsWith('cash_') || cId.startsWith('scroll_')) {
                if (!interaction.message.embeds || interaction.message.embeds.length === 0) {
                    return interaction.reply({ content: '❌ 無法取得原始圖表，發布失敗。', flags: MessageFlags.Ephemeral });
                }

                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                
                if (cId.startsWith('arbitrage_')) originalEmbed.setTitle(`🎯 市場行情套利雷達 (由 ${interaction.user.username} 分享)`);
                if (cId.startsWith('cash_')) originalEmbed.setTitle(`💳 課金最佳化轉換試算 (由 ${interaction.user.username} 分享)`);
                if (cId.startsWith('scroll_')) originalEmbed.setTitle(`🧮 衝卷計算機試算結果 (由 ${interaction.user.username} 分享)`);
                
                try {
                    await targetChannel.send({ embeds: [originalEmbed] });
                    return interaction.update({ content: `✅ 已成功分享至 ${channelName}！`, components: [] });
                } catch (err) {
                    console.error('發送分享失敗:', err);
                    return interaction.reply({ content: `❌ 發布失敗，機器人可能沒有該頻道的發言權限。`, flags: MessageFlags.Ephemeral });
                }
            }
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const cmd = interaction.commandName;

    if (['查價', '套利雷達', '課金指南', '衝卷試算'].includes(cmd)) {
        
        if (interaction.channelId !== ALLOWED_MARKET_CHANNEL_ID) {
            return interaction.reply({ 
                content: `❌ 市場分析指令請移駕至 <#${ALLOWED_MARKET_CHANNEL_ID}> 頻道使用喔！`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        if (cmd === '查價') {
            const itemName = interaction.options.getString('物品名稱');
            const itemData = getMarketItem(itemName);
            if (!itemData) return interaction.reply({ content: `🔍 找不到 **${itemName}** 的報價！`, flags: MessageFlags.Ephemeral });

            const displayChartUrl = isGuildMember ? itemData.chartUrl : (itemData.chartUrl1Day || itemData.chartUrl);
            const viewLevelText = isGuildMember ? '全區間線圖 (公會權限)' : '24小時線圖 (親友權限)';

            const embed = new EmbedBuilder()
                .setColor(0x0f172a) 
                .setTitle(`📊 ${itemData.name}`)
                .setDescription(`**最新價格：** \`${itemData.price}\`\n**近一次波動：** ${itemData.trend}`)
                .setTimestamp()
                .setFooter({ text: `價格走勢 [${viewLevelText}] • 資料來源: Artale 楓之股`, iconURL: client.user.displayAvatarURL() });

            if (displayChartUrl) embed.setImage(displayChartUrl);

            const btnRow = new ActionRowBuilder();
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId(`price_pubG_${itemData.name}`).setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(
                new ButtonBuilder().setCustomId(`price_pubF_${itemData.name}`).setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setLabel('🌐 網頁查看').setStyle(ButtonStyle.Link).setURL('https://artalestock.netlify.app/') 
            );

            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }

        if (cmd === '套利雷達') {
            const allItems = getAllMarketItems();
            let validItems = allItems.filter(i => i.rawTrend !== 0 && !isNaN(i.rawTrend));
            
            validItems.sort((a, b) => b.rawTrend - a.rawTrend);
            
            const premiumItems = validItems.slice(0, 5); 
            const discountItems = validItems.slice(-5).reverse(); 

            let premiumText = premiumItems.map((item, i) => `**${i+1}.** ${item.name} \n└ 📈 \`+${item.rawTrend.toFixed(2)}%\` (報價: ${item.price})`).join('\n\n');
            let discountText = discountItems.map((item, i) => `**${i+1}.** ${item.name} \n└ 📉 \`${item.rawTrend.toFixed(2)}%\` (報價: ${item.price})`).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor(0x3B82F6)
                .setTitle('🎯 市場行情套利雷達')
                .addFields(
                    { name: '🔥 【溢價急漲區】(建議出售)', value: premiumText || '目前無顯著急漲物品', inline: true },
                    { name: '🧊 【折價超跌區】(建議掃貨)', value: discountText || '目前無顯著超跌物品', inline: true }
                )
                .setFooter({ text: '市場瞬息萬變，投資理財有賺有賠', iconURL: client.user.displayAvatarURL() });

            const btnRow = new ActionRowBuilder();
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId('arbitrage_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(new ButtonBuilder().setCustomId('arbitrage_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }

        if (cmd === '課金指南') {
            const twd = interaction.options.getInteger('台幣金額');
            const rate = interaction.options.getNumber('點數比值') || 6.63;
            const totalWc = twd * rate;
            
            const allItems = getAllMarketItems();
            let results = [];

            for (const item of allItems) {
                const cleanName = item.name.replace("[商城道具]", "").trim();
                const wcPrice = cashItemWcPrices[item.name] || cashItemWcPrices[cleanName];
                if (wcPrice > 0 && item.rawPrice > 0) {
                    const totalMesos = (totalWc / wcPrice) * item.rawPrice;
                    results.push({ 
                        name: cleanName, 
                        mesos: totalMesos, 
                        efficiency: Math.floor(item.rawPrice / wcPrice) 
                    });
                }
            }

            if (results.length === 0) return interaction.reply({ content: '❌ 無法取得商城道具的報價資料。', flags: MessageFlags.Ephemeral });

            results.sort((a, b) => b.mesos - a.mesos);
            const topResults = results.slice(0, 3);

            let descText = `**預計投入台幣：** \`${twd.toLocaleString()}\` TWD\n**轉換點數：** \`${totalWc.toLocaleString()}\` WC (匯率 ${rate})\n\n🏆 **最高效率方案 Top 3：**\n\n`;
            topResults.forEach((res, i) => {
                const mesoStr = res.mesos >= 100000000 ? `${(res.mesos / 100000000).toFixed(2)} 億` : `${Math.floor(res.mesos / 10000).toLocaleString()} 萬`;
                descText += `**${i+1}. 買【${res.name}】去賣**\n└ 預估可得楓幣：💰 **\`${mesoStr}\`** (效率: ${res.efficiency.toLocaleString()} 楓幣/WC)\n\n`;
            });

            const embed = new EmbedBuilder()
                .setColor(0xF59E0B)
                .setTitle('💳 台幣 (TWD) ➡️ 楓幣 最佳化轉換試算')
                .setDescription(descText);

            const btnRow = new ActionRowBuilder();
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId('cash_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(new ButtonBuilder().setCustomId('cash_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }

        if (cmd === '衝卷試算') {
            const equipPrice = interaction.options.getNumber('裝備底價'); 
            const slots = interaction.options.getInteger('裝備總衝數') || interaction.options.getInteger('剩餘次數');
            const target = interaction.options.getInteger('目標過數') || slots;
            const tolerance = interaction.options.getInteger('容許失敗數') ?? slots; 
            
            const s1Count = interaction.options.getInteger('主力卷張數'); 

            const s1Price = interaction.options.getNumber('主力卷價格') || interaction.options.getNumber('卷軸價格');
            const s1Prob = interaction.options.getInteger('主力卷成功率') || interaction.options.getInteger('成功率');
            const s1Dest = interaction.options.getInteger('主力卷毀損率') || interaction.options.getInteger('毀損率') || 0;
            
            const s2Price = interaction.options.getNumber('備用卷價格') || 0;
            const s2Prob = interaction.options.getInteger('備用卷成功率') || 0;
            const s2Dest = interaction.options.getInteger('備用卷毀損率') || 0;
            
            const cssPrice = interaction.options.getNumber('純白卷價格') || 0;
            const cssProb = interaction.options.getInteger('純白成功率') || 0;
            const cssDest = interaction.options.getInteger('純白毀損率') || 0;
            
            const marketPrice = interaction.options.getNumber('成品市價') || 0;

            if (s1Prob <= 0 || s1Prob > 100) return interaction.reply({ content: '❌ 成功率請輸入 1~100 之間的數字！', flags: MessageFlags.Ephemeral });
            if (target > slots) return interaction.reply({ content: '❌ 目標過數不能大於總衝數！', flags: MessageFlags.Ephemeral });

            const s1Fail = Math.max(0, 100 - s1Prob - s1Dest);
            const s2Enabled = s2Price > 0 && s2Prob > 0;
            const s2Fail = s2Enabled ? Math.max(0, 100 - s2Prob - s2Dest) : 0;
            const cssEnabled = cssPrice > 0 && cssProb > 0;
            const cssFail = cssEnabled ? Math.max(0, 100 - cssProb - cssDest) : 0;

            const getExpectedCostMatrix = (resetCost) => {
                let V = Array(target + 1).fill(0).map(() => Array(tolerance + 2).fill(resetCost));
                for (let f = 0; f <= tolerance; f++) V[target][f] = 0;

                for (let k = target - 1; k >= 0; k--) {
                    for (let iter = 0; iter < 100; iter++) { 
                        for (let f = tolerance; f >= 0; f--) {
                            let costGiveup = resetCost;
                            let costScroll = resetCost;
                            
                            let usedSlots = k + f; 
                            if (usedSlots < slots) {
                                let c1 = s1Price + (s1Prob/100)*V[k+1][f] + (s1Fail/100)*V[k][f+1] + (s1Dest/100)*resetCost;
                                let c2 = Infinity;
                                if (s2Enabled) {
                                    c2 = s2Price + (s2Prob/100)*V[k+1][f] + (s2Fail/100)*V[k][f+1] + (s2Dest/100)*resetCost;
                                }

                                if (s1Count !== null && s2Enabled) {
                                    if (usedSlots < s1Count) {
                                        costScroll = c1; 
                                    } else {
                                        costScroll = c2; 
                                    }
                                } else {
                                    costScroll = Math.min(c1, c2); 
                                }
                            }

                            let costCss = Infinity;
                            if (f > 0 && cssEnabled) {
                                let denom = 1 - (cssFail / 100);
                                if (denom > 0) {
                                    costCss = (cssPrice + (cssProb/100)*V[k][f-1] + (cssDest/100)*resetCost) / denom;
                                }
                            }
                            
                            V[k][f] = Math.min(costGiveup, costScroll, costCss);
                        }
                    }
                }
                return V;
            };

            let low = 0, high = 1e12; 
            let optimalCost = 0;
            for (let i = 0; i < 80; i++) {
                let mid = (low + high) / 2;
                let optV = getExpectedCostMatrix(mid);
                if (optV[0][0] + equipPrice < mid) {
                    high = mid;
                } else {
                    low = mid;
                }
            }
            optimalCost = high;

            let embed = new EmbedBuilder()
                .setTitle('🧮 衝卷計算機')
                .setColor(0x10B981);

            let desc = `**裝備底價:** ${equipPrice} 萬 | **總衝數:** ${slots}\n`;
            desc += `**目標:** ${slots} 過 ${target} | **容許失敗:** ${tolerance === slots ? '無限制 (盲衝)' : tolerance + ' 次 (停損)'}\n`;
            
            if (s1Count !== null && s2Enabled) {
                desc += `**第一階段 (前${s1Count}張):** ${s1Price}萬 (${s1Prob}% / 爆${s1Dest}%)\n`;
                desc += `**第二階段 (後續卷):** ${s2Price}萬 (${s2Prob}% / 爆${s2Dest}%)\n`;
            } else {
                desc += `**主力卷軸:** ${s1Price}萬 (${s1Prob}% / 爆${s1Dest}%)\n`;
                if (s2Enabled) desc += `**備用/墊刀卷:** ${s2Price}萬 (${s2Prob}% / 爆${s2Dest}%)\n`;
            }
            
            if (cssEnabled) desc += `**純白救援:** ${cssPrice}萬 (${cssProb}% / 爆${cssDest}%)\n`;
            
            let costStr = optimalCost >= 10000 ? `${(optimalCost / 10000).toFixed(2)} 億` : `${Math.floor(optimalCost).toLocaleString()} 萬`;

            desc += `\n🎯 **AI 最佳化預期總造價:** \`${costStr}\`\n`;

            if (marketPrice > 0) {
                let profit = marketPrice - optimalCost;
                let profitStr = Math.abs(profit) >= 10000 ? `${(Math.abs(profit) / 10000).toFixed(2)} 億` : `${Math.floor(Math.abs(profit)).toLocaleString()} 萬`;
                let marketStr = marketPrice >= 10000 ? `${(marketPrice / 10000).toFixed(2)} 億` : `${marketPrice.toLocaleString()} 萬`;
                
                desc += `\n🛒 **成品市價:** ${marketStr}\n`;
                if (profit > 0) {
                    desc += `📈 **投資建議:** **強烈建議製作！** (預期淨賺 \`${profitStr}\`)\n`;
                } else {
                    desc += `📉 **投資建議:** **直接買現成的！** (自己衝預期會虧損 \`${profitStr}\`)\n`;
                }
            }
            
            desc += `\n*(💡 內部運算：模擬千萬次停損、混卷與純白救援之數學最佳解)*`;

            embed.setDescription(desc)
                 .setFooter({ text: '※ 期望造價僅供參考，請衡量自身歐非體質', iconURL: client.user.displayAvatarURL() });

            const btnRow = new ActionRowBuilder();
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId('scroll_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(new ButtonBuilder().setCustomId('scroll_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }
    }

    if (['表情包', '批次新增表情包', '刪除表情包'].includes(cmd)) {
        
        if (cmd === '批次新增表情包') {
            if (!isOwner && !hasAdminRole && !hasAdminPerm) return interaction.reply({ content: '❌ 僅限幹部使用。', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId('modal_batch_emotes').setTitle('批次新增表情包');
            const input = new TextInputBuilder()
                .setCustomId('emotes_data')
                .setLabel("格式：名稱,網址,emoji(選填),描述(選填)")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("開心,https://i.imgur.com/xxx.png,😄,笑死\n難過,https://i.imgur.com/yyy.gif,😭,想哭")
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (cmd === '刪除表情包') {
            if (!isOwner && !hasAdminRole && !hasAdminPerm) return interaction.reply({ content: '❌ 僅限幹部使用。', flags: MessageFlags.Ephemeral });
            const name = interaction.options.getString('名稱');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await db.collection('emotes').doc(name).delete();
            addDbStat('write');
            return interaction.editReply(`🗑️ **表情包已刪除：** \`${name}\``);
        }

        if (cmd === '表情包') {
            const emoteName = interaction.options.getString('名稱');
            const emote = (emotes || []).find(e => e.name === emoteName);
            
            if (!emote) return interaction.reply({ content: '❌ 找不到該表情包，請確認關鍵字是否正確！', flags: MessageFlags.Ephemeral });
            
            await interaction.reply({ content: `✅ 正在為您發送表情包：**${emote.name}**...`, flags: MessageFlags.Ephemeral });
            await sendStickerViaWebhook(interaction, emote.url, client);
            
            setTimeout(() => {
                interaction.deleteReply().catch(() => {});
            }, 2000);
            return;
        }
    }

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

            try {
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
            } catch (err) {
                console.error("選單生成錯誤:", err);
                return interaction.reply({ content: '❌ **貼圖選單生成失敗！**\n可能是表情符號無效。', flags: MessageFlags.Ephemeral });
            }
        }
    }

    if (['解鎖權限', '發布小指南', '發布市場看板', '查詢目前公會成員', '查詢目前親友團', '同步更名', '清除資料', '清除訊息', '星光紅毯設定'].includes(cmd)) {
        
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

        if (cmd === '發布市場看板') {
            const boardEmbed = new EmbedBuilder()
                .setTitle('📊 【 Artale 楓之股｜市場輔助看板 】 📊')
                .setDescription('👇 **請點擊下方選單，選擇您要使用的市場服務：**\n\n' +
                    '🔍 **即時查價**：查詢全服最新物價與趨勢K線圖\n' +
                    '🎯 **套利雷達**：列出目前全市場溢價與折價排行 Top 5\n' +
                    '💳 **課金指南**：台幣最大化轉換楓幣的高效率方案\n' +
                    '🚨 **價格警報**：設定個人專屬的觸價私訊推播提醒\n' +
                    '📋 **我的警報**：查看與管理目前已設定的警報清單\n' +
                    '🧮 **衝卷試算**：精密規劃計算最佳造價與停損評估\n\n' +
                    '*💡 查詢結果僅自己可見，點擊📢 分享按鈕，可以將資訊分享給親友！*')
                .setColor('#F59E0B');

            const actionSelect = new StringSelectMenuBuilder()
                .setCustomId('select_market_action')
                .setPlaceholder('請選擇市場功能...')
                .addOptions([
                    { label: '即時查價', description: '查詢特定物品最新價格', value: 'market_price', emoji: '🔍' },
                    { label: '套利雷達', description: '全服漲跌幅最大排行榜', value: 'market_arbitrage', emoji: '🎯' },
                    { label: '課金指南', description: '台幣換楓幣最佳方案', value: 'market_cash', emoji: '💳' },
                    { label: '價格警報', description: '跌破或突破指定價格時私訊通知', value: 'market_alert_set', emoji: '🚨' },
                    { label: '我的警報', description: '管理已設定的警報', value: 'market_alert_list', emoji: '📋' },
                    { label: '衝卷試算', description: '計算期望造價與停損', value: 'market_scroll', emoji: '🧮' }
                ]);

            await interaction.reply({ content: '✅ 市場看板發布成功！', flags: MessageFlags.Ephemeral });
            return interaction.channel.send({ embeds: [boardEmbed], components: [new ActionRowBuilder().addComponents(actionSelect)] });
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
            const userDoc = await userRef.get(); addDbStat('read');
            let ud = userDoc.exists ? userDoc.data() : { violationPoints: 0, bannedUntil: null };
            
            if (ud.agentStatus === 'rejected' || ud.agentStatus === 'removed') return interaction.editReply('❌ 您的申請先前已被拒絕或移除，無法重複送出。');
            if (ud.isAgent) return interaction.editReply('✅ 您已經是認證的迴響專員囉！');
            if (ud.agentStatus === 'pending') return interaction.editReply('⏳ 您的專員申請正在審核中！');

            ud.agentStatus = 'pending'; await userRef.set(ud, { merge: true }); addDbStat('write');

            const payload = {
                embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('📝 新專員認證申請').setDescription(`玩家 <@${interaction.user.id}> 申請註冊成為 **迴響專員**！`)],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approveAgent_${interaction.user.id}`).setLabel('✅ 通過認證').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`rejectAgent_${interaction.user.id}`).setLabel('❌ 拒絕申請').setStyle(ButtonStyle.Danger))]
            };
            await broadcastToManagementAreas(client, payload);
            return interaction.editReply('✅ **申請已送出！** 請等待管理員進行審核。');
        }
        else if (cmd === '指定迴響專員') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const targetUser = interaction.options.getUser('玩家');
            await db.collection('users').doc(targetUser.id).set({ isAgent: true, agentStatus: 'approved' }, { merge: true }); addDbStat('write');
            try { const member = await interaction.guild.members.fetch(targetUser.id); if (member) await member.roles.add(getAgentRoleId(interaction.guildId)); } catch (e) {}
            return interaction.editReply(`✅ 已成功指定 <@${targetUser.id}> 為迴響專員。`);
        }
        else if (cmd === '刪除迴響專員') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const targetUser = interaction.options.getUser('玩家');
            await db.collection('users').doc(targetUser.id).set({ isAgent: false, agentStatus: 'removed' }, { merge: true }); addDbStat('write');
            try { const member = await interaction.guild.members.fetch(targetUser.id); if (member) await member.roles.remove(getAgentRoleId(interaction.guildId)); } catch (e) {}
            return interaction.editReply(`✅ 已移除 <@${targetUser.id}> 的迴響專員身分。`);
        }
        else if (cmd === '刪除訂單') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const targetUser = interaction.options.getUser('玩家');
            const targetId = interaction.options.getString('訂單id');

            if (targetId) {
                const docId = targetId.trim();
                const targetOrder = allReservations.find(r => r.id === docId);
                if (!targetOrder) return interaction.editReply({ content: `❌ 找不到 ID 為 \`${docId}\` 的訂單。` });
                await db.collection('reservations').doc(docId).delete(); addDbStat('write');
                if (targetOrder.ticketMsgs) {
                    for (const m of targetOrder.ticketMsgs) {
                        try {
                            const ch = await client.channels.fetch(m.channelId).catch(() => null);
                            if (ch) { const msg = await ch.messages.fetch(m.messageId).catch(() => null); if (msg) await msg.delete().catch(() => null); }
                        } catch (e) {}
                    }
                }
                setTimeout(() => { updateBoard(client); }, 1500); 
                return interaction.editReply({ content: `✅ 訂單徹底刪除成功！` });
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
            return interaction.editReply({ content: `${displayMsg}`, components: [row] });
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
            let opData = appSettings['operationMode'] || { autoApprove: false, autoRefreshBoard: false, frozenSlots: [], maxConcurrentOrders: 1 };

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
                const max = opData.maxConcurrentOrders || 1;
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x0099FF).setTitle('⚙️ 營運模式設定').setDescription(`**自動審核狀態**：${opData.autoApprove ? '🟢 開啟' : '🔴 關閉'}\n**自動更新看板**：${opData.autoRefreshBoard ? '🟢 開啟' : '🔴 關閉'}\n**同時段最大單量**：${max} 單\n\n**目前凍結時段**：共 ${(opData.frozenSlots||[]).length} 組`)] });
            }
        }
        else if (cmd === '同時段最大接單數') {
            if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
            const limit = interaction.options.getInteger('數量');
            await db.collection('settings').doc('operationMode').set({ maxConcurrentOrders: limit }, { merge: true });
            addDbStat('write');
            return interaction.editReply({ content: `✅ 設定成功！目前系統同一個時段最多允許 **${limit}** 張訂單並行。` });
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
                    const ReserveBtnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_reserve').setLabel('📝 預約迴響時間').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('btn_refresh_board').setLabel('🔄 手掌握看板').setStyle(ButtonStyle.Secondary));
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
            
            addDbStat('write'); 
            updateBoard(client); 
            return interaction.editReply({ content: '✅ 設定成功！已同步刷新所有看板。' });
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
