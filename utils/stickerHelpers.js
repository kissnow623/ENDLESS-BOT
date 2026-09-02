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

    // 1. 檢查該頻道是否已經有我們的專屬 Webhook
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.name === 'EndlessStickerHook');
    
    // 2. 如果沒有，自動在該頻道建立一個
    if (!webhook) {
        webhook = await channel.createWebhook({
            name: 'EndlessStickerHook',
            avatar: interaction.client.user.displayAvatarURL(),
        });
    }

    // 3. 透過 Webhook 偽裝成玩家本人發送圖片
    await webhook.send({
        content: imageUrl,
        username: member ? member.displayName : user.username, // 優先使用伺服器暱稱
        avatarURL: member ? member.displayAvatarURL() : user.displayAvatarURL()
    });
}

module.exports = { getStickers, addSticker, sendStickerViaWebhook };
