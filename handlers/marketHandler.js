// handlers/marketHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } = require('discord.js');
const { db, addDbStat, admin } = require('../utils/firebase'); // 🌟 引入 admin 來操作遞增點擊率
const { getMarketItem, getAllMarketItems } = require('../utils/marketHelpers'); 

const cashItemWcPrices = {
    "AP初始化卷軸": 400, "SP初始化卷軸": 300, "高級瞬移之石": 36.36, "突襲額外獎勵票券": 171.42, "飄雪結晶": 27.27, "凍結加持器": 40.91, "高效能喇叭UP": 127.28, "戒指精選卷軸轉蛋券": 190,
    "神祕背包": 250, "幸運滿滿轉蛋券": 190, "仲夏假期轉蛋券": 190
};

const ALLOWED_MARKET_CHANNEL_ID = '1544604459085070346'; 
const GUILD_CHANNEL_ID = '1539971422842261601'; 
const FRIEND_CHANNEL_ID = '1544604459085070346'; 

// ==========================================
// 🤖 輔助引擎區：AI 診斷、熱搜追蹤、建構圖表
// ==========================================

// 🌟 雙向回饋機制：幫原網站紀錄 Discord 端熱門搜尋排行榜
async function trackItemActivity(itemName) {
    try {
        await db.collection('hotSearches').doc(itemName).set({
            count: admin.firestore.FieldValue.increment(1),
            lastActive: Date.now()
        }, { merge: true });
        addDbStat('write');
    } catch (e) {
        console.error("熱搜記錄失敗", e);
    }
}

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

    const msg = `✅ 成功以單價 \`${currentPrice.toFixed(2)} 萬\` **${action}** ${qty} 個 **${itemName}**！\n交割總金額：\`${totalCost.toFixed(2)} 萬\``;
    return isUpdate ? interaction.update({ content: msg, embeds: [], components: [] }) : interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
}

function buildMarketMessage(itemData, activeTf, isGuildMember, clientUser) {
    let displayChartUrl = itemData.chartUrl;
    let tfLabel = "全區間歷史走勢";
    
    if (activeTf === '6h') { displayChartUrl = itemData.chartUrl6h || itemData.chartUrl; tfLabel = "6 小時籌碼走勢"; }
    else if (activeTf === '12h') { displayChartUrl = itemData.chartUrl12h || itemData.chartUrl; tfLabel = "12 小時籌碼走勢"; }
    else if (activeTf === '24h') { displayChartUrl = itemData.chartUrl24h || itemData.chartUrl1Day || itemData.chartUrl; tfLabel = "24 小時籌碼走勢"; }
    else if (activeTf === '48h') { displayChartUrl = itemData.chartUrl48h || itemData.chartUrl; tfLabel = "48 小時籌碼走勢"; }

    const aiText = getAITrendAnalysis(itemData.name, itemData.rawTrend24h || 0);
    const safeName = itemData.name.substring(0, 50);

    const vipNote = isGuildMember 
        ? "💡 如果有查詢48H以上需求，請檢視並加入Artale楓之谷VIP\n*(註：若切換按鈕後圖表未變化，表示市場暫無該時段圖表)*" 
        : "💡 如果有查詢24H以上需求，請檢視並加入Artale楓之谷VIP\n*(註：若切換按鈕後圖表未變化，表示市場暫無該時段圖表)*";

    const riskNote = "⚠️ **投資有風險，請保持獨立判斷，審慎評估風險，以上診斷僅供參考，祝大家楓之股滿盆砵缽～**";

    const embed = new EmbedBuilder()
        .setColor(0x0f172a)
        .setTitle(`📊 籌碼K線：${itemData.name}`)
        .setDescription(`**💰 最新成交價：** \`${itemData.price}\`\n**📈 走勢漲跌幅 (24H)：** ${itemData.trend24h}\n\n**🤖 線型盤勢診斷：**\n> ${aiText}\n${riskNote}\n\n*${vipNote}*`)
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
    
    // 🌟 雙向回饋機制：把去網站的理由變得極具吸引力
    btnRow.addComponents(
        new ButtonBuilder().setCustomId(`publish_price_pubF_${safeName}_${activeTf}`).setLabel('📢 發布至親友').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setLabel('🌐 網頁版看詳細明細 (支持原作者)').setStyle(ButtonStyle.Link).setURL('https://artalestock.netlify.app/') 
    );

    return { embeds: [embed], components: [tfRow, btnRow] };
}

// ==========================================
// 🕹️ 市場互動處理中心 (按鈕、選單、表單)
// ==========================================
async function handleMarketInteraction(interaction, client, isGuildMember) {
    if (interaction.isButton()) {
        const cId = interaction.customId;

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

        if (cId === 'market_btn_portfolio_add') {
            const modal = new ModalBuilder().setCustomId('modal_portfolio_add_search').setTitle('💼 新增個人資產庫');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel("物品關鍵字").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel("持有數量").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cost').setLabel("平均購入成本 (單件/萬)").setStyle(TextInputStyle.Short).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        if (cId === 'market_btn_paper_buy' || cId === 'market_btn_paper_sell') {
            const action = cId.includes('buy') ? '買入' : '賣出';
            const modal = new ModalBuilder().setCustomId(`modal_paper_${action}_search`).setTitle(`🛒 模擬炒股：${action}委託`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel("物品關鍵字").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel("委託數量").setStyle(TextInputStyle.Short).setRequired(true))
            );
            return interaction.showModal(modal);
        }

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
                        const currentPriceInWan = marketData ? ((marketData.rawPrice || 0) / 10000) : 0;
                        totalValue += qty * currentPriceInWan;
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
                    return interaction.reply({ content: `❌ 發布失敗。`, flags: MessageFlags.Ephemeral });
                }
            }

            if (cId.startsWith('publish_arbitrage_') || cId.startsWith('publish_cash_')) {
                if (!interaction.message.embeds || interaction.message.embeds.length === 0) return interaction.reply({ content: '❌ 無法取得原始圖表，發布失敗。', flags: MessageFlags.Ephemeral });

                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                const tfText = isGuildMember ? "48H" : "24H";

                if (cId.startsWith('publish_arbitrage_')) originalEmbed.setTitle(`🎯 折溢排行 (${tfText}內變化) (由 ${interaction.user.username} 分享)`);
                if (cId.startsWith('publish_cash_')) originalEmbed.setTitle(`💳 課金最佳化轉換試算 (由 ${interaction.user.username} 分享)`);
                
                try {
                    await targetChannel.send({ embeds: [originalEmbed] });
                    return interaction.update({ content: `✅ 已成功分享至 ${channelName}！`, components: [] });
                } catch (err) {
                    return interaction.reply({ content: `❌ 發布失敗。`, flags: MessageFlags.Ephemeral });
                }
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        const action = interaction.values[0];

        if (interaction.customId === 'select_market_action') {
            if (interaction.channelId !== ALLOWED_MARKET_CHANNEL_ID) return interaction.reply({ content: `❌ 市場看板功能請移駕至 <#${ALLOWED_MARKET_CHANNEL_ID}> 頻道使用喔！`, flags: MessageFlags.Ephemeral });

            if (action === 'market_price') {
                const modal = new ModalBuilder().setCustomId('modal_market_price').setTitle('🔍 即時查價系統 (支援關鍵字)');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel("請輸入想找的物品關鍵字 (例如: 詛咒/30%)").setStyle(TextInputStyle.Short).setRequired(true)));
                return interaction.showModal(modal);
            }

            if (action === 'market_arbitrage') {
                interaction.message.edit({ components: interaction.message.components }).catch(() => {});
                const allItems = getAllMarketItems();
                let validItems = allItems.filter(i => i.rawTrend24h !== 0 && !isNaN(i.rawTrend24h)).sort((a, b) => b.rawTrend24h - a.rawTrend24h);
                let pText = validItems.slice(0, 5).map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📈 \`+${i.rawTrend24h.toFixed(2)}%\` (${i.price})`).join('\n\n');
                let dText = validItems.slice(-5).reverse().map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📉 \`${Math.abs(i.rawTrend24h).toFixed(2)}%\` (${i.price})`).join('\n\n');

                const tfText = isGuildMember ? "48H" : "24H";
                const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle(`🎯 折溢排行 (${tfText}內變化)`)
                    .addFields({ name: `🔥 【溢價急漲區】(建議出售)`, value: pText || '無', inline: true }, { name: `🧊 【折價超跌區】(建議掃貨)`, value: dText || '無', inline: true })
                    .setFooter({ text: '⚠️ 投資有風險，請保持獨立判斷，審慎評估風險，祝大家楓之股滿盆砵缽～', iconURL: client.user.displayAvatarURL() });

                const publishBtn = new ActionRowBuilder();
                if (isGuildMember) publishBtn.addComponents(new ButtonBuilder().setCustomId('publish_arbitrage_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success));
                publishBtn.addComponents(new ButtonBuilder().setCustomId('publish_arbitrage_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary));

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

            if (action === 'market_alert_set') {
                const modal = new ModalBuilder().setCustomId('modal_market_alert_search').setTitle('🚨 警報設定 (1/2)：搜尋物品');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel("請輸入物品關鍵字 (例如: 詛咒/30%)").setStyle(TextInputStyle.Short).setRequired(true)));
                return interaction.showModal(modal);
            }

            if (action === 'market_alert_list') {
                interaction.message.edit({ components: interaction.message.components }).catch(() => {});
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                try {
                    const snapshot = await db.collection('priceAlerts').where('userId', '==', interaction.user.id).get();
                    if (snapshot.empty) return interaction.editReply('📭 您目前沒有設定任何價格警報喔！');
                    
                    let desc = '🚨 **您的專屬價格推播警報清單**\n\n';
                    const deleteOptions = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        desc += `🔹 **${data.itemName}** ➔ 當 ${data.condition} \`${data.targetPrice} 萬\` 時私訊通知\n`;
                        deleteOptions.push(new StringSelectMenuOptionBuilder().setLabel(`刪除: ${data.itemName.substring(0, 50)}`).setDescription(`條件: ${data.condition} ${data.targetPrice}萬`).setValue(doc.id));
                    });
                    
                    const embed = new EmbedBuilder().setColor(0xEF4444).setDescription(desc);
                    const components = deleteOptions.length > 0 ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('market_delete_alert').setPlaceholder('🗑️ 點擊這裡選擇要刪除的警報...').addOptions(deleteOptions.slice(0, 25)))] : [];
                    return interaction.editReply({ embeds: [embed], components });
                } catch (error) { return interaction.editReply('❌ 無法連線至警報資料庫，請稍後再試。'); }
            }

            if (action === 'portfolio_view') {
                interaction.message.edit({ components: interaction.message.components }).catch(() => {});
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const doc = await db.collection('userAssets').doc(interaction.user.id).get();
                const items = doc.exists ? (doc.data().items || {}) : {};
                
                let totalCost = 0; let totalValue = 0; let desc = "";
                for (const [name, info] of Object.entries(items)) {
                    if (info.qty <= 0) continue;
                    const marketData = getMarketItem(name);
                    const currentPriceInWan = marketData ? ((marketData.rawPrice || 0) / 10000) : info.cost;
                    const itemCostTotal = info.qty * info.cost;
                    const itemValueTotal = info.qty * currentPriceInWan;
                    const pnl = itemValueTotal - itemCostTotal;
                    totalCost += itemCostTotal; totalValue += itemValueTotal;
                    desc += `**${name}** (持有: ${info.qty})\n└ 成本: \`${info.cost.toFixed(2)}萬\` | 現價: \`${currentPriceInWan.toFixed(2)}萬\`\n└ 損益: ${pnl >= 0 ? '🔴' : '🟢'} \`${pnl.toFixed(2)}萬\` (${itemCostTotal > 0 ? (pnl/itemCostTotal*100).toFixed(2) : 0}%)\n\n`;
                }

                if (!desc) desc = "📭 目前尚無資產，點擊下方按鈕開始紀錄您的真實庫存！";
                const totalPnl = totalValue - totalCost;
                const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle(`💼 ${interaction.user.username} 的個人資產庫`)
                    .setDescription(`**投入總成本：** \`${totalCost.toFixed(2)} 萬\`\n**目前總市值：** \`${totalValue.toFixed(2)} 萬\`\n**未實現損益：** ${totalPnl >= 0 ? '🔴' : '🟢'} \`${totalPnl.toFixed(2)} 萬\` (${totalCost > 0 ? (totalPnl/totalCost*100).toFixed(2) : 0}%)\n\n${desc}`);

                const btnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('market_btn_portfolio_add').setLabel('➕ 新增持倉紀錄').setStyle(ButtonStyle.Success));
                return interaction.editReply({ embeds: [embed], components: [btnRow] });
            }

            if (action === 'paper_trade') {
                interaction.message.edit({ components: interaction.message.components }).catch(() => {});
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const docRef = db.collection('paperAccounts').doc(interaction.user.id);
                const doc = await docRef.get();
                if (!doc.exists) {
                    await docRef.set({ cash: 1000000, holdings: {}, username: interaction.user.username }); addDbStat('write');
                    return interaction.editReply({ content: '🎉 **開戶成功！** 已為您匯入初始資金 `1,000,000 萬` (100億) 虛擬楓幣！\n請再次點擊「虛擬炒股大賽」查看您的帳戶並開始交易。' });
                }
                let data = doc.data(); let totalValue = data.cash; let hDesc = "";
                if (data.holdings) {
                    for (const [name, qty] of Object.entries(data.holdings)) {
                        const marketData = getMarketItem(name);
                        const currentPriceInWan = marketData ? ((marketData.rawPrice || 0) / 10000) : 0;
                        totalValue += qty * currentPriceInWan;
                        if (qty > 0) hDesc += `🔹 **${name}**: ${qty} 個 (現值: \`${(qty * currentPriceInWan).toFixed(2)} 萬\`)\n`;
                    }
                }
                const embed = new EmbedBuilder().setColor(0xF59E0B).setTitle(`🏆 ${interaction.user.username} 的虛擬證券戶`)
                    .addFields({ name: '💰 可用現金', value: `\`${data.cash.toFixed(2)} 萬\``, inline: true }, { name: '📈 帳戶總淨值', value: `\`${totalValue.toFixed(2)} 萬\``, inline: true }, { name: '📦 庫存明細', value: hDesc || '目前無庫存', inline: false });

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('market_btn_paper_buy').setLabel('🛒 買入').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('market_btn_paper_sell').setLabel('💰 賣出').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('market_btn_paper_rank').setLabel('🏆 看排行榜').setStyle(ButtonStyle.Secondary)
                );
                return interaction.editReply({ embeds: [embed], components: [btnRow] });
            }

            if (action === 'whale_alert') {
                interaction.message.edit({ components: interaction.message.components }).catch(() => {});
                const allItems = getAllMarketItems() || [];
                const whales = allItems.filter(i => Math.abs(i.rawTrend24h) >= 15 && i.rawPrice > 0).sort((a, b) => Math.abs(b.rawTrend24h) - Math.abs(a.rawTrend24h));
                if (whales.length === 0) return interaction.reply({ content: '🌊 目前市場風平浪靜，沒有偵測到巨鯨大戶的異常掃貨或倒貨跡象。', flags: MessageFlags.Ephemeral });
                
                let desc = whales.map(i => {
                    const icon = i.rawTrend24h > 0 ? '🚀 【大戶掃貨暴漲】' : '🩸 【大戶倒貨暴跌】';
                    return `**${i.name}**\n└ ${icon} \`${i.trend24h}\` (現價: ${i.price})`;
                }).join('\n\n');

                const embed = new EmbedBuilder().setColor(0xEC4899).setTitle(`🐳 巨鯨大戶異動雷達 (過去 24H 變化)`).setDescription(desc).setFooter({ text: '※ 背景排程警報已啟動監控', iconURL: client.user.displayAvatarURL() });
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }

        if (interaction.customId === 'market_delete_alert') {
            try {
                await db.collection('priceAlerts').doc(interaction.values[0]).delete();
                return interaction.update({ content: '✅ **指定的警報已成功刪除！**', embeds: [], components: [] });
            } catch (err) { return interaction.reply({ content: '❌ 刪除發生錯誤。', flags: MessageFlags.Ephemeral }); }
        }

        if (interaction.customId === 'select_market_price_result') {
            const itemName = interaction.values[0];
            const itemData = getMarketItem(itemName);
            if (!itemData) return interaction.reply({ content: `🔍 找不到報價！`, flags: MessageFlags.Ephemeral });
            
            // 🌟 記錄社群熱搜點擊
            trackItemActivity(itemName);

            const payload = buildMarketMessage(itemData, '24h', isGuildMember, client.user);
            return interaction.update({ content: '✅ 查詢成功！', embeds: payload.embeds, components: payload.components });
        }

        if (interaction.customId === 'market_alert_select_item') {
            const safeName = interaction.values[0].substring(0, 50); 
            const modal = new ModalBuilder().setCustomId(`market_alert_config_${safeName}`).setTitle(`🚨 設定: ${safeName}`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_price').setLabel("目標觸發價格 (萬)").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel("觸發條件 (請填 高於 或 低於)").setStyle(TextInputStyle.Short).setRequired(true).setValue('低於'))
            );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'select_portfolio_add_result') {
            const parts = interaction.values[0].split('_');
            const itemName = parts.slice(2).join('_');
            
            // 🌟 記錄社群熱搜點擊
            trackItemActivity(itemName);
            
            await addAssetToDb(interaction.user.id, itemName, parseInt(parts[0]), parseFloat(parts[1]));
            return interaction.update({ content: `✅ 成功加入資產庫！\n請重新點擊看板查看更新後的「💼 個人資產庫」。`, components: [] });
        }

        if (interaction.customId === 'select_paper_trade_result') {
            const parts = interaction.values[0].split('_'); 
            const itemName = parts.slice(2).join('_');
            const targetItem = getMarketItem(itemName);
            if (!targetItem) return interaction.reply({ content: '❌ 物品已過期', flags: MessageFlags.Ephemeral });
            
            // 🌟 記錄社群熱搜點擊
            trackItemActivity(itemName);

            await processPaperTrade(interaction, itemName, parseInt(parts[1]), parts[0] === 'buy' ? '買入' : '賣出', (targetItem.rawPrice || 0) / 10000, true);
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

        if (interaction.customId === 'modal_market_price') {
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            const uniqueItems = filterUniqueItems(query);
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到報價！`, flags: MessageFlags.Ephemeral });
            if (uniqueItems.length > 1) {
                const options = uniqueItems.slice(0, 25).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name.substring(0, 100)).setValue(r.name.substring(0, 100)).setDescription(`目前報價: ${r.price || '無'}`.substring(0, 100)));
                const dropdownRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_market_price_result').setPlaceholder('請選擇精確物品...').addOptions(options));
                return interaction.reply({ content: `🔍 找到多個結果：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
            }
            
            // 🌟 記錄社群熱搜點擊
            trackItemActivity(uniqueItems[0].name);

            const payload = buildMarketMessage(uniqueItems[0], '24h', isGuildMember, client.user);
            return interaction.reply({ embeds: payload.embeds, components: payload.components, flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'modal_market_alert_search') {
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            const uniqueItems = filterUniqueItems(query);
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到報價！`, flags: MessageFlags.Ephemeral });
            const options = uniqueItems.slice(0, 25).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name.substring(0, 100)).setValue(r.name.substring(0, 100)).setDescription(`報價: ${r.price || '無'}`.substring(0, 100)));
            const dropdownRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('market_alert_select_item').setPlaceholder('請下拉選擇物品...').addOptions(options));
            return interaction.reply({ content: `🔍 找到多個結果，請選擇：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId.startsWith('market_alert_config_')) {
            const itemName = interaction.customId.replace('market_alert_config_', '');
            const price = interaction.fields.getTextInputValue('target_price');
            const condition = interaction.fields.getTextInputValue('condition');
            await db.collection('priceAlerts').add({ userId: interaction.user.id, userName: interaction.user.username, itemName: itemName, targetPrice: Number(price), condition: condition, createdAt: Date.now() });
            return interaction.reply({ content: `✅ **警報寫入成功！**\n當【${itemName}】${condition} \`${price} 萬\` 時，將私訊通知您！`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'modal_portfolio_add_search') {
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            const qty = parseInt(interaction.fields.getTextInputValue('qty'));
            const cost = parseFloat(interaction.fields.getTextInputValue('cost'));
            if (qty <= 0 || isNaN(cost)) return interaction.reply({ content: '❌ 輸入格式錯誤！', flags: MessageFlags.Ephemeral });
            const uniqueItems = filterUniqueItems(query);
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到報價！`, flags: MessageFlags.Ephemeral });
            if (uniqueItems.length > 1) {
                const options = uniqueItems.slice(0, 25).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name.substring(0, 50)).setValue(`${qty}_${cost}_${r.name.substring(0, 50)}`).setDescription(`報價: ${r.price || '無'}`.substring(0, 100)));
                const dropdownRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_portfolio_add_result').setPlaceholder('請選擇精確物品...').addOptions(options));
                return interaction.reply({ content: `🔍 找到多個物品：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
            }
            
            trackItemActivity(uniqueItems[0].name);
            await addAssetToDb(interaction.user.id, uniqueItems[0].name, qty, cost);
            return interaction.reply({ content: `✅ 成功加入資產庫！`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId.startsWith('modal_paper_')) {
            const isBuy = interaction.customId.includes('buy');
            const query = (interaction.fields.getTextInputValue('item_name') || '').toLowerCase();
            const qty = parseInt(interaction.fields.getTextInputValue('qty'));
            if (qty <= 0) return interaction.reply({ content: '❌ 數量需大於 0！', flags: MessageFlags.Ephemeral });
            const uniqueItems = filterUniqueItems(query);
            if (uniqueItems.length === 0) return interaction.reply({ content: `🔍 找不到報價！`, flags: MessageFlags.Ephemeral });
            if (uniqueItems.length > 1) {
                const actionPrefix = isBuy ? 'buy' : 'sell';
                const options = uniqueItems.slice(0, 25).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name.substring(0, 50)).setValue(`${actionPrefix}_${qty}_${r.name.substring(0, 50)}`).setDescription(`市價: ${r.price || '無'}`.substring(0, 100)));
                const dropdownRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_paper_trade_result').setPlaceholder(`請選擇物品...`).addOptions(options));
                return interaction.reply({ content: `🔍 找到多個標的：`, components: [dropdownRow], flags: MessageFlags.Ephemeral });
            }
            
            trackItemActivity(uniqueItems[0].name);
            const currentPriceInWan = (uniqueItems[0].rawPrice || 0) / 10000;
            await processPaperTrade(interaction, uniqueItems[0].name, qty, isBuy ? '買入' : '賣出', currentPriceInWan);
            return; 
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
                    results.push({ name: cleanName, mesos: (totalWc / wcPrice) * item.rawPrice, efficiency: Math.floor(item.rawPrice / wcPrice) });
                }
            }
            if (results.length === 0) return interaction.reply({ content: '❌ 無法取得報價資料。', flags: MessageFlags.Ephemeral });
            results.sort((a, b) => b.mesos - a.mesos);
            let descText = `**投入台幣：** \`${twd.toLocaleString()}\` TWD\n**轉換點數：** \`${totalWc.toLocaleString()}\` WC (匯率 ${rate})\n\n🏆 **最高效率 Top 3：**\n\n`;
            results.slice(0, 3).forEach((res, i) => {
                const mesoStr = res.mesos >= 100000000 ? `${(res.mesos / 100000000).toFixed(2)} 億` : `${Math.floor(res.mesos / 10000).toLocaleString()} 萬`;
                descText += `**${i+1}. 買【${res.name}】去賣**\n└ 預估得：💰 **\`${mesoStr}\`** (效率: ${res.efficiency.toLocaleString()} 楓幣/WC)\n\n`;
            });
            const embed = new EmbedBuilder().setColor(0xF59E0B).setTitle('💳 台幣 (TWD) ➡️ 楓幣 最佳化轉換試算').setDescription(descText);
            const btnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`publish_cash_pubG_0`).setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`publish_cash_pubF_0`).setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }
    }
}

// ⌨️ 【斜線指令處理區】
async function handleMarketCommand(interaction, client, isGuildMember) {
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
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_portfolio_add_result').setPlaceholder('請選擇精確物品...').addOptions(options));
            return interaction.reply({ content: `🔍 找到多個物品，請選擇：`, components: [row], flags: MessageFlags.Ephemeral });
        }
        
        trackItemActivity(uniqueItems[0].name);
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
            const currentPriceInWan = marketData ? ((marketData.rawPrice || 0) / 10000) : info.cost; 
            const itemCostTotal = info.qty * info.cost;
            const itemValueTotal = info.qty * currentPriceInWan;
            const pnl = itemValueTotal - itemCostTotal;
            totalCost += itemCostTotal; totalValue += itemValueTotal;
            const icon = pnl >= 0 ? '🔴' : '🟢'; 
            desc += `**${name}** (數量: ${info.qty})\n└ 成本: \`${info.cost.toFixed(2)}萬\` | 現價: \`${currentPriceInWan.toFixed(2)}萬\`\n└ 損益: ${icon} \`${pnl.toFixed(2)}萬\` (${itemCostTotal>0 ? (pnl/itemCostTotal*100).toFixed(2) : 0}%)\n\n`;
        }
        const totalPnl = totalValue - totalCost;
        const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle(`💼 ${interaction.user.username} 的個人資產庫`)
            .setDescription(`**投入總成本：** \`${totalCost.toFixed(2)} 萬\`\n**目前總市值：** \`${totalValue.toFixed(2)} 萬\`\n**未實現損益：** ${totalPnl >= 0 ? '🔴' : '🟢'} \`${totalPnl.toFixed(2)} 萬\` (${totalCost>0 ? (totalPnl/totalCost*100).toFixed(2) : 0}%)\n\n${desc}`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (cmd === '巨鯨雷達') {
        const allItems = getAllMarketItems() || [];
        const whales = allItems.filter(i => Math.abs(i.rawTrend24h) >= 15 && i.rawPrice > 0).sort((a, b) => Math.abs(b.rawTrend24h) - Math.abs(a.rawTrend24h));
        if (whales.length === 0) return interaction.reply({ content: '🌊 目前市場風平浪靜，無明顯巨鯨活動。', flags: MessageFlags.Ephemeral });
        
        let desc = whales.map(i => `**${i.name}**\n└ ${i.rawTrend24h > 0 ? '🚀 【大戶掃貨暴漲】' : '🩸 【大戶倒貨暴跌】'} \`${i.trend24h}\` (現價: ${i.price})`).join('\n\n');
        
        const embed = new EmbedBuilder().setColor(0xEC4899).setTitle(`🐳 巨鯨大戶異動雷達 (過去 24H 變化)`).setDescription(desc);
        return interaction.reply({ embeds: [embed] });
    }

    if (['查價', '折溢排行', '課金指南'].includes(cmd)) {
        if (interaction.channelId !== ALLOWED_MARKET_CHANNEL_ID) return interaction.reply({ content: `❌ 市場分析指令請移駕至 <#${ALLOWED_MARKET_CHANNEL_ID}> 頻道使用喔！`, flags: MessageFlags.Ephemeral });

        if (cmd === '查價') {
            const itemName = interaction.options.getString('物品名稱');
            const itemData = getMarketItem(itemName);
            if (!itemData) return interaction.reply({ content: `🔍 找不到 **${itemName}** 的報價！`, flags: MessageFlags.Ephemeral });
            
            trackItemActivity(itemName);
            const payload = buildMarketMessage(itemData, '24h', isGuildMember, client.user);
            return interaction.reply({ embeds: payload.embeds, components: payload.components, flags: MessageFlags.Ephemeral });
        }

        if (cmd === '折溢排行') {
            const is48H = isGuildMember;
            const rawKey = is48H ? 'rawTrend48h' : 'rawTrend24h';
            const tfText = is48H ? "過去 48H" : "過去 24H";

            const allItems = getAllMarketItems();
            let validItems = allItems.filter(i => i[rawKey] !== 0 && !isNaN(i[rawKey])).sort((a, b) => b[rawKey] - a[rawKey]);
            let pText = validItems.slice(0, 5).map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📈 \`+${i[rawKey].toFixed(2)}%\` (${i.price})`).join('\n\n');
            let dText = validItems.slice(-5).reverse().map((i, idx) => `**${idx+1}.** ${i.name} \n└ 📉 \`${Math.abs(i[rawKey]).toFixed(2)}%\` (${i.price})`).join('\n\n');

            const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle(`🎯 折溢排行 (${tfText}內變化)`)
                .addFields(
                    { name: '🔥 【溢價急漲區】(建議出售)', value: pText || '目前無顯著急漲物品', inline: true },
                    { name: '🧊 【折價超跌區】(建議掃貨)', value: dText || '目前無顯著超跌物品', inline: true }
                ).setFooter({ text: '⚠️ 投資有風險，請保持獨立判斷，審慎評估風險，祝大家楓之股滿盆砵缽～', iconURL: client.user.displayAvatarURL() });

            const btnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('publish_arbitrage_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('publish_arbitrage_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary)
            );
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
                    results.push({ name: cleanName, mesos: (totalWc / wcPrice) * item.rawPrice, efficiency: Math.floor(item.rawPrice / wcPrice) });
                }
            }

            if (results.length === 0) return interaction.reply({ content: '❌ 無法取得報價資料。', flags: MessageFlags.Ephemeral });
            results.sort((a, b) => b.mesos - a.mesos);

            let descText = `**投入台幣：** \`${twd.toLocaleString()}\` TWD\n**轉換點數：** \`${totalWc.toLocaleString()}\` WC (匯率 ${rate})\n\n🏆 **最高效率方案 Top 3：**\n\n`;
            results.slice(0, 3).forEach((res, i) => {
                const mesoStr = res.mesos >= 100000000 ? `${(res.mesos / 100000000).toFixed(2)} 億` : `${Math.floor(res.mesos / 10000).toLocaleString()} 萬`;
                descText += `**${i+1}. 買【${res.name}】去賣**\n└ 預估得：💰 **\`${mesoStr}\`** (效率: ${res.efficiency.toLocaleString()} 楓幣/WC)\n\n`;
            });

            const embed = new EmbedBuilder().setColor(0xF59E0B).setTitle('💳 台幣 (TWD) ➡️ 楓幣 最佳化轉換試算').setDescription(descText);
            const btnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('publish_cash_pubG_0').setLabel('📢 發布至公會頻道').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('publish_cash_pubF_0').setLabel('📢 發布至親友閒聊').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [btnRow], flags: MessageFlags.Ephemeral });
        }
    }
}

module.exports = { handleMarketInteraction, handleMarketCommand };
