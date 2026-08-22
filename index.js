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
    PermissionFlagsBits, ApplicationCommandOptionType 
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
// 🔧 2️⃣ 參數設定區
// ==========================================
const config = {
    guildId: '1539475243733622794', 
    channels: { 
        approval: '1539972747545808937',
        welcome: '1539971422842261601' 
    },
    roles: {
        adminRoles: ['1539508532846526494', '1539959330726486036'], 
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
    (userId) => `🏆 號外號外！據說實力超強、顏值超高的 <@${userId}> 選擇加入了 ENDLESS！😎 各位小夥伴快出來排隊歡迎，以後打寶掉寶率就靠你加持啦！✨`
];

// 🌟 輔助函式：產生全新簡潔格式的暱稱
async function updateNickname(member, gameName, roleType, classesArray) {
    const icon = roleType === '公會成員' ? '🌟' : '🌜';
    const classesStr = classesArray.join('｜');
    let newNick = `${gameName} ${icon} ${classesStr}`; // 格式：幸運花花 🌟 黑騎士｜主教
    
    if (newNick.length > 32) newNick = newNick.substring(0, 32); 
    
    try { await member.setNickname(newNick); } catch (e) { console.log(`⚠️ 無法修改 ${member.user.tag} 的暱稱`); }
    return newNick;
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
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent    
    ],
    partials: [ Partials.User, Partials.GuildMember, Partials.Channel, Partials.Message ]
});

client.once('clientReady', async () => {
    console.log(`🤖 機器人登入成功：${client.user.tag}!`);
    const commands = [
        { name: '解鎖權限', description: '發布加入 ENDLESS 或是成為親友團的申請面板' },
        { name: '查詢目前公會成員', description: '查詢公會成員列表與總人數 (僅限幹部)' },
        { name: '查詢目前親友團', description: '查詢親友團成員列表與總人數 (僅限幹部)' },
        { name: '更新資料', description: '更新您的遊戲名稱或等級 (同步修改暱稱)' },
        { name: '刪除職業', description: '刪除您已登記的職業分身 (同步更新身分組與暱稱)' }, // 🌟 新增指令
        { 
            name: '清除資料', description: '清除指定成員的資料庫紀錄與身分組 (僅限幹部)',
            options: [{ name: '目標', description: '請選擇要重置資料的成員', type: ApplicationCommandOptionType.User, required: true }]
        },
        {
            name: '清除訊息', description: '快速清除當前頻道指定數量的訊息 (僅限幹部)',
            options: [{ name: '數量', description: '請輸入要清除的訊息數量 (1 到 100)', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 100 }]
        }
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, config.guildId), { body: commands });
        console.log('✅ 指令註冊完成！');
        setInterval(checkAnniversaries, 24 * 60 * 60 * 1000);
        checkAnniversaries();
    } catch (error) { console.error('❌ 指令註冊失敗：', error); }
});

// ==========================================
// 🎁 每日巡邏：檢查入群週年並發送溫馨私訊
// ==========================================
async function checkAnniversaries() {
    try {
        const snapshot = await db.collection('members').get();
        if (snapshot.empty) return;
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${now.getMonth() + 1}`; 
        snapshot.forEach(async doc => {
            const data = doc.data();
            if (!data.joinDate) return;
            const joinDate = data.joinDate.toDate();
            const monthDiff = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth());
            const dayDiff = now.getDate() - joinDate.getDate();
            if (dayDiff === 0 && [1, 3, 6, 12].includes(monthDiff)) {
                if (data.lastCongratulated === currentMonthStr) return;
                const guild = client.guilds.cache.get(config.guildId);
                if (!guild) return;
                const member = await guild.members.fetch(data.discordId).catch(() => null);
                if (member) {
                    let msg = '';
                    const isMember = data.role === '公會成員';
                    if (monthDiff === 1) msg = isMember ? `🎉 哇喔！不知不覺你加入 **ENDLESS** 大家庭已經滿 **1 個月**啦！🍄\n這段時間還習慣嗎？有空多來語音頻道找大家聊天打屁，或是揪團一起練功打王喔！🛡️ 我們都在等你～` : `🎈 嗨嗨！不知不覺你來到 **ENDLESS** 伺服器跟我們玩耍滿 **1 個月**啦！☕\n超開心有你這個好朋友常來串門子，有空記得多來語音頻道跟大家聊聊天、分享生活喔！🎮✨`;
                    if (monthDiff === 3) msg = isMember ? `✨ 叮咚！你在 **ENDLESS** 陪伴大家滿 **3 個月**囉！🍁\n感謝你這段時間的熱血參與，公會因為有你變得更熱鬧、更強大了！⚔️ 今晚要不要來頻道一起刷副本、打個王呢？🍗` : `🎵 叮咚！你在 **ENDLESS** 陪伴大家滿 **3 個月**囉！🌟\n雖然你是親友團，但我們早就把你當成一家人啦！感謝你總是帶來歡樂，別忘了常回來看我們唷！🥰🍻`;
                    if (monthDiff === 6) msg = isMember ? `🏰 太感動啦！半年的時光飛逝，你在 **ENDLESS** 滿 **6 個月**了！💎\n這半年來辛苦啦，無論是尬聊還是熬夜打裝備，你的存在都是公會最寶貴的力量！🚀 讓我們繼續並肩作戰吧！🔥` : `💖 哇！時光飛逝，你成為 **ENDLESS** 的專屬親友已經滿 **6 個月**了！🥂\n這半年來有你的陪伴真的超棒，無論是打屁哈啦還是掛機聽歌，這裡永遠有你的一個位置！🏠✨`;
                    if (monthDiff === 12) msg = isMember ? `👑 太神啦！！你在 **ENDLESS** 迎來了最高榮耀的 **1 週年紀念日**！🏆🎊\n一年 365 天的陪伴真的非常不容易，你已經是公會無可取代的核心靈魂了！💯 未來的冒險篇章，也請你多多指教喔！🎆🎇` : `🏆 太神啦！！你在 **ENDLESS** 迎來了超讚的 **1 週年紀念日**！🎉🎂\n能有一整年的陪伴真的超級難得，你已經是我們最最最重視的摯友了！💯 未來的日子，也要繼續一起開開心心地玩耍喔！🎆🎇`;
                    await member.send(msg).catch(() => {});
                    await db.collection('members').doc(data.discordId).update({ lastCongratulated: currentMonthStr });
                }
            }
        });
    } catch (error) { console.error("❌ 週年巡邏發生錯誤：", error); }
}

// ==========================================
// 處理所有互動
// ==========================================
client.on('interactionCreate', async interaction => {
    try {
        // 🔘 斜線指令
        if (interaction.isChatInputCommand()) {
            const cmd = interaction.commandName;
            const isOwner = interaction.user.id === interaction.guild?.ownerId; 
            const hasAdminRole = interaction.member.roles.cache.hasAny(...config.roles.adminRoles); 
            const hasAdminPerm = interaction.member.permissions.has(PermissionFlagsBits.Administrator); 

            if ((cmd === '解鎖權限' || cmd === '查詢目前公會成員' || cmd === '查詢目前親友團' || cmd === '清除資料' || cmd === '清除訊息') && !isOwner && !hasAdminRole && !hasAdminPerm) {
                return interaction.reply({ content: '❌ 很抱歉，此管理指令僅限幹部使用。', ephemeral: true });
            }

            if (cmd === '解鎖權限') {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_member').setLabel('公會成員').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_friend').setLabel('親友團').setStyle(ButtonStyle.Success)
                );
                const welcomeMessage = "🎈 **叮咚！歡迎光臨 ENDLESS！** 🎈\n終於等到你啦！為了讓你能在伺服器裡暢通無阻地跟大家聊天，請先偷偷告訴我們，你是我們的……？（點擊下方按鈕選擇身分唷！）👇";
                return interaction.reply({ content: welcomeMessage, components: [row] });
            }

            if (cmd === '查詢目前公會成員') {
                await interaction.deferReply({ ephemeral: true }); 
                try {
                    const snapshot = await db.collection('members').where('role', '==', '公會成員').get();
                    if (snapshot.empty) return interaction.editReply('目前資料庫中沒有公會成員紀錄。');
                    let members = [];
                    snapshot.forEach(doc => members.push(doc.data()));
                    members.sort((a, b) => parseInt(b.gameLevel) - parseInt(a.gameLevel));
                    let description = `目前公會總人數：**${members.length}** 人\n\n**【 成員等級排行榜 】**\n`;
                    members.forEach((m, index) => { 
                        const classes = m.gameClasses ? m.gameClasses.join('｜') : m.gameClass;
                        description += `${index + 1}. **${m.gameName}** (LV.${m.gameLevel}) - ${classes}\n`; 
                    });
                    const embed = new EmbedBuilder().setTitle('🛡️ ENDLESS 公會成員名冊').setDescription(description.substring(0, 4000)).setColor('#FFD700');
                    return interaction.editReply({ embeds: [embed] });
                } catch (error) { return interaction.editReply('❌ 查詢資料庫時發生錯誤。'); }
            }

            if (cmd === '查詢目前親友團') {
                await interaction.deferReply({ ephemeral: true }); 
                try {
                    const snapshot = await db.collection('members').where('role', '==', '親友團').get();
                    if (snapshot.empty) return interaction.editReply('目前資料庫中沒有親友團紀錄。');
                    let members = [];
                    snapshot.forEach(doc => members.push(doc.data()));
                    members.sort((a, b) => (a.joinDate?.toDate() || 0) - (b.joinDate?.toDate() || 0));
                    let description = `目前親友團總人數：**${members.length}** 人\n\n**【 🌙 親友團名單 】**\n`;
                    members.forEach((m, index) => { 
                        const classes = m.gameClasses ? m.gameClasses.join('｜') : m.gameClass;
                        description += `${index + 1}. **${m.gameName}** - ${classes}\n`; 
                    });
                    const embed = new EmbedBuilder().setTitle('🌙 ENDLESS 親友團名冊').setDescription(description.substring(0, 4000)).setColor('#FF99CC');
                    return interaction.editReply({ embeds: [embed] });
                } catch (error) { return interaction.editReply('❌ 查詢資料庫時發生錯誤。'); }
            }

            if (cmd === '更新資料') {
                const modal = new ModalBuilder().setCustomId('modal_update_data').setTitle('更新遊戲資料');
                // 🌟 更新表單標題
                const q1 = new TextInputBuilder().setCustomId('update_name').setLabel("新遊戲名稱/暱稱").setStyle(TextInputStyle.Short);
                const q2 = new TextInputBuilder().setCustomId('update_level').setLabel("目前最新等級 (親友團可不填)").setStyle(TextInputStyle.Short).setRequired(false);
                modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(q2));
                return interaction.showModal(modal);
            }

            // 🌟 新增：刪除職業 (解決誤選/不再玩某分身的問題)
            if (cmd === '刪除職業') {
                await interaction.deferReply({ ephemeral: true });
                const doc = await db.collection('members').doc(interaction.user.id).get();
                if (!doc.exists) return interaction.editReply('❌ 找不到您的資料，請先完成申請登記！');
                
                const data = doc.data();
                let classes = data.gameClasses || (data.gameClass ? [data.gameClass] : []);
                
                if (classes.length === 0) return interaction.editReply('❌ 您目前沒有登記任何職業！');
                if (classes.length === 1) return interaction.editReply('⚠️ 您目前只有登記一個主職業，無法刪除！如果想要「更換」主職業，請直接填寫新職業申請或聯繫幹部。');

                const removeOptions = classes.map(c => new StringSelectMenuOptionBuilder().setLabel(c).setValue(c));
                const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_remove_class`).setPlaceholder('請選擇要刪除的職業...').addOptions(removeOptions);
                    
                return interaction.editReply({
                    content: '🗑️ **請選擇您要刪除的職業分身：**\n*(注意：刪除後將會同步移除您的該職業身分組，並更新您的暱稱標籤)*',
                    components: [new ActionRowBuilder().addComponents(selectMenu)]
                });
            }

            if (cmd === '清除資料') {
                await interaction.deferReply({ ephemeral: true });
                const targetUser = interaction.options.getUser('目標');
                if (!targetUser) return interaction.editReply('❌ 找不到該成員。');
                try {
                    await db.collection('members').doc(targetUser.id).delete();
                    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                    if (member) {
                        const rolesToRemove = [config.roles.guildMember, config.roles.familyFriend, ...Object.values(config.roles.classes)];
                        await member.roles.remove(rolesToRemove).catch(() => {});
                    }
                    return interaction.editReply(`✅ **重置成功！**\n已完全清除 <@${targetUser.id}> 的資料庫紀錄，並拔除所有公會與職業身分組。`);
                } catch (err) { return interaction.editReply('❌ 清除資料失敗，請確認機器人權限是否足夠。'); }
            }

            if (cmd === '清除訊息') {
                await interaction.deferReply({ ephemeral: true });
                const amount = interaction.options.getInteger('數量');
                try {
                    const deleted = await interaction.channel.bulkDelete(amount, true);
                    return interaction.editReply(`✅ 咻咻咻～🧹 成功清除了 **${deleted.size}** 則訊息！\n*(⚠️ 貼心提醒：超過 14 天的歷史訊息 Discord 系統不允許機器人整把刪除喔！)*`);
                } catch (err) { return interaction.editReply('❌ 清除失敗，請確認機器人是否有「管理訊息」的權限，或是訊息已經太舊了。'); }
            }
        }

        // 🔘 按鈕點擊
        if (interaction.isButton()) {
            if (interaction.customId === 'btn_member' || interaction.customId === 'btn_friend') {
                const isMember = interaction.customId === 'btn_member';
                const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_class_${isMember ? 'member' : 'friend'}`).setPlaceholder('請選擇您的遊戲主職業...').addOptions(classOptionsList);
                return interaction.reply({ 
                    content: isMember ? '您選擇了「公會成員」，請先選擇您的主職業：' : '您選擇了「親友團」，請先選擇您的主職業：', 
                    components: [new ActionRowBuilder().addComponents(selectMenu)],
                    ephemeral: true
                });
            }

            // 🛡️ 審核通過
            if (interaction.customId.startsWith('approve_')) {
                const parts = interaction.customId.split('_');
                const targetUserId = parts[1];
                const targetClass = parts[2];
                await interaction.deferUpdate(); 
                
                try {
                    const originalEmbed = interaction.message.embeds[0];
                    const gameName = originalEmbed.fields.find(f => f.name.includes('遊戲名稱'))?.value.replace(/`/g, '') || '未知';
                    const gameLevel = originalEmbed.fields.find(f => f.name.includes('等級'))?.value.replace(/`/g, '').replace('LV.', '').trim() || '未知';
                    const gameCode = originalEmbed.fields.find(f => f.name.includes('代碼'))?.value.replace(/`/g, '') || '未知';

                    const member = await interaction.guild.members.fetch(targetUserId);
                    
                    const docRef = db.collection('members').doc(targetUserId);
                    const doc = await docRef.get();
                    let existingClasses = [];
                    if (doc.exists) {
                        const data = doc.data();
                        existingClasses = data.gameClasses || (data.gameClass ? [data.gameClass] : []);
                    }
                    if (!existingClasses.includes(targetClass)) existingClasses.push(targetClass);

                    await member.roles.remove(config.roles.familyFriend).catch(() => {});

                    let rolesToAdd = [config.roles.guildMember];
                    if (config.roles.classes[targetClass]) rolesToAdd.push(config.roles.classes[targetClass]);
                    await member.roles.add(rolesToAdd).catch(() => {});

                    await docRef.set({
                        discordId: targetUserId, discordTag: member.user.tag, gameName: gameName,
                        gameClasses: existingClasses, gameLevel: gameLevel, gameCode: gameCode, role: '公會成員', 
                        joinDate: doc.exists && doc.data().joinDate ? doc.data().joinDate : admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    await updateNickname(member, gameName, '公會成員', existingClasses);

                    // 🌟 升級版：新版溫暖過件通知 + 雙修詢問
                    const passedMsg = `🎉 **太棒了！狂賀！** 🎉\n你的申請已經正式通過啦！歡迎成為 ENDLESS 大家庭的一份子！🥳\n現在，伺服器裡的所有專屬頻道都已經為你解鎖囉！趕快進去跟大家打個招呼、找人一起練功打王吧！衝呀～～🚀`;
                    
                    const extraClassSelect = new StringSelectMenuBuilder()
                        .setCustomId(`add_extra_class_${config.guildId}`)
                        .setPlaceholder('選擇其他的職業分身 (若無請忽略)...')
                        .addOptions(classOptionsList);
                    
                    const extraClassMsg = `\n\n💌 親愛的 **${gameName}** ，如果您在遊戲中還有其他的職業分身，歡迎點選下方的選單新增！\n系統會自動幫您配發身分組，並在您的暱稱加上容易識別的職業標籤喔！🥰\n*(如果沒有其他職業，這則訊息可以直接忽略唷！)*`;

                    await member.send({
                        content: passedMsg + extraClassMsg,
                        components: [new ActionRowBuilder().addComponents(extraClassSelect)]
                    }).catch(() => {});

                    // 🌟 升級版：發送並釘選功能指南
                    const guideMsgText = `📌 **【 ENDLESS 實用功能小指南 】** 📌\n你可以在伺服器內的任何頻道，輸入以下指令來呼叫我幫忙喔：\n\n🔸 \`/更新資料\`：隨時更改你的遊戲名稱或最新等級！\n🔸 \`/刪除職業\`：不小心點錯分身職業，或是不玩該職業時可以一鍵刪除！\n🔸 \`/解鎖權限\`：呼叫萬用的迎新面板。\n\n*(💡 這則訊息已經幫你釘選在我們的對話中，隨時可以點擊右上角的「圖釘 📌」查看喔！)*`;
                    
                    const guideMsg = await member.send(guideMsgText).catch(() => null);
                    if (guideMsg) await guideMsg.pin().catch(() => console.log('⚠️ 無法釘選私訊 (可能已達上限或權限問題)'));

                    const updatedEmbed = EmbedBuilder.from(originalEmbed).setColor('#00FF00').setTitle('✅ 審核已通過').setFooter({ text: `由 ${interaction.user.tag} 批准`, iconURL: interaction.user.displayAvatarURL() });
                    await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

                    try {
                        const welcomeChannel = await client.channels.fetch(config.channels.welcome);
                        if (welcomeChannel) {
                            const randomMsg = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)](targetUserId);
                            await welcomeChannel.send(randomMsg);
                        }
                    } catch (err) { console.log('⚠️ 無法發送迎新廣播：', err); }

                } catch (error) { return interaction.followUp({ content: '❌ 處理失敗，請確認機器人權限。', ephemeral: true }); }
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

                return interaction.reply({ content: '請選擇要退回該申請的原因：', components: [new ActionRowBuilder().addComponents(reasonSelect)], ephemeral: true });
            }
        }

        // 🔘 下拉式選單
        if (interaction.isStringSelectMenu()) {
            
            // 🌟 玩家在私訊中選擇「刪除職業」
            if (interaction.customId === 'select_remove_class') {
                await interaction.deferUpdate();
                const classToRemove = interaction.values[0];
                
                const docRef = db.collection('members').doc(interaction.user.id);
                const doc = await docRef.get();
                if (!doc.exists) return interaction.followUp({ content: '❌ 找不到資料。', ephemeral: true });
                
                const data = doc.data();
                let classes = data.gameClasses || (data.gameClass ? [data.gameClass] : []);
                
                if (!classes.includes(classToRemove)) return interaction.followUp({ content: '❌ 您已經沒有這個職業囉！', ephemeral: true });
                
                classes = classes.filter(c => c !== classToRemove);
                
                const roleId = config.roles.classes[classToRemove];
                if (roleId) await interaction.member.roles.remove(roleId).catch(() => {});
                
                await docRef.update({ gameClasses: classes, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
                
                const newNick = await updateNickname(interaction.member, data.gameName, data.role, classes);
                
                return interaction.editReply({ content: `✅ 成功刪除 **${classToRemove}**！\n您的暱稱已更新為：**${newNick}**`, components: [] });
            }

            if (interaction.customId.startsWith('add_extra_class_')) {
                const selectedClass = interaction.values[0];
                const guildId = interaction.customId.split('_')[3];
                const guild = await client.guilds.fetch(guildId);
                const member = await guild.members.fetch(interaction.user.id).catch(() => null);

                if (!member) return interaction.reply({ content: '❌ 無法獲取您的伺服器身分，請確認您還在伺服器中。', ephemeral: true });

                const docRef = db.collection('members').doc(interaction.user.id);
                const doc = await docRef.get();
                if (!doc.exists) return interaction.reply({ content: '❌ 找不到您的資料庫紀錄。', ephemeral: true });

                const data = doc.data();
                let classes = data.gameClasses || (data.gameClass ? [data.gameClass] : []);
                const gameName = data.gameName;
                const roleType = data.role;

                if (classes.includes(selectedClass)) {
                    return interaction.reply({ content: `⚠️ 您已經擁有 **${selectedClass}** 的職業身分囉！`, ephemeral: true });
                }

                classes.push(selectedClass);

                if (config.roles.classes[selectedClass]) {
                    await member.roles.add(config.roles.classes[selectedClass]).catch(() => {});
                }

                await docRef.update({ gameClasses: classes });
                const newNick = await updateNickname(member, gameName, roleType, classes);

                return interaction.reply({ content: `✅ **太棒了！** 已成功為您新增 **${selectedClass}** 職業！\n您現在在群組內的專屬暱稱已自動升級為：**${newNick}** 😎`, ephemeral: true });
            }

            if (interaction.customId.startsWith('select_class_')) {
                const isMember = interaction.customId === 'select_class_member';
                const selectedClass = interaction.values[0]; 
                const modal = new ModalBuilder().setCustomId(`modal_${isMember ? 'member' : 'friend'}_${selectedClass}`).setTitle(isMember ? '公會成員資料' : '親友團資料');

                if (isMember) {
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_level').setLabel("遊戲等級").setStyle(TextInputStyle.Short)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_code').setLabel("遊戲代碼").setStyle(TextInputStyle.Short))
                    );
                } else {
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nickname').setLabel("暱稱").setStyle(TextInputStyle.Short)));
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
                const gameClass = interaction.customId.split('_')[2]; 
                const name = interaction.fields.getTextInputValue('game_name');
                const level = interaction.fields.getTextInputValue('game_level');
                const code = interaction.fields.getTextInputValue('game_code');
                
                await interaction.deferReply({ ephemeral: true }); 

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
                                    { name: '⚔️ 職業', value: `\`${gameClass}\``, inline: true },
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
                            if (timeoutNote) {
                                embed.addFields({ name: '⚠️ 備註', value: '玩家未在 5 分鐘內附上截圖。' });
                            }

                            const row = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`approve_${interaction.user.id}_${gameClass}`).setLabel('✅ 審核通過').setStyle(ButtonStyle.Success),
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

                    await dmChannel.send(`👋 嗨嗨！你剛剛填寫了 ENDLESS 的入會申請，距離加入我們只差最後一步啦！🏃‍♂️💨\n\n📸 **請在 5 分鐘內，直接將你的「角色資料截圖」傳送在這個聊天室喔！**\n*(這張帥氣的截圖會附在你的申請單上，讓公會好好認識你！)*\n\n如果不需要上傳截圖，請直接回覆文字：\`跳過\``);

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
                const gameClass = interaction.customId.split('_')[2];
                const nicknameInput = interaction.fields.getTextInputValue('nickname');
                
                await interaction.deferReply({ ephemeral: true }); 
                try {
                    let rolesToAdd = [config.roles.familyFriend];
                    if (config.roles.classes[gameClass]) rolesToAdd.push(config.roles.classes[gameClass]);
                    await interaction.member.roles.add(rolesToAdd);
                    
                    const existingClasses = [gameClass];
                    await db.collection('members').doc(interaction.user.id).set({
                        discordId: interaction.user.id, discordTag: interaction.user.tag, gameName: nicknameInput,
                        gameClasses: existingClasses, gameLevel: 'N/A', gameCode: 'N/A', role: '親友團', joinDate: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    await updateNickname(interaction.member, nicknameInput, '親友團', existingClasses);
                    
                    try {
                        const welcomeChannel = await client.channels.fetch(config.channels.welcome);
                        if (welcomeChannel) {
                            await welcomeChannel.send(`🎈 叮咚！ENDLESS 迎來了一位超酷的親友團新夥伴！<@${interaction.user.id}> 已經解鎖頻道囉～大家快把最熱情的貼圖刷起來，讓他感受我們的溫暖吧！🔥🔥`);
                        }
                    } catch (err) { console.log('⚠️ 無法發送迎新廣播：', err); }

                    return interaction.editReply({ content: `✅ 登記成功！身分組已發放，歡迎加入！` });
                } catch (error) { return interaction.editReply({ content: '❌ 處理失敗，請確認機器人身分組階級是否在親友團之上。' }); }
            }

            if (interaction.customId.startsWith('modal_reject_custom_')) {
                const parts = interaction.customId.split('_');
                const targetUserId = parts[3];
                const msgId = parts[4];
                const reason = interaction.fields.getTextInputValue('reject_reason');
                
                await interaction.deferReply({ ephemeral: true });
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
                
                await interaction.deferReply({ ephemeral: true }); 
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
        console.error("🚨 互動處理發生未預期錯誤：", globalError);
    }
});

// ==========================================
// 💌 5️⃣ 處理新成員加入與離開
// ==========================================
client.on('guildMemberAdd', async member => {
    try { await member.send(`👋 歡迎來到 **ENDLESS**！請前往伺服器內的任意頻道，輸入 \`/解鎖權限\` 指令來申請身分。`).catch(() => {}); } catch (error) {}
});

client.on('guildMemberRemove', async member => {
    try {
        const doc = await db.collection('members').doc(member.id).get();
        if (doc.exists) {
            await db.collection('members').doc(member.id).delete();
            console.log(`🧹 偵測到成員 ${member.user.tag} 離開伺服器，已自動清除其 Firebase 紀錄。`);
        }
    } catch (error) {
        console.error("❌ 清除離開成員資料失敗：", error);
    }
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
