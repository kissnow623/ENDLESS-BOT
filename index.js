require('dotenv').config();

// ==========================================
// 🌐 0. 強制使用 IPv4 (破解 Render 網路黑洞)
// ==========================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const admin = require('firebase-admin');
const { 
    Client, GatewayIntentBits, Partials, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, EmbedBuilder, REST, Routes,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    PermissionFlagsBits, ApplicationCommandOptionType,
    MessageFlags 
} = require('discord.js');

// ==========================================
// 1. 初始化 Firebase 資料庫
// ==========================================
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // 處理私鑰換行符號 (相容兩種寫法)
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
// 2. 參數與全域變數設定區
// ==========================================

// ------------------------------------------
// 【迴響王團預約系統設定】
// ------------------------------------------
const ALLOWED_GUILDS = ['1466073297169940543', '1536011422323179631', '1536416054832799795', '1539475243733622794']; // 加入了公會伺服器ID

// 專員身分組映射表
const AGENT_ROLE_MAP = {
    'default': '1541411576228093963', 
};

function getAgentRoleId(guildId) {
    return AGENT_ROLE_MAP[guildId] || AGENT_ROLE_MAP['default'];
}

// 資料庫用量追蹤系統 (內部計數器)
let dbStats = { reads: 0, writes: 0, resetDay: new Date(Date.now() + 8 * 3600000).getUTCDate() };

function addDbStat(type, count = 1) {
    const twDate = new Date(Date.now() + 8 * 3600000).getUTCDate();
    if (dbStats.resetDay !== twDate) {
        dbStats.reads = 0; dbStats.writes = 0; dbStats.resetDay = twDate;
    }
    if (type === 'read') dbStats.reads += count;
    if (type === 'write') dbStats.writes += count;
}

// 全域記憶體快取 (迴響用)
let allReservations = [];
let appSettings = {};

// 監聽近期訂單
const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
db.collection('reservations').where('timestamp', '>=', ninetyDaysAgo).onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length); 
    allReservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

// 監聽設定檔
db.collection('settings').onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length);
    snapshot.docs.forEach(doc => { appSettings[doc.id] = doc.data(); });
});

const publicBoardIntro = "🎉 **歡迎來到迴響預約中心！**\n為了出團順暢，請提早預約您的專屬迴響時段。\n👇 請點擊下方 **【📝 預約迴響時間】** 快速排單，系統將會為您登記並通知審核！";
const reserveBtnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_reserve').setLabel('📝 預約迴響時間').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_refresh_board').setLabel('🔄 手動刷新看板').setStyle(ButtonStyle.Secondary)
);

// ------------------------------------------
// 【ENDLESS 公會系統設定】
// ------------------------------------------
const ADMIN_ROLES = [
    '1539508532846526494', // 幹部身分組 1
    '1539959330726486036'  // 幹部身分組 2
];

const config = {
    guildId: '1539475243733622794', 
    features: {
        redCarpetEnabled: false 
    },
    channels: { 
        approval: '1539972747545808937',
        welcome: '1539971422842261601',       
        welcomeFriend: '1539904561941188608',
        boostThanks: '1540726577443115109', 
        chatLounge: '1539904561941188608',   
        leaderboardChannel: '這裡填入你想要發布排行榜的頻道ID' 
    },
    roles: {
        adminRoles: ADMIN_ROLES, 
        guildMember: '1539959985797341184',
        familyFriend: '1539960787882475591',
        classes: {
            '黑騎士': '1540148326433820784', '聖騎士': '1540148350144479312',
            '英雄': '1540148429336875098', '箭神': '1540148458621763674',
            '神射手': '1540148479316197496', '主教': '1540148561331753100',
            '冰雷': '1540148594672144445', '火毒': '1540148630608937032',
            '夜使者': '1540148685193748501', '暗影神偷': '1540148712062591047',
            '拳霸': '1540148732711014484', '槍神': '1540148797152301126'
        }
    }
};

const classOptionsList = Object.keys(config.roles.classes).map(className => 
    new StringSelectMenuOptionBuilder().setLabel(className).setValue(className)
);

// 🌟 公會成員：30 款隨機迎新
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

// 🌟 親友團：30 款專屬隨機迎新
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

// Booster：30 款浮誇出場台詞
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

// 🌟 感謝卡專用五張圖片 (隨機輪播)
const boostBannerImages = [
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540947667784564867/file_000000001e3482068ff550c4da330d58.png?ex=6a8bced9&is=6a8a7d59&hm=04da4b20777bf733ee124c1c56ece83736516f213a1ad947e7a6894cbab4f7fe&',
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540947668430495754/file_000000002f708206a62ff6600b3bbc41.png?ex=6a8bced9&is=6a8a7d59&hm=4051d76562215866856e85981c406c59fd045b9a55e8affcad326e530288adc0&',
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540956754345459744/file_00000000553882069dd3021f5990a4b4.png?ex=6a8bd74f&is=6a8a85cf&hm=3ae158e282a42359ed672d6990373b5f9d7a1930b765679089176eb55ab7a6d8&',
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540956754752577647/file_00000000e81482099c4a51450c9ae8f5.png?ex=6a8bd74f&is=6a8a85cf&hm=f6491e5e1d3e7d26e9d8b22fc12d336eb6819d0c13aefa05415b0adbb39be41a&',
    'https://cdn.discordapp.com/attachments/1539719568065560656/1540956755255754832/file_000000009fa0822fa44fa1ac84280623.png?ex=6a8bd750&is=6a8a85d0&hm=40fc1a910df5e646e106825e56e6ff14235ee21c6b3783c0331f20cd9e4a0a32&'
];

// 邀請碼快取
const guildInvites = new Map();

// ==========================================
// 3. Web 伺服器
// ==========================================
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is currently alive and running!'));
app.listen(port, () => console.log(`[Web Server] Listening on port ${port}`));

// ==========================================
// 4. 核心功能函式庫
// ==========================================

// ------------------------------------------
// 【迴響相關函數】
// ------------------------------------------
function getTaiwanTime() {
    const now = new Date();
    const twDate = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    return {
        yyyy: twDate.getUTCFullYear(),
        mm: String(twDate.getUTCMonth() + 1).padStart(2, '0'),
        dd: String(twDate.getUTCDate()).padStart(2, '0'),
        hh: String(twDate.getUTCHours()).padStart(2, '0'),
        min: String(twDate.getUTCMinutes()).padStart(2, '0')
    };
}

function formatDateTimeStr(dateStr, timeStr) {
    let parts = dateStr.replace(/\//g, '-').split('-');
    if (parts.length === 3) {
        parts[1] = parts[1].padStart(2, '0');
        parts[2] = parts[2].padStart(2, '0');
        dateStr = parts.join('-');
    }
    if (timeStr.length === 4 && timeStr.indexOf(':') === 1) timeStr = '0' + timeStr;
    const dt = new Date(`${dateStr}T${timeStr}:00+08:00`);
    return { formattedDate: dateStr, formattedTime: timeStr, parsedDate: dt };
}

function getBoardContentWithTime() {
    return publicBoardIntro;
}

function isWeekend(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(Date.UTC(y, m - 1, d, 4, 0, 0)); 
    const day = dt.getUTCDay();
    return day === 0 || day === 6;
}

function isTimeFrozen(timeStr, frozenSlots, dateStr) {
    if (!frozenSlots || frozenSlots.length === 0) return false;
    const [h, m] = timeStr.split(':').map(Number);
    const tMins = h * 60 + m;
    const isWknd = isWeekend(dateStr);

    for (const slot of frozenSlots) {
        const sType = slot.type || 'all'; 
        if (sType === 'weekday' && isWknd) continue;
        if (sType === 'weekend' && !isWknd) continue;

        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;

        if (startMins <= endMins) {
            if (tMins >= startMins && tMins <= endMins) return true;
        } else {
            if (tMins >= startMins || tMins <= endMins) return true;
        }
    }
    return false;
}

function getFrozenTextForDateStr(frozenSlots, dateStr) {
    if (!frozenSlots || frozenSlots.length === 0) return "無暫停時段";
    const isWknd = isWeekend(dateStr);
    
    let applicable = frozenSlots.filter(s => {
        const sType = s.type || 'all';
        if (sType === 'weekday' && isWknd) return false;
        if (sType === 'weekend' && !isWknd) return false;
        return true;
    });
    
    if (applicable.length === 0) return "無暫停時段";
    
    return applicable.map(s => {
        const [sh, sm] = s.start.split(':').map(Number);
        const [eh, em] = s.end.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        if (startMins > endMins) {
            return `於 \`${s.start}\` 至明日 \`${s.end}\` 暫停系統預約`;
        } else {
            return `於 \`${s.start}\` 至 \`${s.end}\` 暫停系統預約`;
        }
    }).join('、');
}

async function addViolation(discordId) {
    const userRef = db.collection('users').doc(discordId);
    const doc = await userRef.get();
    addDbStat('read');
    let points = 1;
    let bannedUntil = null;
    if (doc.exists) points = (doc.data().violationPoints || 0) + 1;
    if (points >= 3) {
        bannedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000; 
        points = 0; 
    }
    await userRef.set({ violationPoints: points, bannedUntil: bannedUntil }, { merge: true });
    addDbStat('write');
    return { points, bannedUntil };
}

async function checkIsAgent(userId, member) {
    if (member && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const doc = await db.collection('users').doc(userId).get();
    addDbStat('read');
    if (doc.exists && doc.data().isAgent === true) return true;
    return false;
}

async function broadcastToManagementAreas(payload) {
    const doc = appSettings['managementArea'];
    if (!doc) return [];
    const channels = doc.channels || [];
    let sentMsgs = [];
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
            if (ch) {
                const msg = await ch.messages.fetch(m.messageId).catch(() => null);
                if (msg) await msg.edit({ embeds: [newEmbed], components: newComponents });
            }
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
    try {
        const user = await client.users.fetch(discordId);
        const dmChannel = await user.createDM();
        const msg = await dmChannel.messages.fetch(messageId);
        if (msg) await msg.edit(payload);
    } catch (e) {}
}

function buildTicketPayload(docId, data) {
    let embed = new EmbedBuilder();
    let components = [];
    let row = new ActionRowBuilder();

    const playerNameDisplay = data.discordName ? ` (${data.discordName})` : '';
    const baseDesc = `**單號**：\`${docId}\`\n**玩家**：<@${data.discordId}>${playerNameDisplay} (遊戲ID: ${data.gameId})\n**地點**：${data.location}\n**頻道**：${data.channel || '-'}\n**預約時間**：\`${data.date} ${data.time}\`\n**備註**：${data.notes || '無'}\n\n**📋 訂單時間線**：\n`;
    let timeline = '';

    if (data.status === 'pending') {
        embed.setColor(0xFFA500).setTitle('🚨 新訂單待審核');
        timeline += `> 🟡 審核等待中...\n`;
        row.addComponents(
            new ButtonBuilder().setCustomId(`approve_${docId}`).setLabel('✅ 審核通過').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${docId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger)
        );
    } else if (data.status === 'rejected') {
        embed.setColor(0xFF0000).setTitle('❌ 訂單已拒絕');
        timeline += `> 🔴 已拒絕 (審核：<@${data.reviewer}>)\n`;
        if (data.rejectReason) timeline += `> 📝 原因：${data.rejectReason}\n`;
    } else if (data.status === 'expired') {
        embed.setColor(0x808080).setTitle('⏳ 申請已過期失效');
        timeline += `> ⚪ 未審核，開打時間已過自動失效\n`;
    } else if (data.status === 'canceled') {
        embed.setColor(0x808080).setTitle('🚫 玩家已自行取消');
        timeline += `> ⚪ 玩家已取消\n`;
    } else {
        timeline += `> ✅ 審核通過 (審核：<@${data.reviewer || '管理員'}>)\n`;

        if (data.status === 'approved') {
            if (!data.reminded) {
                embed.setColor(0x00FF00).setTitle('🟢 訂單已排程');
                if (!data.takenBy) {
                    timeline += `> 🟡 審核通過，開放專員提前接單！\n`;
                    timeline += `> ⏳ 等待鬧鐘發送...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`takeOrder_${docId}`).setLabel('✋ 我來接單').setStyle(ButtonStyle.Primary));
                } else {
                    timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`;
                    timeline += `> ⏳ 等待鬧鐘發送...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`release_${docId}`).setLabel('🔄 釋出轉單').setStyle(ButtonStyle.Secondary));
                }
            } else if (data.reminded && !data.postChecked) {
                if (!data.takenBy) {
                    embed.setColor(0xFFA500).setTitle('🚨 準備出團 (等待接單)');
                    timeline += `> 🟡 鬧鐘已響，等待專員接單...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`takeOrder_${docId}`).setLabel('✋ 我來接單').setStyle(ButtonStyle.Primary));
                } else {
                    embed.setColor(0x00FF00).setTitle('🟢 專員已接單');
                    timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`;
                    timeline += `> ⏳ 等待出團與結案...\n`;
                    row.addComponents(new ButtonBuilder().setCustomId(`release_${docId}`).setLabel('🔄 釋出轉單').setStyle(ButtonStyle.Secondary));
                }
            } else if (data.postChecked) {
                embed.setColor(0x8A2BE2).setTitle('🟣 等待結案回報');
                if (data.takenBy) {
                    timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`;
                    timeline += `> 🟡 等待專員回報結案...\n`;
                    if (data.dmFailed) {
                        timeline += `> ⚠️ 無法私訊專員，請在此直接結案！\n`;
                    } else {
                        timeline += `> 💡 已發送結案私訊給專員。若專員無回應，管理員可在此代為結案。\n`;
                    }
                    row.addComponents(
                        new ButtonBuilder().setCustomId(`complete_${docId}`).setLabel('⭕ 順利完成').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`free_${docId}`).setLabel('🎁 免單').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`fail_${docId}`).setLabel('❌ 未完成/取消').setStyle(ButtonStyle.Danger)
                    );
                } else {
                    timeline += `> 🔴 警告：此單無人接手！\n`;
                    timeline += `> 🟡 等待任何專員幫忙補結案...\n`;
                    row.addComponents(
                        new ButtonBuilder().setCustomId(`complete_${docId}`).setLabel('⭕ 順利完成').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`free_${docId}`).setLabel('🎁 免單').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`fail_${docId}`).setLabel('❌ 未完成/取消').setStyle(ButtonStyle.Danger)
                    );
                }
            }
        } else if (data.status === 'completed') {
            embed.setColor(0x00FF00).setTitle('⭕ 訂單已結案 (順利完成)');
            if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`;
            timeline += `> ⭕ 順利完成 (確認：<@${data.closer || data.takenBy}>)\n`;
        } else if (data.status === 'free') {
            embed.setColor(0xFFD700).setTitle('🎁 訂單已結案 (免單)');
            if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`;
            timeline += `> 🎁 免單 (確認：<@${data.closer || data.takenBy}>)\n`;
        } else if (data.status === 'failed') {
            embed.setColor(0xFF0000).setTitle('❌ 訂單已結案 (未完成/取消)');
            if (data.takenBy) timeline += `> ✅ 專員接單 (專員：<@${data.takenBy}>)\n`;
            timeline += `> ❌ 未完成/取消 (確認：<@${data.closer || data.takenBy || '系統'}>)\n`;
        }
    }

    embed.setDescription(baseDesc + timeline);
    if (row.components.length > 0) components.push(row);
    return { embeds: [embed], components };
}

function generateScheduleEmbed(reservations, isAdmin = false, page = 1, isCommand = false) {
    const now = Date.now();
    const tw = getTaiwanTime();
    const todayStr = `${tw.yyyy}-${tw.mm}-${tw.dd}`;
    const currentMonthPrefix = `${tw.yyyy}-${tw.mm}`;

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
    const totalItems = futureRes.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const p = Math.max(1, Math.min(page, totalPages));

    let scheduleText = '';

    if (totalItems === 0) {
        scheduleText += isAdmin ? '目前沒有任何已通過的未來預約喔！\n\n' : '本日目前沒有已通過的預約喔！\n\n';
    } else {
        const startIdx = (p - 1) * ITEMS_PER_PAGE;
        const pageItems = futureRes.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        const grouped = {};
        
        pageItems.forEach(res => {
            if (!grouped[res.date]) grouped[res.date] = [];
            grouped[res.date].push(res);
        });

        for (const [date, items] of Object.entries(grouped)) {
            scheduleText += `**📅 ${date}**\n\n`;
            items.forEach((res) => {
                const noteText = res.notes && res.notes !== '無' ? ` | 備註：${res.notes}` : '';
                let channelDisplay = '';
                let playerInfo = '';
                const playerNameDisplay = res.discordName ? ` (${res.discordName})` : '';
                
                if (isAdmin) {
                    const userStats = stats[res.discordId] || { month: 0, total: 0 };
                    channelDisplay = ` | 頻道：${res.channel || '當日決定'}`;
                    playerInfo = `ID：${res.gameId} | <@${res.discordId}>${playerNameDisplay} | 本月：${userStats.month}次 | 總：${userStats.total}次`;
                } else {
                    channelDisplay = ''; 
                    playerInfo = `👤 🔒 匿名玩家`;
                }
                scheduleText += `🕒 \`${res.time}\` ── **【${res.location}】**\n`;
                scheduleText += ` └─ ${playerInfo}${channelDisplay}${noteText}\n\n`;
            });
        }
        
        if (!isCommand && totalItems > ITEMS_PER_PAGE) {
            scheduleText += `\n⚠️ **由於篇幅限制，看板僅顯示近期 ${ITEMS_PER_PAGE} 筆預約。**\n*(管理員可使用 \`/查詢預約\` 指令進行分頁檢視)*\n\n`;
        }
    }

    if (!isCommand) {
        const opMode = appSettings['operationMode'] || {};
        const fSlots = opMode.frozenSlots || [];
        if (fSlots.length > 0 && !isAdmin) {
            const todayFrozenText = getFrozenTextForDateStr(fSlots, todayStr);
            if (todayFrozenText !== "無暫停時段") {
                scheduleText += `\n⚠️ **【今日系統預約限制】**\n${todayFrozenText}\n\n`;
            }
        }
        scheduleText += `🔄 **最後刷新時間**：\`${tw.yyyy}-${tw.mm}-${tw.dd} ${tw.hh}:${tw.min}\``;
    }

    const embed = new EmbedBuilder()
        .setColor(isAdmin ? 0xFF0000 : 0x0099FF)
        .setDescription(scheduleText);
        
    if (isAdmin) {
        embed.setTitle(isCommand ? `👑【管理員】王團自動排班表 (第 ${p}/${totalPages} 頁)` : '👑【管理員】王團自動排班表');
    }
    
    return { embed, totalPages, currentPage: p };
}

async function updateBoard() {
    try {
        const reservations = allReservations;
        const boardContent = getBoardContentWithTime();

        const pubDoc = appSettings['publicBoards'] || {};
        let pubList = pubDoc.list || [];
        let validPubList = [];
        let pubChanged = false;
        
        for (let b of pubList) {
            try {
                const ch = await client.channels.fetch(b.channelId).catch(() => null);
                if (ch) {
                    const msg = await ch.messages.fetch(b.messageId).catch(() => null);
                    if (msg) {
                        const { embed } = generateScheduleEmbed(reservations, false, 1, false);
                        await msg.edit({ content: boardContent, embeds: [embed], components: [reserveBtnRow] });
                        validPubList.push(b);
                    } else {
                        const { embed } = generateScheduleEmbed(reservations, false, 1, false);
                        const newMsg = await ch.send({ content: boardContent, embeds: [embed], components: [reserveBtnRow] });
                        validPubList.push({ channelId: ch.id, messageId: newMsg.id });
                        pubChanged = true;
                    }
                } else pubChanged = true;
            } catch (e) { pubChanged = true; }
        }
        if (pubChanged || pubList.length !== validPubList.length) {
            await db.collection('settings').doc('publicBoards').set({ list: validPubList });
            addDbStat('write');
        }

        const admDoc = appSettings['adminBoards'] || {};
        let admList = admDoc.list || [];
        let validAdmList = [];
        let admChanged = false;

        for (let b of admList) {
            try {
                const ch = await client.channels.fetch(b.channelId).catch(() => null);
                if (ch) {
                    const msg = await ch.messages.fetch(b.messageId).catch(() => null);
                    if (msg) {
                        const { embed } = generateScheduleEmbed(reservations, true, 1, false);
                        await msg.edit({ content: null, embeds: [embed] });
                        validAdmList.push(b);
                    } else {
                        const { embed } = generateScheduleEmbed(reservations, true, 1, false);
                        const newMsg = await ch.send({ embeds: [embed] });
                        validAdmList.push({ channelId: ch.id, messageId: newMsg.id });
                        admChanged = true;
                    }
                } else admChanged = true;
            } catch (e) { admChanged = true; }
        }
        if (admChanged || admList.length !== validAdmList.length) {
            await db.collection('settings').doc('adminBoards').set({ list: validAdmList });
            addDbStat('write');
        }

    } catch (e) { console.log('看板更新失敗', e); }
}

async function processRejection(docId, reason, reviewerId, interaction) {
    const docRef = db.collection('reservations').doc(docId);
    let data = allReservations.find(r => r.id === docId);
    if (!data) return interaction.editReply({ content: '❌ 訂單已不存在', components: [] });
    if (data.status !== 'pending') return interaction.editReply({ content: '❌ 訂單已被處理過囉', components: [] });

    data.status = 'rejected';
    data.reviewer = reviewerId;
    data.rejectReason = reason;
    await docRef.update({ status: 'rejected', reviewer: reviewerId, rejectReason: reason });
    addDbStat('write');

    const payload = buildTicketPayload(docId, data);
    await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);

    const dmEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle('🚫 預約未通過')
        .setDescription(`管理員退回了您的申請。\n**地點**：${data.location}\n**時間**：${data.date} ${data.time}\n**原因**：${reason}`);
    await editUserDM(data.discordId, data.userDmMsgId, { embeds: [dmEmbed], components: [] });

    await interaction.editReply({ content: '✅ 訂單已拒絕，並已通知玩家。', components: [] });
}

function calculateOrderPrice(order) {
    const prices = appSettings['prices'] || {};
    const vipRules = appSettings['vipRules'] || {};
    if (order.status === 'free') return 0;
    if (order.status !== 'completed') return 0;
    let price = prices[order.location] || 0;
    const rule = vipRules[order.location];
    if (rule && rule.buy > 0) {
        const userHistory = allReservations
            .filter(r => r.discordId === order.discordId && r.location === order.location && (r.status === 'approved' || r.status === 'completed' || r.status === 'free'))
            .sort((a, b) => a.timestamp - b.timestamp);
        const orderIndex = userHistory.findIndex(r => r.id === order.id);
        if (orderIndex !== -1) {
            const cycle = rule.buy + rule.free;
            if ((orderIndex % cycle) >= rule.buy) price = 0; 
        }
    }
    return price;
}

function buildAgentStatMessage(agentId) {
    const agentIds = [...new Set(allReservations.filter(r => r.takenBy && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')).map(r => r.takenBy))];
    const currentIndex = agentIds.indexOf(agentId);
    const tw = getTaiwanTime();
    const currentMonthPrefix = `${tw.yyyy}-${tw.mm}`;
    let total = 0, month = 0, totalFree = 0, monthFree = 0, failed = 0, totalRevenue = 0, monthRevenue = 0;

    allReservations.forEach(r => {
        if (r.takenBy === agentId && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')) {
            const isCurrentMonth = r.date.startsWith(currentMonthPrefix);
            if (r.status === 'completed') {
                total++; if (isCurrentMonth) month++;
                const price = calculateOrderPrice(r);
                totalRevenue += price; if (isCurrentMonth) monthRevenue += price;
            } else if (r.status === 'free') {
                totalFree++; if (isCurrentMonth) monthFree++;
            } else if (r.status === 'failed') {
                failed++;
            }
        }
    });

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`📊 迴響專員接單績效 (${currentIndex + 1} / ${agentIds.length})`)
        .setDescription(`**專員**：<@${agentId}>\n> 本月完成：\`${month}\` 次 (總計 \`${total}\`)\n> 本月免單招待：\`${monthFree}\` 次 (總計 \`${totalFree}\`)\n> 失敗/取消數：\`${failed}\` 次\n>\n> 💰 本月收益：\`${monthRevenue}\` 萬\n> 💰 總計收益：\`${totalRevenue}\` 萬`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`agent_nav_prev_${agentId}`).setLabel('◀ 上一位').setStyle(ButtonStyle.Secondary).setDisabled(currentIndex <= 0),
        new ButtonBuilder().setCustomId(`agent_details_${agentId}_1`).setLabel('📋 查看訂單明細').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`agent_nav_next_${agentId}`).setLabel('下一位 ▶').setStyle(ButtonStyle.Secondary).setDisabled(currentIndex >= agentIds.length - 1 || currentIndex === -1)
    );
    return { embed, components: [row] };
}

function buildAgentDetailsMessage(agentId, page) {
    const orders = allReservations
        .filter(r => r.takenBy === agentId && (r.status === 'completed' || r.status === 'free' || r.status === 'failed'))
        .sort((a, b) => b.timestamp - a.timestamp);

    const ITEMS_PER_PAGE = 8;
    const totalPages = Math.max(1, Math.ceil(orders.length / ITEMS_PER_PAGE));
    const p = Math.max(1, Math.min(page, totalPages));
    const startIdx = (p - 1) * ITEMS_PER_PAGE;
    const pageItems = orders.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    let desc = `**專員**：<@${agentId}> 的歷史訂單紀錄\n\n`;
    if (pageItems.length === 0) { 
        desc += "尚無訂單明細。"; 
    } else {
        pageItems.forEach(o => {
            let statusIcon = '⭕'; let priceStr = '';
            if (o.status === 'completed') {
                const pAmt = calculateOrderPrice(o);
                priceStr = pAmt === 0 ? `(💎 VIP免單)` : `(${pAmt}萬)`;
            } else if (o.status === 'free') {
                statusIcon = '🎁'; priceStr = `(招待)`;
            } else if (o.status === 'failed') {
                statusIcon = '❌'; priceStr = `(失敗/取消)`;
            }
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

// ------------------------------------------
// 【公會相關函數】
// ------------------------------------------
async function updateNickname(member, gameName, roleType, classesArray) {
    const icon = roleType === '公會成員' ? '🌟' : '🍁';
    const classesStr = classesArray.join('｜');
    let newNick = `${gameName} ${icon} ${classesStr}`; 
    if (newNick.length > 32) newNick = newNick.substring(0, 32); 
    try { 
        await member.setNickname(newNick); 
    } catch (e) { 
        console.log(`⚠️ 無法修改 ${member.user.tag} 的暱稱`); 
    }
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
    } catch (error) {
        console.error('❌ 產生公會成員排行榜失敗：', error);
        return null;
    }
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
    } catch (error) {
         console.error('❌ 產生親友團排行榜失敗：', error);
         return null;
    }
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
            { title: '🏰 ENDLESS 的堅固基石 🏰', text: '**致敬守護者！** 每一座偉大的城堡，都需要最堅固的基石，感謝贊助！🛡️' },
            { title: '💎 尊榮 VIP 降臨 💎', text: '**粉紅徽章亮起！** 讓我們掌聲歡迎 VIP，這份心意我們一定會好好珍惜！✨' },
            { title: '🌟 奇蹟守護者 🌟', text: '**無私奉獻！** 你的支持就像守護 ENDLESS 的魔法護盾，讓伺服器與眾不同！🔮' },
            { title: '🍷 酒館的最強金主 🍷', text: '**大金主降臨！** 謝謝老闆幫公會酒館升級高級沙發，讓我們敬你一杯！🍻' },
            { title: '👑 無可取代的寶藏 👑', text: '**捕捉到寶藏！** 系統偵測到一枚閃閃發光的寶藏夥伴，你絕對是最珍貴的！🎁' },
            { title: '🎆 煙火為你綻放 🎆', text: '**砰砰砰！** 因為你的加成，伺服器的夜空綻放了最美的專屬煙火！🎇' },
            { title: '🎀 溫暖的擁抱 🎀', text: '**溫暖的擁抱！** 你的支持就像冬天裡的一杯熱可可，暖暖地流進了我們心裡... ☕' },
            { title: '💸 乾爹/乾媽撒幣啦 💸', text: '**財力展示！** 感謝您為伺服器注入了滿滿的魔法金幣，ENDLESS 因為您而更加奢華！💰' },
            { title: '👑 絕對領域展開 👑', text: '**超強氣場！** 專屬的加成領域已經啟動，感謝您為公會帶來無與倫比的榮耀與光芒！✨' },
            { title: '🍄 頂級超級藥水 🍄', text: '**能量滿滿！** 您的 Boost 就像一罐超級藥水，讓整個伺服器的活力瞬間回滿啦！❤️‍🔥' },
            { title: '🌌 星際航線解鎖 🌌', text: '**飛向宇宙！** 有了您的推進器加持，ENDLESS 已經準備好突破天際，航向未知的新星系！🚀' },
            { title: '🏅 殿堂級 MVP 降臨 🏅', text: '**全場歡呼！** 您就是我們公會最耀眼的 MVP，感謝您賜予伺服器這份尊貴的加成力量！🏆' }
        ];

        const randomChoice = boostVariations[Math.floor(Math.random() * boostVariations.length)];

        const thankYouEmbed = new EmbedBuilder()
            .setColor('#FF99CC') 
            .setTitle(randomChoice.title) 
            .setDescription(
                `💖 **Thank you for Ur boost** 💖\n\n` +
                `${randomChoice.text}\n\n` + 
                `• 目前伺服器累計已有\n ✨ **${boostCount} 個加成** ✨ \n\n` +
                `• 已解鎖屬於您的專屬出場 BGM！\n 貼心小助手已經私訊音效設定教學給您，趕緊去看看吧 💌`
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true })) 
            .setImage(randomImage) 
            .setFooter({ text: `ENDLESS 感謝您的支持與陪伴，祝您一切順利 🤍`, iconURL: member.guild.iconURL() }) 
            .setTimestamp();

        let pingContent = `🎊 **<@${member.id}> 觸發了伺服器感謝加成 💕** 🎊`;
        if (mode === 'test') {
            pingContent = `🎊 **[私密測試預覽] <@${member.id}> 觸發了伺服器感謝加成 💕** 🎊`;
        } else if (mode === 'replay') {
            pingContent = `🎊 **[經典回顧] 再次感謝 <@${member.id}> 對伺服器的偉大加成 💕** 🎊`;
        }

        let sentMessage = null;

        if (mode === 'test' && interaction) {
            sentMessage = await interaction.editReply({ content: pingContent, embeds: [thankYouEmbed], fetchReply: true });
        } else if (boostChannel) {
            sentMessage = await boostChannel.send({ content: pingContent, embeds: [thankYouEmbed] });
            if (sentMessage) {
                try {
                    await sentMessage.react('🎉');
                    await sentMessage.react('🎊');
                    await sentMessage.react('💖');
                    await sentMessage.react('✨');
                } catch (reactErr) { console.error('無法加入灑花反應：', reactErr); }
            }
        }

        if (mode === 'normal') {
            const tutorialEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎶 【 Booster 專屬特權：語音頻道出場 BGM 設定指南 】 🎶')
                .setDescription(`🎀 **叮咚！親愛的乾爹/乾媽您好！(抱大腿)**\n超級無敵感謝您用閃亮亮的 Server Boost 支持 ENDLESS 呀！🥰\n\n你知道嗎？身為尊貴的 Booster，Discord 有送您一個超神氣的隱藏特權喔！就是——**「專屬語音進場 BGM」**！✨\n\n只要設定好，以後您每次踩進公會的語音頻道，系統就會自動幫您播專屬的出場配樂！是不是超有排場、超像巨星登場！😎\n\n👇 **快跟著我的超簡單 3 步驟把專屬 BGM 裝起來吧：**\n\n**Step 1.** 點擊 Discord 左下角您的名字旁邊的 ⚙️ **「使用者設定 (小齒輪)」**。\n**Step 2.** 在左邊清單找到 🔊 **「語音和視訊」**。\n**Step 3.** 往下滾動找到 **「音效板 (Soundboard)」** 區塊，點一下 **「入用語音頻道音效」** 右邊的 ✏️ 鉛筆圖示，就可以挑選您最愛的音效啦！\n\n*(💡 悄悄話：您可以直接選我們 ENDLESS 伺服器自己專屬的可愛音效喔！趕快去挑一首，今晚來語音頻道讓我們驚豔一下吧！)*`)
                .setFooter({ text: 'ENDLESS 專屬貼心小秘書', iconURL: member.guild.iconURL() });

            await member.send({ embeds: [tutorialEmbed] }).catch(() => {});
            await docRef.set({ thankedAt: admin.firestore.FieldValue.serverTimestamp(), tag: member.user.tag });
        }
        return true;
    } catch (err) {
        console.error('❌ 處理加成感謝失敗：', err);
        return false;
    }
}

// ==========================================
// 5. Discord Client 宣告與指令註冊
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

client.once('clientReady', async () => {
    console.log(`🤖 機器人登入成功：${client.user.tag}!`);
    const adminPerms = PermissionFlagsBits.Administrator.toString();

    // 快取伺服器內所有的邀請連結
    client.guilds.cache.forEach(async guild => {
        try {
            const invites = await guild.invites.fetch();
            const codeUses = new Map();
            invites.forEach(inv => codeUses.set(inv.code, inv.uses));
            guildInvites.set(guild.id, codeUses);
            console.log(`✅ 已快取伺服器 [${guild.name}] 的邀請碼資料，邀請追蹤啟動。`);
        } catch (err) {
            console.log(`⚠️ 無法獲取伺服器 [${guild.name}] 的邀請碼。`);
        }
    });

    // 整合所有指令 (Echo + Guild)
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
                { name: '類型', type: 3, description: '適用日', required: true, choices: [ { name: '平日 (週一至週五)', value: 'weekday' }, { name: '假日 (週六與週日)', value: 'weekend' }, { name: '不分平假日', value: 'all' } ] },
                { name: '開始時間', type: 3, description: '例如 23:00', required: true }, 
                { name: '結束時間', type: 3, description: '例如 08:00', required: true }
            ]},
            { name: '清空凍結時段', type: 1, description: '清除所有已設定的凍結時段' },
            { name: '查看目前設定', type: 1, description: '查看自動審核狀態與凍結時段' }
        ]},
        { name: '玩家管理', description: '管理玩家的違規點數與封鎖狀態 (管理員)', options: [
            { name: '玩家', type: 6, description: '選擇目標玩家', required: true },
            { name: '動作', type: 3, description: '執行的動作', required: true, choices: [
                { name: '解除封鎖 (解Ban)', value: 'unban' },
                { name: '清除違規點數 (歸零)', value: 'clear_points' },
                { name: '增加違規點數 (+1)', value: 'add_point' },
                { name: '扣除違規點數 (-1)', value: 'remove_point' }
            ]}
        ]},
        { name: '刪除訂單', description: '列出近期歷史訂單以供刪除 (管理員)', options: [
            { name: '玩家', type: 6, description: '選擇玩家以縮小搜尋範圍 (選填)', required: false },
            { name: '訂單id', type: 3, description: '直接輸入訂單 ID 進行單獨刪除 (選填)', required: false }
        ]}
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
    } catch (error) { 
        console.error('❌ 指令註冊失敗：', error); 
    }

    // 啟動開機加成狀態掃描
    try {
        const guild = client.guilds.cache.get(config.guildId);
        if (guild) {
            const boostChannel = await client.channels.fetch(config.channels.boostThanks).catch(() => null);
            if (boostChannel) {
                const members = await guild.members.fetch();
                for (const [id, member] of members) {
                    if (member.premiumSince) {
                        await checkAndThankBooster(member, boostChannel, 'normal');
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
                console.log('✅ 啟動加成狀態掃描完成！');
            }
        }
    } catch (err) { 
        console.error('❌ 啟弱掃描加成者失敗：', err); 
    }
});

// ==========================================
// 6. 整合式心跳排程引擎 (每 60 秒輪詢)
// ==========================================
let lastLeaderboardMonth = -1;

setInterval(async () => {
    const now = Date.now();
    const twTime = new Date(now + 8 * 3600000);

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

            if (data.status === 'pending' && data.timestamp < now) {
                await db.collection('reservations').doc(data.id).update({ status: 'expired' });
                addDbStat('write');
                needsSync = true;
                await editUserDM(data.discordId, data.userDmMsgId, { embeds: [new EmbedBuilder().setColor(0x808080).setTitle('⏳ 預約已過期失效').setDescription(`您的預約因超過開打時間未審核，已自動失效。\n**地點**：${data.location}\n**時間**：${data.date} ${data.time}`)], components: [] });
            }

            if (data.status === 'approved' && !data.reminded && timeDiff <= alarmLeadTime * 60 * 1000 && timeDiff > 0) {
                await db.collection('reservations').doc(data.id).update({ reminded: true });
                addDbStat('write');
                needsBump = true; 

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
                    await broadcastToManagementAreas({ content: `🚨 **【緊急派單通知】**\n<@${data.discordId}> 預約的【${data.location}】將在 ${alarmLeadTime} 分鐘後出團，目前**尚未有專員接單**！\n請盡速點擊下方卡片的「✋ 我來接單」！` });
                }
            }

            if (data.status === 'approved' && !data.buttonsRemoved && now >= data.timestamp) {
                await editUserDM(data.discordId, data.userDmMsgId, { components: [] });
                await db.collection('reservations').doc(data.id).update({ buttonsRemoved: true });
                addDbStat('write');
            }

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
                addDbStat('write');
                needsBump = true;
                data.postChecked = true; data.dmFailed = dmFailed;
            }

            if (data.status === 'approved' && data.postChecked && now - data.timestamp >= 12 * 60 * 60 * 1000) {
                await db.collection('reservations').doc(data.id).update({ status: 'failed', closer: '系統自動結案' });
                addDbStat('write');
                needsSync = true;
                data.status = 'failed'; data.closer = '系統自動結案';
            }

            if (needsBump) {
                const payload = buildTicketPayload(data.id, data);
                const newRefs = await bumpManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                await db.collection('reservations').doc(data.id).update({ ticketMsgs: newRefs });
                addDbStat('write');
            } else if (needsSync) {
                const payload = buildTicketPayload(data.id, data);
                await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
            }
        }
        
        if (opMode.autoRefreshBoard === true) {
            updateBoard();
        }
    } catch (error) { 
        console.error(error); 
    }

    // ------------------------------------------
    // B. 公會系統：每月發布排行榜
    // ------------------------------------------
    try {
        const currentMonth = twTime.getUTCMonth();
        
        // 台灣時間 1號凌晨 00:00 發布，且當月沒發過
        if (twTime.getUTCDate() === 1 && twTime.getUTCHours() === 0 && currentMonth !== lastLeaderboardMonth) {
            lastLeaderboardMonth = currentMonth;
            
            const guild = client.guilds.cache.get(config.guildId);
            if (guild) {
                const targetChannel = await client.channels.fetch(config.channels.leaderboardChannel).catch(() => null);
                if (targetChannel) {
                    const memberEmbed = await generateMemberLeaderboard();
                    const friendEmbed = await generateFriendLeaderboard();

                    if (memberEmbed && typeof memberEmbed !== 'string') await targetChannel.send({ embeds: [memberEmbed] });
                    if (friendEmbed && typeof friendEmbed !== 'string') await targetChannel.send({ embeds: [friendEmbed] });
                }
            }
        }
    } catch (error) {
        console.error('❌ 自動發佈排行榜時發生錯誤：', error);
    }
}, 60 * 1000); 

// ==========================================
// 7. 公會專屬事件監聽 (Discord Event Handlers)
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
        const cachedInvites = guildInvites.get(member.guild.id);
        if (!cachedInvites) return;

        const newInvites = await member.guild.invites.fetch().catch(() => null);
        if (!newInvites) return;

        const usedInvite = newInvites.find(inv => inv.uses > (cachedInvites.get(inv.code) || 0));
        let inviterData = '無法追蹤 / 未知';

        if (usedInvite && usedInvite.inviter) {
            inviterData = `<@${usedInvite.inviter.id}>`; 
        }

        newInvites.forEach(inv => cachedInvites.set(inv.code, inv.uses));
        guildInvites.set(member.guild.id, cachedInvites);

        await db.collection('inviteTracking').doc(member.id).set({
            inviter: inviterData,
            joinedAt: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (error) {
        console.error("❌ 追蹤邀請人發生錯誤：", error);
    }
});

client.on('guildMemberRemove', async member => {
    try {
        const doc = await db.collection('members').doc(member.id).get();
        if (doc.exists) {
            await db.collection('members').doc(member.id).delete();
            console.log(`🧹 偵測到成員 ${member.user.tag} 離開伺服器，已自動清除其 Firebase 紀錄。`);
        }
        await db.collection('inviteTracking').doc(member.id).delete().catch(()=>{});
    } catch (error) { 
        console.error("❌ 清除離開成員資料失敗：", error); 
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const boostChannel = await client.channels.fetch(config.channels.boostThanks).catch(() => null);
        await checkAndThankBooster(newMember, boostChannel, 'normal');
    }
});

client.on('messageCreate', async message => {
    if (!config.features.redCarpetEnabled) return;

    if (message.author.bot || message.channel.id !== config.channels.chatLounge) return;

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
                try {
                    await message.author.send(`✨ **關於您的專屬紅毯進場** ✨\n*(💡 貼心小提醒：剛剛在 <#${message.channel.id}> 的浮誇進場是 Booster 專屬特權喔！如果您覺得太高調，隨時可以在伺服器聊天頻道輸入 \`/星光紅毯設定\` 指令將其關閉！)*`);
                } catch (e) {
                    const hintMsg = await message.channel.send(`<@${message.author.id}> *(💡 貼心小提醒：這是 Booster 專屬特權喔！若覺得太高調，隨時可使用 \`/星光紅毯設定\` 關閉。此提示 15 秒後自動刪除)*`);
                    setTimeout(() => hintMsg.delete().catch(() => null), 15000);
                }
            }

            await docRef.set({ lastRedCarpet: todayStr, hasSeenHint: true }, { merge: true });

        } catch (err) { 
            console.error('❌ 星光紅毯觸發失敗：', err); 
        }
    }
});

// ==========================================
// 8. 巨無霸事件分流中心：Interaction Create
// ==========================================
client.on('interactionCreate', async interaction => {
    try {
        // [防護] 只允許在特定伺服器運作 
        if (interaction.guildId && ALLOWED_GUILDS.length > 0 && !ALLOWED_GUILDS.includes(interaction.guildId)) {
            if (interaction.isRepliable()) {
                return interaction.reply({ content: '❌ 此伺服器尚未開通機器人服務。', ephemeral: true }).catch(() => {});
            }
            return;
        }

        // ===================================
        // 👉 A. Chat Input Commands (斜線指令)
        // ===================================
        if (interaction.isChatInputCommand()) {
            const cmd = interaction.commandName;
            
            const isOwner = interaction.user.id === interaction.guild?.ownerId; 
            const hasAdminRole = interaction.member?.roles?.cache?.hasAny(...config.roles.adminRoles); 
            const hasAdminPerm = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator); 

            // ------------------------------------------
            // 💎 【公會系統指令區】
            // ------------------------------------------
            if (['解鎖權限', '發布小指南', '查詢目前公會成員', '查詢目前親友團', '同步更名', '檢查補發感謝', '測試感謝卡', '重播感謝卡', '清除資料', '清除訊息', '星光紅毯設定'].includes(cmd)) {
                
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

                if (!isOwner && !hasAdminRole && !hasAdminPerm) {
                    return interaction.reply({ content: '❌ 很抱歉，此指令僅限幹部使用。', flags: MessageFlags.Ephemeral });
                }

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

                    if (!targetMember) return interaction.editReply('❌ 找不到該成員，他可能已經離開伺服器了。');
                    if (!targetMember.premiumSince) return interaction.editReply(`❌ <@${targetUser.id}> 目前**不是**伺服器加成者喔！無法發送感謝卡。`);

                    const boostChannel = await interaction.guild.channels.fetch(config.channels.boostThanks).catch(() => null);
                    if (!boostChannel) return interaction.editReply('❌ 找不到感謝卡發佈頻道，請檢查設定。');

                    const success = await checkAndThankBooster(targetMember, boostChannel, 'replay', interaction);

                    if (success) {
                        return interaction.editReply(`✅ **大成功！** 已經在 <#${config.channels.boostThanks}> 重新為 <@${targetUser.id}> 舉辦盛大的感謝典禮囉！🎉`);
                    } else {
                        return interaction.editReply('❌ 重播失敗，發生了未知的錯誤。');
                    }
                }

                if (cmd === '檢查補發感謝') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    await interaction.editReply('⏳ 正在掃描伺服器加成者名單，請稍候...');
                    try {
                        const boostChannel = await interaction.guild.channels.fetch(config.channels.boostThanks).catch(() => null);
                        if (!boostChannel) return interaction.editReply('❌ 找不到感謝卡發布頻道！');

                        let count = 0;
                        const members = await interaction.guild.members.fetch();
                        for (const [id, member] of members) {
                            if (member.premiumSince) {
                                const wasThanked = await checkAndThankBooster(member, boostChannel, 'normal');
                                if (wasThanked) count++;
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        }
                        return interaction.editReply(`✅ **掃描補發完畢！**\n✨ 本次總共為 **${count}** 位錯過的乾爹乾媽補發了精美感謝卡片！🎉`);
                    } catch (err) {
                        console.error('❌ 補發感謝指令錯誤：', err);
                        return interaction.editReply('❌ 執行掃描時發生錯誤。');
                    }
                }

                if (cmd === '解鎖權限') {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_member').setLabel('公會成員').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('btn_friend').setLabel('親友團').setStyle(ButtonStyle.Success)
                    );
                    const welcomeMessage = "🎈 **叮咚！歡迎光臨 ENDLESS！** 🎈\n終於等到你啦！為了讓你能在伺服器裡暢通無阻地跟大家聊天，請先偷偷告訴我們，你是我們的……？\n👇（點擊下方按鈕選擇身分唷！）";
                    return interaction.reply({ content: welcomeMessage, components: [row] });
                }

                if (cmd === '發布小指南') {
                    const guideEmbed = new EmbedBuilder()
                        .setTitle('📌 【 ENDLESS 實用功能小指南 】 📌')
                        .setDescription('🔸 **更新資料**：更改你的遊戲名稱或最新等級！\n🔸 **新增職業**：新增額外的職業，並配發身份組，更新名稱識別。\n🔸 **刪除職業**：不小心點錯分身職業，或是不玩該職業時可以一鍵刪除！\n\n👇 **請點擊下方選單，選擇您要使用的服務：**')
                        .setColor('#FFB6C1');

                    const actionSelect = new StringSelectMenuBuilder()
                        .setCustomId('select_user_action')
                        .setPlaceholder('請選擇功能...')
                        .addOptions([
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
                    if(embed && typeof embed !== 'string') {
                        return interaction.editReply({ embeds: [embed] });
                    } else {
                        return interaction.editReply(embed || '❌ 查詢資料庫時發生錯誤。');
                    }
                }

                if (cmd === '查詢目前親友團') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
                    const embed = await generateFriendLeaderboard();
                     if(embed && typeof embed !== 'string') {
                        return interaction.editReply({ embeds: [embed] });
                    } else {
                        return interaction.editReply(embed || '❌ 查詢資料庫時發生錯誤。');
                    }
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
            // 👑 【迴響預約系統指令區】
            // ------------------------------------------
            if (['預約', '我的紀錄', '接單統計', '查詢預約', '刷新看板', '註冊迴響專員', '指定迴響專員', '刪除迴響專員', '清理訊息', '設定公開看板', '設定管理看板', '迴響管理區', '價格', '迴響鬧鐘', '優惠設定', '系統狀態', '營運設定', '玩家管理', '刪除訂單'].includes(cmd)) {
                
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
                    
                    const uptimeHours = (process.uptime() / 3600).toFixed(2);
                    const embed = new EmbedBuilder()
                        .setColor(0x3498db)
                        .setTitle('🤖 系統運作與資料庫狀態')
                        .setDescription(`此數據為機器人自本日 00:00 以來的「估算」用量。\n*(註：若機器人重啟，此數據會歸零重新計算，實際用量請以 Firebase 後台為準)*`)
                        .addFields(
                            { name: '📖 本日讀取 (Reads)', value: `約 ${dbStats.reads} 次`, inline: true },
                            { name: '✍️ 本日寫入 (Writes)', value: `約 ${dbStats.writes} 次`, inline: true },
                            { name: '🕒 機器人已持續運作', value: `${uptimeHours} 小時`, inline: false }
                        );
                    return interaction.editReply({ embeds: [embed] });
                }
                else if (cmd === '刷新看板') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    await updateBoard();
                    return interaction.editReply({ content: '✅ 所有預約看板已手動強制刷新完畢！' });
                }
                else if (cmd === '註冊迴響專員') {
                    const userRef = db.collection('users').doc(interaction.user.id);
                    const userDoc = await userRef.get();
                    addDbStat('read');
                    let ud = userDoc.exists ? userDoc.data() : { violationPoints: 0, bannedUntil: null };
                    
                    if (ud.agentStatus === 'rejected' || ud.agentStatus === 'removed') {
                        return interaction.editReply('❌ 您的申請先前已被拒絕或移除，無法重複送出。若有疑問請聯繫管理員！');
                    }
                    if (ud.isAgent) {
                        return interaction.editReply('✅ 您已經是認證的迴響專員囉！可以開始接單服務了。');
                    }
                    if (ud.agentStatus === 'pending') {
                        return interaction.editReply('⏳ 您的專員申請正在審核中，請耐心等候管理員通知！');
                    }

                    ud.agentStatus = 'pending';
                    await userRef.set(ud, { merge: true });
                    addDbStat('write');

                    const payload = {
                        embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('📝 新專員認證申請')
                            .setDescription(`玩家 <@${interaction.user.id}> 申請註冊成為 **迴響專員**！\n請審核是否賦予接單權限：`)],
                        components: [new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`approveAgent_${interaction.user.id}`).setLabel('✅ 通過認證').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`rejectAgent_${interaction.user.id}`).setLabel('❌ 拒絕申請').setStyle(ButtonStyle.Danger)
                        )]
                    };
                    await broadcastToManagementAreas(payload);
                    return interaction.editReply('✅ **申請已送出！** 請等待管理員進行審核，審核結果將會私訊通知您。');
                }
                else if (cmd === '指定迴響專員') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const targetUser = interaction.options.getUser('玩家');
                    
                    await db.collection('users').doc(targetUser.id).set({ isAgent: true, agentStatus: 'approved' }, { merge: true });
                    addDbStat('write');
                    
                    try {
                        const member = await interaction.guild.members.fetch(targetUser.id);
                        const roleId = getAgentRoleId(interaction.guildId);
                        if (member && roleId) {
                            await member.roles.add(roleId);
                        }
                    } catch (e) {
                        console.error('給予身分組失敗：', e);
                    }

                    try {
                        await targetUser.send('🎉 **恭喜！管理員已直接指定您為【迴響專員】囉！**\n您可以開始至頻道接單了！');
                    } catch (e) {}
                    
                    return interaction.editReply(`✅ 已成功指定 <@${targetUser.id}> 為迴響專員，並已自動配發身分組。`);
                }
                else if (cmd === '刪除迴響專員') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const targetUser = interaction.options.getUser('玩家');
                    
                    await db.collection('users').doc(targetUser.id).set({ isAgent: false, agentStatus: 'removed' }, { merge: true });
                    addDbStat('write');

                    try {
                        const member = await interaction.guild.members.fetch(targetUser.id);
                        const roleId = getAgentRoleId(interaction.guildId);
                        if (member && roleId) {
                            await member.roles.remove(roleId);
                        }
                    } catch (e) {
                        console.error('移除身分組失敗：', e);
                    }

                    return interaction.editReply(`✅ 已成功移除 <@${targetUser.id}> 的迴響專員身分，並已自動撤銷身分組。`);
                }
                else if (cmd === '刪除訂單') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    
                    const targetUser = interaction.options.getUser('玩家');
                    const targetId = interaction.options.getString('訂單id');

                    if (targetId) {
                        const docId = targetId.trim();
                        const targetOrder = allReservations.find(r => r.id === docId);
                        
                        if (!targetOrder) return interaction.editReply({ content: `❌ 找不到 ID 為 \`${docId}\` 的訂單。` });

                        await db.collection('reservations').doc(docId).delete();
                        addDbStat('write');
                        if (targetOrder.ticketMsgs) {
                            for (const m of targetOrder.ticketMsgs) {
                                try {
                                    const ch = await client.channels.fetch(m.channelId).catch(() => null);
                                    if (ch) {
                                        const msg = await ch.messages.fetch(m.messageId).catch(() => null);
                                        if (msg) await msg.delete().catch(() => null);
                                    }
                                } catch (e) {}
                            }
                        }
                        setTimeout(() => { updateBoard(); }, 1500); 
                        return interaction.editReply({ content: `✅ 已成功從資料庫徹底刪除訂單 \`${docId}\`！` });
                    }

                    let userOrders = [];
                    let displayMsg = '';
                    
                    if (targetUser) {
                        userOrders = allReservations
                            .filter(r => r.discordId === targetUser.id)
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .slice(0, 25);
                        displayMsg = `🗑️ **刪除訂單系統**\n請在下方選擇要刪除 <@${targetUser.id}> 的歷史訂單：`;
                    } else {
                        userOrders = allReservations
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .slice(0, 25);
                        displayMsg = `🗑️ **刪除訂單系統 (近期所有紀錄)**\n請在下方選擇要刪除的歷史訂單：`;
                    }

                    if (userOrders.length === 0) return interaction.editReply({ content: `❌ 目前沒有找到任何訂單紀錄。` });

                    const options = userOrders.map(o => {
                        let statusTw = '其他';
                        if (o.status === 'approved') statusTw = '排程中';
                        if (o.status === 'completed') statusTw = '完成';
                        if (o.status === 'free') statusTw = '免單';
                        if (o.status === 'failed') statusTw = '失敗';
                        if (o.status === 'canceled') statusTw = '取消';
                        if (o.status === 'pending') statusTw = '待審核';
                        if (o.status === 'rejected') statusTw = '已拒絕';
                        if (o.status === 'expired') statusTw = '過期';

                        const pName = o.discordName ? o.discordName.substring(0, 6) : '未知';
                        return {
                            label: `[${o.date}] ${o.location} - 玩家:${pName}`,
                            description: `狀態: ${statusTw} | ID: ${o.id}`,
                            value: o.id
                        };
                    });

                    const row = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('select_delete_order')
                            .setPlaceholder('請選擇要從資料庫徹底刪除的訂單')
                            .addOptions(options)
                    );
                    return interaction.editReply({ content: `${displayMsg}\n*(注意：刪除後將無法恢復，並會自動修正報表統計)*`, components: [row] });
                }
                else if (cmd === '玩家管理') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const targetUser = interaction.options.getUser('玩家');
                    const action = interaction.options.getString('動作');
                    
                    const userRef = db.collection('users').doc(targetUser.id);
                    const userDoc = await userRef.get();
                    addDbStat('read');
                    let ud = userDoc.exists ? userDoc.data() : { violationPoints: 0, bannedUntil: null };

                    if (action === 'unban') {
                        ud.bannedUntil = null;
                        await userRef.set(ud, { merge: true });
                        addDbStat('write');
                        return interaction.editReply(`✅ 已成功解除 <@${targetUser.id}> 的預約封鎖狀態！`);
                    } else if (action === 'clear_points') {
                        ud.violationPoints = 0;
                        await userRef.set(ud, { merge: true });
                        addDbStat('write');
                        return interaction.editReply(`✅ 已將 <@${targetUser.id}> 的違規點數清空歸零。`);
                    } else if (action === 'add_point') {
                        ud.violationPoints = (ud.violationPoints || 0) + 1;
                        if (ud.violationPoints >= 3) {
                            ud.bannedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
                            ud.violationPoints = 0;
                            await userRef.set(ud, { merge: true });
                            addDbStat('write');
                            return interaction.editReply(`✅ 已增加 <@${targetUser.id}> 的違規點數。目前達 3 點，已自動觸發封鎖 7 天！`);
                        }
                        await userRef.set(ud, { merge: true });
                        addDbStat('write');
                        return interaction.editReply(`✅ 已增加 <@${targetUser.id}> 的違規點數。目前累積：${ud.violationPoints} / 3 點。`);
                    } else if (action === 'remove_point') {
                        ud.violationPoints = Math.max(0, (ud.violationPoints || 0) - 1);
                        await userRef.set(ud, { merge: true });
                        addDbStat('write');
                        return interaction.editReply(`✅ 已扣除 <@${targetUser.id}> 的違規點數。目前累積：${ud.violationPoints} / 3 點。`);
                    }
                }
                else if (cmd === '查詢預約') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const { embed, totalPages, currentPage } = generateScheduleEmbed(allReservations, true, 1, true);
                    
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
                    let opData = appSettings['operationMode'] || { autoApprove: false, autoRefreshBoard: false, frozenSlots: [] };

                    if (sub === '自動審核') {
                        const stateStr = interaction.options.getString('狀態');
                        const state = stateStr === 'true';
                        opData.autoApprove = state;
                        await docRef.set(opData, { merge: true });
                        addDbStat('write');
                        return interaction.editReply(`✅ 已將「自動審核」狀態設定為：**${state ? '🟢 開啟 (系統自動接單)' : '🔴 關閉 (維持人工審核)'}**`);
                    } else if (sub === '自動更新看板') {
                        const stateStr = interaction.options.getString('狀態');
                        const state = stateStr === 'true';
                        opData.autoRefreshBoard = state;
                        await docRef.set(opData, { merge: true });
                        addDbStat('write');
                        return interaction.editReply(`✅ 已將「自動更新看板」狀態設定為：**${state ? '🟢 開啟 (每分鐘自動刷新)' : '🔴 關閉 (手動刷新)'}**`);
                    } else if (sub === '新增凍結時段') {
                        const type = interaction.options.getString('類型');
                        const start = interaction.options.getString('開始時間');
                        const end = interaction.options.getString('結束時間');
                        if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
                            return interaction.editReply('❌ 格式錯誤，請輸入例如 `02:00` 的格式喔！');
                        }
                        if (!opData.frozenSlots) opData.frozenSlots = [];
                        opData.frozenSlots.push({ type, start, end });
                        await docRef.set(opData, { merge: true });
                        addDbStat('write');
                        const typeStr = type === 'weekday' ? '平日' : (type === 'weekend' ? '假日' : '平假日');
                        return interaction.editReply(`✅ 已新增凍結時段：${typeStr} \`${start}\` 到 \`${end}\` 期間將自動阻擋預約。`);
                    } else if (sub === '清空凍結時段') {
                        opData.frozenSlots = [];
                        await docRef.set(opData, { merge: true });
                        addDbStat('write');
                        return interaction.editReply(`✅ 已清空所有凍結時段，全時段皆可預約。`);
                    } else if (sub === '查看目前設定') {
                        let desc = `**自動審核狀態**：${opData.autoApprove ? '🟢 開啟 (系統自動接單)' : '🔴 關閉 (維持人工審核)'}\n`;
                        desc += `**自動更新看板**：${opData.autoRefreshBoard ? '🟢 開啟 (每分鐘自動刷新)' : '🔴 關閉 (手動刷新)'}\n\n`;
                        desc += `**目前凍結時段**：\n`;
                        if (opData.frozenSlots && opData.frozenSlots.length > 0) {
                            opData.frozenSlots.forEach(s => {
                                const sType = s.type === 'weekday' ? '平日' : (s.type === 'weekend' ? '假日' : '平假日');
                                desc += `> 🛑 [${sType}] \`${s.start}\` ~ \`${s.end}\`\n`;
                            });
                        } else {
                            desc += '> 無凍結時段';
                        }
                        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x0099FF).setTitle('⚙️ 營運模式設定').setDescription(desc)] });
                    }
                }
                else if (cmd === '清理訊息') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const amount = interaction.options.getInteger('數量');
                    try {
                        await interaction.channel.bulkDelete(amount, true);
                        return interaction.editReply({ content: `✅ 成功清理了 ${amount} 則訊息！` });
                    } catch (e) {
                        return interaction.editReply({ content: `❌ 清理失敗，可能包含超過 14 天的舊訊息。` });
                    }
                }
                else if (cmd === '迴響管理區') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    
                    let channels = [...(appSettings['managementArea']?.channels || [])];
                    
                    if (channels.includes(interaction.channelId)) {
                        channels = channels.filter(id => id !== interaction.channelId);
                        await db.collection('settings').doc('managementArea').set({ channels });
                        addDbStat('write');
                        return interaction.editReply({ content: '✅ 已成功移除迴響管理區。' });
                    } else {
                        channels.push(interaction.channelId);
                        await db.collection('settings').doc('managementArea').set({ channels });
                        addDbStat('write');
                        return interaction.editReply({ content: '✅ **迴響管理區設定成功！**' });
                    }
                }
                else if (cmd === '設定公開看板') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    let list = appSettings['publicBoards']?.list || [];
                    const existingIdx = list.findIndex(b => b.channelId === interaction.channelId);
                    if (existingIdx !== -1) {
                        list.splice(existingIdx, 1);
                        await db.collection('settings').doc('publicBoards').set({ list });
                        addDbStat('write');
                        return interaction.editReply({ content: '✅ 已移除公開看板。' });
                    } else {
                        const msg = await interaction.channel.send({ content: getBoardContentWithTime(), embeds: [new EmbedBuilder().setTitle('載入中...').setColor(0x0099FF)], components: [reserveBtnRow] });
                        list.push({ channelId: interaction.channelId, messageId: msg.id });
                        await db.collection('settings').doc('publicBoards').set({ list });
                        addDbStat('write');
                        await interaction.editReply({ content: '✅ 公開看板設定成功！' });
                        updateBoard();
                    }
                }
                else if (cmd === '設定管理看板') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    let list = appSettings['adminBoards']?.list || [];
                    const existingIdx = list.findIndex(b => b.channelId === interaction.channelId);
                    if (existingIdx !== -1) {
                        list.splice(existingIdx, 1);
                        await db.collection('settings').doc('adminBoards').set({ list });
                        addDbStat('write');
                        return interaction.editReply({ content: '✅ 已移除真實名單看板。' });
                    } else {
                        const tw = getTaiwanTime();
                        const msg = await interaction.channel.send({ content: `🔄 **最後刷新時間**：\`${tw.yyyy}-${tw.mm}-${tw.dd} ${tw.hh}:${tw.min}\``, embeds: [new EmbedBuilder().setTitle('載入中...').setColor(0xFF0000)] });
                        list.push({ channelId: interaction.channelId, messageId: msg.id });
                        await db.collection('settings').doc('adminBoards').set({ list });
                        addDbStat('write');
                        await interaction.editReply({ content: '✅ 管理看板設定成功！' });
                        updateBoard();
                    }
                }
                else if (cmd === '價格') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const loc = interaction.options.getString('地點');
                    const price = interaction.options.getInteger('價格');
                    await db.collection('settings').doc('prices').set({ [loc]: price }, { merge: true });
                    addDbStat('write');
                    await interaction.editReply({ content: `✅ 已將【${loc}】的價格設定為 **${price}萬**。` });
                }
                else if (cmd === '迴響鬧鐘') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const mins = interaction.options.getInteger('分鐘');
                    await db.collection('settings').doc('alarm').set({ leadTime: mins }, { merge: true });
                    addDbStat('write');
                    await interaction.editReply({ content: `✅ 已設定鬧鐘提前 **${mins}分鐘** 發送。` });
                }
                else if (cmd === '優惠設定') {
                    if (!hasAdminPerm) return interaction.editReply({ content: '❌ 權限不足' });
                    const loc = interaction.options.getString('地點');
                    const buy = interaction.options.getInteger('滿幾次');
                    const free = interaction.options.getInteger('送幾次');
                    await db.collection('settings').doc('vipRules').set({ [loc]: { buy, free } }, { merge: true });
                    addDbStat('write');
                    await interaction.editReply({ content: `✅ 已設定【${loc}】優惠規則：滿 **${buy}** 送 **${free}**。` });
                }
                else if (cmd === '我的紀錄') {
                    const tw = getTaiwanTime();
                    const currentMonthPrefix = `${tw.yyyy}-${tw.mm}`;
                    let total = 0, month = 0;
                    allReservations.forEach(d => { 
                        if (d.discordId === interaction.user.id && (d.status === 'approved' || d.status === 'completed' || d.status === 'free')) {
                            total++; 
                            if (d.date.startsWith(currentMonthPrefix)) month++; 
                        }
                    });
                    const userDoc = await db.collection('users').doc(interaction.user.id).get();
                    addDbStat('read');
                    let points = 0;
                    let banStatus = '🟢 正常 (功能皆可使用)';
                    if (userDoc.exists) {
                        const ud = userDoc.data();
                        points = ud.violationPoints || 0;
                        if (ud.bannedUntil && ud.bannedUntil > Date.now()) {
                            const bDate = new Date(ud.bannedUntil + 8 * 3600 * 1000);
                            banStatus = `🔴 預約休息中 (解除：${bDate.getUTCFullYear()}-${String(bDate.getUTCMonth()+1).padStart(2,'0')}-${String(bDate.getUTCDate()).padStart(2,'0')} ${String(bDate.getUTCHours()).padStart(2,'0')}:${String(bDate.getUTCMinutes()).padStart(2,'0')})`;
                        }
                    }
                    const statEmbed = new EmbedBuilder().setColor(0x9B59B6).setTitle(`📊 ${interaction.user.username} 的預約數據`)
                        .addFields({ name: '本月排單', value: `${month} 次`, inline: true }, { name: '近期總單 (90天內)', value: `${total} 次`, inline: true }, { name: '臨時調整', value: `${points} / 3 次`, inline: false }, { name: '帳號狀態', value: banStatus, inline: false });
                    await interaction.editReply({ embeds: [statEmbed] });
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

        // ===================================
        // 👉 B. Buttons (按鈕互動)
        // ===================================
        else if (interaction.isButton()) {
            
            // ------------------------------------------
            // 💎 【公會系統按鈕】
            // ------------------------------------------
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

            // ⚠️ 處理兩邊可能衝突的 approve_ 與 reject_ 前綴
            if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_')) {
                const parts = interaction.customId.split('_');
                const action = parts[0]; 

                // 如果 parts 長度 >= 3，代表是公會的 (approve_userId_classes)
                // 如果 parts[1] 全是數字 (Discord ID)，代表是公會的 reject (reject_userId)
                if ( (action === 'approve' && parts.length >= 3) || (action === 'reject' && /^\d+$/.test(parts[1])) ) {
                    
                    const targetUserId = parts[1];

                    // 【公會：審核通過】
                    if (action === 'approve') {
                        const targetClassesStr = parts[2]; 
                        const requestedClasses = targetClassesStr.split('-');

                        await interaction.deferUpdate(); 
                        
                        try {
                            const originalEmbed = interaction.message.embeds[0];
                            const gameName = originalEmbed.fields.find(f => f.name.includes('遊戲名稱'))?.value.replace(/`/g, '') || '未知';
                            const gameLevel = originalEmbed.fields.find(f => f.name.includes('等級'))?.value.replace(/`/g, '').replace('LV.', '').trim() || '未知';
                            const gameCode = originalEmbed.fields.find(f => f.name.includes('代碼'))?.value.replace(/`/g, '') || '未知';
                            const referrer = originalEmbed.fields.find(f => f.name.includes('引薦人'))?.value.replace(/`/g, '') || '無法追蹤 / 未知';

                            const member = await interaction.guild.members.fetch(targetUserId);
                            const docRef = db.collection('members').doc(targetUserId);
                            const doc = await docRef.get();
                            
                            let finalClasses = [...requestedClasses];

                            await member.roles.remove(config.roles.familyFriend).catch(() => {});

                            let rolesToAdd = [config.roles.guildMember];
                            finalClasses.forEach(cls => {
                                if (config.roles.classes[cls]) rolesToAdd.push(config.roles.classes[cls]);
                            });
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
                    // 【公會：退回申請】
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
                    return; // 公會邏輯處理完畢
                }
            } // end of approve_ & reject_ overlap check

            // ------------------------------------------
            // 👑 【迴響系統按鈕區】
            // ------------------------------------------
            
            if (interaction.customId === 'btn_refresh_board') {
                await interaction.deferUpdate().catch(() => {}); 
                await updateBoard(); 
            }

            else if (interaction.customId.startsWith('agent_nav_') || interaction.customId.startsWith('agent_details_')) {
                await interaction.deferUpdate().catch(() => {});
                const parts = interaction.customId.split('_');
                const agentIds = [...new Set(allReservations.filter(r => r.takenBy && (r.status === 'completed' || r.status === 'failed' || r.status === 'free')).map(r => r.takenBy))];
                
                if (interaction.customId.startsWith('agent_nav_')) {
                    const action = parts[2]; 
                    const currentAgentId = parts[3];
                    let currIdx = agentIds.indexOf(currentAgentId);
                    if (currIdx === -1) currIdx = 0; 
                    if (action === 'prev') currIdx = Math.max(0, currIdx - 1);
                    if (action === 'next') currIdx = Math.min(agentIds.length - 1, currIdx + 1);
                    
                    const targetAgentId = agentIds[currIdx];
                    const { embed, components } = buildAgentStatMessage(targetAgentId);
                    return interaction.editReply({ embeds: [embed], components });
                }
                
                if (interaction.customId.startsWith('agent_details_')) {
                    const agentId = parts[2];
                    const page = parseInt(parts[3]);
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

            // 王團訂單按鈕 (包含 approve, reject, edit, cancel, takeOrder 等)
            else {
                const parts = interaction.customId.split('_');
                const action = parts[0];
                const docId = parts[1];

                if (!docId) return; // 避免未知的按鈕

                if (action === 'approveAgent') {
                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ 權限不足', ephemeral: true });
                    await db.collection('users').doc(docId).set({ isAgent: true, agentStatus: 'approved' }, { merge: true });
                    addDbStat('write');
                    await interaction.message.edit({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ 專員申請已通過').setDescription(`<@${docId}> 已正式成為認證專員 (審核者：<@${interaction.user.id}>)`)], components: [] });
                    
                    try {
                        const member = await interaction.guild.members.fetch(docId);
                        const roleId = getAgentRoleId(interaction.guildId);
                        if (member && roleId) await member.roles.add(roleId);
                    } catch (e) { }

                    try {
                        const targetUser = await client.users.fetch(docId);
                        await targetUser.send('🎉 **恭喜！管理員已通過您的申請，您現在正式成為【迴響專員】囉！**\n您可以開始至頻道接單了！');
                    } catch(e) {}
                    return interaction.reply({ content: '✅ 審核完成，已配發身分組。', ephemeral: true });
                }

                if (action === 'rejectAgent') {
                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ 權限不足', ephemeral: true });
                    await db.collection('users').doc(docId).set({ isAgent: false, agentStatus: 'rejected' }, { merge: true });
                    addDbStat('write');
                    await interaction.message.edit({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ 專員申請已拒絕').setDescription(`<@${docId}> 的申請已被拒絕 (審核者：<@${interaction.user.id}>)`)], components: [] });
                    try {
                        const targetUser = await client.users.fetch(docId);
                        await targetUser.send('🚫 **抱歉，管理員退回了您的【迴響專員】申請。**');
                    } catch(e) {}
                    return interaction.reply({ content: '✅ 已拒絕。', ephemeral: true });
                }

                if (action === 'edit') {
                    const docRef = db.collection('reservations').doc(docId);
                    const doc = await docRef.get();
                    addDbStat('read');
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
                            await db.runTransaction(async (t) => {
                                const doc = await t.get(docRef);
                                addDbStat('read');
                                if (!doc.exists) throw new Error('NOT_FOUND');
                                const data = doc.data();
                                if (data.takenBy) throw new Error('TAKEN'); 
                                
                                t.update(docRef, { takenBy: interaction.user.id });
                            });
                            addDbStat('write');
                            
                            const latestDoc = await docRef.get();
                            addDbStat('read');
                            const data = { id: latestDoc.id, ...latestDoc.data() };
                            const payload = buildTicketPayload(docId, data);
                            await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                            return interaction.followUp({ content: '✅ 成功接單！', ephemeral: true });
                            
                        } catch (error) {
                            if (error.message === 'TAKEN') {
                                return interaction.followUp({ content: '❌ 慢了一步，已經被其他人接走囉！', ephemeral: true });
                            }
                            return interaction.followUp({ content: '❌ 找不到訂單或發生錯誤。', ephemeral: true });
                        }
                    }

                    const doc = await docRef.get();
                    addDbStat('read');
                    if (!doc.exists) return interaction.followUp({ content: '❌ 找不到此訂單（可能已被刪除）。', ephemeral: true });
                    let data = doc.data();
                    data.id = doc.id;

                    if (action === 'approve') {
                        if (data.status !== 'pending') return interaction.followUp({ content: '❌ 訂單已處理過囉！', ephemeral: true });
                        data.status = 'approved';
                        data.reviewer = interaction.user.id;
                        await docRef.update({ status: data.status, reviewer: data.reviewer });
                        addDbStat('write');
                        
                        const payload = buildTicketPayload(docId, data);
                        await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                        
                        const dmEmbed = new EmbedBuilder().setColor(0x00FF00).setTitle('✅ 預約已通過').setDescription(`**地點**：${data.location}\n**時間**：${data.date} ${data.time}`);
                        const btnRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`edit_${docId}`).setLabel('✏️ 變更登記資料').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`cancel_${docId}`).setLabel('🗑️ 取消預約').setStyle(ButtonStyle.Danger)
                        );
                        await editUserDM(data.discordId, data.userDmMsgId, { embeds: [dmEmbed], components: [btnRow] });
                        updateBoard();
                        return;
                    }

                    if (action === 'release') {
                        if (data.postChecked) {
                            return interaction.followUp({ content: '❌ 訂單已經進入結案確認階段，無法釋出轉單，請直接結案！', ephemeral: true });
                        }
                        if (data.takenBy !== interaction.user.id) {
                            return interaction.followUp({ content: '❌ 只有目前的接單專員可以釋出此訂單！', ephemeral: true });
                        }
                        data.takenBy = null;
                        await docRef.update({ takenBy: null });
                        addDbStat('write');
                        
                        const payload = buildTicketPayload(docId, data);
                        const newRefs = await bumpManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                        await docRef.update({ ticketMsgs: newRefs });
                        addDbStat('write');
                        return interaction.followUp({ content: '✅ 已成功釋出訂單，等待其他專員接手。', ephemeral: true });
                    }

                    if (action === 'complete' || action === 'fail' || action === 'free') {
                        if (data.status === 'completed' || data.status === 'failed' || data.status === 'free') {
                            return interaction.followUp({ content: '❌ 已經結案過了！', ephemeral: true });
                        }
                        if (data.takenBy && data.takenBy !== interaction.user.id) {
                            return interaction.followUp({ content: `❌ 只有專員 <@${data.takenBy}> 才能確認結案！`, ephemeral: true });
                        }

                        if (action === 'complete') data.status = 'completed';
                        else if (action === 'free') data.status = 'free';
                        else data.status = 'failed';

                        data.closer = interaction.user.id;
                        if (!data.takenBy) data.takenBy = interaction.user.id;

                        await docRef.update({ status: data.status, closer: data.closer, takenBy: data.takenBy });
                        addDbStat('write');
                        
                        const payload = buildTicketPayload(docId, data);
                        await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);
                        try { await interaction.editReply({ components: [] }); } catch(e){}

                        if (action === 'complete') {
                            const blessingEmbed = new EmbedBuilder().setColor(0xFFD700).setTitle('🎊 【訂單圓滿完成】')
                                .setDescription(`**地點**：${data.location}\n**時間**：${data.date} ${data.time}\n\n感謝您的惠顧！\n祝您這趟王團 **寶物大豐收、掉寶順利** 🍀\n期待下次再為您服務喔～`);
                            await editUserDM(data.discordId, data.userDmMsgId, { embeds: [blessingEmbed], components: [] });
                        } else if (action === 'free') {
                            const freeEmbed = new EmbedBuilder().setColor(0xFFD700).setTitle('🎁 【專員招待！本次免單】')
                                .setDescription(`**地點**：${data.location}\n**時間**：${data.date} ${data.time}\n\n專員為您標記了本次服務為 **免單招待**！🎉\n祝您武運昌隆，期待下次再見！`);
                            await editUserDM(data.discordId, data.userDmMsgId, { embeds: [freeEmbed], components: [] });
                        }

                        updateBoard();
                        return;
                    }

                    if (data.timestamp < Date.now()) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x808080).setTitle('📜 歷史紀錄').setDescription(`預約時間已過。`)], components: [] });
                    
                    if (action === 'cancel') {
                        const isLastMinute = (data.timestamp - Date.now()) <= 30 * 60 * 1000;
                        const wasApproved = data.status === 'approved';
                        
                        data.status = 'canceled';
                        await docRef.update({ status: 'canceled' });
                        addDbStat('write');
                        
                        const payload = buildTicketPayload(docId, data);
                        await syncManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);

                        let replyText = '✅ **訂單已取消**。';
                        if (isLastMinute && wasApproved) {
                            const { points, bannedUntil } = await addViolation(data.discordId);
                            if (bannedUntil) replyText += `\n💡 系統通知：暫停預約權限 7 天。`;
                            else replyText += `\n💡 溫馨提醒：已記錄一次臨時調整（目前：${points}/3）。`;
                        }
                        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('🚫 訂單已取消').setDescription(`**地點**：${data.location}\n**時間**：${data.date} ${data.time}`)], components: [] });
                        await interaction.followUp({ content: replyText, ephemeral: true });
                        updateBoard();
                    }
                }
            } // end of echo buttons
        }

        // ===================================
        // 👉 C. String Select Menus (下拉式選單)
        // ===================================
        else if (interaction.isStringSelectMenu()) {
            
            // ------------------------------------------
            // 💎 【公會系統選單】
            // ------------------------------------------
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
                const doc = await docRef.get();
                const data = doc.data();
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
                const doc = await docRef.get();
                const data = doc.data();
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
                const targetUserId = parts[3];
                const msgId = parts[4];
                const reason = interaction.values[0];

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
                await processRejection(docId, reason, interaction.user.id, interaction);
            }
            if (interaction.customId === 'select_delete_order') {
                await interaction.deferUpdate().catch(() => {});
                const docId = interaction.values[0];
                const targetOrder = allReservations.find(r => r.id === docId);
                
                await db.collection('reservations').doc(docId).delete();
                addDbStat('write');
                
                if (targetOrder && targetOrder.ticketMsgs) {
                    for (const m of targetOrder.ticketMsgs) {
                        try {
                            const ch = await client.channels.fetch(m.channelId).catch(() => null);
                            if (ch) {
                                const msg = await ch.messages.fetch(m.messageId).catch(() => null);
                                if (msg) await msg.delete().catch(() => null);
                            }
                        } catch (e) {}
                    }
                }
                
                setTimeout(() => { updateBoard(); }, 1500); 
                return interaction.editReply({ content: `✅ 已成功從資料庫徹底刪除該筆訂單紀錄！`, components: [] });
            }
        }

        // ===================================
        // 👉 D. Modal Submit (彈出式表單提交)
        // ===================================
        else if (interaction.isModalSubmit()) {
            
            // ------------------------------------------
            // 💎 【公會系統表單】
            // ------------------------------------------
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
                            if (attachment) {
                                embed.setImage(`attachment://${attachment.name}`);
                                messageOptions.files = [attachment];
                            }
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
                        } else {
                            await m.reply(`✅ 收到指示！已略過截圖步驟，你的申請單已經送出給幹部審核囉！請靜候佳音。`);
                        }
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
                    finalClasses.forEach(cls => {
                        if (config.roles.classes[cls]) rolesToAdd.push(config.roles.classes[cls]);
                    });
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
                } catch (error) { 
                    return interaction.editReply({ content: '❌ 處理失敗，請確認機器人身分組階級是否在親友團之上。' }); 
                }
            }

            if (interaction.customId.startsWith('modal_reject_custom_')) {
                const parts = interaction.customId.split('_');
                const targetUserId = parts[3];
                const msgId = parts[4];
                const reason = interaction.fields.getTextInputValue('reject_reason');
                
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
                } catch (error) { 
                    return interaction.editReply({ content: '❌ 無法發送私訊通知該成員。' }); 
                }
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
                } catch (error) { 
                    return interaction.editReply({ content: '❌ 更新失敗，請稍後再試。' }); 
                }
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

                    const isConflict = allReservations.some(res => res.location === location && Math.abs(targetTimeMs - res.timestamp) < 10 * 60 * 1000 && res.status === 'approved');
                    if (isConflict) {
                        return interaction.editReply({ content: `❌ **時段衝突**：第 ${i+1} 場（${tTime}）前後10分鐘已有排單，無法完成連續預約。` });
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
                        timestamp: slot.targetTimeMs, reminded: false, takenBy: null, postChecked: false, userDmMsgId: null, buttonsRemoved: false,
                        status: autoApprove ? 'approved' : 'pending',
                        reviewer: autoApprove ? '系統自動' : null
                    };
                    
                    const docRef = await db.collection('reservations').add(data);
                    addDbStat('write');
                    data.id = docRef.id;

                    const payload = buildTicketPayload(docRef.id, data);
                    const sentMsgs = await broadcastToManagementAreas(payload);
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
                            await docRef.update({ userDmMsgId: dmMsg.id });
                            addDbStat('write');
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
                
                if (autoApprove) updateBoard();
            }

            if (interaction.customId.startsWith('submitReject_')) {
                await interaction.deferUpdate().catch(() => {});
                const docId = interaction.customId.split('_')[1];
                const reason = interaction.fields.getTextInputValue('reason');
                await processRejection(docId, reason, interaction.user.id, interaction);
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
                newDate = formattedDate;
                newTime = formattedTime;
                const newDateTime = parsedDate;

                if (isNaN(newDateTime.getTime())) return interaction.followUp({ content: '❌ 格式錯誤，請確認日期格式。', ephemeral: true });
                if (newDateTime.getTime() <= Date.now()) return interaction.followUp({ content: '❌ 無法改為過去的時間。', ephemeral: true });

                const opMode = appSettings['operationMode'] || {};
                const frozenSlots = opMode.frozenSlots || [];
                const autoApprove = opMode.autoApprove || false;

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
                    const isConflict = allReservations.some(res => res.id !== docId && res.location === data.location && Math.abs(newDateTime.getTime() - res.timestamp) < 10 * 60 * 1000 && res.status === 'approved');
                    if (isConflict) return interaction.followUp({ content: '❌ 申請時間前後10分鐘已排單。', ephemeral: true });
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
                const newRefs = await bumpManagementMessages(data.ticketMsgs, payload.embeds[0], payload.components);

                await db.collection('reservations').doc(docId).update({ 
                    discordName: data.discordName,
                    date: newDate, time: newTime, gameId: newGameId, channel: newChannel, notes: newNotes,
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

                updateBoard();
            }
        }

    } catch (globalError) {
        if (globalError.code === 10062) return; 
        console.error("🚨 互動處理發生未預期錯誤：", globalError);
    }
});

// ==========================================
// 9. 啟動機器人登入
// ==========================================
const safeToken = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.trim() : null;
if (!safeToken) {
    console.error("❌ [錯誤] 系統抓不到 DISCORD_TOKEN！");
}

client.login(safeToken).then(() => {
    console.log('✅ Discord Token 驗證成功，正在登入...');
}).catch(error => {
    console.error("❌ [致命錯誤] Discord 拒絕了登入連線：", error);
});
