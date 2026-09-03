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

const ALLOWED_MARKET_CHANNEL_ID = '1544604459085070346'; 
const GUILD_CHANNEL_ID = '1539971422842261601'; 
const FRIEND_CHANNEL_ID = '1544604459085070346'; 

// ==========================================
// 🤖 核心引擎：AI 盤勢動態診斷
// ==========================================
function getAITrendAnalysis(itemName, trendPercent) {
    const seed = itemName.length + Math.floor(Math.abs(trendPercent * 100)); 
    const rate = parseFloat(trendPercent);

    if (rate >= 15) {
        const texts = [
            "🔥 【極度過熱】籌碼極度集中！出現無基期軋空急漲，追高需嚴控風險！",
            "🚀 【主升段爆發】短線爆發力驚人，已突破歷史壓力區間，留意上方獲利了結賣壓。",
            "⚠️ 【乖離過大】價格飆升脫離均線過遠，隨時有劇烈回檔風險，建議分批獲利了結。"
        ];
        return texts[seed % texts.length];
    } else if (rate >= 5) {
        const texts = [
            "📈 【強勢多頭】均線呈現完美黃金交叉，買盤力道強勁，建議沿短期均線偏多操作。",
            "🐂 【量價齊揚】底部籌碼穩固並穩健攀升，市場共識高度一致，為健康多頭格局。",
            "💪 【多方控盤】突破近期盤整區，主力吸籌跡象明顯，後市依然具備上攻動能。"
        ];
        return texts[seed % texts.length];
    } else if (rate >= 1) {
        const texts = [
            "↗️ 【溫和上漲】處於緩漲格局，籌碼良性換手，適合耐心持有等待主升段。",
            "🌱 【初升段跡象】底部剛剛成型，均線微幅上彎，可考慮於回踩支撐時建倉。",
            "🌤️ 【震盪盤堅】雖有上漲但伴隨震盪，大戶正在洗盤清洗浮額，持有者需具備耐心。"
        ];
        return texts[seed % texts.length];
    } else if (rate > -1) {
        const texts = [
            "⚖️ 【橫盤整理】多空雙方激烈交戰，價格進入收斂三角形整理，等待突破方向。",
            "💤 【量縮觀望】交易量顯著萎縮，市場觀望氣氛濃厚，無明顯趨勢，建議多看少做。",
            "🔄 【箱型震盪】目前處於上有壓、下有撐的箱型區間，高出低進為當前最佳策略。"
        ];
        return texts[seed % texts.length];
    } else if (rate > -5) {
        const texts = [
            "↘️ 【溫和下跌】近期走勢偏弱，均線微幅下彎，留意下方重要支撐是否跌破。",
            "🍂 【回檔修正】漲多後的健康回檔，正在測試短期均線支撐力道。",
            "🌧️ 【多殺多疑慮】部分短線獲利盤正在湧出，走勢轉弱，暫時不建議急於接刀。"
        ];
        return texts[seed % texts.length];
    } else if (rate > -15) {
        const texts = [
            "📉 【弱勢空頭】均線呈現死亡交叉，高檔賣壓沉重，目前走勢全面偏空。",
            "🐻 【跌破支撐】已跌破近期重要防守線，籌碼出現鬆動踩踏跡象，請避開鋒芒。",
            "🚨 【空方控盤】跌勢尚未見底，反彈皆是逃命波，請嚴格執行停損紀律。"
        ];
        return texts[seed % texts.length];
    } else {
        const texts = [
            "🧊 【恐慌超跌】市場出現恐慌性拋售，價格乖離率過大，隨時醞釀強勢報復性反彈！",
            "🩸 【非理性殺盤】進入絕望區間！短線籌碼清洗徹底，激進者可嘗試小部位搶短多。",
            "💎 【長線價值浮現】歷史罕見低檔區現蹤！目前價格極具長線投資吸引力，適合分批建倉。"
        ];
        return texts[seed % texts.length];
    }
}

// ==========================================
// 📈 輔助函式：新增實體資產與模擬炒股
// ==========================================
async function addAssetToDb(userId, itemName, qty, cost) {
    const docRef = db.collection('userAssets').doc(userId);
    const doc = await docRef.get();
    let data = doc.exists ? doc.data() : { items: {} };
    if (!data.items) data.items = {};

    if (data.items[itemName]) {
        const oldQty = data.items[itemName].qty;
        const oldCost = data.items[itemName].cost;
        const newQty = oldQty + qty;
        const newAvg = newQty > 0 ? ((oldQty * oldCost) + (qty * cost)) / newQty : 0;
        data.items[itemName] = { qty: newQty, cost: newAvg };
    } else {
        data.items[itemName] = { qty: qty, cost: cost };
    }
    await docRef.set(data, { merge: true });
    addDbStat('write');
}

async function processPaperTrade(interaction, itemName, qty, action, currentPrice, isUpdate = false) {
    if (currentPrice <= 0) {
        const msg = '❌ 該物品目前無有效報價，無法交易。';
        return isUpdate ? interaction.update({ content: msg, components: [] }) : interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }

    const docRef = db.collection('paperAccounts').doc(interaction.user.id);
    const doc = await docRef.get();
    if (!doc.exists) {
        const msg = '❌ 找不到您的證券戶！請先在市場看板點擊「🏆 虛擬炒股大賽」完成開戶。';
        return isUpdate ? interaction.update({ content: msg, components: [] }) : interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }

    let data = doc.data();
    if (!data.holdings) data.holdings = {};
    
    const totalCost = qty * currentPrice;

    if (action === '買入') {
        if (data.cash < totalCost) {
            const msg = `❌ 資金不足！買入需 \`${totalCost.toFixed(2)} 萬\`，您只剩 \`${data.cash.toFixed(2)} 萬\`。`;
            return isUpdate ? interaction.update({ content: msg, components: [] }) : interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
        data.cash -= totalCost;
        data.holdings[itemName] = (data.holdings[itemName] || 0) + qty;
    } else if (action === '賣出') {
        const currentQty = data.holdings[itemName] || 0;
        if (currentQty < qty) {
            const msg = `❌ 庫存不足！您目前只有 ${currentQty} 個 ${itemName}。`;
            return isUpdate ? interaction.update({ content: msg, components: [] }) : interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
        data.cash += totalCost;
        data.holdings[itemName] -= qty;
        if (data.holdings[itemName] === 0) delete data.holdings[itemName];
    }

    await docRef.set(data, { merge: true });
    addDbStat('write');

    const msg = `✅ 成功以單價 \`${currentPrice} 萬\` **${action}** ${qty} 個 **${itemName}**！\n交割總金額：\`${totalCost.toFixed(2)} 萬\``;
    return isUpdate ? interaction.update({ content: msg, embeds: [], components: [] }) : interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
}

// ==========================================
// 📱 核心引擎：構建「籌碼K線 App」面板
// ==========================================
function buildMarketMessage(itemData, activeTf, isGuildMember, clientUser) {
    let displayChartUrl = itemData.chartUrl;
    let tfLabel = "全區間歷史走勢";
    
    if (activeTf === '6h') { displayChartUrl = itemData.chartUrl6h || itemData.chartUrl; tfLabel = "6 小時籌碼走勢"; }
    else if (activeTf === '12h') { displayChartUrl = itemData.chartUrl12h || itemData.chartUrl; tfLabel = "12 小時籌碼走勢"; }
    else if (activeTf === '24h') { displayChartUrl = itemData.chartUrl24h || itemData.chartUrl1Day || itemData.chartUrl; tfLabel = "24 小時籌碼走勢"; }
    else if (activeTf === '48h') { displayChartUrl = itemData.chartUrl48h || itemData.chartUrl; tfLabel = "48 小時籌碼走勢"; }

    const aiText = getAITrendAnalysis(itemData.name, itemData.rawTrend || parseFloat(itemData.trend) || 0);
    const safeName = itemData.name.substring(0, 50);

    const vipNote = isGuildMember 
        ? "💡 如果有查詢48H以上需求，請檢視並加入Artale楓之谷VIP\n*(註：若切換按鈕後圖表未變化，表示市場暫無該時段圖表)*" 
        : "💡 如果有查詢24H以上需求，請檢視並加入Artale楓之谷VIP\n*(註：若切換按鈕後圖表未變化，表示市場暫無該時段圖表)*";

    const embed = new EmbedBuilder()
        .setColor(0x0f172a)
        .setTitle(`📊 籌碼K線：${itemData.name}`)
        .setDescription(`**💰 最新成交價：** \`${itemData.price}\`\n**📈 走勢漲跌幅：** ${itemData.trend}\n\n**🤖 線型盤勢診斷：**\n> ${aiText}\n\n*${vipNote}*`)
        .setTimestamp()
        .setFooter({ text: `📍 當前檢視：${tfLabel} • 資料來源: Artale 楓之股`, iconURL: clientUser.displayAvatarURL() });

    if (displayChartUrl) embed.setImage(displayChartUrl);

    const tfs = [{ id: '6h', label: '6H' }, { id: '12h', label: '12H' }, { id: '24h', label: '24H' }, { id: '48h', label: '48H' }];
    const tfRow = new ActionRowBuilder();
    tfs.forEach(tf => {
        tfRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`market_tf_${tf.id}_${safeName}`)
                .setLabel(tf.label)
                .setStyle(activeTf === tf.id ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );
    });

    const btnRow = new ActionRowBuilder();
    if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId(`publish_price_pubG_${safeName}_${activeTf}`).setLabel('📢 發布至公會').setStyle(ButtonStyle.Success));
    btnRow.addComponents(
        new ButtonBuilder().setCustomId(`publish_price_pubF_${safeName}_${activeTf}`).setLabel('📢 發布至親友').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setLabel('🌐 前往Artale楓之谷').setStyle(ButtonStyle.Link).setURL('https://artalestock.netlify.app/') 
    );

    return { embeds: [embed], components: [tfRow, btnRow] };
}

async function handleCommand(interaction, client) {
    const { allReservations, appSettings, stickers, emotes } = getCache();
    
    const isOwner = interaction.user.id === interaction.guild?.ownerId; 
    const hasAdminRole = interaction.member?.roles?.cache?.hasAny(...config.roles.adminRoles); 
    const hasAdminPerm = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator); 

    const isGuildMember = interaction.member?.roles?.cache?.has(config.roles.guildMember) || interaction.member?.roles?.cache?.some(r => r.name.includes('公會'));

    // ==========================================
    // 🌟 【動態按鈕攔截區：K線切換、資產操作、炒股】
    // ==========================================
    if (interaction.isButton()) {
        const cId = interaction.customId;

        // 1️⃣ 籌碼K線切換
        if (cId.startsWith('market_tf_')) {
            const parts = cId.split('_'); 
            const targetTf = parts[2]; 
            const itemName = parts.slice(3).join('_');

            if (!isGuildMember && ['48h'].includes(targetTf)) {
                return interaction.reply({ content: `🔒 **籌碼K線專業版 權限不足！**\n親友團僅開放 24H 內走勢圖，欲解鎖 48H 以上專業線圖，請成為公會成員！`, flags: MessageFlags.Ephemeral });
            }

            const itemData = getMarketItem(itemName);
            if (!itemData) return interaction.reply({ content: '❌ 資料已過期，請重新發起查詢。', flags: MessageFlags.Ephemeral });

            const payload = buildMarketMessage(itemData, targetTf, isGuildMember, client.user);
            return interaction.update({ embeds: payload.embeds, components: payload.components });
        }

        // 2️⃣ 觸發新增資產表單
        if (cId === 'market_btn_portfolio_add') {
            const modal = new ModalBuilder().setCustomId('market_modal_portfolio').setTitle('💼 新增個人資產庫');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel("請輸入物品關鍵字").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel("持有數量").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cost').setLabel("平均購入成本 (單件/萬)").setStyle(TextInputStyle.Short).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        // 3️⃣ 觸發虛擬炒股買/賣表單
        if (cId === 'market_btn_paper_buy' || cId === 'market_btn_paper_sell') {
            const action = cId.includes('buy') ? '買入' : '賣出';
            const modal = new ModalBuilder().setCustomId(`market_modal_paper_${action}`).setTitle(`🛒 模擬炒股：${action}委託`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel("請輸入物品關鍵字").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel("委託數量").setStyle(TextInputStyle.Short).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        // 4️⃣ 顯示虛擬炒股排行榜
        if (cId === 'market_btn_paper_rank') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const snapshot = await db.collection('paperAccounts').get();
            if (snapshot.empty) return interaction.editReply('目前還沒有人開戶炒股！');
            
            let ranks = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                let totalValue = data.cash || 0;
                if (data.holdings) {
                    for (const [name, qty] of Object.entries(data.holdings)) {
                        const marketData = getMarketItem(name);
                        const currentPrice = marketData ? (marketData.rawPrice || 0) : 0;
                        totalValue += qty * currentPrice;
                    }
                }
                ranks.push({ id: doc.id, value: totalValue });
            });
            
            ranks.sort((a, b) => b.value - a.value);
            let desc = ranks.slice(0, 10).map((r, i) => {
                let rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i+1}.**`;
                return `${rankIcon} <@${r.id}> ➔ 淨值: \`${r.value.toFixed(2)} 萬\``;
            }).join('\n\n');
            
            const embed = new EmbedBuilder().setColor(0x10B981).setTitle('🏆 楓之谷巴菲特：虛擬炒股淨值排行榜').setDescription(desc);
            return interaction.editReply({ embeds: [embed] });
        }

        // 5️⃣ 發布路由系統
        if (cId.startsWith('publish_')) {
            const isGuildChannel = cId.includes('_pubG_');
            const targetChannelId = isGuildChannel ? GUILD_CHANNEL_ID : FRIEND_CHANNEL_ID;
            const channelName = isGuildChannel ? '🥳｜公會頻道' : '👄｜親友閒聊relax';

            const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
            if (!targetChannel) return interaction.reply({ content: `❌ 找不到目標頻道 (${targetChannelId})，無法發布。`, flags: MessageFlags.Ephemeral });

            if (cId.startsWith('publish_price_')) {
                const parts = cId.split('_'); 
                const activeTf = parts[parts.length - 1]; 
                const itemName = parts.slice(3, parts.length - 1).join('_'); 
                
                const itemData = getMarketItem(itemName);
                if (!itemData) return interaction.reply({ content: '資料已過期，無法發布。', flags: MessageFlags.Ephemeral });

                const payload = buildMarketMessage(itemData, activeTf, isGuildMember, client.user);
                const pubEmbed = EmbedBuilder.from(payload.embeds[0]);
                pubEmbed.setTitle(`📊 籌碼K線：${itemData.name} (由 ${interaction.user.username} 分享)`);
                
                try {
                    await targetChannel.send({ embeds: [pubEmbed] });
                    return interaction.update({ content: `✅ 已成功將查價資訊分享至 ${channelName}！`, components: [] });
                } catch (err) {
                    return interaction.reply({ content: `❌ 發布失敗，機器人可能沒有該頻道的發言權限。`, flags: MessageFlags.Ephemeral });
                }
            }

            if (cId.startsWith('publish_arbitrage_') || cId.startsWith('publish_cash_')) {
                if (!interaction.message.embeds || interaction.message.embeds.length === 0) {
                    return interaction.reply({ content: '❌ 無法取得原始圖表，發布失敗。', flags: MessageFlags.Ephemeral });
                }

                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                const tfText = isGuildMember ? "48H" : "24H";

                if (cId.startsWith('publish_arbitrage_')) originalEmbed.setTitle(`🎯 折溢排行 (${tfText}內變化) (由 ${interaction.user.username} 分享)`);
                if (cId.startsWith('publish_cash_')) originalEmbed.setTitle(`💳 課金最佳化轉換試算 (由 ${interaction.user.username} 分享)`);
                
                try {
                    await targetChannel.send({ embeds: [originalEmbed] });
                    return interaction.update({ content: `✅ 已成功分享至 ${channelName}！`, components: [] });
                } catch (err) {
                    return interaction.reply({ content: `❌ 發布失敗，機器人可能沒有該頻道的發言權限。`, flags: MessageFlags.Ephemeral });
                }
            }
        }
    }

    // ==========================================
    // 🌟 【市場看板：元件攔截處理區】
    // ==========================================
    if (interaction.isStringSelectMenu()) {
        
        // 1️⃣ 處理主看板選單
        if (interaction.customId === 'select_market_action') {
            if (interaction.channelId !== ALLOWED_MARKET_CHANNEL_ID) {
                return interaction.reply({ content: `❌ 市場看板功能請移駕至 <#${ALLOWED_MARKET_CHANNEL_ID}> 頻道使用喔！`, flags: MessageFlags.Ephemeral });
            }

            const action = interaction.values[0];

            // ⚠️ 彈出表單 (Modal) 時，不能使用 interaction.update()，直接讓選單保持現狀。
            if (action === 'market_price') {
                const modal = new ModalBuilder().setCustomId('market_modal_price').setTitle('🔍 即時查價系統 (支援關鍵字)');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('item_name').setLabel("請輸入想找的物品關鍵字 (例如: 詛咒/30%)").setStyle(TextInputStyle.Short).setRequired(true)
                ));
                return interaction.showModal(modal);
            }

            // 🌟 正常回覆 Embed 的功能，使用 update + followUp 完美重置下拉選單！
            if (action === 'market_arbitrage') {
                await interaction.update({ components: interaction.message.components }); // 瞬間重置選單

                const allItems = getAllMarketItems();
                let validItems = allItems.filter(i => i.rawTrend !== 0 && !isNaN(i.rawTrend)).sort((a, b) => b.rawTrend - a.rawTrend);
                
                let pText = validItems.slice(0, 5).map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📈 \`+${i.rawTrend.toFixed(2)}%\` (${i.price})`).join('\n\n');
                let dText = validItems.slice(-5).reverse().map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📉 \`${i.rawTrend.toFixed(2)}%\` (${i.price})`).join('\n\n');

                const tfText = isGuildMember ? "48H" : "24H";
                const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle(`🎯 折溢排行 (${tfText}內變化)`)
                    .addFields({ name: `🔥 【溢價急漲區】(建議出售)`, value: pText || '無', inline: true }, { name: `🧊 【折價超跌區】(建議掃貨)`, value: dText || '無', inline: true });

                const publishBtn = new ActionRowBuilder();
                if (isGuildMember) publishBtn.addComponents(new ButtonBuilder().setCustomId('publish_arbitrage_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
                publishBtn.addComponents(new ButtonBuilder().setCustomId('publish_arbitrage_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

                return interaction.followUp({ embeds: [embed], components: [publishBtn], flags: MessageFlags.Ephemeral });
            }

            if (action === 'market_cash') {
                const modal = new ModalBuilder().setCustomId('market_modal_cash').setTitle('💳 課金指南試算');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('twd_amount').setLabel("預計投入台幣金額 (TWD)").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('wc_rate').setLabel("點數比值 (不填預設為 6.63)").setStyle(TextInputStyle.Short).setRequired(false).setValue('6.63'))
                );
                return interaction.showModal(modal);
            }

            if (action === 'market_alert_set') {
                const modal = new ModalBuilder().setCustomId('market_modal_alert_search').setTitle('🚨 警報設定 (1/2)：搜尋物品');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel("請輸入物品關鍵字 (例如: 詛咒/30%)").setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (action === 'market_alert_list') {
                await interaction.update({ components: interaction.message.components });
                try {
                    const snapshot = await db.collection('priceAlerts').where('userId', '==', interaction.user.id).get();
                    if (snapshot.empty) {
                        return interaction.followUp({ content: '📭 您目前沒有設定任何價格警報喔！', flags: MessageFlags.Ephemeral });
                    }
                    
                    let desc = '🚨 **您的專屬價格推播警報清單**\n\n';
                    const deleteOptions = [];
                    
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        desc += `🔹 **${data.itemName}** ➔ 當 ${data.condition} \`${data.targetPrice} 萬\` 時私訊通知\n`;
                        
                        deleteOptions.push(new StringSelectMenuOptionBuilder()
                            .setLabel(`刪除: ${data.itemName.substring(0, 50)}`)
                            .setDescription(`條件: ${data.condition} ${data.targetPrice}萬`)
                            .setValue(doc.id) 
                        );
                    });
                    
                    const embed = new EmbedBuilder().setColor(0xEF4444).setDescription(desc);
                    const components = [];
                    
                    if (deleteOptions.length > 0) {
                        components.push(new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('market_delete_alert') 
                                .setPlaceholder('🗑️ 點擊這裡選擇要刪除的警報...')
                                .addOptions(deleteOptions.slice(0, 25))
                        ));
                    }
                    
                    return interaction.followUp({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
                } catch (error) {
                    return interaction.followUp({ content: '❌ 無法連線至警報資料庫，請稍後再試。', flags: MessageFlags.Ephemeral });
                }
            }

            if (action === 'portfolio_view') {
                await interaction.update({ components: interaction.message.components });
                
                const doc = await db.collection('userAssets').doc(interaction.user.id).get();
                const items = doc.exists ? (doc.data().items || {}) : {};
                
                let totalCost = 0; let totalValue = 0; let desc = "";
                
                for (const [name, info] of Object.entries(items)) {
                    if (info.qty <= 0) continue;
                    const marketData = getMarketItem(name);
                    const currentPrice = marketData ? (marketData.rawPrice || 0) : info.cost;
                    const itemCostTotal = info.qty * info.cost;
                    const itemValueTotal = info.qty * currentPrice;
                    const pnl = itemValueTotal - itemCostTotal;
                    const pnlPercent = itemCostTotal > 0 ? (pnl / itemCostTotal) * 100 : 0;
                    
                    totalCost += itemCostTotal; totalValue += itemValueTotal;
                    const icon = pnl >= 0 ? '🔴' : '🟢'; 
                    desc += `**${name}** (持有: ${info.qty})\n└ 成本: \`${info.cost.toFixed(2)}萬\` | 現價: \`${currentPrice.toFixed(2)}萬\`\n└ 損益: ${icon} \`${pnl.toFixed(2)}萬\` (${pnlPercent.toFixed(2)}%)\n\n`;
                }

                if (!desc) desc = "📭 目前尚無資產，點擊下方按鈕開始紀錄您的真實庫存！";

                const totalPnl = totalValue - totalCost;
                const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
                const mainIcon = totalPnl >= 0 ? '🔴' : '🟢';

                const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle(`💼 ${interaction.user.username} 的個人資產庫`)
                    .setDescription(`**投入總成本：** \`${totalCost.toFixed(2)} 萬\`\n**目前總市值：** \`${totalValue.toFixed(2)} 萬\`\n**未實現損益：** ${mainIcon} \`${totalPnl.toFixed(2)} 萬\` (${totalPnlPercent.toFixed(2)}%)\n\n${desc}`)
                    .setTimestamp();

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('market_btn_portfolio_add').setLabel('➕ 新增持倉紀錄').setStyle(ButtonStyle.Success)
                );
                return interaction.followUp({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
            }

            if (action === 'paper_trade') {
                await interaction.update({ components: interaction.message.components });
                
                const docRef = db.collection('paperAccounts').doc(interaction.user.id);
                const doc = await docRef.get();
                if (!doc.exists) {
                    await docRef.set({ cash: 1000000, holdings: {}, username: interaction.user.username });
                    addDbStat('write');
                    return interaction.followUp({ content: '🎉 **開戶成功！** 已為您匯入初始資金 `1,000,000 萬` (100億) 虛擬楓幣！\n請再次點擊「虛擬炒股大賽」查看您的帳戶並開始交易。', flags: MessageFlags.Ephemeral });
                }
                
                let data = doc.data();
                let totalValue = data.cash;
                let hDesc = "";
                
                if (data.holdings) {
                    for (const [name, qty] of Object.entries(data.holdings)) {
                        const marketData = getMarketItem(name);
                        const currentPrice = marketData ? (marketData.rawPrice || 0) : 0;
                        const value = qty * currentPrice;
                        totalValue += value;
                        if (qty > 0) hDesc += `🔹 **${name}**: ${qty} 個 (現值: \`${value.toFixed(2)} 萬\`)\n`;
                    }
                }
                
                const embed = new EmbedBuilder().setColor(0xF59E0B).setTitle(`🏆 ${interaction.user.username} 的虛擬證券戶`)
                    .addFields(
                        { name: '💰 可用現金', value: `\`${data.cash.toFixed(2)} 萬\``, inline: true },
                        { name: '📈 帳戶總淨值', value: `\`${totalValue.toFixed(2)} 萬\``, inline: true },
                        { name: '📦 庫存明細', value: hDesc || '目前無庫存', inline: false }
                    );

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('market_btn_paper_buy').setLabel('🛒 買入').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('market_btn_paper_sell').setLabel('💰 賣出').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('market_btn_paper_rank').setLabel('🏆 看排行榜').setStyle(ButtonStyle.Secondary)
                );
                return interaction.followUp({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
            }

            if (action === 'whale_alert') {
                await interaction.update({ components: interaction.message.components });
                const allItems = getAllMarketItems() || [];
                const whales = allItems.filter(i => Math.abs(i.rawTrend) >= 15 && i.rawPrice > 0).sort((a, b) => Math.abs(b.rawTrend) - Math.abs(a.rawTrend));

                if (whales.length === 0) return interaction.followUp({ content: '🌊 目前市場風平浪靜，沒有偵測到巨鯨大戶的異常掃貨或倒貨跡象。', flags: MessageFlags.Ephemeral });

                let desc = whales.map(i => {
                    const icon = i.rawTrend > 0 ? '🚀 【大戶掃貨暴漲】' : '🩸 【大戶倒貨暴跌】';
                    return `**${i.name}**\n└ ${icon} \`${i.trend}\` (現價: ${i.price})`;
                }).join('\n\n');

                const tfText = isGuildMember ? "48H" : "24H";
                const embed = new EmbedBuilder().setColor(0xEC4899).setTitle(`🐳 巨鯨大戶異動雷達 (15% 振幅監控, ${tfText}內變化)`).setDescription(desc).setFooter({ text: '※ 背景排程警報已啟動監控', iconURL: client.user.displayAvatarURL() });
                return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            return interaction.reply({ content: '🛠️ 此功能正在連線調整中，即將開放！', flags: MessageFlags.Ephemeral });
        }

        // 🌟 刪除警報的下拉選單攔截
        if (interaction.customId === 'market_delete_alert') {
            const alertId = interaction.values[0];
            try {
                await db.collection('priceAlerts').doc(alertId).delete();
                return interaction.update({ content: '✅ **指定的警報已成功刪除！**', embeds: [], components: [] });
            } catch (err) {
                return interaction.reply({ content: '❌ 刪除警報時發生錯誤，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
        }

        // 2️⃣ 處理查價結果的二次下拉選單
        if (interaction.customId === 'market_select_price_result') {
            const itemName = interaction.values[0];
            const itemData = getMarketItem(itemName);
            
            if (!itemData) return interaction.reply({ content: `🔍 找不到 **${itemName}** 的報價！`, flags: MessageFlags.Ephemeral });

            // 呼叫 App 面板
            const defaultTf = '24h';
            const payload = buildMarketMessage(itemData, defaultTf, isGuildMember, client.user);

            return interaction.update({ content: '✅ 查詢成功！', embeds: payload.embeds, components: payload.components });
        }

        // 🌟 警報第二步：選好道具後，彈出設定目標價的表單
        if (interaction.customId === 'market_alert_select_item') {
            const itemName = interaction.values[0];
            const safeName = itemName.substring(0, 50); 
            
            const modal = new ModalBuilder().setCustomId(`market_alert_config_${safeName}`).setTitle(`🚨 設定: ${safeName}`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_price').setLabel("目標觸發價格 (萬)").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel("觸發條件 (請填 高於 或 低於)").setStyle(TextInputStyle.Short).setRequired(true).setValue('低於'))
            );
            return interaction.showModal(modal);
        }

        // 🌟 新增資產的二次選單
        if (interaction.customId === 'market_select_portfolio_result') {
            const parts = interaction.values[0].split('_');
            const qty = parseInt(parts[0]);
            const cost = parseFloat(parts[1]);
            const itemName = parts.slice(2).join('_');
            await addAssetToDb(interaction.user.id, itemName, qty, cost);
            return interaction.update({ content: `✅ 成功將 **${itemName}** (數量: ${qty}, 成本: ${cost}萬) 加入您的實體資產庫！\n請重新點擊看板查看更新後的「💼 個人資產庫」。`, components: [] });
        }

        // 🌟 炒股買賣的二次選單
        if (interaction.customId === 'market_select_paper_result') {
            const parts = interaction.values[0].split('_'); 
            const action = parts[0] === 'buy' ? '買入' : '賣出';
            const qty = parseInt(parts[1]);
            const itemName = parts.slice(2).join('_');
            const targetItem = getMarketItem(itemName);
            
            if (!targetItem) return interaction.reply({ content: '❌ 物品已過期', flags: MessageFlags.Ephemeral });
            await processPaperTrade(interaction, itemName, qty, action, targetItem.rawPrice, true);
        }
    }

    if (interaction.isModalSubmit()) {
        
        const filterUniqueItems = (query) => {
            const allItems = getAllMarketItems() || [];
            const uniqueItems = []; const seenNames = new Set();
            for (const item of allItems) {
                if (item.name && item.name.toLowerCase().includes(query) && !seenNames.has(item.name)) {
                    seenNames.add(item.name); uniqueItems.push(item);
                }
            }
            return uniqueItems;
        };

        if (interaction.customId === 'market_modal_price') {
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            const uniqueItems = filterUniqueItems(query);
            
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到包含 **${query}** 的報價！`, flags: MessageFlags.Ephemeral });
            
            if (uniqueItems.length > 1) {
                const options = uniqueItems.slice(0, 25).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name.substring(0, 100)).setValue(r.name.substring(0, 100)).setDescription(`目前報價: ${r.price || '無報價'}`.substring(0, 100)));
                const dropdownRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('market_select_price_result').setPlaceholder('找到多個結果，請選擇精確物品...').addOptions(options));
                return interaction.reply({ content: `🔍 找到 **${uniqueItems.length}** 個符合的物品：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
            }

            const defaultTf = '24h';
            const payload = buildMarketMessage(uniqueItems[0], defaultTf, isGuildMember, client.user);
            return interaction.reply({ embeds: payload.embeds, components: payload.components, flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'market_modal_alert_search') {
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            const uniqueItems = filterUniqueItems(query);
            
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到包含 **${query}** 的報價！`, flags: MessageFlags.Ephemeral });
            
            const options = uniqueItems.slice(0, 25).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name.substring(0, 100)).setValue(r.name.substring(0, 100)).setDescription(`目前報價: ${r.price || '無報價'}`.substring(0, 100)));
            const dropdownRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('market_alert_select_item').setPlaceholder('請下拉選擇要設定警報的物品...').addOptions(options));
            return interaction.reply({ content: `🔍 找到多個符合的物品，請選擇：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId.startsWith('market_alert_config_')) {
            const itemName = interaction.customId.replace('market_alert_config_', '');
            const price = interaction.fields.getTextInputValue('target_price');
            const condition = interaction.fields.getTextInputValue('condition');
            
            await db.collection('priceAlerts').add({ userId: interaction.user.id, userName: interaction.user.username, itemName: itemName, targetPrice: Number(price), condition: condition, createdAt: Date.now() });
            return interaction.reply({ content: `✅ **警報寫入成功！**\n資料庫已記錄：當【${itemName}】${condition} \`${price} 萬\` 時，將會以 **私訊 (DM)** 方式推播通知您！`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'market_modal_portfolio') {
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            const qty = parseInt(interaction.fields.getTextInputValue('qty'));
            const cost = parseFloat(interaction.fields.getTextInputValue('cost'));
            
            if (qty <= 0 || isNaN(cost)) return interaction.reply({ content: '❌ 數量與成本輸入格式錯誤！', flags: MessageFlags.Ephemeral });

            const uniqueItems = filterUniqueItems(query);
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到包含 **${query}** 的報價！`, flags: MessageFlags.Ephemeral });

            if (uniqueItems.length > 1) {
                const options = uniqueItems.slice(0, 25).map(r => {
                    const safeName = r.name.substring(0, 50); 
                    return new StringSelectMenuOptionBuilder().setLabel(safeName).setValue(`${qty}_${cost}_${safeName}`).setDescription(`目前報價: ${r.price || '無報價'}`.substring(0, 100));
                });
                const dropdownRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('market_select_portfolio_result').setPlaceholder('請選擇要新增的精確物品...').addOptions(options));
                return interaction.reply({ content: `🔍 找到多個物品，請選擇您實際持有的裝備：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
            }

            await addAssetToDb(interaction.user.id, uniqueItems[0].name, qty, cost);
            return interaction.reply({ content: `✅ 成功將 **${uniqueItems[0].name}** (數量: ${qty}, 成本: ${cost}萬) 加入您的實體資產庫！\n請重新點選看板的「💼 個人資產庫」查看更新。`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId.startsWith('market_modal_paper_')) {
            const isBuy = interaction.customId.includes('買入');
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            const qty = parseInt(interaction.fields.getTextInputValue('qty'));
            
            if (qty <= 0) return interaction.reply({ content: '❌ 委託數量必須大於 0！', flags: MessageFlags.Ephemeral });

            const uniqueItems = filterUniqueItems(query);
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到報價，無法交易！`, flags: MessageFlags.Ephemeral });

            if (uniqueItems.length > 1) {
                const actionPrefix = isBuy ? 'buy' : 'sell';
                const options = uniqueItems.slice(0, 25).map(r => {
                    const safeName = r.name.substring(0, 50);
                    return new StringSelectMenuOptionBuilder().setLabel(safeName).setValue(`${actionPrefix}_${qty}_${safeName}`).setDescription(`市價: ${r.price || '無'}`.substring(0, 100));
                });
                const dropdownRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('market_select_paper_result').setPlaceholder(`請選擇要${isBuy ? '買入' : '賣出'}的精確物品...`).addOptions(options));
                return interaction.reply({ content: `🔍 找到多個標的，請選擇：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
            }

            await processPaperTrade(interaction, uniqueItems[0].name, qty, isBuy ? '買入' : '賣出', uniqueItems[0].rawPrice);
            return; 
        }

        if (interaction.customId === 'market_modal_cash') {
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
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId(`publish_cash_pubG_0`).setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(new ButtonBuilder().setCustomId(`publish_cash_pubF_0`).setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const cmd = interaction.commandName;

    if (cmd === '新增資產') {
        const itemName = interaction.options.getString('物品名稱').toLowerCase();
        const qty = interaction.options.getInteger('數量');
        const cost = interaction.options.getNumber('購入成本');
        
        const allItems = getAllMarketItems() || [];
        const uniqueItems = []; const seenNames = new Set();
        for (const item of allItems) {
            if (item.name && item.name.toLowerCase().includes(itemName) && !seenNames.has(item.name)) {
                seenNames.add(item.name); uniqueItems.push(item);
            }
        }
        
        if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到包含 **${itemName}** 的物品！`, flags: MessageFlags.Ephemeral });

        if (uniqueItems.length > 1) {
            const options = uniqueItems.slice(0, 25).map(r => {
                const safeName = r.name.substring(0, 50);
                return new StringSelectMenuOptionBuilder().setLabel(safeName).setValue(`${qty}_${cost}_${safeName}`).setDescription(`市價: ${r.price}`);
            });
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('market_select_portfolio_result').setPlaceholder('請選擇精確物品...').addOptions(options));
            return interaction.reply({ content: `🔍 找到多個物品，請選擇：`, components: [row], flags: MessageFlags.Ephemeral });
        }

        await addAssetToDb(interaction.user.id, uniqueItems[0].name, qty, cost);
        return interaction.reply({ content: `✅ 成功將 **${uniqueItems[0].name}** (數量: ${qty}, 成本: ${cost}萬) 加入資產庫！\n可透過市場看板查詢總資產。`, flags: MessageFlags.Ephemeral });
    }

    if (cmd === '我的資產') {
        const doc = await db.collection('userAssets').doc(interaction.user.id).get();
        if (!doc.exists || !doc.data().items || Object.keys(doc.data().items).length === 0) {
            return interaction.reply({ content: '📭 您的資產庫目前是空的！請使用 `/新增資產` 或是看板的按鈕來紀錄。', flags: MessageFlags.Ephemeral });
        }
        const items = doc.data().items;
        let totalCost = 0; let totalValue = 0; let desc = "";
        for (const [name, info] of Object.entries(items)) {
            if(info.qty <= 0) continue;
            const marketData = getMarketItem(name);
            const currentPrice = marketData ? (marketData.rawPrice || 0) : info.cost; 
            const itemCostTotal = info.qty * info.cost;
            const itemValueTotal = info.qty * currentPrice;
            const pnl = itemValueTotal - itemCostTotal;
            totalCost += itemCostTotal; totalValue += itemValueTotal;
            const icon = pnl >= 0 ? '🔴' : '🟢'; 
            desc += `**${name}** (數量: ${info.qty})\n└ 成本: \`${info.cost.toFixed(2)}萬\` | 現價: \`${currentPrice.toFixed(2)}萬\`\n└ 損益: ${icon} \`${pnl.toFixed(2)}萬\` (${itemCostTotal>0 ? (pnl/itemCostTotal*100).toFixed(2) : 0}%)\n\n`;
        }
        const totalPnl = totalValue - totalCost;
        const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle(`💼 ${interaction.user.username} 的個人資產庫`)
            .setDescription(`**投入總成本：** \`${totalCost.toFixed(2)} 萬\`\n**目前總市值：** \`${totalValue.toFixed(2)} 萬\`\n**未實現損益：** ${totalPnl >= 0 ? '🔴' : '🟢'} \`${totalPnl.toFixed(2)} 萬\` (${totalCost>0 ? (totalPnl/totalCost*100).toFixed(2) : 0}%)\n\n${desc}`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (cmd === '巨鯨雷達') {
        const allItems = getAllMarketItems() || [];
        const whales = allItems.filter(i => Math.abs(i.rawTrend) >= 15 && i.rawPrice > 0).sort((a, b) => Math.abs(b.rawTrend) - Math.abs(a.rawTrend));
        if (whales.length === 0) return interaction.reply({ content: '🌊 目前市場風平浪靜，無明顯巨鯨活動。', flags: MessageFlags.Ephemeral });
        let desc = whales.map(i => `**${i.name}**\n└ ${i.rawTrend > 0 ? '🚀 【大戶掃貨暴漲】' : '🩸 【大戶倒貨暴跌】'} \`${i.trend}\` (現價: ${i.price})`).join('\n\n');
        const tfText = isGuildMember ? "48H" : "24H";
        const embed = new EmbedBuilder().setColor(0xEC4899).setTitle(`🐳 巨鯨大戶異動雷達 (15% 振幅監控, ${tfText}內變化)`).setDescription(desc);
        return interaction.reply({ embeds: [embed] });
    }

    if (['查價', '折溢排行', '課金指南'].includes(cmd)) {
        
        if (interaction.channelId !== ALLOWED_MARKET_CHANNEL_ID) {
            return interaction.reply({ content: `❌ 市場分析指令請移駕至 <#${ALLOWED_MARKET_CHANNEL_ID}> 頻道使用喔！`, flags: MessageFlags.Ephemeral });
        }

        if (cmd === '查價') {
            const itemName = interaction.options.getString('物品名稱');
            const itemData = getMarketItem(itemName);
            if (!itemData) return interaction.reply({ content: `🔍 找不到 **${itemName}** 的報價！`, flags: MessageFlags.Ephemeral });

            const defaultTf = '24h';
            const payload = buildMarketMessage(itemData, defaultTf, isGuildMember, client.user);
            return interaction.reply({ embeds: payload.embeds, components: payload.components, flags: MessageFlags.Ephemeral });
        }

        if (cmd === '折溢排行') {
            const allItems = getAllMarketItems();
            let validItems = allItems.filter(i => i.rawTrend !== 0 && !isNaN(i.rawTrend)).sort((a, b) => b.rawTrend - a.rawTrend);
            const premiumItems = validItems.slice(0, 5); 
            const discountItems = validItems.slice(-5).reverse(); 

            let premiumText = premiumItems.map((item, i) => `**${i+1}.** ${item.name} \n└ 📈 \`+${item.rawTrend.toFixed(2)}%\` (報價: ${item.price})`).join('\n\n');
            let discountText = discountItems.map((item, i) => `**${i+1}.** ${item.name} \n└ 📉 \`${item.rawTrend.toFixed(2)}%\` (報價: ${item.price})`).join('\n\n');

            const tfText = isGuildMember ? "48H" : "24H";
            const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle(`🎯 折溢排行 (${tfText}內變化)`)
                .addFields(
                    { name: '🔥 【溢價急漲區】(建議出售)', value: premiumText || '目前無顯著急漲物品', inline: true },
                    { name: '🧊 【折價超跌區】(建議掃貨)', value: discountText || '目前無顯著超跌物品', inline: true }
                ).setFooter({ text: '市場瞬息萬變，投資理財有賺有賠', iconURL: client.user.displayAvatarURL() });

            const btnRow = new ActionRowBuilder();
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId('publish_arbitrage_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(new ButtonBuilder().setCustomId('publish_arbitrage_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

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
            if (isGuildMember) btnRow.addComponents(new ButtonBuilder().setCustomId('publish_cash_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
            btnRow.addComponents(new ButtonBuilder().setCustomId('publish_cash_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

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
                    '🎯 **折溢排行**：列出目前全市場溢價與折價排行 Top 5\n' +
                    '💳 **課金指南**：台幣最大化轉換楓幣的高效率方案\n' +
                    '🚨 **價格警報**：設定個人專屬的觸價私訊推播提醒\n' +
                    '📋 **我的警報**：查看與管理目前已設定的警報清單\n' +
                    '💼 **個人資產庫**：追蹤你的真實楓幣資產與未實現損益\n' +
                    '🏆 **虛擬炒股大賽**：免費開戶！用百億虛擬金練習眼光\n' +
                    '🐳 **巨鯨大戶雷達**：掃描市場上暴漲暴跌的異常物品\n\n' +
                    '*💡 查詢結果僅自己可見，點擊📢 分享按鈕，可以將資訊分享給親友！*')
                .setColor('#F59E0B');

            const actionSelect = new StringSelectMenuBuilder()
                .setCustomId('select_market_action')
                .setPlaceholder('請選擇市場功能...')
                .addOptions([
                    { label: '即時查價', description: '查詢特定物品最新價格', value: 'market_price', emoji: '🔍' },
                    { label: '折溢排行', description: '全服漲跌幅最大排行榜', value: 'market_arbitrage', emoji: '🎯' },
                    { label: '課金指南', description: '台幣換楓幣最佳方案', value: 'market_cash', emoji: '💳' },
                    { label: '價格警報', description: '設定跌破或突破指定價格時的通知', value: 'market_alert_set', emoji: '🚨' },
                    { label: '我的警報', description: '管理已設定的警報', value: 'market_alert_list', emoji: '📋' },
                    { label: '個人資產庫', description: '追蹤你的真實楓幣資產與未實現損益', value: 'portfolio_view', emoji: '💼' },
                    { label: '虛擬炒股大賽', description: '免費開戶！用虛擬金練習投資眼光', value: 'paper_trade', emoji: '🏆' },
                    { label: '巨鯨大戶雷達', description: '掃描市場上暴漲暴跌的異常物品', value: 'whale_alert', emoji: '🐳' }
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
