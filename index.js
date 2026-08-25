require('dotenv').config();

// ==========================================
// 🌐 0️⃣ 強制使用 IPv4 (破解 Render 網路黑洞)
// ==========================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { 
    Client, GatewayIntentBits, Partials, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, EmbedBuilder, REST, Routes,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    PermissionFlagsBits, ApplicationCommandOptionType,
    MessageFlags // 🌟 新增：用於替換過時的 ephemeral 寫法
} = require('discord.js');
const express = require('express');
const admin = require('firebase-admin');

// ==========================================
// 1️⃣ Firebase 驗證與初始化
// ==========================================
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
    console.error("❌ [錯誤] Firebase 金鑰解析失敗！");
    process.exit(1); 
}
if (serviceAccount && !admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Firestore 連線成功！");
}
const db = admin.firestore();

// ==========================================
// 👑 幹部與管理員設定專區
// ==========================================
const ADMIN_ROLES = [
    '1539508532846526494', // 幹部身分組 1
    '1539959330726486036'  // 幹部身分組 2
];

// ==========================================
// 🔧 2️⃣ 參數設定區與總開關
// ==========================================
const config = {
    guildId: '1539475243733622794', 
    features: {
        // 🌟 星光紅毯總開關：false (關閉隱藏), true (開啟啟用)
        redCarpetEnabled: false 
    },
    channels: { 
        approval: '1539972747545808937',
        welcome: '1539971422842261601',       
        welcomeFriend: '1539904561941188608',
        boostThanks: '1540726577443115109', // 🌟 Server Boost 感謝卡推播頻道
        chatLounge: '1539904561941188608',   // 🌟 星光紅毯鋪設頻道
        leaderboardChannel: '這裡填入你想要發布排行榜的頻道ID' // 🌟 新增：每月自動發布排行榜的頻道
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

// Booster：30 款浮誇出場台詞 (暫時隱藏不使用)
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

async function updateNickname(member, gameName, roleType, classesArray) {
    const icon = roleType === '公會成員' ? '🌟' : '🍁';
    const classesStr = classesArray.join('｜');
    let newNick = `${gameName} ${icon} ${classesStr}`; 
    if (newNick.length > 32) newNick = newNick.substring(0, 32); 
    try { await member.setNickname(newNick); } catch (e) { console.log(`⚠️ 無法修改 ${member.user.tag} 的暱稱`); }
    return newNick;
}

// ==========================================
// 🌟 核心函式：公會成員排行榜格式化 (已加入容錯)
// ==========================================
async function generateMemberLeaderboard() {
    try {
        const snapshot = await db.collection('members').where('role', '==', '公會成員').get();
        if (snapshot.empty) return '目前資料庫中沒有公會成員紀錄。';
        
        let members = [];
        snapshot.forEach(doc => members.push(doc.data()));
        
        // 加入容錯：確保非數字內容不會破壞排序
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

// ==========================================
// 🌟 核心函式：親友團排行榜格式化
// ==========================================
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

// ==========================================
// 🌟 共用核心函式：發布高質感加成感謝卡片
// ==========================================
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
// 🌐 3️⃣ 建立 Express 伺服器
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('✅ Artale ENDLESS-BOT is running online!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 網頁伺服器已啟動於 Port ${PORT}`));

// ==========================================
// 🤖 4️⃣ 建立 Discord Client 與 指令註冊
// ==========================================
const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent ],
    partials: [ Partials.User, Partials.GuildMember, Partials.Channel, Partials.Message ]
});

client.once('clientReady', async () => {
    console.log(`🤖 機器人登入成功：${client.user.tag}!`);
    const adminPerms = PermissionFlagsBits.Administrator.toString();

    // 🌟 星光紅毯設定指令被註解隱藏，不會顯示在指令清單中
    const commands = [
        { name: '解鎖權限', description: '發布加入 ENDLESS 或是成為親友團的申請面板 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '發布小指南', description: '發布 ENDLESS 實用功能小指南面板 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '查詢目前公會成員', description: '查詢公會成員列表與總人數 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '查詢目前親友團', description: '查詢親友團成員列表與總人數 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '同步更名', description: '批次同步資料庫中所有成員的最新暱稱格式與符號 (僅限幹部)', default_member_permissions: adminPerms },
        { name: '檢查補發感謝', description: '【幹部專屬】掃描伺服器所有加成者，自動為錯過的乾爹乾媽補發感謝卡！', default_member_permissions: adminPerms },
        { name: '測試感謝卡', description: '【幹部專屬】發送一張私密測試用的加成感謝卡 (僅自己可見)', default_member_permissions: adminPerms },
        { 
            name: '重播感謝卡', 
            description: '【幹部專屬】強制公開重播指定玩家的加成感謝卡 (不管以前有沒有發過)', 
            default_member_permissions: adminPerms,
            options: [{ name: '玩家', description: '請選擇您要重新感謝的加成者', type: ApplicationCommandOptionType.User, required: true }]
        },
        { 
            name: '清除資料', description: '清除指定成員的資料庫紀錄與身分組 (僅限幹部)', default_member_permissions: adminPerms,
            options: [{ name: '目標', description: '請選擇要重置資料的成員', type: ApplicationCommandOptionType.User, required: true }]
        },
        {
            name: '清除訊息', description: '快速清除當前頻道指定數量的訊息 (僅限幹部)', default_member_permissions: adminPerms,
            options: [{ name: '數量', description: '請輸入要清除的訊息數量 (1 到 100)', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 100 }]
        }
        /* 
        🌟 未來如果需要重新開放，只要把這段註解解開即可
        ,{
            name: '星光紅毯設定',
            description: '【Booster專屬】開啟或關閉您每日首次發言的浮誇出場台詞！',
            options: [{
                name: '狀態', description: '您要開啟還是關閉紅毯出場設定？', type: ApplicationCommandOptionType.String, required: true,
                choices: [ { name: '🟢 開啟浮誇出場', value: 'on' }, { name: '🔴 關閉低調潛水', value: 'off' } ]
            }]
        }
        */
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, config.guildId), { body: commands });
        console.log('✅ 指令註冊完成！');
    } catch (error) { console.error('❌ 指令註冊失敗：', error); }

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
    } catch (err) { console.error('❌ 啟動掃描加成者失敗：', err); }
    
    scheduleMonthlyLeaderboard();
});

// ==========================================
// 🚀 每月初自動發布排行榜邏輯 (修復 24.8 天上限限制)
// ==========================================
function scheduleMonthlyLeaderboard() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0); 
    const timeUntilNextMonth = nextMonth.getTime() - now.getTime();
    
    const MAX_TIMEOUT = 2147483647; // Node.js setTimeout 最大值 (約 24.8 天)

    if (timeUntilNextMonth > MAX_TIMEOUT) {
        // 如果超過上限，先等待 24 天，然後再重新計算
        setTimeout(scheduleMonthlyLeaderboard, MAX_TIMEOUT);
    } else {
        // 如果在安全範圍內，設定實際發布的計時器
        setTimeout(async () => {
            try {
                const guild = client.guilds.cache.get(config.guildId);
                if (!guild) return;

                const channelId = config.channels.leaderboardChannel;
                if (!channelId || channelId === '這裡填入你想要發布排行榜的頻道ID') return;

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return;

                const memberEmbed = await generateMemberLeaderboard();
                const friendEmbed = await generateFriendLeaderboard();

                if (memberEmbed && typeof memberEmbed !== 'string') await targetChannel.send({ embeds: [memberEmbed] });
                if (friendEmbed && typeof friendEmbed !== 'string') await targetChannel.send({ embeds: [friendEmbed] });

            } catch (error) {
                console.error('❌ 自動發佈排行榜時發生錯誤：', error);
            } finally {
                // 發布完成後，重新排程下個月
                scheduleMonthlyLeaderboard();
            }
        }, timeUntilNextMonth);
    }
}

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const boostChannel = await client.channels.fetch(config.channels.boostThanks).catch(() => null);
        await checkAndThankBooster(newMember, boostChannel, 'normal');
    }
});

// ==========================================
// 🚀 Booster 星光紅毯系統 (目前預設關閉)
// ==========================================
client.on('messageCreate', async message => {
    // 🌟 如果總開關是 false，直接略過所有紅毯邏輯
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

        } catch (err) { console.error('❌ 星光紅毯觸發失敗：', err); }
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const cmd = interaction.commandName;
            const isOwner = interaction.user.id === interaction.guild?.ownerId; 
            const hasAdminRole = interaction.member.roles.cache.hasAny(...config.roles.adminRoles); 
            const hasAdminPerm = interaction.member.permissions.has(PermissionFlagsBits.Administrator); 

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

            // 確保權限控管
            if ((cmd === '解鎖權限' || cmd === '發布小指南' || cmd === '查詢目前公會成員' || cmd === '查詢目前親友團' || cmd === '同步更名' || cmd === '檢查補發感謝' || cmd === '測試感謝卡' || cmd === '重播感謝卡' || cmd === '清除資料' || cmd === '清除訊息') && !isOwner && !hasAdminRole && !hasAdminPerm) {
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

        // 🔘 按鈕點擊
        if (interaction.isButton()) {
            if (interaction.customId === 'btn_member' || interaction.customId === 'btn_friend') {
                const isMember = interaction.customId === 'btn_member';
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_class_${isMember ? 'member' : 'friend'}`)
                    .setPlaceholder('請選擇您的遊戲職業 (可多選)...')
                    .setMinValues(1)
                    .setMaxValues(4)
                    .addOptions(classOptionsList);
                return interaction.reply({ 
                    content: isMember ? '您選擇了「公會成員」，請選擇您的職業 (可多選)：' : '您選擇了「親友團」，請選擇您的職業 (可多選)：', 
                    components: [new ActionRowBuilder().addComponents(selectMenu)],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.customId.startsWith('approve_')) {
                const parts = interaction.customId.split('_');
                const targetUserId = parts[1];
                const targetClassesStr = parts[2]; 
                const requestedClasses = targetClassesStr.split('-');

                await interaction.deferUpdate(); 
                
                try {
                    const originalEmbed = interaction.message.embeds[0];
                    const gameName = originalEmbed.fields.find(f => f.name.includes('遊戲名稱'))?.value.replace(/`/g, '') || '未知';
                    const gameLevel = originalEmbed.fields.find(f => f.name.includes('等級'))?.value.replace(/`/g, '').replace('LV.', '').trim() || '未知';
                    const gameCode = originalEmbed.fields.find(f => f.name.includes('代碼'))?.value.replace(/`/g, '') || '未知';

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
                        gameClasses: finalClasses, gameLevel: gameLevel, gameCode: gameCode, role: '公會成員', 
                        joinDate: doc.exists && doc.data().joinDate ? doc.data().joinDate : admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    await updateNickname(member, gameName, '公會成員', finalClasses);

                    const passedMsg = `🎉 **太棒了！狂賀！** 🎉\n你的申請已經正式通過啦！歡迎成為 ENDLESS 大家庭的一份子！🥳\n現在，伺服器裡的所有專屬頻道都已經為你解鎖囉！趕快進去跟大家打個招呼、找人一起練功打王吧！衝呀～～🚀`;
                    await member.send(passedMsg).catch(() => {});

                    const updatedEmbed = EmbedBuilder.from(originalEmbed).setColor('#00FF00').setTitle('✅ 審核已通過').setFooter({ text: `由 ${interaction.user.tag} 批准`, iconURL: interaction.user.displayAvatarURL() });
                    await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

                    try {
                        const welcomeChannel = await client.channels.fetch(config.channels.welcome);
                        if (welcomeChannel) {
                            const randomMsg = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)](targetUserId);
                            await welcomeChannel.send(randomMsg);
                        }
                    } catch (err) {}

                } catch (error) { return interaction.followUp({ content: '❌ 處理失敗，請確認機器人權限。', flags: MessageFlags.Ephemeral }); }
            }

            if (interaction.customId.startsWith('reject_')) {
                const targetUserId = interaction.customId.split('_')[1];
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
        }

        // 🔘 下拉式選單
        if (interaction.isStringSelectMenu()) {
            
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
                    } catch (error) { return interaction.editReply({ content: '❌ 無法發送私訊通知該成員。', components: [] }); }
                }
            }
        }

        // 🔘 彈出式表單提交
        if (interaction.isModalSubmit()) {
            
            if (interaction.customId.startsWith('modal_member_')) {
                const selectedClassesStr = interaction.customId.replace('modal_member_', '');
                const classesForDisplay = selectedClassesStr.replace(/-/g, '｜');
                const name = interaction.fields.getTextInputValue('game_name');
                const level = interaction.fields.getTextInputValue('game_level');
                const code = interaction.fields.getTextInputValue('game_code');
                
                await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

                const sendToApprovalChannel = async (attachment = null, timeoutNote = false) => {
                    try {
                        const channel = await client.channels.fetch(config.channels.approval);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setTitle('🛡️ ENDLESS | 新成員入會申請')
                                .setDescription(`**<@${interaction.user.id}>** 提交了公會成員申請，請幹部進行審核。`)
                                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                                .addFields(
                                    { name: '👤 遊戲名稱', value: `\`${name}\``, inline: true },
                                    { name: '📈 等級', value: `\`LV. ${level}\``, inline: true },
                                    { name: '⚔️ 職業', value: `\`${classesForDisplay}\``, inline: true }, 
                                    { name: '🔑 遊戲代碼', value: `\`${code}\``, inline: true }
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
                } catch (error) { return interaction.editReply({ content: '❌ 處理失敗，請確認機器人身分組階級是否在親友團之上。' }); }
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
        }
    } catch (globalError) {
        // 🌟 新增：忽略 DiscordAPIError[10062] (機器人重啟時，玩家送出的互動超時)
        if (globalError.code === 10062) return; 
        console.error("🚨 互動處理發生未預期錯誤：", globalError);
    }
});

// ==========================================
// 💌 5️⃣ 處理新成員離開
// ==========================================
client.on('guildMemberRemove', async member => {
    try {
        const doc = await db.collection('members').doc(member.id).get();
        if (doc.exists) {
            await db.collection('members').doc(member.id).delete();
            console.log(`🧹 偵測到成員 ${member.user.tag} 離開伺服器，已自動清除其 Firebase 紀錄。`);
        }
    } catch (error) { console.error("❌ 清除離開成員資料失敗：", error); }
});

// ==========================================
// 🚀 6️⃣ 啟動機器人
// ==========================================
const safeToken = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.trim() : null;

if (!safeToken) {
    console.error("❌ [錯誤] 系統抓不到 DISCORD_TOKEN！");
} else {
    console.log(`🔍 [檢查] 目前使用的 Token 前四碼為：${safeToken.substring(0, 4)}***`);
}

client.login(safeToken).catch(error => {
    console.error("❌ [致命錯誤] Discord 拒絕了登入連線：", error);
});
