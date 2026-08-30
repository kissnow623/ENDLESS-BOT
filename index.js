require('dotenv').config();

// ==========================================
// 🌐 0. 強制使用 IPv4 (破解 Render 網路黑洞)
// ==========================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. 啟動 Web 伺服器 (防止 Render 休眠)
// ==========================================
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('✅ ENDLESS-BOT is running online!'));
app.listen(port, () => console.log(`🌐 Web Server Listening on port ${port}`));

// ==========================================
// 2. 建立 Discord Client
// ==========================================
const client = new Client({
    intents: [ 
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.DirectMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites 
    ],
    partials: [ Partials.User, Partials.GuildMember, Partials.Channel, Partials.Message ]
});

// 全域快取存放區
client.guildInvites = new Map();

// ==========================================
// 3. 動態載入 Events (事件路由)
// ==========================================
// 系統會自動讀取 events 資料夾中的檔案，並掛載對應的觸發事件
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
    console.log(`✅ 成功載入 ${eventFiles.length} 個系統事件！`);
} else {
    console.log(`⚠️ 尚未建立 events 資料夾，請確認目錄架構。`);
}

// ==========================================
// 4. 啟動機器人登入
// ==========================================
const safeToken = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.trim() : null;
if (!safeToken) {
    console.error("❌ [錯誤] 系統抓不到 DISCORD_TOKEN！");
}

client.login(safeToken).catch(error => {
    console.error("❌ [致命錯誤] Discord 拒絕了登入連線：", error);
});
