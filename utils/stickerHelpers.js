const { EmbedBuilder } = require('discord.js');
const { db, addDbStat } = require('./firebase');

// 📥 從資料庫獲取所有貼圖
async function getStickers() {
    const snapshot = await db.collection('stickers').get();
    addDbStat('read');
    if (snapshot.empty) return [];
    // 將資料庫的文檔 ID 和內容合併回傳
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// 📤 將新貼圖寫入資料庫
async function addSticker(data) {
    await db.collection('stickers').add(data);
    addDbStat('write');
}

// 🤖 核心技術：Webhook 偽裝與發送
async function sendStickerViaWebhook(interaction, imageUrl) {
    const channel = interaction.channel;
    const member = interaction.member; // 取伺服器內的成員狀態 (為了抓暱稱)
    const user = interaction.user;

    try {
        // 🌟 核心修正：判斷當前是否在「討論串 (Thread)」中
        const isThread = channel.isThread();
        // Webhook 只能建立在主頻道，所以如果是討論串，就要往上找它的老爸 (parent)
        const webhookChannel = isThread ? channel.parent : channel;

        // 1. 檢查該頻道是否已經有我們的專屬 Webhook
        const webhooks = await webhookChannel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.name === 'EndlessStickerHook');
        
        // 2. 如果沒有，自動在該頻道建立一個
        if (!webhook) {
            webhook = await webhookChannel.createWebhook({
                name: 'EndlessStickerHook',
                avatar: interaction.client.user.displayAvatarURL(),
            });
        }

        // 準備發送的資料
        const sendOptions = {
            content: imageUrl,
            username: member ? member.displayName : user.username, // 優先使用伺服器暱稱
            avatarURL: member ? member.displayAvatarURL() : user.displayAvatarURL()
        };

        // 🌟 如果在討論串內，發送時必須「指定」發進這個討論串的 ID
        if (isThread) {
            sendOptions.threadId = channel.id;
        }

        // 3. 透過 Webhook 偽裝成玩家本人發送圖片
        await webhook.send(sendOptions);

    } catch (error) {
        console.error("❌ Webhook 發送貼圖/表情包失敗：", error);
        // 如果機器人沒有管理 Webhook 的權限或發生意外，退回使用普通發送模式
        const displayName = member ? member.displayName : user.username;
        await channel.send({
            content: `**${displayName}** 傳送了圖片：\n${imageUrl}`
        });
    }
}

module.exports = { getStickers, addSticker, sendStickerViaWebhook };
