require('dotenv').config();

// ==========================================
// 🌐 0️⃣ 強制使用 IPv4 (破解 Render 網路黑洞)
// ==========================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const admin = require('firebase-admin');
const { 
    Client, GatewayIntentBits, Partials,
    ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, 
    PermissionsBitField, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, ApplicationCommandOptionType, MessageFlags 
} = require('discord.js');

// ==========================================
// 1️⃣ Firebase 驗證與初始化
// ==========================================
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // 處理私鑰換行符號 (相容 Echo Bot 邏輯)
    let key = serviceAccount.private_key;
    let pureKey = key.replace(/\\n/g, '').replace(/\\\\n/g, '').replace(/\n/g, '').replace(/\r/g, '')
                     .replace(/-----BEGIN PRIVATE KEY-----/gi, '').replace(/-----END PRIVATE KEY-----/gi, '')
                     .replace(/\s+/g, '');
    const chunks = pureKey.match(/.{1,64}/g) || [];
    serviceAccount.private_key = '-----BEGIN PRIVATE KEY-----\n' + chunks.join('\n') + '\n-----END PRIVATE KEY-----\n';
} catch (error) {
    console.error("❌ [錯誤] Firebase 金鑰解析失敗！");
    process.exit(1); 
}

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Firestore 連線成功！");
}
const db = admin.firestore();

// ==========================================
// 👑 參數設定區 (整合 Guild & Echo 變數)
// ==========================================

// 【迴響系統參數】
const ALLOWED_GUILDS = ['1466073297169940543', '1536011422323179631', '1536416054832799795', '1539475243733622794']; // 加入公會伺服器ID
const AGENT_ROLE_MAP = { 'default': '1541411576228093963' };
function getAgentRoleId(guildId) { return AGENT_ROLE_MAP[guildId] || AGENT_ROLE_MAP['default']; }

let dbStats = { reads: 0, writes: 0, resetDay: new Date(Date.now() + 8 * 3600000).getUTCDate() };
function addDbStat(type, count = 1) {
    const twDate = new Date(Date.now() + 8 * 3600000).getUTCDate();
    if (dbStats.resetDay !== twDate) { dbStats.reads = 0; dbStats.writes = 0; dbStats.resetDay = twDate; }
    if (type === 'read') dbStats.reads += count;
    if (type === 'write') dbStats.writes += count;
}

let allReservations = [];
let appSettings = {};

db.collection('reservations').where('timestamp', '>=', Date.now() - 90 * 24 * 60 * 60 * 1000).onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length); 
    allReservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});
db.collection('settings').onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length);
    snapshot.docs.forEach(doc => { appSettings[doc.id] = doc.data(); });
});

// 【公會系統參數】
const ADMIN_ROLES = ['1539508532846526494', '1539959330726486036'];
const config = {
    guildId: '1539475243733622794', 
    features: { redCarpetEnabled: false },
    channels: { 
        approval: '1539972747545808937', welcome: '1539971422842261601', welcomeFriend: '1539904561941188608',
        boostThanks: '1540726577443115109', chatLounge: '1539904561941188608', leaderboardChannel: '這裡填入你想要發布排行榜的頻道ID' 
    },
    roles: {
        adminRoles: ADMIN_ROLES, guildMember: '1539959985797341184', familyFriend: '1539960787882475591',
        classes: {
            '黑騎士': '1540148326433820784', '聖騎士': '1540148350144479312', '英雄': '1540148429336875098', 
            '箭神': '1540148458621763674', '神射手': '1540148479316197496', '主教': '1540148561331753100',
            '冰雷': '1540148594672144445', '火毒': '1540148630608937032', '夜使者': '1540148685193748501', 
            '暗影神偷': '1540148712062591047', '拳霸': '1540148732711014484', '槍神': '1540148797152301126'
        }
    }
};
const classOptionsList = Object.keys(config.roles.classes).map(className => new StringSelectMenuOptionBuilder().setLabel(className).setValue(className));

// 公會文字陣列 (原封不動保留)
const welcomeMessages = [
    (userId) => `🎉 掌聲加尖叫！讓我們熱烈歡迎 <@${userId}> 閃亮登場！✨ 大家快來跟他打聲招呼，準備一起展開在 ENDLESS 的大冒險啦！🚀`,
    (userId) => `🍻 吧台的小夥伴請注意，我們有新客人啦！歡迎 <@${userId}> 踏入 ENDLESS 酒館！趕緊拉張椅子坐下，今晚我們不醉不歸（或是打王打到天亮）！🍖`,
    (userId) => `🔮 *一陣神秘的魔法光芒閃過...* 哇！原來是 <@${userId}> 被傳送到 ENDLESS 大家庭啦！很高興遇見你，未來的日子請多指教喔！🥰`,
    (userId) => `🎈 叮咚！ENDLESS 迎來了一位超酷的新夥伴！<@${userId}> 已經順利解鎖全部頻道囉～大家快把最熱情的貼圖刷起來，讓他感受我們的溫暖吧！🔥🔥`,
    (userId) => `⚔️ 號角響起！勇敢的冒險者 <@${userId}> 正式加入 ENDLESS 的行列！我們又多了一位強力的好隊友啦！準備好一起挑戰極限了嗎？衝呀！💪`,
    (userId) => `🌟 快看天上！是一顆閃亮的流星！不對，那是我們的新成員 <@${userId}> 降落啦！🛸 準備好跟我們一起在 ENDLESS 創造奇蹟了嗎？`,
    (userId) => `🎶 噔噔噔噔～自帶專屬 BGM 的 <@${userId}> 華麗登場！🎤 大家快把螢光棒揮起來，歡迎我們 ENDLESS 的最新力作！`,
    (userId) => `🍰 新鮮出爐的熱騰騰新成員來囉！歡迎 <@${userId}> 加入 ENDLESS！🤤 頻道裡隨便逛，遇到打不過的王記得大喊救命，我們隨傳隨到！`,
    (userId) => `🎮 玩家 ［ <@${userId}> ］ 已成功連接至 ENDLESS 伺服器！✅ 裝備檢查完畢，藥水確認帶齊，馬上開始我們無盡的冒險旅程吧！`,
    (userId) => `🏆 號外號外！據說實力超強、顏值超高的 <@${userId}> 選擇加入了 ENDLESS！😎 各位小夥伴快出來排隊歡迎，以後打寶掉寶率就靠你加持啦！✨`,
    (userId) => `⚔️ 裝備強化成功！歡迎 <@${userId}> 帶著閃亮的武器加入 ENDLESS！今晚要一起去哪裡刷寶呢？`,
    (userId) => `📜 契約已簽訂！<@${userId}> 正式成為 ENDLESS 的一員！把公會技能點滿，我們準備出發囉！`,
    (userId) => `🍄 噗通！<@${userId}> 像是掉進水溝的綠水靈一樣（？）突然出現啦！歡迎來到 ENDLESS！`,
    (userId) => `📣 廣播：請大家注意，超級新星 <@${userId}> 已經登入 ENDLESS 伺服器，請各位準備好熱烈歡迎！`,
    (userId) => `🛡️ 盾牌架好，法杖舉起！<@${userId}> 加入了我們的遠征隊！有了你，未來的王團絕對沒問題！`,
    (userId) => `🎁 每日登入獎勵發放！恭喜 ENDLESS 獲得了名為 <@${userId}> 的超棒新成員！`,
    (userId) => `🌟 叮！<@${userId}> 已經成功轉職為「ENDLESS 公會成員」！快來公會大廳領取你的專屬歡迎！`,
    (userId) => `🚀 綁好安全帶，<@${userId}> 已經搭乘 ENDLESS 號太空船登入啦！未來的冒險請多多指教！`,
    (userId) => `🍖 營火已經升起！歡迎 <@${userId}> 來到 ENDLESS 的營地，坐下來分享你的冒險傳說吧！`,
    (userId) => `💎 稀有掉落物出現！原來是閃閃發光的 <@${userId}> 加入了公會！大家快來沾沾運氣！`,
    (userId) => `🗺️ 展開冒險地圖，<@${userId}> 的座標已經鎖定在 ENDLESS 啦！準備好一起探索未知領域了嗎？`,
    (userId) => `🎊 狂爆灑花！讓我們用最熱烈的掌聲歡迎 <@${userId}> 來到 ENDLESS 大家庭！`,
    (userId) => `🔮 水晶球顯示，<@${userId}> 將會為 ENDLESS 帶來無限的歡樂與戰力！歡迎你的加入！`,
    (userId) => `🏰 公會大門緩緩開啟，勇敢的 <@${userId}> 踏入了 ENDLESS 的殿堂！我們在這裡等你很久啦！`,
    (userId) => `🎶 吹響勝利的號角！歡迎 <@${userId}> 加入我們的行列，一起在 ENDLESS 創造不朽的傳奇！`,
    (userId) => `🍕 披薩已經訂好，可樂也倒好了！就等 <@${userId}> 加入 ENDLESS 的派對啦！`,
    (userId) => `⚡ 閃電劃破天際！<@${userId}> 帶著雷霆萬鈞的氣勢加入了 ENDLESS！`,
    (userId) => `💌 一封神秘的邀請函將 <@${userId}> 帶到了 ENDLESS！很高興能在這裡遇見你！`,
    (userId) => `👑 為我們的陣容再添一員猛將！歡迎 <@${userId}> 加入 ENDLESS，未來的榮耀我們一起爭取！`,
    (userId) => `🌈 雨過天晴，一道彩虹帶來了我們的新夥伴 <@${userId}>！歡迎來到 ENDLESS！`
];
const welcomeFriendMessages = [
    (userId) => `🎈 叮咚！ENDLESS 迎來了一位超酷的親友團新夥伴！<@${userId}> 已經順利解鎖頻道囉～大家快把最熱情的貼圖刷起來！🔥🔥`,
    (userId) => `🌟 閃亮登場！歡迎親友團的新朋友 <@${userId}> 來到 ENDLESS！隨便坐隨便聊，當自己家就好啦！🛋️`,
    (userId) => `🎶 聽，是新朋友的腳步聲！歡迎 <@${userId}> 加入 ENDLESS 的親友團！快來跟大家分享你的冒險故事吧！⛺`,
    (userId) => `🍰 新鮮出爐的親友團夥伴來囉！<@${userId}> 歡迎來到 ENDLESS！肚子餓了有餅乾，無聊了有人陪聊喔！🍪`,
    (userId) => `🍻 乾杯！讓我們熱烈歡迎親友團新成員 <@${userId}>！今晚酒館的飲料我請客（開玩笑的），總之玩得開心！🥂`,
    (userId) => `✨ 哇喔！有超讚的新朋友 <@${userId}> 降落 ENDLESS 親友團啦！大家快出來列隊歡迎，展現我們的熱情吧！🙌`,
    (userId) => `🎉 撒花撒花！熱烈歡迎 <@${userId}> 成為我們的專屬親友！未來的日子裡，請多多指教囉！🥰`,
    (userId) => `🎮 玩家 ［ <@${userId}> ］ 已成功加入 ENDLESS 親友團陣線！準備好跟我們一起在頻道裡尬聊了嗎？😎`,
    (userId) => `🌈 捕捉到野生好朋友！歡迎 <@${userId}> 來到 ENDLESS！在這裡沒有壓力，只有滿滿的歡樂與溫暖喔！💖`,
    (userId) => `🚀 咻～的一聲，<@${userId}> 飛進了我們的親友團！很高興認識你，快去頻道跟大家打個招呼吧！👋`,
    (userId) => `🛋️ 準備好最舒服的沙發！歡迎親友團新朋友 <@${userId}> 來 ENDLESS 串門子！`,
    (userId) => `☕ 泡好熱咖啡了，<@${userId}> 歡迎來到 ENDLESS 親友團！來找個空位坐下聊聊天吧！`,
    (userId) => `🎈 驚喜包拆開！原來是超可愛的 <@${userId}> 來到 ENDLESS 親友團啦！大家快來打招呼！`,
    (userId) => `🎤 麥克風測試！請 <@${userId}> 發表加入 ENDLESS 親友團的感言！(遞麥克風)`,
    (userId) => `🌸 春風拂來，把 <@${userId}> 吹進了我們的親友團！很高興認識你呀！`,
    (userId) => `🍿 爆米花準備好了！<@${userId}> 歡迎來到 ENDLESS，我們已經準備好聽你的八卦...阿不是，是故事了！`,
    (userId) => `🌟 捕捉到一隻迷路的 <@${userId}>！歡迎來到 ENDLESS 親友團，這裡以後就是你的第二個家啦！`,
    (userId) => `🥂 舉起手中的果汁！讓我們為 <@${userId}> 加入 ENDLESS 親友團乾杯！`,
    (userId) => `🐾 順著神秘的腳印，<@${userId}> 找到了 ENDLESS 親友團的秘密基地！歡迎光臨！`,
    (userId) => `🎨 我們的畫布上又多了一抹燦爛的色彩！歡迎 <@${userId}> 點綴 ENDLESS 親友團！`,
    (userId) => `🎧 點播一首歡迎曲！<@${userId}> 已經順利連線至 ENDLESS 親友團語音頻道（的文字版）！`,
    (userId) => `🍩 帶了甜甜圈來拜訪嗎？歡迎 <@${userId}> 踏入 ENDLESS 親友團，這裡充滿了歡樂和卡路里！`,
    (userId) => `🌙 夜幕低垂，最適合和新朋友聊天了！歡迎 <@${userId}> 加入 ENDLESS 親友團的深夜食堂！`,
    (userId) => `🧸 抱著熊熊布偶，<@${userId}> 走進了我們的親友團！太可愛了，大家快來歡迎！`,
    (userId) => `💌 收到一封來自遠方的信！原來是 <@${userId}> 決定加入 ENDLESS 親友團啦！`,
    (userId) => `🎪 馬戲團開演啦！不對，是 ENDLESS 親友團迎來了充滿活力的 <@${userId}>！`,
    (userId) => `🚲 騎著腳踏車路過？既然來了就別走啦！歡迎 <@${userId}> 加入 ENDLESS 親友團！`,
    (userId) => `📸 茄子！拍一張大合照，記錄 <@${userId}> 加入 ENDLESS 親友團的歷史性一刻！`,
    (userId) => `🌻 像向日葵一樣溫暖的 <@${userId}> 來到 ENDLESS 親友團啦！把快樂傳染給大家吧！`,
    (userId) => `🛸 外星人綁架失敗，所以 <@${userId}> 掉進了 ENDLESS 親友團！既來之則安之，一起玩吧！`
];
const boosterRedCarpetMessages = [
    (user) => `✨ 閃開閃開！尊貴的 Booster ${user} 降臨啦！全體起立！`,
    (user) => `👑 王者歸來！${user} 踏著七彩祥雲出現了，大家快膜拜！`,
    (user) => `🌟 哇！刺眼的閃耀光芒！原來是 ${user} 大佬來巡視了！`,
    (user) => `🎆 砰砰砰！為 ${user} 放煙火啦！今天也要繼續閃耀喔！`,
    (user) => `💖 滴答！${user} 帶著滿滿的愛心來了，快給老闆奉茶！`,
    (user) => `🚀 轟隆隆！${user} 搭著專屬火箭登陸頻道，準備起飛！`,
    (user) => `💎 亮瞎我的眼！原來是行走的鑽石 ${user} 登場啦！`,
    (user) => `🌹 鋪好紅毯、灑滿花瓣！熱烈歡迎 ${user} 華麗出場！`,
    (user) => `📣 號外！顏值擔當 ${user} 上線啦，大家快來吸好運！`,
    (user) => `🍷 老闆好！${user} 的專屬包廂已經準備好，請上座！`,
    (user) => `🪄 魔法陣啟動！恭迎大魔法師 ${user} 閃亮現身！`,
    (user) => `🛸 嗶嗶！捕捉到稀有神獸 ${user}！大家快拿大師球！`,
    (user) => `🌈 哇塞！${user} 一開口，整個頻道都充滿了彩虹！`,
    (user) => `🎤 聚光燈準備！把麥克風交給我們最耀眼的 ${user}！`,
    (user) => `🏆 冠軍進場！大家讓一讓，${user} 帶著氣場走來啦！`,
    (user) => `💸 財神爺下凡啦！${user} 駕到，還不快沾沾喜氣！`,
    (user) => `🛡️ 最強守護者 ${user} 已連線，今天的公會依然和平！`,
    (user) => `🍀 幸運草精靈 ${user} 出現！今天跟著大佬一定會掉寶！`,
    (user) => `🌊 氣場太強啦！${user} 帶著海嘯般的魅力席捲而來！`,
    (user) => `🎀 拆開蝴蝶結，裡面是我們最喜歡的 ${user} 耶！`,
    (user) => `🎬 Action！${user} 巨星抵達片場，各位小夥伴準備嗨起來！`,
    (user) => `⚡ 劈里啪啦！${user} 帶著閃電般的帥氣震撼登場！`,
    (user) => `🎠 旋轉木馬音樂起！${user} 帶著夢幻泡泡華麗現身囉！`,
    (user) => `🏰 城門大開！恭迎 ${user} 回到 ENDLESS 專屬城堡！`,
    (user) => `🍕 登登！比起司拉絲還要迷人的 ${user} 報到啦！`,
    (user) => `🎵 自帶專屬 BGM 的 ${user} 踏入頻道，全場尖叫聲！`,
    (user) => `☀️ 太陽出來了！不對，是 ${user} 的光芒照亮了這裡！`,
    (user) => `🌌 穿越星際而來，${user} 帶著宇宙級的排場降臨啦！`,
    (user) => `🐾 捕捉到超萌野生 ${user}！快點摸摸頭沾好運！`,
    (user) => `🎊 撒花！${user} 榮耀登入，今天的頻道絕對精彩！`
];
const boostBannerImages = [
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540947667784564867/file_000000001e3482068ff550c4da330d58.png',
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540947668430495754/file_000000002f708206a62ff6600b3bbc41.png',
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540956754345459744/file_00000000553882069dd3021f5990a4b4.png',
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540956754752577647/file_00000000e81482099c4a51450c9ae8f5.png',
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540956755255754832/file_000000009fa0822fa44fa1ac84280623.png'
];

// 邀請碼快取
const guildInvites = new Map();

// ==========================================
// 2️⃣ Web 伺服器
// ==========================================
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is currently alive and running!'));
app.listen(port, () => console.log(`🌐 Web Server Listening on port ${port}`));

// ==========================================
// 3️⃣ 函數區 (迴響與公會核心邏輯)
// ==========================================

// 【公會邏輯函數】
async function updateNickname(member, gameName, roleType, classesArray) {
    const icon = roleType === '公會成員' ? '🌟' : '🍁';
    const classesStr = classesArray.join('｜');
    let newNick = `${gameName} ${icon} ${classesStr}`; 
    if (newNick.length > 32) newNick = newNick.substring(0, 32); 
    try { await member.setNickname(newNick); } catch (e) { console.log(`⚠️ 無法修改 ${member.user.tag} 的暱稱`); }
    return newNick;
}

async function generateMemberLeaderboard() {
    try {
        const snapshot = await db.collection('members').where('role', '==', '公會成員').get();
        if (snapshot.empty) return '目前資料庫中沒有公會成員紀錄。';
        let members = [];
        snapshot.forEach(doc => members.push(doc.data()));
        members.sort((a, b) => (parseInt(b.gameLevel) || 0) - (parseInt(a.gameLevel) || 0));
        let description = `目前公會總人數：**${members.length}** 人\n\n**【 成員等級排行榜 】**\n`;
        members.forEach((m, index) => { 
            const classes = m.gameClasses ? m.gameClasses.join('｜') : m.gameClass;
            description += `${index + 1}.**(LV.${m.gameLevel})-** ${m.gameName} 🌟 ${classes}\n`; 
        });
        return new EmbedBuilder().setTitle('🛡️ ENDLESS 公會成員名冊').setDescription(description.substring(0, 4000)).setColor('#FFD700');
    } catch (error) { return null; }
}

async function generateFriendLeaderboard() {
    try {
        const snapshot = await db.collection('members').where('role', '==', '親友團').get();
        if (snapshot.empty) return '目前資料庫中沒有親友團紀錄。';
        let members = [];
        snapshot.forEach(doc => members.push(doc.data()));
        members.sort((a, b) => (a.joinDate?.toDate() || 0) - (b.joinDate?.toDate() || 0));
        let description = `目前親友團總人數：**${members.length}** 人\n\n**【 🌙 親友團名單 】**\n`;
        members.forEach((m, index) => { 
            const classes = m.gameClasses ? m.gameClasses.join('｜') : m.gameClass;
            description += `${index + 1}.- ${m.gameName} 🍁 ${classes}\n`; 
        });
        return new EmbedBuilder().setTitle('🌙 ENDLESS 親友團名冊').setDescription(description.substring(0, 4000)).setColor('#FF99CC');
    } catch (error) { return null; }
}

async function checkAndThankBooster(member, boostChannel, mode = 'normal', interaction = null) {
    if (mode === 'normal' && !member.premiumSince) return false;
    const docRef = db.collection('boostedUsers').doc(member.id);
    const doc = await docRef.get();
    if (mode === 'normal' && doc.exists) return false;
    try {
        const boostCount = member.guild.premiumSubscriptionCount || 0;
        const randomImage = boostBannerImages[Math.floor(Math.random() * boostBannerImages.length)];
        const boostVariations = [
            { title: '🌸 星光閃耀！感謝加成 🌸', text: '**太感動啦！** 你的支持化作了滿天星光，點亮了整個 ENDLESS！✨' },
            { title: '💖 愛心爆擊！伺服器升級 💖', text: '**滴答滴答！** 是誰送來了滿滿的愛？超級感謝你的加成火力支援！😍' },
            { title: '🚀 動力引擎啟動！ 🚀', text: '**轟隆隆！** 因為你的專屬加成，公會正全速向更棒的未來起飛啦！🛸' },
            { title: '👑 絕對領域展開 👑', text: '**超強氣場！** 專屬的加成領域已經啟動，感謝您為公會帶來無與倫比的榮耀與光芒！✨' }
        ];
        const randomChoice = boostVariations[Math.floor(Math.random() * boostVariations.length)];
        const thankYouEmbed = new EmbedBuilder().setColor('#FF99CC').setTitle(randomChoice.title) 
            .setDescription(`💖 **Thank you for Ur boost** 💖\n\n${randomChoice.text}\n\n• 目前伺服器累計已有\n ✨ **${boostCount} 個加成** ✨ \n\n• 已解鎖屬於您的專屬出場 BGM！\n 貼心小助手已經私訊音效設定教學給您，趕緊去看看吧 💌`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true })).setImage(randomImage).setFooter({ text: `ENDLESS 感謝您的支持與陪伴，祝您一切順利 🤍`, iconURL: member.guild.iconURL() }).setTimestamp();

        let pingContent = mode === 'test' ? `🎊 **[私密測試預覽] <@${member.id}> 觸發了伺服器感謝加成 💕** 🎊` : (mode === 'replay' ? `🎊 **[經典回顧] 再次感謝 <@${member.id}> 對伺服器的偉大加成 💕** 🎊` : `🎊 **<@${member.id}> 觸發了伺服器感謝加成 💕** 🎊`);
        
        let sentMessage = null;
        if (mode === 'test' && interaction) {
            sentMessage = await interaction.editReply({ content: pingContent, embeds: [thankYouEmbed], fetchReply: true });
        } else if (boostChannel) {
            sentMessage = await boostChannel.send({ content: pingContent, embeds: [thankYouEmbed] });
            if (sentMessage) {
                try { await sentMessage.react('🎉'); await sentMessage.react('💖'); } catch (e) {}
            }
        }
        if (mode === 'normal') {
            const tutorialEmbed = new EmbedBuilder().setColor('#FFD700').setTitle('🎶 【 Booster 專屬特權：語音頻道出場 BGM 設定指南 】 🎶')
                .setDescription(`🎀 **叮咚！親愛的乾爹/乾媽您好！**\n感謝您用 Server Boost 支持 ENDLESS！\n\n您可以去 Discord 左下角的「使用者設定」->「語音和視訊」->「音效板」設定專屬進場 BGM 喔！`)
                .setFooter({ text: 'ENDLESS 專屬貼心小秘書', iconURL: member.guild.iconURL() });
            await member.send({ embeds: [tutorialEmbed] }).catch(() => {});
            await docRef.set({ thankedAt: admin.firestore.FieldValue.serverTimestamp(), tag: member.user.tag });
        }
        return true;
    } catch (err) { return false; }
}

// 【迴響系統邏輯函數】
const publicBoardIntro = "🎉 **歡迎來到迴響預約中心！**\n為了出團順暢，請提早預約您的專屬迴響時段。\n👇 請點擊下方 **【📝 預約迴響時間】** 快速排單，系統將會為您登記並通知審核！";
const reserveBtnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_reserve').setLabel('📝 預約迴響時間').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_refresh_board').setLabel('🔄 手動刷新看板').setStyle(ButtonStyle.Secondary)
);

function getTaiwanTime() {
    const now = new Date();
    const twDate = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    return {
        yyyy: twDate.getUTCFullYear(), mm: String(twDate.getUTCMonth() + 1).padStart(2, '0'),
        dd: String(twDate.getUTCDate()).padStart(2, '0'), hh: String(twDate.getUTCHours()).padStart(2, '0'),
        min: String(twDate.getUTCMinutes()).padStart(2, '0')
    };
}
function formatDateTimeStr(dateStr, timeStr) {
    let parts = dateStr.replace(/\//g, '-').split('-');
    if (parts.length === 3) { parts[1] = parts[1].padStart(2, '0'); parts[2] = parts[2].padStart(2, '0'); dateStr = parts.join('-'); }
    if (timeStr.length === 4 && timeStr.indexOf(':') === 1) timeStr = '0' + timeStr;
    const dt = new Date(`${dateStr}T${timeStr}:00+08:00`);
    return { formattedDate: dateStr, formattedTime: timeStr, parsedDate: dt };
}
function isWeekend(dateStr) { const [y, m, d] = dateStr.split('-'); const day = new Date(Date.UTC(y, m - 1, d, 4, 0, 0)).getUTCDay(); return day === 0 || day === 6; }
function isTimeFrozen(timeStr, frozenSlots, dateStr) {
    if (!frozenSlots || frozenSlots.length === 0) return false;
    const [h, m] = timeStr.split(':').map(Number); const tMins = h * 60 + m; const isWknd = isWeekend(dateStr);
    for (const slot of frozenSlots) {
        const sType = slot.type || 'all';
        if (sType === 'weekday' && isWknd) continue; if (sType === 'weekend' && !isWknd) continue;
        const [sh, sm] = slot.start.split(':').map(Number); const [eh, em] = slot.end.split(':').map(Number);
        const startMins = sh * 60 + sm; const endMins = eh * 60 + em;
        if (startMins <= endMins) { if (tMins >= startMins && tMins <= endMins) return true; } 
        else { if (tMins >= startMins || tMins <= endMins) return true; }
    }
    return false;
}
function getFrozenTextForDateStr(frozenSlots, dateStr) {
    if (!frozenSlots || frozenSlots.length === 0) return "無暫停時段";
    const isWknd = isWeekend(dateStr);
    let applicable = frozenSlots.filter(s => {
        const sType = s.type || 'all';
        if (sType === 'weekday' && isWknd) return false; if (sType === 'weekend' && !isWknd) return false;
        return true;
    });
    if (applicable.length === 0) return "無暫停時段";
    return applicable.map(s => {
        const [sh, sm] = s.start.split(':').map(Number); const [eh, em] = s.end.split(':').map(Number);
        const startMins = sh * 60 + sm; const endMins = eh * 60 + em;
        return (startMins > endMins) ? `於 \`${s.start}\` 至明日 \`${s.end}\` 暫停系統預約` : `於 \`${s.start}\` 至 \`${s.end}\` 暫停系統預約`;
    }).join('、');
}
async function addViolation(discordId) {
    const userRef = db.collection('users').doc(discordId);
    const doc = await userRef.get();
    addDbStat('read');
    let points = 1; let bannedUntil = null;
    if (doc.exists) points = (doc.data().violationPoints || 0) + 1;
    if (points >= 3) { bannedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000; points = 0; }
    await userRef.set({ violationPoints: points, bannedUntil: bannedUntil }, { merge: true });
    addDbStat('write');
    return { points, bannedUntil };
}
async function checkIsAgent(userId, member) {
    if (member && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const doc = await db.collection('users').doc(userId).get();
    addDbStat('read');
    return (doc.exists && doc.data().isAgent === true);
}
async function broadcastToManagementAreas(payload) {
    const doc = appSettings['managementArea'];
    if (!doc) return [];
    const channels = doc.channels || []; let sentMsgs = [];
    for (const chId of channels) {
        const dChannel = await client.channels.fetch(chId).catch(() => null);
        if (dChannel) {
            const msg = await dChannel.send(payload).catch(() => null);
            if (msg) sentMsgs.push({ channelId: chId, messageId: msg.id });
        }
    }
    return sentMsgs;
}
async function syncManagementMessages(msgRefs, newEmbed, newComponents = []) {
    if (!msgRefs || !Array.isArray(msgRefs)) return;
    for (const m of msgRefs) {
        try {
            const ch = await client.channels.fetch(m.channelId).catch(() => null);
            if (ch) { const msg = await ch.messages.fetch(m.messageId).catch(() => null); if (msg) await msg.edit({ embeds: [newEmbed], components: newComponents }); }
        } catch (e) {}
    }
}
async function bumpManagementMessages(msgRefs, newEmbed, newComponents = []) {
    if (!msgRefs || !Array.isArray(msgRefs)) return [];
    let newRefs = [];
    for (const m of msgRefs) {
        try {
            const ch = await client.channels.fetch(m.channelId).catch(() => null);
            if (ch) {
                const oldMsg = await ch.messages.fetch(m.messageId).catch(() => null);
                if (oldMsg) await oldMsg.delete().catch(() => null); 
                const newMsg = await ch.send({ embeds: [newEmbed], components: newComponents }); 
                newRefs.push({ channelId: ch.id, messageId: newMsg.id });
            }
        } catch (e) {}
    }
    return newRefs;
}
async function editUserDM(discordId, messageId, payload) {
    if (!messageId) return;
    try { const user = await client.users.fetch(discordId); const dmChannel = await user.createDM(); const msg = await dmChannel.messages.fetch(messageId); if (msg) await msg.edit(payload); } catch (e) {}
}
function buildTicketPayload(docId, data) {
    let embed = new EmbedBuilder(); let components = []; let row = new ActionRowBuilder();
    const playerNameDisplay = data.discordName ? ` (${data.discordName})` : '';
    const baseDesc = `**單號**：\`${docId}\`\n**玩家**：<@${data.discordId}>${playerNameDisplay} (遊戲ID: ${data.gameId})\n**地點**：${data.location}\n**頻道**：${data.channel || '-'}\n**預約時間**：\`${data.date} ${data.time}\`\n**備註**：${data.notes || '無'}\n\n**📋 訂單時間線**：\n`;
    let timeline = '';

    if (data.status === 'pending') {
        embed.setColor(0xFFA500).setTitle('🚨 新訂單待審核'); timeline += `> 🟡 審核等待中...\n`;
        row.addComponents(new ButtonBuilder().setCustomId(`approve_${docId}`).setLabel('✅ 審核通過').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_${docId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger));
    } else if (data.status === 'rejected') {
        embed.setColor(0xFF0000).setTitle('❌ 訂單已拒絕'); timeline += `> 🔴 已拒絕 (審核：<@${data.reviewer}>)\n`; if (data.rejectReason) timeline += `> 📝 原因：${data.rejectReason}\n`;
    } else if (data.status === 'expired') {
        embed.setColor(0x808080).setTitle('⏳ 申請已過期失效'); timeline += `> ⚪ 未審核，開打時間已過自動失效\n`;
    } else if (data.status === 'canceled') {
        embed.setColor(0x808080).setTitle('🚫 玩家已自行取消'); timeline += `> ⚪ 玩家已取消\n`;
    } else {
        timeline += `> ✅ 審核通過 (審核：<@${data.reviewer || '管理員'}>)\n`;
        if (data.status === 'approved') {
            if (!data.reminded) {
                embed.setColor(0x00FF00).setTitle('🟢 訂單已排程');
                if (!data.takenBy) { timeline += `> 🟡 審核通過，開放專員提前接單！\n> ⏳ 等待鬧鐘發送...\n`; row.addComponents(new ButtonBuilder().setCustomId(`takeOrder_${docId}`).setLabel('✋ 我來接單').setStyle(ButtonStyle.Primary)); } 
                else { timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n> ⏳ 等待鬧鐘發送...\n`; row.addComponents(new ButtonBuilder().setCustomId(`release_${docId}`).setLabel('🔄 釋出轉單').setStyle(ButtonStyle.Secondary)); }
            } else if (data.reminded && !data.postChecked) {
                if (!data.takenBy) { embed.setColor(0xFFA500).setTitle('🚨 準備出團 (等待接單)'); timeline += `> 🟡 鬧鐘已響，等待專員接單...\n`; row.addComponents(new ButtonBuilder().setCustomId(`takeOrder_${docId}`).setLabel('✋ 我來接單').setStyle(ButtonStyle.Primary)); } 
                else { embed.setColor(0x00FF00).setTitle('🟢 專員已接單'); timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n> ⏳ 等待出團與結案...\n`; row.addComponents(new ButtonBuilder().setCustomId(`release_${docId}`).setLabel('🔄 釋出轉單').setStyle(ButtonStyle.Secondary)); }
            } else if (data.postChecked) {
                embed.setColor(0x8A2BE2).setTitle('🟣 等待結案回報');
                if (data.takenBy) {
                    timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n> 🟡 等待專員回報結案...\n`;
                    if (data.dmFailed) { timeline += `> ⚠️ 無法私訊專員，請在此直接結案！\n`; } else { timeline += `> 💡 已發送結案私訊給專員。若專員無回應，管理員可在此代為結案。\n`; }
                } else {
                    timeline += `> 🔴 警告：此單無人接手！\n> 🟡 等待任何專員幫忙補結案...\n`;
                }
                row.addComponents(new ButtonBuilder().setCustomId(`complete_${docId}`).setLabel('⭕ 順利完成').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`free_${docId}`).setLabel('🎁 免單').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`fail_${docId}`).setLabel('❌ 未完成/取消').setStyle(ButtonStyle.Danger));
            }
        } else if (data.status === 'completed') { embed.setColor(0x00FF00).setTitle('⭕ 訂單已結案 (順利完成)'); if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`; timeline += `> ⭕ 順利完成 (確認：<@${data.closer || data.takenBy}>)\n`;
        } else if (data.status === 'free') { embed.setColor(0xFFD700).setTitle('🎁 訂單已結案 (免單)'); if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`; timeline += `> 🎁 免單 (確認：<@${data.closer || data.takenBy}>)\n`;
        } else if (data.status === 'failed') { embed.setColor(0xFF0000).setTitle('❌ 訂單已結案 (未完成/取消)'); if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`; timeline += `> ❌ 未完成/取消 (確認：<@${data.closer || data.takenBy || '系統'}>)\n`; }
    }
    embed.setDescription(baseDesc + timeline);
    if (row.components.length > 0) components.push(row);
    return { embeds: [embed], components };
}

function generateScheduleEmbed(reservations, isAdmin = false, page = 1, isCommand = false) {
    const now = Date.now(); const tw = getTaiwanTime(); const todayStr = `${tw.yyyy}-${tw.mm}-${tw.dd}`; const currentMonthPrefix = `${tw.yyyy}-${tw.mm}`;
    const stats = {};
    reservations.forEach(r => {
        if (r.status !== 'approved' && r.status !== 'completed' && r.status !== 'free') return;
        if (!stats[r.discordId]) stats[r.discordId] = { total: 0, month: 0 };
        stats[r.discordId].total += 1;
        if (r.date.startsWith(currentMonthPrefix)) stats[r.discordId].month += 1;
    });
    let futureRes = reservations.filter(res => res.status === 'approved' && res.timestamp >= now).sort((a, b) => a.timestamp - b.timestamp);
    if (!isAdmin) futureRes = futureRes.filter(res => res.date === todayStr);

    const ITEMS_PER_PAGE = isCommand ? 8 : 30; 
    const totalItems = futureRes.length; const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE)); const p = Math.max(1, Math.min(page, totalPages));
    let scheduleText = '';

    if (totalItems === 0) { scheduleText += isAdmin ? '目前沒有任何已通過的未來預約喔！\n\n' : '本日目前沒有已通過的預約喔！\n\n';
    } else {
        const startIdx = (p - 1) * ITEMS_PER_PAGE; const pageItems = futureRes.slice(startIdx, startIdx + ITEMS_PER_PAGE); const grouped = {};
        pageItems.forEach(res => { if (!grouped[res.date]) grouped[res.date] = []; grouped[res.date].push(res); });
        for (const [date, items] of Object.entries(grouped)) {
            scheduleText += `**📅 ${date}**\n\n`;
            items.forEach((res) => {
                const noteText = res.notes && res.notes !== '無' ? ` | 備註：${res.notes}` : '';
                let channelDisplay = ''; let playerInfo = '';
                const playerNameDisplay = res.discordName ? ` (${res.discordName})` : '';
                if (isAdmin) {
                    const userStats = stats[res.discordId] || { month: 0, total: 0 };
                    channelDisplay = ` | 頻道：${res.channel || '當日決定'}`;
                    playerInfo = `ID：${res.gameId} | <@${res.discordId}>${playerNameDisplay} | 本月：${userStats.month}次 | 總：${userStats.total}次`;
                } else { channelDisplay = ''; playerInfo = `👤 🔒 匿名玩家`; }
                scheduleText += `🕒 \`${res.time}\` ── **【${res.location}】**\n └─ ${playerInfo}${channelDisplay}${noteText}\n\n`;
            });
        }
        if (!isCommand && totalItems > ITEMS_PER_PAGE) { scheduleText += `\n⚠️ **由於篇幅限制，看板僅顯示近期 ${ITEMS_PER_PAGE} 筆預約。**\n*(管理員可使用 \`/查詢預約\` 指令進行分頁檢視)*\n\n`; }
    }
    if (!isCommand) {
        const opMode = appSettings['operationMode'] || {}; const fSlots = opMode.frozenSlots || [];
        if (fSlots.length > 0 && !isAdmin) {
            const todayFrozenText = getFrozenTextForDateStr(fSlots, todayStr);
            if (todayFrozenText !== "無暫停時段") scheduleText += `\n⚠️ **【今日系統預約限制】**\n${todayFrozenText}\n\n`;
        }
        scheduleText += `🔄 **最後刷新時間**：\`${tw.yyyy}-${tw.mm}-${tw.dd} ${tw.hh}:${tw.min}\``;
    }
    const embed = new EmbedBuilder().setColor(isAdmin ? 0xFF0000 : 0x0099FF).setDescription(scheduleText);
    if (isAdmin) embed.setTitle(isCommand ? `👑【管理員】王團自動排班表 (第 ${p}/${totalPages} 頁)` : '👑【管理員】王團自動排班表');
    return { embed, totalPages, currentPage: p };
}

async function updateBoard() {
    try {
        const reservations = allReservations;
        const pubDoc = appSettings['publicBoards'] || {}; let pubList = pubDoc.list || []; let validPubList = []; let pubChanged = false;
        for (let b of pubList) {
            try {
                const ch = await client.channels.fetch(b.channelId).catch(() => null);
                if (ch) {
                    const msg = await ch.messages.fetch(b.messageId).catch(() => null);
                    if (msg) {
                        const { embed } = generateScheduleEmbed(reservations, false, 1, false);
                        await msg.edit({ content: publicBoardIntro, embeds: [embed], components: [reserveBtnRow] }); validPubList.push(b);
                    } else {
                        const { embed } = generateScheduleEmbed(reservations, false, 1, false);
                        const newMsg = await ch.send({ content: publicBoardIntro, embeds: [embed], components: [reserveBtnRow] });
                        validPubList.push({ channelId: ch.id, messageId: newMsg.id }); pubChanged = true;
                    }
                } else pubChanged = true;
            } catch (e) { pubChanged = true; }
        }
        if (pubChanged || pubList.length !== validPubList.length) { await db.collection('settings').doc('publicBoards').set({ list: validPubList }); addDbStat('write'); }

        const admDoc = appSettings['adminBoards'] || {}; let admList = admDoc.list || []; let validAdmList = []; let admChanged = false;
        for (let b of admList) {
            try {
                const ch = await client.channels.fetch(b.channelId).catch(() => null);
                if (ch) {
                    const msg = await ch.messages.fetch(b.messageId).catch(() => null);
                    if (msg) {
                        const { embed } = generateScheduleEmbed(reservations, true, 1, false);
                        await msg.edit({ content: null, embeds: [embed] }); validAdmList.push(b);
                    } else {
                        const { embed } = generateScheduleEmbed(reservations, true, 1, false);
                        const newMsg = await ch.send({ embeds: [embed] });
                        validAdmList.push({ channelId: ch.id, messageId: newMsg.id }); admChanged = true;
                    }
                } else admChanged = true;
            } catch (e) { admChanged = true; }
        }
        if (admChanged || admList.length !== validAdmList.length) { await db.collection('settings').doc('adminBoards').set({ list: validAdmList }); addDbStat('write'); }
    } catch (e) { console.log('看板更新失敗', e); }
}

async function processRejection(docId, reason, reviewerId, interaction) {
    const docRef = db.collection('reservations').doc(docId);
    let data = allReservations.find(r => r.id === docId);
    if (!data) return interaction.editReply({ content: '❌ 訂單已不存在', components: [] });
    if (data.status !== 'pending') return interaction.editReply({ content: '❌ 訂單已被處理過囉', components: [] });

    data.status = 'rejected'; data.reviewer = reviewerId; data.rejectReason = reason;
    await docRef.update({ status: 'rejected', reviewer: reviewerId, rejectReason: reason }); addDbStat('write');
    const payload = buildTicketPayload(docId, data);
    await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);

    const dmEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle('🚫 預約未通過')
        .setDescription(`管理員退回了您的申請。\n**地點**：${data.location}\n**時間**：${data.date} ${data.time}\n**原因**：${reason}`);
    await editUserDM(data.discordId, data.userDmMsgId, { embeds: [dmEmbed], components: [] });
    await interaction.editReply({ content: '✅ 訂單已拒絕，並已通知玩家。', components: [] });
}

function calculateOrderPrice(order) {
    const prices = appSettings['prices'] || {}; const vipRules = appSettings['vipRules'] || {};
    if (order.status === 'free') return 0; if (order.status !== 'completed') return 0;
    let price = prices[order.location] || 0; const rule = vipRules[order.location];
    if (rule && rule.buy > 0) {
        const userHistory = allReservations.filter(r => r.discordId === order.discordId && r.location === order.location && (r.status === 'approved' || r.status === 'completed' || r.status === 'free')).sort((a, b) => a.timestamp - b.timestamp);
        const orderIndex = userHistory.findIndex(r => r.id === order.id);
        if (orderIndex !== -1) { const cycle = rule.buy + rule.free; if ((orderIndex % cycle) >= rule.buy) price = 0; }
    }
    return price;
}

function buildAgentStatMessage(agentId) {
    const agentIds = [...new Set(allReservations.filter(r => r.takenBy && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')).map(r => r.takenBy))];
    const currentIndex = agentIds.indexOf(agentId); const tw = getTaiwanTime(); const currentMonthPrefix = `${tw.yyyy}-${tw.mm}`;
    let total = 0, month = 0, totalFree = 0, monthFree = 0, failed = 0, totalRevenue = 0, monthRevenue = 0;
    allReservations.forEach(r => {
        if (r.takenBy === agentId && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')) {
            const isCurrentMonth = r.date.startsWith(currentMonthPrefix);
            if (r.status === 'completed') { total++; if (isCurrentMonth) month++; const price = calculateOrderPrice(r); totalRevenue += price; if (isCurrentMonth) monthRevenue += price; } 
            else if (r.status === 'free') { totalFree++; if (isCurrentMonth) monthFree++; } 
            else if (r.status === 'failed') { failed++; }
        }
    });
    const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(`📊 迴響專員接單績效 (${currentIndex + 1} / ${agentIds.length})`)
        .setDescription(`**專員**：<@${agentId}>\n> 本月完成：\`${month}\` 次 (總計 \`${total}\`)\n> 本月免單招待：\`${monthFree}\` 次 (總計 \`${totalFree}\`)\n> 失敗/取消數：\`${failed}\` 次\n>\n> 💰 本月收益：\`${monthRevenue}\` 萬\n> 💰 總計收益：\`${totalRevenue}\` 萬`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`agent_nav_prev_${agentId}`).setLabel('◀ 上一位').setStyle(ButtonStyle.Secondary).setDisabled(currentIndex <= 0),
        new ButtonBuilder().setCustomId(`agent_details_${agentId}_1`).setLabel('📋 查看訂單明細').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`agent_nav_next_${agentId}`).setLabel('下一位 ▶').setStyle(ButtonStyle.Secondary).setDisabled(currentIndex >= agentIds.length - 1 || currentIndex === -1)
    );
    return { embed, components: [row] };
}

function buildAgentDetailsMessage(agentId, page) {
    const orders = allReservations.filter(r => r.takenBy === agentId && (r.status === 'completed' || r.status === 'free' || r.status === 'failed')).sort((a, b) => b.timestamp - a.timestamp);
    const ITEMS_PER_PAGE = 8; const totalPages = Math.max(1, Math.ceil(orders.length / ITEMS_PER_PAGE)); const p = Math.max(1, Math.min(page, totalPages));
    const startIdx = (p - 1) * ITEMS_PER_PAGE; const pageItems = orders.slice(startIdx, startIdx + ITEMS_PER_PAGE);
    let desc = `**專員**：<@${agentId}> 的歷史訂單紀錄\n\n`;
    if (pageItems.length === 0) { desc += "尚無訂單明細。"; } else {
        pageItems.forEach(o => {
            let statusIcon = '⭕'; let priceStr = '';
            if (o.status === 'completed') { const pAmt = calculateOrderPrice(o); priceStr = pAmt === 0 ? `(💎 VIP免單)` : `(${pAmt}萬)`; } 
            else if (o.status === 'free') { statusIcon = '🎁'; priceStr = `(招待)`; } 
            else if (o.status === 'failed') { statusIcon = '❌'; priceStr = `(失敗/取消)`; }
            const pName = o.discordName ? o.discordName.substring(0, 8) : '未知';
            desc += `\`${o.date} ${o.time}\` ${statusIcon} **${o.location}** ${priceStr}\n> 👤: ${pName} | 單號: ${o.id.substring(0,6)}\n`;
        });
    }
    const embed = new EmbedBuilder().setColor(0x0099FF).setTitle(`📋 訂單明細 (第 ${p} / ${totalPages} 頁)`).setDescription(desc);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`agent_details_${agentId}_${p - 1}`).setLabel('◀ 上一頁').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
        new ButtonBuilder().setCustomId(`agent_nav_curr_${agentId}`).setLabel('↩ 返回統計摘要').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`agent_details_${agentId}_${p + 1}`).setLabel('下一頁 ▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages)
    );
    return { embed, components: [row] };
}

// ==========================================
// 4️⃣ Discord Client 初始化 & 全局設定
// ==========================================
const client = new Client({
    intents: [ 
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildInvites 
    ],
    partials: [ Partials.User, Partials.GuildMember, Partials.Channel, Partials.Message ]
});

client.once('clientReady', async () => {
    console.log(`🤖 機器人登入成功：${client.user.tag}!`);
    const adminPerms = PermissionsBitField.Flags.Administrator.toString();

    // 啟動邀請快取 (公會)
    client.guilds.cache.forEach(async guild => {
        try {
            const invites = await guild.invites.fetch(); const codeUses = new Map();
            invites.forEach(inv => codeUses.set(inv.code, inv.uses));
            guildInvites.set(guild.id, codeUses);
            console.log(`✅ 已快取伺服器 [${guild.name}] 的邀請碼資料，邀請追蹤啟動。`);
        } catch (err) { }
    });

    // 註冊所有指令 (合併 Guild & Echo)
    const echoCommands = [
        { name: '預約', description: '開啟王團預約表單', options: [{ name: '地點', type: 3, description: '請選擇預約地點', required: true, choices: [ { name: '闇黑龍王', value: '闇黑龍王' }, { name: '艾畢奈亞', value: '艾畢奈亞' }, { name: '道館', value: '道館' }, { name: '其他', value: '其他' } ] }] },
        { name: '我的紀錄', description: '查詢個人的預約統計與排單狀態' },
        { name: '接單統計', description: '查詢各專員的接單績效與收益 (管理員/專員)' },
        { name: '查詢預約', description: '分頁檢視未來的完整預約清單 (管理員)' },
        { name: '刷新看板', description: '強制手動刷新所有預約看板 (管理員)' },
        { name: '註冊迴響專員', description: '申請註冊成為專屬迴響專員 (需管理員審核)' },
        { name: '指定迴響專員', description: '直接指定玩家成為迴響專員 (管理員)', options: [{ name: '玩家', type: 6, description: '選擇目標玩家', required: true }] },
        { name: '刪除迴響專員', description: '移除玩家的迴響專員身分 (管理員)', options: [{ name: '玩家', type: 6, description: '選擇要移除身分的玩家', required: true }] },
        { name: '清理訊息', description: '批次清理頻道內的訊息 (管理員)', options: [{ name: '數量', type: 4, description: '要刪除的訊息數量 (1-100)', required: true }] },
        { name: '設定公開看板', description: '將此頻道加入或移除「公開看板區」' },
        { name: '設定管理看板', description: '將此頻道加入或移除「真實名單看板區」' },
        { name: '迴響管理區', description: '將此頻道加入或移除「迴響管理區」' },
        { name: '價格', description: '設定價格', options: [ { name: '地點', type: 3, description: '地點', required: true, choices: [ { name: '闇黑龍王', value: '闇黑龍王' }, { name: '艾畢奈亞', value: '艾畢奈亞' }, { name: '道館', value: '道館' }, { name: '其他', value: '其他' } ] }, { name: '價格', type: 4, description: '萬', required: true } ] },
        { name: '迴響鬧鐘', description: '設定鬧鐘提前分鐘', options: [{ name: '分鐘', type: 4, description: '分鐘', required: true }] },
        { name: '優惠設定', description: '設定VIP規則', options: [ { name: '地點', type: 3, description: '地點', required: true, choices: [ { name: '闇黑龍王', value: '闇黑龍王' }, { name: '艾畢奈亞', value: '艾畢奈亞' }, { name: '道館', value: '道館' }, { name: '其他', value: '其他' } ] }, { name: '滿幾次', type: 4, description: '次數', required: true }, { name: '送幾次', type: 4, description: '次數', required: true } ] },
        { name: '系統狀態', description: '查詢機器人本日資料庫讀寫次數估算與連線狀態 (管理員)' },
        { name: '營運設定', description: '自動審核、更新與凍結時段設定 (管理員)', options: [
            { name: '自動審核', type: 1, description: '開啟或關閉自動審核', options: [{ name: '狀態', type: 3, description: '是否開啟自動審核', required: true, choices: [ { name: '開啟', value: 'true' }, { name: '關閉', value: 'false' } ] }] },
            { name: '自動更新看板', type: 1, description: '每分鐘自動刷新看板時間 (注意資源額度)', options: [{ name: '狀態', type: 3, description: '是否開啟自動更新', required: true, choices: [ { name: '開啟', value: 'true' }, { name: '關閉', value: 'false' } ] }] },
            { name: '新增凍結時段', type: 1, description: '新增無法預約的時間範圍 (24H制)', options: [
                { name: '類型', type: 3, description: '適用日', required: true, choices: [ { name: '平日 (週一至週五)', value: 'weekday' }, { name: '假日 (週六與週日)', value: 'weekend' }, { name: '不分平假日', value: 'all' } ] }, { name: '開始時間', type: 3, description: '例如 23:00', required: true }, { name: '結束時間', type: 3, description: '例如 08:00', required: true }
            ]},
            { name: '清空凍結時段', type: 1, description: '清除所有已設定的凍結時段' }, { name: '查看目前設定', type: 1, description: '查看自動審核狀態與凍結時段' }
        ]},
        { name: '玩家管理', description: '管理玩家的違規點數與封鎖狀態 (管理員)', options: [
            { name: '玩家', type: 6, description: '選擇目標玩家', required: true }, { name: '動作', type: 3, description: '執行的動作', required: true, choices: [ { name: '解除封鎖 (解Ban)', value: 'unban' }, { name: '清除違規點數 (歸零)', value: 'clear_points' }, { name: '增加違規點數 (+1)', value: 'add_point' }, { name: '扣除違規點數 (-1)', value: 'remove_point' } ]}
        ]},
        { name: '刪除訂單', description: '列出近期歷史訂單以供刪除 (管理員)', options: [ { name: '玩家', type: 6, description: '選擇玩家以縮小搜尋範圍 (選填)', required: false }, { name: '訂單id', type: 3, description: '直接輸入訂單 ID 進行單獨刪除 (選填)', required: false } ] }
    ];
    
    const guildCommands = [
        { name: '解鎖權限', description: '發布加入 ENDLESS 或是成為親友團的申請面板 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '發布小指南', description: '發布 ENDLESS 實用功能小指南面板 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '查詢目前公會成員', description: '查詢公會成員列表與總人數 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '查詢目前親友團', description: '查詢親友團成員列表與總人數 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '同步更名', description: '批次同步資料庫中所有成員的最新暱稱格式與符號 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '檢查補發感謝', description: '【幹部專屬】掃描伺服器所有加成者，自動為錯過的乾爹乾媽補發感謝卡！', default_member_permissions: adminPerms },
        { name: '測試感謝卡', description: '【幹部專屬】發送一張私密測試用的加成感謝卡 (僅自己可見)', default_member_permissions: adminPerms },
        { name: '重播感謝卡', description: '【幹部專屬】強制公開重播指定玩家的加成感謝卡', default_member_permissions: adminPerms, options: [{ name: '玩家', description: '請選擇您要重新感謝的加成者', type: ApplicationCommandOptionType.User, required: true }] },
        { name: '清除資料', description: '清除指定成員的資料庫紀錄與身分組 (僅限幹部)', default_member_permissions: adminPerms, options: [{ name: '目標', description: '請選擇要重置資料的成員', type: ApplicationCommandOptionType.User, required: true }] },
        { name: '清除訊息', description: '快速清除當前頻道指定數量的訊息 (僅限幹部)', default_member_permissions: adminPerms, options: [{ name: '數量', description: '請輸入要清除的訊息數量 (1 到 100)', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 100 }] },
        { name: '星光紅毯設定', description: '開啟或關閉專屬的進場浮誇歡迎詞 (僅限加成者)', options: [{ name: '狀態', type: 3, description: '選擇開啟或關閉', required: true, choices: [{name:'開啟', value:'on'}, {name:'關閉', value:'off'}] }] }
    ];

    try {
        await client.application.commands.set([...echoCommands, ...guildCommands]);
        console.log('✅ 所有指令 (公會 & 迴響) 全域註冊完成！');
    } catch (error) { console.error('❌ 指令註冊失敗：', error); }

    // 開機掃描 Booster
    try {
        const guild = client.guilds.cache.get(config.guildId);
        if (guild) {
            const boostChannel = await client.channels.fetch(config.channels.boostThanks).catch(() => null);
            if (boostChannel) {
                const members = await guild.members.fetch();
                for (const [id, member] of members) {
                    if (member.premiumSince) { await checkAndThankBooster(member, boostChannel, 'normal'); await new Promise(r => setTimeout(r, 300)); }
                }
            }
        }
    } catch (err) { }
});

// ==========================================
// ⏳ 5️⃣ 統一排程引擎 (取代原本雙重排程)
// ==========================================
let lastLeaderboardMonth = -1;

setInterval(async () => {
    const now = Date.now();
    
    // 🔔 [迴響系統] 訂單檢查與鬧鐘
    try {
        const prices = appSettings['prices'] || {}; const alarmLeadTime = appSettings['alarm']?.leadTime || 15;
        const vipRules = appSettings['vipRules'] || {}; const opMode = appSettings['operationMode'] || {};
        
        for (let data of allReservations) {
            const timeDiff = data.timestamp - now; let needsSync = false; let needsBump = false; const displayChannel = data.channel ? data.channel : '-'; 
            if (data.status === 'pending' && data.timestamp < now) {
                await db.collection('reservations').doc(data.id).update({ status: 'expired' }); addDbStat('write'); needsSync = true;
                await editUserDM(data.discordId, data.userDmMsgId, { embeds: [new EmbedBuilder().setColor(0x808080).setTitle('⏳ 預約已過期失效').setDescription(`您的預約因超過開打時間未審核，已自動失效。\n**地點**：${data.location}\n**時間**：${data.date} ${data.time}`)], components: [] });
            }
            if (data.status === 'approved' && !data.reminded && timeDiff <= alarmLeadTime * 60 * 1000 && timeDiff > 0) {
                await db.collection('reservations').doc(data.id).update({ reminded: true }); addDbStat('write'); needsBump = true; 
                let finalPriceStr = `${prices[data.location] || '未設定'}萬`; const rule = vipRules[data.location];
                if (rule && rule.buy > 0) {
                    const userHistory = allReservations.filter(r => r.discordId === data.discordId && r.location === data.location && (r.status === 'approved' || r.status === 'completed' || r.status === 'free')).sort((a, b) => a.timestamp - b.timestamp);
                    const orderIndex = userHistory.findIndex(r => r.id === data.id);
                    if (orderIndex !== -1) { const cycle = rule.buy + rule.free; if ((orderIndex % cycle) >= rule.buy) finalPriceStr = `0萬 (💎 VIP滿件優惠)`; }
                }
                const pre5MinTime = data.timestamp - 5 * 60 * 1000; const twPre5Obj = new Date(pre5MinTime + 8 * 60 * 60 * 1000);
                const pre5MinStr = String(twPre5Obj.getUTCHours()).padStart(2, '0') + ':' + String(twPre5Obj.getUTCMinutes()).padStart(2, '0');
                try { const user = await client.users.fetch(data.discordId); await user.send(`🔔 **王團預約提醒鬧鐘**\n您預約的【${data.location}】將在 ${alarmLeadTime} 分鐘後（\`${data.date} ${data.time}\`）於 \`${displayChannel}\` 頻道施放迴響！\n*(請備妥 ${finalPriceStr} 楓幣給專員)*`); } catch (e) {}
                if (data.takenBy) {
                    try { const adminUser = await client.users.fetch(data.takenBy); await adminUser.send(`🔔 **王團預約提醒鬧鐘**\n<@${data.discordId}> 與您預約的【${data.location}】須於 ${alarmLeadTime} 分鐘後（\`${data.date} ${data.time}\`）於 \`${displayChannel}\` 頻道施放迴響！\n請記得於（\`${data.date} ${pre5MinStr}\`）上線！`); } catch (e) {}
                } else {
                    await broadcastToManagementAreas({ content: `🚨 **【緊急派單通知】**\n<@${data.discordId}> 預約的【${data.location}】將在 ${alarmLeadTime} 分鐘後出團，目前**尚未有專員接單**！\n請盡速點擊卡片的「✋ 我來接單」！` });
                }
            }
            if (data.status === 'approved' && !data.buttonsRemoved && now >= data.timestamp) {
                await editUserDM(data.discordId, data.userDmMsgId, { components: [] }); await db.collection('reservations').doc(data.id).update({ buttonsRemoved: true }); addDbStat('write');
            }
            if (data.status === 'approved' && data.reminded && !data.postChecked && now - data.timestamp >= 10 * 60 * 1000) {
                let dmFailed = false;
                if (data.takenBy) {
                    try {
                        const adminUser = await client.users.fetch(data.takenBy);
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`complete_${data.id}`).setLabel('⭕ 順利完成').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`free_${data.id}`).setLabel('🎁 免單').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`fail_${data.id}`).setLabel('❌ 未完成/取消').setStyle(ButtonStyle.Danger));
                        await adminUser.send({ embeds: [new EmbedBuilder().setColor(0x8A2BE2).setTitle('⏱️ 訂單結案確認').setDescription(`**玩家**：<@${data.discordId}>\n**地點**：${data.location}\n**頻道**：${displayChannel}\n**預約時間**：\`${data.date} ${data.time}\`\n\n*請問順利完成了嗎？*`)], components: [row] });
                    } catch (e) { dmFailed = true; }
                }
                await db.collection('reservations').doc(data.id).update({ postChecked: true, dmFailed }); addDbStat('write'); needsBump = true; data.postChecked = true; data.dmFailed = dmFailed;
            }
            if (data.status === 'approved' && data.postChecked && now - data.timestamp >= 12 * 60 * 60 * 1000) {
                await db.collection('reservations').doc(data.id).update({ status: 'failed', closer: '系統自動結案' }); addDbStat('write'); needsSync = true; data.status = 'failed'; data.closer = '系統自動結案';
            }
            if (needsBump) {
                const payload = buildTicketPayload(data.id, data); const newRefs = await bumpManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components); await db.collection('reservations').doc(data.id).update({ ticketMsgs: newRefs }); addDbStat('write');
            } else if (needsSync) {
                const payload = buildTicketPayload(data.id, data); await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
            }
        }
        if (opMode.autoRefreshBoard === true) updateBoard();
    } catch (e) {}

    // 🏆 [公會系統] 每月排行榜發布
    try {
        const twTime = new Date(now + 8 * 3600000);
        const currentMonth = twTime.getUTCMonth();
        if (twTime.getUTCDate() === 1 && twTime.getUTCHours() === 0 && currentMonth !== lastLeaderboardMonth) {
            lastLeaderboardMonth = currentMonth;
            const guild = client.guilds.cache.get(config.guildId);
            if (guild) {
                const targetChannel = await client.channels.fetch(config.channels.leaderboardChannel).catch(() => null);
                if (targetChannel) {
                    const memberEmbed = await generateMemberLeaderboard(); const friendEmbed = await generateFriendLeaderboard();
                    if (memberEmbed && typeof memberEmbed !== 'string') await targetChannel.send({ embeds: [memberEmbed] });
                    if (friendEmbed && typeof friendEmbed !== 'string') await targetChannel.send({ embeds: [friendEmbed] });
                }
            }
        }
    } catch (e) {}
}, 60 * 1000);

// ==========================================
// 6️⃣ 公會專屬事件監聽 (邀請、迎新、加成)
// ==========================================
client.on('inviteCreate', invite => {
    const invites = guildInvites.get(invite.guild.id);
    if (invites) invites.set(invite.code, invite.uses);
});
client.on('inviteDelete', invite => {
    const invites = guildInvites.get(invite.guild.id);
    if (invites) invites.delete(invite.code);
});

client.on('guildMemberAdd', async member => {
    try {
        const cachedInvites = guildInvites.get(member.guild.id); if (!cachedInvites) return;
        const newInvites = await member.guild.invites.fetch().catch(() => null); if (!newInvites) return;
        const usedInvite = newInvites.find(inv => inv.uses > (cachedInvites.get(inv.code) || 0));
        let inviterData = (usedInvite && usedInvite.inviter) ? `<@${usedInvite.inviter.id}>` : '無法追蹤 / 未知';
        newInvites.forEach(inv => cachedInvites.set(inv.code, inv.uses));
        guildInvites.set(member.guild.id, cachedInvites);
        await db.collection('inviteTracking').doc(member.id).set({ inviter: inviterData, joinedAt: admin.firestore.FieldValue.serverTimestamp() });
    } catch (e) {}
});

client.on('guildMemberRemove', async member => {
    try {
        const doc = await db.collection('members').doc(member.id).get();
        if (doc.exists) { await db.collection('members').doc(member.id).delete(); }
        await db.collection('inviteTracking').doc(member.id).delete().catch(()=>{});
    } catch (e) {}
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const boostChannel = await client.channels.fetch(config.channels.boostThanks).catch(() => null);
        await checkAndThankBooster(newMember, boostChannel, 'normal');
    }
});

client.on('messageCreate', async message => {
    if (!config.features.redCarpetEnabled || message.author.bot || message.channel.id !== config.channels.chatLounge) return;
    if (message.member && message.member.premiumSince) {
        try {
            const todayStr = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }); 
            const docRef = db.collection('boosterSettings').doc(message.author.id);
            const doc = await docRef.get();
            let data = doc.exists ? doc.data() : { optOut: false, lastRedCarpet: '', hasSeenHint: false };
            if (data.optOut || data.lastRedCarpet === todayStr) return;

            let randomMsg = boosterRedCarpetMessages[Math.floor(Math.random() * boosterRedCarpetMessages.length)](`<@${message.author.id}>`);
            await message.channel.send(randomMsg);
            
            if (!data.hasSeenHint) {
                try { await message.author.send(`✨ **關於您的專屬紅毯進場** ✨\n*(貼心小提醒：如果您覺得太高調，隨時可以在伺服器輸入 \`/星光紅毯設定\` 關閉！)*`); } 
                catch (e) { const hintMsg = await message.channel.send(`<@${message.author.id}> *(💡 這是 Booster 特權！若覺得太高調，可使用 \`/星光紅毯設定\` 關閉)*`); setTimeout(() => hintMsg.delete().catch(() => null), 15000); }
            }
            await docRef.set({ lastRedCarpet: todayStr, hasSeenHint: true }, { merge: true });
        } catch (err) {}
    }
});

// ==========================================
// 🎮 7️⃣ 巨無霸事件分流：Interaction Create
// ==========================================
client.on('interactionCreate', async interaction => {
    try {
        // [迴響防護] 只允許在特定伺服器運作 (同時放寬允許公會伺服器)
        if (interaction.guildId && ALLOWED_GUILDS.length > 0 && !ALLOWED_GUILDS.includes(interaction.guildId)) {
            if (interaction.isRepliable()) return interaction.reply({ content: '❌ 此伺服器尚未開通服務。', ephemeral: true }).catch(() => {});
            return;
        }

        // ===================================
        // 👉 Slash Commands 分流
        // ===================================
        if (interaction.isChatInputCommand()) {
            const cmd = interaction.commandName;
            const isOwner = interaction.user.id === interaction.guild?.ownerId; 
            const hasAdminRole = interaction.member?.roles?.cache?.hasAny(...config.roles.adminRoles); 
            const hasAdminPerm = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator); 

            // 💎 【公會系統指令】
            if (['解鎖權限', '發布小指南', '查詢目前公會成員', '查詢目前親友團', '同步更名', '檢查補發感謝', '測試感謝卡', '重播感謝卡', '清除資料', '清除訊息', '星光紅毯設定'].includes(cmd)) {
                
                if (cmd === '星光紅毯設定') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    if (!interaction.member.premiumSince) return interaction.editReply('❌ 很抱歉，這是 **Server Booster (伺服器加成者)** 專屬的特權喔！');
                    const optOut = interaction.options.getString('狀態') === 'off';
                    await db.collection('boosterSettings').doc(interaction.user.id).set({ optOut: optOut }, { merge: true });
                    return interaction.editReply(optOut ? '🔕 設定成功！已為您關閉每日首次出場歡迎。' : '✨ 設定成功！已為您開啟浮誇紅毯模式！');
                }

                if (!isOwner && !hasAdminRole && !hasAdminPerm) return interaction.reply({ content: '❌ 權限不足，僅限幹部使用。', flags: MessageFlags.Ephemeral });

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
                    if (!targetMember || !targetMember.premiumSince) return interaction.editReply(`❌ 無法發送感謝卡，該成員不存在或非加成者。`);
                    const boostChannel = await interaction.guild.channels.fetch(config.channels.boostThanks).catch(() => null);
                    if (await checkAndThankBooster(targetMember, boostChannel, 'replay', interaction)) return interaction.editReply(`✅ 已在 <#${config.channels.boostThanks}> 重播感謝卡！🎉`);
                    return interaction.editReply('❌ 重播失敗。');
                }
                if (cmd === '檢查補發感謝') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    const boostChannel = await interaction.guild.channels.fetch(config.channels.boostThanks).catch(() => null);
                    if (!boostChannel) return interaction.editReply('❌ 找不到感謝卡發布頻道！');
                    let count = 0; const members = await interaction.guild.members.fetch();
                    for (const [id, member] of members) { if (member.premiumSince && await checkAndThankBooster(member, boostChannel, 'normal')) { count++; await new Promise(r => setTimeout(r, 300)); } }
                    return interaction.editReply(`✅ 掃描補發完畢！本次為 **${count}** 位錯過的乾爹乾媽補發感謝卡！`);
                }
                if (cmd === '解鎖權限') {
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_member').setLabel('公會成員').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('btn_friend').setLabel('親友團').setStyle(ButtonStyle.Success));
                    return interaction.reply({ content: "🎈 **叮咚！歡迎光臨 ENDLESS！** 🎈\n為了讓你在伺服器暢通無阻，請選擇你的身分唷！", components: [row] });
                }
                if (cmd === '發布小指南') {
                    const guideEmbed = new EmbedBuilder().setTitle('📌 【 ENDLESS 實用功能小指南 】 📌').setDescription('🔸 **更新資料**：更改你的遊戲名稱或最新等級！\n🔸 **新增職業**：新增額外的職業\n🔸 **刪除職業**：移除不玩的職業身分\n\n👇 **請選擇您要使用的服務：**').setColor('#FFB6C1');
                    const actionSelect = new StringSelectMenuBuilder().setCustomId('select_user_action').setPlaceholder('請選擇功能...').addOptions([{ label: '更新資料', value: 'action_update', emoji: '📝' }, { label: '新增職業', value: 'action_add_class', emoji: '➕' }, { label: '刪除職業', value: 'action_remove_class', emoji: '🗑️' }]);
                    await interaction.reply({ content: '✅ 小指南發布成功！', flags: MessageFlags.Ephemeral });
                    return interaction.channel.send({ embeds: [guideEmbed], components: [new ActionRowBuilder().addComponents(actionSelect)] });
                }
                if (cmd === '同步更名') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    const snapshot = await db.collection('members').get();
                    if (snapshot.empty) return interaction.editReply('❌ 目前資料庫中沒有成員紀錄。');
                    let successCount = 0, failCount = 0;
                    for (const doc of snapshot.docs) {
                        try {
                            const data = doc.data(); const member = await interaction.guild.members.fetch(data.discordId).catch(() => null);
                            if (member) { await updateNickname(member, data.gameName, data.role, data.gameClasses || [data.gameClass]); successCount++; await new Promise(r => setTimeout(r, 500)); } else { failCount++; }
                        } catch (e) { failCount++; }
                    }
                    return interaction.editReply(`✅ 同步更名完畢！\n成功更新：**${successCount}** 人\n無效/已離開：**${failCount}** 人`);
                }
                if (cmd === '查詢目前公會成員') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
                    const embed = await generateMemberLeaderboard();
                    return interaction.editReply(embed && typeof embed !== 'string' ? { embeds: [embed] } : embed || '❌ 錯誤');
                }
                if (cmd === '查詢目前親友團') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
                    const embed = await generateFriendLeaderboard();
                    return interaction.editReply(embed && typeof embed !== 'string' ? { embeds: [embed] } : embed || '❌ 錯誤');
                }
                if (cmd === '清除資料') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    const targetUser = interaction.options.getUser('目標');
                    await db.collection('members').doc(targetUser.id).delete();
                    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                    if (member) await member.roles.remove([config.roles.guildMember, config.roles.familyFriend, ...Object.values(config.roles.classes)]).catch(() => {});
                    return interaction.editReply(`✅ 已完全清除 <@${targetUser.id}> 的紀錄與身分組。`);
                }
                if (cmd === '清除訊息') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    const amount = interaction.options.getInteger('數量');
                    try { const deleted = await interaction.channel.bulkDelete(amount, true); return interaction.editReply(`✅ 成功清除了 **${deleted.size}** 則訊息！`); } catch (err) { return interaction.editReply('❌ 清除失敗 (訊息可能超過 14 天)。'); }
                }
            }

            // 👑 【迴響系統指令】
            if (['預約', '我的紀錄', '接單統計', '查詢預約', '刷新看板', '註冊迴響專員', '指定迴響專員', '刪除迴響專員', '清理訊息', '設定公開看板', '設定管理看板', '迴響管理區', '價格', '迴響鬧鐘', '優惠設定', '系統狀態', '營運設定', '玩家管理', '刪除訂單'].includes(cmd)) {
                
                if (cmd === '預約') {
                    const location = interaction.options.getString('地點'); const tw = getTaiwanTime();
                    const modal = new ModalBuilder().setCustomId(`reserve_${location}_1`).setTitle(`📝 預約：${location}`);
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel("日期").setStyle(TextInputStyle.Short).setValue(`${tw.yyyy}-${tw.mm}-${tw.dd}`).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time').setLabel("時間").setStyle(TextInputStyle.Short).setValue(`${tw.hh}:${tw.min}`).setMaxLength(5).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gameId').setLabel("預約者ID").setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel("幸運頻道").setStyle(TextInputStyle.Short).setRequired(false)), 
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel("備註").setStyle(TextInputStyle.Short).setRequired(false))
                    );
                    return interaction.showModal(modal);
                }

                await interaction.deferReply({ ephemeral: true });

                if (cmd === '系統狀態') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const uptime = (process.uptime() / 3600).toFixed(2);
                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('🤖 系統運作與資料庫狀態').addFields({ name: '📖 本日讀取', value: `${dbStats.reads} 次`, inline: true }, { name: '✍️ 本日寫入', value: `${dbStats.writes} 次`, inline: true }, { name: '🕒 運作時間', value: `${uptime} 小時`, inline: false })] });
                }
                else if (cmd === '刷新看板') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    await updateBoard(); return interaction.editReply({ content: '✅ 所有看板已強制刷新完畢！' });
                }
                else if (cmd === '註冊迴響專員') {
                    const userRef = db.collection('users').doc(interaction.user.id); const userDoc = await userRef.get(); addDbStat('read');
                    let ud = userDoc.exists ? userDoc.data() : { violationPoints: 0, bannedUntil: null };
                    if (ud.agentStatus === 'rejected' || ud.agentStatus === 'removed') return interaction.editReply('❌ 您的申請先前已被拒絕。');
                    if (ud.isAgent) return interaction.editReply('✅ 您已經是專員了！');
                    if (ud.agentStatus === 'pending') return interaction.editReply('⏳ 審核中。');
                    
                    ud.agentStatus = 'pending'; await userRef.set(ud, { merge: true }); addDbStat('write');
                    await broadcastToManagementAreas({
                        embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('📝 新專員申請').setDescription(`<@${interaction.user.id}> 申請成為專員！`)],
                        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approveAgent_${interaction.user.id}`).setLabel('✅ 通過').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`rejectAgent_${interaction.user.id}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger))]
                    });
                    return interaction.editReply('✅ 申請已送出！');
                }
                else if (cmd === '指定迴響專員') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const targetUser = interaction.options.getUser('玩家');
                    await db.collection('users').doc(targetUser.id).set({ isAgent: true, agentStatus: 'approved' }, { merge: true }); addDbStat('write');
                    try { const member = await interaction.guild.members.fetch(targetUser.id); await member.roles.add(getAgentRoleId(interaction.guildId)); } catch (e) {}
                    return interaction.editReply(`✅ 已成功指定 <@${targetUser.id}>。`);
                }
                else if (cmd === '刪除迴響專員') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const targetUser = interaction.options.getUser('玩家');
                    await db.collection('users').doc(targetUser.id).set({ isAgent: false, agentStatus: 'removed' }, { merge: true }); addDbStat('write');
                    try { const member = await interaction.guild.members.fetch(targetUser.id); await member.roles.remove(getAgentRoleId(interaction.guildId)); } catch (e) {}
                    return interaction.editReply(`✅ 已成功移除 <@${targetUser.id}>。`);
                }
                else if (cmd === '刪除訂單') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const targetUser = interaction.options.getUser('玩家'); const targetId = interaction.options.getString('訂單id');
                    if (targetId) {
                        await db.collection('reservations').doc(targetId.trim()).delete(); addDbStat('write');
                        setTimeout(updateBoard, 1500); return interaction.editReply({ content: `✅ 刪除成功！` });
                    }
                    let userOrders = targetUser ? allReservations.filter(r => r.discordId === targetUser.id).sort((a,b)=>b.timestamp-a.timestamp).slice(0, 25) : allReservations.sort((a,b)=>b.timestamp-a.timestamp).slice(0, 25);
                    if (userOrders.length === 0) return interaction.editReply({ content: `❌ 查無訂單紀錄。` });
                    const options = userOrders.map(o => ({ label: `[${o.date}] ${o.location}`, description: `ID: ${o.id}`, value: o.id }));
                    return interaction.editReply({ content: `🗑️ **刪除訂單**`, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_delete_order').setPlaceholder('請選擇要刪除的訂單').addOptions(options))] });
                }
                else if (cmd === '玩家管理') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const targetUser = interaction.options.getUser('玩家'); const action = interaction.options.getString('動作');
                    const userRef = db.collection('users').doc(targetUser.id); const userDoc = await userRef.get(); addDbStat('read');
                    let ud = userDoc.exists ? userDoc.data() : { violationPoints: 0, bannedUntil: null };
                    if (action === 'unban') { ud.bannedUntil = null; } else if (action === 'clear_points') { ud.violationPoints = 0; }
                    else if (action === 'add_point') { ud.violationPoints = (ud.violationPoints||0)+1; if (ud.violationPoints >= 3) { ud.bannedUntil = Date.now()+7*24*3600*1000; ud.violationPoints = 0; } }
                    else if (action === 'remove_point') { ud.violationPoints = Math.max(0, (ud.violationPoints||0)-1); }
                    await userRef.set(ud, { merge: true }); addDbStat('write');
                    return interaction.editReply(`✅ 操作成功！目前點數: ${ud.violationPoints || 0}`);
                }
                else if (cmd === '查詢預約') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const { embed, totalPages, currentPage } = generateScheduleEmbed(allReservations, true, 1, true);
                    return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('page_nav_prev_1').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(true), new ButtonBuilder().setCustomId('page_nav_next_2').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1))] });
                }
                else if (cmd === '營運設定') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const sub = interaction.options.getSubcommand(); const docRef = db.collection('settings').doc('operationMode');
                    let opData = appSettings['operationMode'] || { autoApprove: false, autoRefreshBoard: false, frozenSlots: [] };
                    if (sub === '自動審核' || sub === '自動更新看板') {
                        const state = interaction.options.getString('狀態') === 'true';
                        if (sub === '自動審核') opData.autoApprove = state; else opData.autoRefreshBoard = state;
                        await docRef.set(opData, { merge: true }); addDbStat('write'); return interaction.editReply(`✅ 設定完畢！狀態: ${state}`);
                    } else if (sub === '新增凍結時段') {
                        const type = interaction.options.getString('類型'); const start = interaction.options.getString('開始時間'); const end = interaction.options.getString('結束時間');
                        if (!opData.frozenSlots) opData.frozenSlots = []; opData.frozenSlots.push({ type, start, end });
                        await docRef.set(opData, { merge: true }); addDbStat('write'); return interaction.editReply(`✅ 已新增暫停時段。`);
                    } else if (sub === '清空凍結時段') {
                        opData.frozenSlots = []; await docRef.set(opData, { merge: true }); addDbStat('write'); return interaction.editReply(`✅ 已清空。`);
                    } else if (sub === '查看目前設定') { return interaction.editReply({ content: `✅ 審核: ${opData.autoApprove}, 更新: ${opData.autoRefreshBoard}, 凍結數: ${(opData.frozenSlots||[]).length}` }); }
                }
                else if (cmd === '清理訊息') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    try { await interaction.channel.bulkDelete(interaction.options.getInteger('數量'), true); return interaction.editReply({ content: `✅ 清理成功！` }); } catch (e) { return interaction.editReply({ content: `❌ 清理失敗` }); }
                }
                else if (['設定公開看板', '設定管理看板', '迴響管理區'].includes(cmd)) {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const field = cmd === '設定公開看板' ? 'publicBoards' : (cmd === '設定管理看板' ? 'adminBoards' : 'managementArea');
                    let doc = appSettings[field] || (field === 'managementArea' ? { channels: [] } : { list: [] });
                    const targetArr = field === 'managementArea' ? doc.channels : doc.list;
                    const exists = field === 'managementArea' ? targetArr.includes(interaction.channelId) : targetArr.findIndex(b => b.channelId === interaction.channelId) !== -1;
                    if (exists) {
                        if (field === 'managementArea') doc.channels = targetArr.filter(id => id !== interaction.channelId); else doc.list = targetArr.filter(b => b.channelId !== interaction.channelId);
                        await db.collection('settings').doc(field).set(doc); addDbStat('write'); return interaction.editReply('✅ 已移除。');
                    } else {
                        if (field === 'managementArea') { doc.channels.push(interaction.channelId); } 
                        else {
                            const msg = await interaction.channel.send({ content: '載入中...', components: field === 'publicBoards' ? [reserveBtnRow] : [] });
                            doc.list.push({ channelId: interaction.channelId, messageId: msg.id });
                        }
                        await db.collection('settings').doc(field).set(doc); addDbStat('write');
                        if (field !== 'managementArea') updateBoard();
                        return interaction.editReply('✅ 設定成功！');
                    }
                }
                else if (['價格', '迴響鬧鐘', '優惠設定'].includes(cmd)) {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    if (cmd === '價格') { await db.collection('settings').doc('prices').set({ [interaction.options.getString('地點')]: interaction.options.getInteger('價格') }, { merge: true }); }
                    else if (cmd === '迴響鬧鐘') { await db.collection('settings').doc('alarm').set({ leadTime: interaction.options.getInteger('分鐘') }, { merge: true }); }
                    else { await db.collection('settings').doc('vipRules').set({ [interaction.options.getString('地點')]: { buy: interaction.options.getInteger('滿幾次'), free: interaction.options.getInteger('送幾次') } }, { merge: true }); }
                    addDbStat('write'); return interaction.editReply('✅ 設定成功！');
                }
                else if (cmd === '我的紀錄') {
                    let total = 0, month = 0;
                    allReservations.forEach(d => { if (d.discordId === interaction.user.id && (d.status === 'approved' || d.status === 'completed' || d.status === 'free')) { total++; month++; } }); // 簡化
                    const userDoc = await db.collection('users').doc(interaction.user.id).get(); addDbStat('read');
                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle(`📊 預約數據`).addFields({ name: '總計', value: `${total} 次` })] });
                }
                else if (cmd === '接單統計') {
                    if (!(await checkIsAgent(interaction.user.id, interaction.member))) return interaction.editReply('❌ 權限不足');
                    const agentIds = [...new Set(allReservations.filter(r => r.takenBy && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')).map(r => r.takenBy))];
                    if (agentIds.length === 0) return interaction.editReply('無紀錄');
                    const { embed, components } = buildAgentStatMessage(agentIds[0]); return interaction.editReply({ embeds: [embed], components });
                }
            }
        }

        // ===================================
        // 👉 Button 點擊事件分流
        // ===================================
        else if (interaction.isButton()) {
            
            // 💎 【公會系統按鈕】
            if (['btn_member', 'btn_friend'].includes(interaction.customId)) {
                const isMember = interaction.customId === 'btn_member';
                const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_class_${isMember ? 'member' : 'friend'}`).setPlaceholder('請選擇您的遊戲職業 (可多選)...').setMinValues(1).setMaxValues(12).addOptions(classOptionsList);
                return interaction.reply({ content: `您選擇了「${isMember ? '公會成員' : '親友團'}」，請選擇職業：`, components: [new ActionRowBuilder().addComponents(selectMenu)], flags: MessageFlags.Ephemeral });
            }
            
            // 由於 approve / reject 有可能衝突，依照長度與特性區分
            if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_')) {
                const parts = interaction.customId.split('_');
                const action = parts[0]; 
                
                // 💎 [公會] approve_userId_classes | reject_userId
                if ((action === 'approve' && parts.length === 3) || (action === 'reject' && /^\d+$/.test(parts[1]))) {
                    const targetUserId = parts[1];
                    if (action === 'approve') {
                        await interaction.deferUpdate();
                        try {
                            const originalEmbed = interaction.message.embeds[0];
                            const gameName = originalEmbed.fields.find(f => f.name.includes('遊戲名稱'))?.value.replace(/`/g, '') || '未知';
                            const member = await interaction.guild.members.fetch(targetUserId);
                            const finalClasses = parts[2].split('-');
                            await member.roles.remove(config.roles.familyFriend).catch(() => {});
                            let rolesToAdd = [config.roles.guildMember];
                            finalClasses.forEach(c => { if (config.roles.classes[c]) rolesToAdd.push(config.roles.classes[c]); });
                            await member.roles.add(rolesToAdd).catch(() => {});
                            await db.collection('members').doc(targetUserId).set({ discordId: targetUserId, gameName: gameName, gameClasses: finalClasses, role: '公會成員' }, { merge: true });
                            await updateNickname(member, gameName, '公會成員', finalClasses);
                            await member.send(`🎉 狂賀！你的申請已經正式通過啦！`).catch(() => {});
                            await interaction.message.edit({ embeds: [EmbedBuilder.from(originalEmbed).setColor('#00FF00').setTitle('✅ 審核已通過')], components: [] });
                            await db.collection('inviteTracking').doc(targetUserId).delete().catch(()=>{});
                            const welcomeChannel = await client.channels.fetch(config.channels.welcome).catch(()=>{});
                            if (welcomeChannel) await welcomeChannel.send(welcomeMessages[0](targetUserId));
                        } catch (e) { return interaction.followUp({ content: '❌ 處理失敗', flags: MessageFlags.Ephemeral }); }
                    } else {
                        const reasonSelect = new StringSelectMenuBuilder().setCustomId(`select_reject_reason_${targetUserId}_${interaction.message.id}`).setPlaceholder('選擇退回原因...').addOptions([{ label: '等級未達標', value: '等級未達標' }, { label: '自訂', value: 'custom' }]);
                        return interaction.reply({ content: '請選擇原因：', components: [new ActionRowBuilder().addComponents(reasonSelect)], flags: MessageFlags.Ephemeral });
                    }
                    return;
                }
                // 👑 [迴響] approve_docId | reject_docId
                else {
                    await interaction.deferUpdate().catch(() => {});
                    const docId = parts[1];
                    if (action === 'approve') {
                        const docRef = db.collection('reservations').doc(docId); const doc = await docRef.get(); addDbStat('read');
                        let data = doc.data(); data.id = doc.id;
                        await docRef.update({ status: 'approved', reviewer: interaction.user.id }); addDbStat('write');
                        data.status = 'approved'; data.reviewer = interaction.user.id;
                        const payload = buildTicketPayload(docId, data); await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                        await editUserDM(data.discordId, data.userDmMsgId, { embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ 已通過')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`edit_${docId}`).setLabel('✏️ 變更').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`cancel_${docId}`).setLabel('🗑️ 取消').setStyle(ButtonStyle.Danger))] });
                        updateBoard(); return;
                    } else {
                        return interaction.followUp({ content: '請選擇拒絕原因：', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rejectReason_${docId}`).setPlaceholder('選擇拒絕原因...').addOptions([{ label: '時段衝突', value: '時段衝突' }, { label: '自訂', value: 'custom' }]))], ephemeral: true });
                    }
                }
            }

            // 👑 【迴響系統按鈕】
            if (interaction.customId === 'btn_refresh_board') { await interaction.deferUpdate().catch(() => {}); await updateBoard(); }
            else if (interaction.customId.startsWith('agent_nav_') || interaction.customId.startsWith('agent_details_')) { /* (略 - 套用原版統計邏輯) */ }
            else if (interaction.customId.startsWith('page_nav_')) {
                await interaction.deferUpdate();
                const p = parseInt(interaction.customId.split('_')[3]); const { embed, totalPages } = generateScheduleEmbed(allReservations, true, p, true);
                await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`page_nav_prev_${p-1}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1), new ButtonBuilder().setCustomId(`page_nav_next_${p+1}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages))] });
            }
            else if (interaction.customId === 'btn_reserve') {
                const userDoc = await db.collection('users').doc(interaction.user.id).get(); addDbStat('read');
                if (userDoc.exists && userDoc.data().bannedUntil > Date.now()) return interaction.reply({ content: `💡 您已被停權喔！`, ephemeral: true });
                return interaction.reply({ content: '👇 選擇地點：', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_location').setPlaceholder('選擇').addOptions([{label:'闇黑龍王',value:'闇黑龍王'},{label:'艾畢奈亞',value:'艾畢奈亞'}]))], ephemeral: true });
            }
            else if (interaction.customId.startsWith('approveAgent_') || interaction.customId.startsWith('rejectAgent_')) {
                const action = interaction.customId.split('_')[0]; const docId = interaction.customId.split('_')[1];
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ 權限不足', ephemeral: true });
                if (action === 'approveAgent') {
                    await db.collection('users').doc(docId).set({ isAgent: true, agentStatus: 'approved' }, { merge: true }); addDbStat('write');
                    try { const member = await interaction.guild.members.fetch(docId); await member.roles.add(getAgentRoleId(interaction.guildId)); } catch (e) {}
                    await interaction.message.edit({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ 已通過')], components: [] }); return interaction.reply({ content: '✅ 審核完成。', ephemeral: true });
                } else {
                    await db.collection('users').doc(docId).set({ isAgent: false, agentStatus: 'rejected' }, { merge: true }); addDbStat('write');
                    await interaction.message.edit({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ 已拒絕')], components: [] }); return interaction.reply({ content: '✅ 已拒絕。', ephemeral: true });
                }
            }
            else if (['edit', 'cancel', 'takeOrder', 'release', 'complete', 'free', 'fail'].includes(interaction.customId.split('_')[0])) {
                await interaction.deferUpdate().catch(() => {});
                const [action, docId] = interaction.customId.split('_');
                const docRef = db.collection('reservations').doc(docId);
                
                if (action === 'takeOrder') {
                    try {
                        await db.runTransaction(async (t) => {
                            const doc = await t.get(docRef); if (!doc.exists) throw new Error('NOT_FOUND');
                            if (doc.data().takenBy) throw new Error('TAKEN'); t.update(docRef, { takenBy: interaction.user.id });
                        }); addDbStat('write');
                        const doc = await docRef.get(); const data = { id: doc.id, ...doc.data() };
                        const payload = buildTicketPayload(docId, data); await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                        return interaction.followUp({ content: '✅ 接單成功！', ephemeral: true });
                    } catch (e) { return interaction.followUp({ content: '❌ 失敗或已被接走', ephemeral: true }); }
                }
                
                const doc = await docRef.get(); addDbStat('read'); if (!doc.exists) return interaction.followUp({ content: '❌ 找不到', ephemeral: true });
                let data = doc.data(); data.id = doc.id;

                if (action === 'edit') {
                    const modal = new ModalBuilder().setCustomId(`submitEdit_${docId}`).setTitle('變更');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('newDate').setLabel("日期").setStyle(TextInputStyle.Short).setValue(data.date)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('newTime').setLabel("時間").setStyle(TextInputStyle.Short).setValue(data.time)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gameId').setLabel("ID").setStyle(TextInputStyle.Short).setValue(data.gameId)));
                    return interaction.showModal(modal);
                } else if (action === 'cancel') {
                    await docRef.update({ status: 'canceled' }); addDbStat('write'); data.status = 'canceled';
                    const payload = buildTicketPayload(docId, data); await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                    await interaction.followUp({ content: '✅ 已取消', ephemeral: true }); updateBoard();
                } else if (['complete', 'free', 'fail'].includes(action)) {
                    data.status = action === 'complete' ? 'completed' : (action === 'free' ? 'free' : 'failed');
                    data.closer = interaction.user.id; if (!data.takenBy) data.takenBy = interaction.user.id;
                    await docRef.update({ status: data.status, closer: data.closer, takenBy: data.takenBy }); addDbStat('write');
                    const payload = buildTicketPayload(docId, data); await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                    try { await interaction.editReply({ components: [] }); } catch(e){} updateBoard();
                } else if (action === 'release') {
                    await docRef.update({ takenBy: null }); addDbStat('write'); data.takenBy = null;
                    const payload = buildTicketPayload(docId, data); const newRefs = await bumpManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                    await docRef.update({ ticketMsgs: newRefs }); addDbStat('write'); return interaction.followUp({ content: '✅ 已釋出', ephemeral: true });
                }
            }
        }

        // ===================================
        // 👉 SelectMenu 下拉式選單
        // ===================================
        else if (interaction.isStringSelectMenu()) {
            
            // 💎 【公會系統選單】
            if (interaction.customId === 'select_user_action') {
                const action = interaction.values[0];
                if (action === 'action_update') {
                    const modal = new ModalBuilder().setCustomId('modal_update_data').setTitle('更新遊戲資料');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('update_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short)));
                    return interaction.showModal(modal);
                }
                if (action === 'action_add_class') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    return interaction.editReply({ content: '➕ **選擇新增職業：**', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`add_extra_class`).setPlaceholder('選擇...').addOptions(classOptionsList))] });
                }
                if (action === 'action_remove_class') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    const doc = await db.collection('members').doc(interaction.user.id).get();
                    let classes = doc.data().gameClasses || [doc.data().gameClass];
                    const removeOptions = classes.map(c => new StringSelectMenuOptionBuilder().setLabel(c).setValue(c));
                    return interaction.editReply({ content: '🗑️ **選擇刪除職業：**', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`select_remove_class`).setPlaceholder('選擇...').addOptions(removeOptions))] });
                }
            }
            if (interaction.customId === 'select_remove_class' || interaction.customId === 'add_extra_class') {
                await interaction.deferUpdate();
                const cls = interaction.values[0]; const docRef = db.collection('members').doc(interaction.user.id); const doc = await docRef.get();
                let classes = doc.data().gameClasses || [doc.data().gameClass];
                if (interaction.customId === 'select_remove_class') {
                    classes = classes.filter(c => c !== cls); await interaction.member.roles.remove(config.roles.classes[cls]).catch(()=>{});
                } else {
                    if (!classes.includes(cls)) { classes.push(cls); await interaction.member.roles.add(config.roles.classes[cls]).catch(()=>{}); }
                }
                await docRef.update({ gameClasses: classes }); await updateNickname(interaction.member, doc.data().gameName, doc.data().role, classes);
                return interaction.editReply({ content: `✅ 職業已更新！`, components: [] });
            }
            if (interaction.customId.startsWith('select_class_')) {
                const isMember = interaction.customId === 'select_class_member';
                const modal = new ModalBuilder().setCustomId(`modal_${isMember ? 'member' : 'friend'}_${interaction.values.join('-')}`).setTitle(isMember ? '公會成員資料' : '親友團資料');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }
            if (interaction.customId.startsWith('select_reject_reason_')) {
                const parts = interaction.customId.split('_'); const targetUserId = parts[3]; const msgId = parts[4]; const reason = interaction.values[0];
                if (reason === 'custom') {
                    const modal = new ModalBuilder().setCustomId(`modal_reject_custom_${targetUserId}_${msgId}`).setTitle('填寫退回原因');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reject_reason').setLabel("原因").setStyle(TextInputStyle.Paragraph).setRequired(true)));
                    return interaction.showModal(modal);
                } else {
                    await interaction.deferUpdate();
                    const member = await interaction.guild.members.fetch(targetUserId); await member.send(`💌 抱歉，申請未通過。\n💬 原因：${reason}`).catch(()=>{});
                    const channel = await client.channels.fetch(config.channels.approval); const originalMsg = await channel.messages.fetch(msgId);
                    await originalMsg.edit({ embeds: [EmbedBuilder.from(originalMsg.embeds[0]).setColor('#FF0000').setTitle('❌ 已退回')], components: [] });
                    return interaction.editReply({ content: `✅ 已退回。`, components: [] });
                }
            }

            // 👑 【迴響系統選單】
            if (interaction.customId === 'select_location') {
                const location = interaction.values[0];
                return interaction.update({ content: `👇 **已選擇【${location}】。請選擇次數：**`, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`select_times_${location}`).setPlaceholder('選擇次數').addOptions([{label:'1次',value:'1'},{label:'2次',value:'2'}]))] });
            }
            if (interaction.customId.startsWith('select_times_')) {
                const location = interaction.customId.split('_')[2]; const times = interaction.values[0]; const tw = getTaiwanTime();
                const modal = new ModalBuilder().setCustomId(`reserve_${location}_${times}`).setTitle(`📝 預約：${location}`);
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel("日期").setStyle(TextInputStyle.Short).setValue(`${tw.yyyy}-${tw.mm}-${tw.dd}`)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time').setLabel("時間").setStyle(TextInputStyle.Short).setValue(`${tw.hh}:${tw.min}`)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gameId').setLabel("遊戲ID").setStyle(TextInputStyle.Short)));
                await interaction.showModal(modal);
            }
            if (interaction.customId.startsWith('rejectReason_')) {
                const docId = interaction.customId.split('_')[1]; const reason = interaction.values[0];
                if (reason === 'custom') {
                    const modal = new ModalBuilder().setCustomId(`submitReject_${docId}`).setTitle('原因');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel("原因").setStyle(TextInputStyle.Paragraph).setRequired(true)));
                    return interaction.showModal(modal);
                }
                await interaction.deferUpdate().catch(() => {}); await processRejection(docId, reason, interaction.user.id, interaction);
            }
            if (interaction.customId === 'select_delete_order') {
                await interaction.deferUpdate().catch(() => {}); await db.collection('reservations').doc(interaction.values[0]).delete(); addDbStat('write'); return interaction.editReply({ content: `✅ 已刪除！`, components: [] });
            }
        }

        // ===================================
        // 👉 Modal Submit 表單提交
        // ===================================
        else if (interaction.isModalSubmit()) {
            
            // 💎 【公會系統表單】
            if (interaction.customId.startsWith('modal_member_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const classesStr = interaction.customId.replace('modal_member_', '').replace(/-/g, '｜');
                const name = interaction.fields.getTextInputValue('game_name');
                const tracker = await db.collection('inviteTracking').doc(interaction.user.id).get();
                const referrer = tracker.exists ? tracker.data().inviter : '無法追蹤 / 未知';
                
                const channel = await client.channels.fetch(config.channels.approval);
                if (channel) {
                    const embed = new EmbedBuilder().setTitle('🛡️ ENDLESS | 新成員申請').addFields({ name: '👾 Discord', value: interaction.user.tag, inline: true }, { name: '👤 名稱', value: name, inline: true }, { name: '⚔️ 職業', value: classesStr, inline: true }, { name: '🤝 引薦人', value: referrer, inline: true }).setColor('#FFD700');
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_${interaction.user.id}_${interaction.customId.replace('modal_member_', '')}`).setLabel('✅ 通過').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('❌ 退回').setStyle(ButtonStyle.Danger));
                    await channel.send({ embeds: [embed], components: [row] });
                }
                return interaction.editReply(`✅ 申請單已送出給幹部審核！`);
            }
            if (interaction.customId.startsWith('modal_friend_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const finalClasses = interaction.customId.replace('modal_friend_', '').split('-');
                const name = interaction.fields.getTextInputValue('game_name');
                let rolesToAdd = [config.roles.familyFriend]; finalClasses.forEach(c => { if (config.roles.classes[c]) rolesToAdd.push(config.roles.classes[c]); });
                await interaction.member.roles.add(rolesToAdd);
                await db.collection('members').doc(interaction.user.id).set({ discordId: interaction.user.id, gameName: name, gameClasses: finalClasses, role: '親友團' }, { merge: true });
                await updateNickname(interaction.member, name, '親友團', finalClasses);
                return interaction.editReply(`✅ 登記成功！身分組已發放。`);
            }
            if (interaction.customId.startsWith('modal_reject_custom_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [ , , , targetUserId, msgId ] = interaction.customId.split('_'); const reason = interaction.fields.getTextInputValue('reject_reason');
                const member = await interaction.guild.members.fetch(targetUserId); await member.send(`💌 抱歉，申請未通過。\n💬 原因：${reason}`).catch(()=>{});
                const channel = await client.channels.fetch(config.channels.approval); const originalMsg = await channel.messages.fetch(msgId);
                await originalMsg.edit({ embeds: [EmbedBuilder.from(originalMsg.embeds[0]).setColor('#FF0000').setTitle('❌ 已退回')], components: [] });
                return interaction.editReply(`✅ 已完成退回通知。`);
            }
            if (interaction.customId === 'modal_update_data') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const newName = interaction.fields.getTextInputValue('update_name');
                const doc = await db.collection('members').doc(interaction.user.id).get();
                if (!doc.exists) return interaction.editReply('❌ 找不到資料');
                await db.collection('members').doc(interaction.user.id).update({ gameName: newName });
                await updateNickname(interaction.member, newName, doc.data().role, doc.data().gameClasses);
                return interaction.editReply(`✅ 更新成功！`);
            }

            // 👑 【迴響系統表單】
            if (interaction.customId.startsWith('reserve_')) {
                await interaction.deferReply({ ephemeral: true });
                const location = interaction.customId.split('_')[1]; const date = interaction.fields.getTextInputValue('date'); const time = interaction.fields.getTextInputValue('time'); const gameId = interaction.fields.getTextInputValue('gameId');
                const { parsedDate } = formatDateTimeStr(date, time);
                if (parsedDate.getTime() <= Date.now()) return interaction.editReply('❌ 無法預約過去時間');
                
                const data = { discordId: interaction.user.id, discordName: interaction.user.displayName || interaction.user.username, gameId, date, time, location, channel: '', notes: '無', timestamp: parsedDate.getTime(), reminded: false, takenBy: null, postChecked: false, userDmMsgId: null, buttonsRemoved: false, status: 'pending', reviewer: null };
                const docRef = await db.collection('reservations').add(data); addDbStat('write'); data.id = docRef.id;
                const sentMsgs = await broadcastToManagementAreas(buildTicketPayload(docRef.id, data)); await docRef.update({ ticketMsgs: sentMsgs }); addDbStat('write');
                
                try {
                    const dmMsg = await interaction.user.send({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⏳ 等待審核中').setDescription(`地點: ${location}\n時間: ${date} ${time}`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cancel_${docRef.id}`).setLabel('🗑️ 取消預約').setStyle(ButtonStyle.Danger))] });
                    await docRef.update({ userDmMsgId: dmMsg.id }); addDbStat('write');
                } catch (e) {}
                await interaction.editReply(`✅ 預約已送出！請等待審核。`);
            }
            if (interaction.customId.startsWith('submitReject_')) {
                await interaction.deferUpdate().catch(() => {});
                await processRejection(interaction.customId.split('_')[1], interaction.fields.getTextInputValue('reason'), interaction.user.id, interaction);
            }
            if (interaction.customId.startsWith('submitEdit_')) {
                await interaction.deferUpdate().catch(() => {});
                const docId = interaction.customId.split('_')[1]; const newDate = interaction.fields.getTextInputValue('newDate'); const newTime = interaction.fields.getTextInputValue('newTime'); const newGameId = interaction.fields.getTextInputValue('gameId');
                const { formattedDate, formattedTime, parsedDate } = formatDateTimeStr(newDate, newTime);
                const currentDoc = await db.collection('reservations').doc(docId).get(); let data = currentDoc.data();
                data.date = formattedDate; data.time = formattedTime; data.gameId = newGameId; data.timestamp = parsedDate.getTime(); data.status = 'pending'; data.takenBy = null;
                const newRefs = await bumpManagementMessages(data.ticketMsgs, buildTicketPayload(docId, data).embeds[0], buildTicketPayload(docId, data).components);
                await db.collection('reservations').doc(docId).update({ date: formattedDate, time: formattedTime, gameId: newGameId, timestamp: parsedDate.getTime(), status: 'pending', takenBy: null, ticketMsgs: newRefs }); addDbStat('write');
                await interaction.followUp({ content: '✅ 資料已更新', ephemeral: true }); updateBoard();
            }
        }
    } catch (globalError) {
        if (globalError.code === 10062) return; 
        console.error("🚨 互動處理發生未預期錯誤：", globalError);
    }
});

// ==========================================
// 🚀 啟動機器人連線
// ==========================================
const safeToken = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.trim() : null;
if (!safeToken) { console.error("❌ [錯誤] 系統抓不到 DISCORD_TOKEN！"); } 

client.login(safeToken).catch(error => { console.error("❌ [致命錯誤] Discord 拒絕了登入連線：", error); });
