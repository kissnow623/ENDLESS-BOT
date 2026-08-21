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
    PermissionFlagsBits 
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
    channels: { approval: '1539972747545808937' },
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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.User, Partials.GuildMember]
});

client.on('debug', info => console.log(`[DJS 連線追蹤] ${info}`));
client.on('warn', info => console.log(`[DJS 警告] ${info}`));
client.on('error', error => console.error(`[DJS 錯誤]`, error));

client.once('clientReady', async () => {
    console.log(`🤖 機器人登入成功：${client.user.tag}!`);
    const commands = [
        { name: '解鎖權限', description: '申請加入 ENDLESS 或是成為親友團' },
        { name: '查詢目前公會成員', description: '查詢公會成員列表與總人數 (僅限管理員)' },
        { name: '更新資料', description: '更新您的遊戲名稱或等級 (同步修改暱稱)' }
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, config.guildId), { body: commands });
        console.log('✅ 指令註冊完成！');
        
        // 啟動每日問候巡邏排程 (每 24 小時檢查一次)
        setInterval(checkAnniversaries, 24 * 60 * 60 * 1000);
        checkAnniversaries(); // 啟動時先檢查一次
    } catch (error) {
        console.error('❌ 指令註冊失敗：', error);
    }
});

// ==========================================
// 🎁 每日巡邏：檢查入群週年並發送溫馨私訊
// ==========================================
async function checkAnniversaries() {
    try {
        console.log("🔍 [系統] 開始執行每日會員週年巡邏...");
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

                    if (monthDiff === 1) {
                        msg = isMember
                            ? `🎉 哇喔！不知不覺你加入 **ENDLESS** 大家庭已經滿 **1 個月**啦！🍄\n這段時間還習慣嗎？有空多來語音頻道找大家聊天打屁，或是揪團一起練功打王喔！🛡️ 我們都在等你～`
                            : `🎈 嗨嗨！不知不覺你來到 **ENDLESS** 伺服器跟我們玩耍滿 **1 個月**啦！☕\n超開心有你這個好朋友常來串門子，有空記得多來語音頻道跟大家聊聊天、分享生活喔！🎮✨`;
                    }
                    if (monthDiff === 3) {
                        msg = isMember
                            ? `✨ 叮咚！你在 **ENDLESS** 陪伴大家滿 **3 個月**囉！🍁\n感謝你這段時間的熱血參與，公會因為有你變得更熱鬧、更強大了！⚔️ 今晚要不要來頻道一起刷副本、打個王呢？🍗`
                            : `🎵 叮咚！你在 **ENDLESS** 陪伴大家滿 **3 個月**囉！🌟\n雖然你是親友團，但我們早就把你當成一家人啦！感謝你總是帶來歡樂，別忘了常回來看我們唷！🥰🍻`;
                    }
                    if (monthDiff === 6) {
                        msg = isMember
                            ? `🏰 太感動啦！半年的時光飛逝，你在 **ENDLESS** 滿 **6 個月**了！💎\n這半年來辛苦啦，無論是尬聊還是熬夜打裝備，你的存在都是公會最寶貴的力量！🚀 讓我們繼續並肩作戰吧！🔥`
                            : `💖 哇！時光飛逝，你成為 **ENDLESS** 的專屬親友已經滿 **6 個月**了！🥂\n這半年來有你的陪伴真的超棒，無論是打屁哈啦還是掛機聽歌，這裡永遠有你的一個位置！🏠✨`;
                    }
                    if (monthDiff === 12) {
                        msg = isMember
                            ? `👑 太神啦！！你在 **ENDLESS** 迎來了最高榮耀的 **1 週年紀念日**！🏆🎊\n一年 365 天的陪伴真的非常不容易，你已經是公會無可取代的核心靈魂了！💯 未來的冒險篇章，也請你多多指教喔！🎆🎇`
                            : `🏆 太神啦！！你在 **ENDLESS** 迎來了超讚的 **1 週年紀念日**！🎉🎂\n能有一整年的陪伴真的超級難得，你已經是我們最最最重視的摯友了！💯 未來的日子，也要繼續一起開開心心地玩耍喔！🎆🎇`;
                    }

                    await member.send(msg).catch(() => console.log(`⚠️ 無法發送週年私訊給 ${data.discordTag}`));
                    await db.collection('members').doc(data.discordId).update({ lastCongratulated: currentMonthStr });
                    console.log(`💌 已發送 ${monthDiff} 個月週年祝賀給 ${data.discordTag}`);
                }
            }
        });
    } catch (error) {
        console.error("❌ 週年巡邏發生錯誤：", error);
    }
}

// ==========================================
// 處理所有互動
// ==========================================
client.on('interactionCreate', async interaction => {
    
    // 🔘 斜線指令
    if (interaction.isChatInputCommand()) {
        const cmd = interaction.commandName;
        const isOwner = interaction.user.id === interaction.guild?.ownerId; 
        const hasAdminRole = interaction.member.roles.cache.hasAny(...config.roles.adminRoles); 
        const hasAdminPerm = interaction.member.permissions.has(PermissionFlagsBits.Administrator); 

        if ((cmd === '解鎖權限' || cmd === '查詢目前公會成員') && !isOwner && !hasAdminRole && !hasAdminPerm) {
            return interaction.reply({ content: '❌ 很抱歉，您沒有權限使用此指令。', ephemeral: true });
        }

        if (cmd === '解鎖權限') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_member').setLabel('公會成員').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_friend').setLabel('親友團').setStyle(ButtonStyle.Success)
            );
            const welcomeMessage = "🎈 **叮咚！歡迎光臨 ENDLESS！** 🎈\n終於等到你啦！為了讓你能在伺服器裡暢通無阻地跟大家聊天，請先偷偷告訴我們，你是我們的……？（點擊下方按鈕選擇身分唷！）👇";
            // 🌟 發布為公開面板
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
                members.forEach((m, index) => { description += `${index + 1}. **${m.gameName}** (LV.${m.gameLevel}) - ${m.gameClass}\n`; });
                const embed = new EmbedBuilder().setTitle('🛡️ ENDLESS 公會成員名冊').setDescription(description.substring(0, 4000)).setColor('#FFD700');
                return interaction.editReply({ embeds: [embed] });
            } catch (error) { return interaction.editReply('❌ 查詢資料庫時發生錯誤。'); }
        }

        if (cmd === '更新資料') {
            const modal = new ModalBuilder().setCustomId('modal_update_data').setTitle('更新遊戲資料');
            const q1 = new TextInputBuilder().setCustomId('update_name').setLabel("新遊戲名稱/暱稱 (若無更改請填原名)").setStyle(TextInputStyle.Short);
            const q2 = new TextInputBuilder().setCustomId('update_level').setLabel("目前最新等級 (親友團可不填)").setStyle(TextInputStyle.Short).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(q2));
            return interaction.showModal(modal);
        }
    }

    // 🔘 按鈕點擊
    if (interaction.isButton()) {
        if (interaction.customId === 'btn_member' || interaction.customId === 'btn_friend') {
            const isMember = interaction.customId === 'btn_member';
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_class_${isMember ? 'member' : 'friend'}`).setPlaceholder('請選擇您的遊戲職業...').addOptions(classOptionsList);
            // 🌟 僅限點擊者可見的下拉選單 (不破壞公開面板)
            return interaction.reply({ 
                content: isMember ? '您選擇了「公會成員」，請選擇職業：' : '您選擇了「親友團」，請選擇職業：', 
                components: [new ActionRowBuilder().addComponents(selectMenu)],
                ephemeral: true
            });
        }

        if (interaction.customId.startsWith('approve_')) {
            const [_, targetUserId, targetClass] = interaction.customId.split('_');
            try {
                await interaction.deferUpdate(); // 🌟 爭取 3 秒處理時間防斷線
                
                const embed = interaction.message.embeds[0];
                const gameName = embed.fields.find(f => f.name === '遊戲名稱')?.value || '未知';
                const gameLevel = embed.fields.find(f => f.name === '等級')?.value || '未知';
                const gameCode = embed.fields.find(f => f.name === '代碼')?.value || '未知';

                const member = await interaction.guild.members.fetch(targetUserId);
                let rolesToAdd = [config.roles.guildMember];
                if (config.roles.classes[targetClass]) rolesToAdd.push(config.roles.classes[targetClass]);
                await member.roles.add(rolesToAdd);

                await db.collection('members').doc(targetUserId).set({
                    discordId: targetUserId, discordTag: member.user.tag, gameName: gameName,
                    gameClass: targetClass, gameLevel: gameLevel, gameCode: gameCode, role: '公會成員', joinDate: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                const newNickname = `［${gameName}］☀️［${targetClass}］`.substring(0, 32);
                try { await member.setNickname(newNickname); } 
                catch(e) { await member.send(`⚠️ 溫馨提醒：因為您的權限位階較高，機器人無法幫您自動改名，請手動修改為：**${newNickname}**`); }

                await member.send(`🎉 恭喜！申請已通過，歡迎加入 ENDLESS！`);
                return interaction.editReply({ content: `✅ 已批准 <@${targetUserId}>`, embeds: [], components: [] });
            } catch (error) { return interaction.followUp({ content: '❌ 處理失敗，請確認權限。', ephemeral: true }); }
        }

        if (interaction.customId.startsWith('reject_')) {
            const targetUserId = interaction.customId.split('_')[1];
            const modal = new ModalBuilder().setCustomId(`modal_reject_${targetUserId}`).setTitle('填寫退回原因');
            const reasonInput = new TextInputBuilder().setCustomId('reject_reason').setLabel("原因").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            return interaction.showModal(modal);
        }
    }

    // 🔘 下拉式選單
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('select_class_')) {
            const isMember = interaction.customId === 'select_class_member';
            const selectedClass = interaction.values[0]; 
            const modal = new ModalBuilder().setCustomId(`modal_${isMember ? 'member' : 'friend'}_${selectedClass}`).setTitle(isMember ? '公會成員資料' : '親友團資料');

            if (isMember) {
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_level').setLabel("遊戲等級 (純數字)").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_code').setLabel("遊戲代碼").setStyle(TextInputStyle.Short))
                );
            } else {
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nickname').setLabel("暱稱").setStyle(TextInputStyle.Short)));
            }
            return interaction.showModal(modal);
        }
    }

    // 🔘 彈出式表單提交
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('modal_member_')) {
            const gameClass = interaction.customId.split('_')[2]; 
            const name = interaction.fields.getTextInputValue('game_name');
            const level = interaction.fields.getTextInputValue('game_level');
            const code = interaction.fields.getTextInputValue('game_code');
            
            try {
                await interaction.deferUpdate(); 
                const channel = await client.channels.fetch(config.channels.approval);
                if (channel) {
                    const embed = new EmbedBuilder().setTitle('🛡️ 新成員申請').addFields(
                        { name: '申請人', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '遊戲名稱', value: name, inline: true }, { name: '等級', value: level, inline: true },
                        { name: '職業', value: gameClass, inline: true }, { name: '代碼', value: code, inline: true }
                    ).setColor('#0099ff');
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`approve_${interaction.user.id}_${gameClass}`).setLabel('審核通過').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('不通過').setStyle(ButtonStyle.Danger)
                    );
                    await channel.send({ embeds: [embed], components: [row] });
                }
                return interaction.editReply({ content: `✅ 資料已送出，請靜候幹部審核！`, components: [] });
            } catch (error) {
                return interaction.editReply({ content: `❌ 傳送失敗，請確認審核頻道設定是否正確。`, components: [] });
            }
        }

        if (interaction.customId.startsWith('modal_friend_')) {
            const gameClass = interaction.customId.split('_')[2];
            const nicknameInput = interaction.fields.getTextInputValue('nickname');
            
            try {
                await interaction.deferUpdate(); 
                let rolesToAdd = [config.roles.familyFriend];
                if (config.roles.classes[gameClass]) rolesToAdd.push(config.roles.classes[gameClass]);
                await interaction.member.roles.add(rolesToAdd);
                
                // 🌟 新增：親友團寫入資料庫
                await db.collection('members').doc(interaction.user.id).set({
                    discordId: interaction.user.id, discordTag: interaction.user.tag, gameName: nicknameInput,
                    gameClass: gameClass, gameLevel: 'N/A', gameCode: 'N/A', role: '親友團', joinDate: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                const newNickname = `［${nicknameInput}］🌙［${gameClass}］`.substring(0, 32);
                try { await interaction.member.setNickname(newNickname); } 
                catch(e) { await interaction.member.send(`⚠️ 溫馨提醒：因為您的權限位階較高，機器人無法幫您自動改名，請手動修改為：**${newNickname}**`); }
                
                return interaction.editReply({ content: `✅ 登記成功！資料已寫入且身分組已配發。`, components: [] });
            } catch (error) { return interaction.editReply({ content: '❌ 處理失敗', components: [] }); }
        }

        if (interaction.customId.startsWith('modal_reject_')) {
            const targetUserId = interaction.customId.split('_')[2];
            const reason = interaction.fields.getTextInputValue('reject_reason');
            try {
                await interaction.deferUpdate();
                const member = await interaction.guild.members.fetch(targetUserId);
                await member.send(`您的申請未通過。\n**原因：** ${reason}`);
                return interaction.editReply({ content: `❌ 已拒絕`, embeds: [], components: [] });
            } catch (error) { return interaction.followUp({ content: '❌ 無法發送私訊。', ephemeral: true }); }
        }

        if (interaction.customId === 'modal_update_data') {
            const newName = interaction.fields.getTextInputValue('update_name');
            const newLevel = interaction.fields.fields.get('update_level') ? interaction.fields.getTextInputValue('update_level') : 'N/A';
            
            try {
                await interaction.deferReply({ ephemeral: true }); 
                
                const doc = await db.collection('members').doc(interaction.user.id).get();
                if (!doc.exists) return interaction.editReply({ content: '❌ 找不到您的資料。可能是您還沒申請，或是幹部尚未審核通過喔！' });
                
                const userData = doc.data();
                const gameClass = userData.gameClass;
                const roleType = userData.role; 
                
                // 更新資料庫
                const updateData = { gameName: newName, lastUpdated: admin.firestore.FieldValue.serverTimestamp() };
                if (newLevel && newLevel !== 'N/A') updateData.gameLevel = newLevel;
                await db.collection('members').doc(interaction.user.id).update(updateData);
                
                const newNickname = roleType === '公會成員' ? `［${newName}］☀️［${gameClass}］`.substring(0, 32) : `［${newName}］🌙［${gameClass}］`.substring(0, 32);
                
                try { await interaction.member.setNickname(newNickname); } 
                catch(e) { await interaction.member.send(`⚠️ 溫馨提醒：請手動將暱稱修改為：**${newNickname}**`); }
                
                return interaction.editReply({ content: `✅ 資料更新成功！您的暱稱已同步更新！` });
            } catch (error) { return interaction.editReply({ content: '❌ 更新失敗' }); }
        }
    }
});

// ==========================================
// 💌 5️⃣ 處理新成員加入
// ==========================================
client.on('guildMemberAdd', async member => {
    try { await member.send(`👋 歡迎來到 **ENDLESS**！請前往伺服器內的任意頻道，輸入 \`/解鎖權限\` 指令來申請身分。`); } catch (error) {}
});

// ==========================================
// 🚀 6️⃣ 啟動機器人與終極除錯雷達
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
