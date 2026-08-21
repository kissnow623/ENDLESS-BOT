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

// X光透視模式
client.on('debug', info => console.log(`[DJS 連線追蹤] ${info}`));
client.on('warn', info => console.log(`[DJS 警告] ${info}`));
client.on('error', error => console.error(`[DJS 錯誤]`, error));

// 修正：使用 clientReady 取代舊版 ready 事件
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
    } catch (error) {
        console.error('❌ 指令註冊失敗：', error);
    }
});

// ==========================================
// 處理所有互動
// ==========================================
client.on('interactionCreate', async interaction => {
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
            
            // 👇 換上了輕鬆俏皮版的迎新文案
            const welcomeMessage = "🎈 **叮咚！歡迎光臨 ENDLESS！** 🎈\n終於等到你啦！為了讓你能在伺服器裡暢通無阻地跟大家聊天，請先偷偷告訴我們，你是我們的……？\n（點擊下方按鈕選擇身分唷！）👇";
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
            const q1 = new TextInputBuilder().setCustomId('update_name').setLabel("新遊戲名稱 (若無更改請填原名)").setStyle(TextInputStyle.Short);
            const q2 = new TextInputBuilder().setCustomId('update_level').setLabel("目前最新等級").setStyle(TextInputStyle.Short);
            modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(q2));
            return interaction.showModal(modal);
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'btn_member' || interaction.customId === 'btn_friend') {
            const isMember = interaction.customId === 'btn_member';
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_class_${isMember ? 'member' : 'friend'}`).setPlaceholder('請選擇您的遊戲職業...').addOptions(classOptionsList);
            return interaction.update({ content: isMember ? '您選擇了「公會成員」，請選擇職業：' : '您選擇了「親友團」，請選擇職業：', components: [new ActionRowBuilder().addComponents(selectMenu)] });
        }

        // 幹部審核通過
        if (interaction.customId.startsWith('approve_')) {
            const [_, targetUserId, targetClass] = interaction.customId.split('_');
            try {
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

                // 📝 變更為公會成員專屬格式：［遊戲名稱］☀️［職業］
                const newNickname = `［${gameName}］☀️［${targetClass}］`.substring(0, 32);
                try { await member.setNickname(newNickname); } 
                catch(e) { console.log(`⚠️ 無法修改 ${member.user.tag} 的暱稱 (位階過高或擁有者)`); }

                await member.send(`🎉 恭喜！申請已通過，歡迎加入 ENDLESS！`);
                return interaction.update({ content: `✅ 已批准 <@${targetUserId}>`, embeds: [], components: [] });
            } catch (error) { return interaction.reply({ content: '❌ 處理失敗，請確認機器人權限。', ephemeral: true }); }
        }

        // 幹部審核拒絕
        if (interaction.customId.startsWith('reject_')) {
            const targetUserId = interaction.customId.split('_')[1];
            const modal = new ModalBuilder().setCustomId(`modal_reject_${targetUserId}`).setTitle('填寫退回原因');
            const reasonInput = new TextInputBuilder().setCustomId('reject_reason').setLabel("原因").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            return interaction.showModal(modal);
        }
    }

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

    if (interaction.isModalSubmit()) {
        
        // 提交公會成員申請 (修復抓不到頻道的問題)
        if (interaction.customId.startsWith('modal_member_')) {
            const gameClass = interaction.customId.split('_')[2]; 
            const name = interaction.fields.getTextInputValue('game_name');
            const level = interaction.fields.getTextInputValue('game_level');
            const code = interaction.fields.getTextInputValue('game_code');
            
            try {
                // 強制抓取伺服器頻道，避免快取遺失
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
                    return interaction.update({ content: `✅ 資料已送出，請靜候幹部審核！`, components: [] });
                }
            } catch (error) {
                console.error('❌ 傳送審核表單失敗：', error);
                return interaction.update({ content: `❌ 傳送失敗，請確認審核頻道設定是否正確。`, components: [] });
            }
        }

        // 提交親友團申請
        if (interaction.customId.startsWith('modal_friend_')) {
            const gameClass = interaction.customId.split('_')[2];
            const nicknameInput = interaction.fields.getTextInputValue('nickname');
            let rolesToAdd = [config.roles.familyFriend];
            if (config.roles.classes[gameClass]) rolesToAdd.push(config.roles.classes[gameClass]);
            
            try {
                await interaction.member.roles.add(rolesToAdd);
                
                // 📝 變更為親友團專屬格式：［暱稱］🌙［職業］
                const newNickname = `［${nicknameInput}］🌙［${gameClass}］`.substring(0, 32);
                try { await interaction.member.setNickname(newNickname); } 
                catch(e) { console.log(`⚠️ 無法修改 ${interaction.user.tag} 的暱稱 (位階過高或擁有者)`); }
                
                return interaction.update({ content: `✅ 登記成功！`, components: [] });
            } catch (error) { return interaction.update({ content: '❌ 身分組發送失敗', components: [] }); }
        }

        // 拒絕理由送出
        if (interaction.customId.startsWith('modal_reject_')) {
            const targetUserId = interaction.customId.split('_')[2];
            const reason = interaction.fields.getTextInputValue('reject_reason');
            try {
                const member = await interaction.guild.members.fetch(targetUserId);
                await member.send(`您的申請未通過。\n**原因：** ${reason}`);
                return interaction.update({ content: `❌ 已拒絕`, embeds: [], components: [] });
            } catch (error) { return interaction.reply({ content: '❌ 無法發送私訊。', ephemeral: true }); }
        }

        // 成員自主更新資料
        if (interaction.customId === 'modal_update_data') {
            const newName = interaction.fields.getTextInputValue('update_name');
            const newLevel = interaction.fields.getTextInputValue('update_level');
            try {
                const doc = await db.collection('members').doc(interaction.user.id).get();
                if (!doc.exists) return interaction.reply({ content: '❌ 找不到您的資料', ephemeral: true });
                
                const gameClass = doc.data().gameClass;
                await db.collection('members').doc(interaction.user.id).update({ 
                    gameName: newName, gameLevel: newLevel, lastUpdated: admin.firestore.FieldValue.serverTimestamp() 
                });
                
                // 📝 更新時，同步套用公會成員格式
                const newNickname = `［${newName}］☀️［${gameClass}］`.substring(0, 32);
                try { await interaction.member.setNickname(newNickname); } catch(e) {}
                
                return interaction.reply({ content: `✅ 資料更新成功！`, ephemeral: true });
            } catch (error) { return interaction.reply({ content: '❌ 更新失敗', ephemeral: true }); }
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
