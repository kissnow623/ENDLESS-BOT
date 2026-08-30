// config/constants.js

const ALLOWED_GUILDS = ['1466073297169940543', '1536011422323179631', '1536416054832799795', '1539475243733622794']; 

const AGENT_ROLE_MAP = {
    'default': '1541411576228093963', 
};

const ADMIN_ROLES = [
    '1539508532846526494', // 幹部身分組 1
    '1539959330726486036'  // 幹部身分組 2
];

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

module.exports = {
    ALLOWED_GUILDS,
    AGENT_ROLE_MAP,
    getAgentRoleId,
    config,
    classOptionsList,
    welcomeMessages,
    welcomeFriendMessages,
    boosterRedCarpetMessages,
    boostBannerImages
};
