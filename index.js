require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, EmbedBuilder, REST, Routes,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder // ⬅️ 新增下拉選單套件
} = require('discord.js');
const express = require('express');

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  })
});

const db = admin.firestore();
console.log('Firebase Connected!');

// ==========================================
// 🔧 設定區
// ==========================================
const config = {
    guildId: '1539475243733622794', 
    channels: {
        approval: '1539972747545808937' // 審核頻道 ID
    },
    roles: {
        guildMember: '1539959985797341184',
        familyFriend: '1539960787882475591',
        classes: {
            '黑騎士': '1540148326433820784',
            '聖騎士': '1540148350144479312',
            '英雄': '1540148429336875098',
            '箭神': '1540148458621763674',
            '神射手': '1540148479316197496',
            '主教': '1540148561331753100',
            '冰雷': '1540148594672144445',
            '火毒': '1540148630608937032',
            '夜使者': '1540148685193748501',
            '暗影神偷': '1540148712062591047',
            '拳霸': '1540148732711014484',
            '槍神': '1540148797152301126'
        }
    }
};

// 用來產生下拉式選單選項的陣列
const classOptionsList = Object.keys(config.roles.classes).map(className => 
    new StringSelectMenuOptionBuilder().setLabel(className).setValue(className)
);

// ==========================================
// 🌐 建立 Express 伺服器
// ==========================================
const app = express();
app.get('/', (req, res) => {
    res.send('Artale ENDLESS-BOT is running!');
});
app.listen(process.env.PORT || 3000, () => {
    console.log('Web server is running and ready for UptimeRobot.');
});

// ==========================================
// 🤖 建立 Discord Client
// ==========================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.User, Partials.GuildMember]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const commands = [{
        name: '解鎖權限',
        description: '申請加入 ENDLESS 或是成為親友團'
    }];
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, config.guildId),
            { body: commands }
        );
        console.log('Slash commands registered.');
    } catch (error) {
        console.error(error);
    }
});

// ==========================================
// 處理所有互動 (指令、按鈕、下拉選單、表單)
// ==========================================
client.on('interactionCreate', async interaction => {
    
    // 1️⃣ 處理斜線指令
    if (interaction.isChatInputCommand() && interaction.commandName === '解鎖權限') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_member').setLabel('公會成員').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_friend').setLabel('親友團').setStyle(ButtonStyle.Success)
        );
        await interaction.reply({
            content: '歡迎來到 ENDLESS，這裡是一個大家庭，請告訴我們，您是我們的…',
            components: [row],
            ephemeral: true
        });
    }

    // 2️⃣ 處理按鈕點擊 (改成顯示下拉式選單)
    if (interaction.isButton()) {
        if (interaction.customId === 'btn_member' || interaction.customId === 'btn_friend') {
            const isMember = interaction.customId === 'btn_member';
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_class_${isMember ? 'member' : 'friend'}`)
                .setPlaceholder('請選擇您的遊戲職業...')
                .addOptions(classOptionsList);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            // 更新原本的訊息，把按鈕換成下拉式選單
            await interaction.update({ 
                content: isMember ? '您選擇了「公會成員」，請先選擇您的遊戲職業：' : '您選擇了「親友團」，請先選擇您的遊戲職業：', 
                components: [row] 
            });
        }

        // 審核按鈕：通過
        if (interaction.customId.startsWith('approve_')) {
            const [_, targetUserId, targetClass] = interaction.customId.split('_');
            try {
                const member = await interaction.guild.members.fetch(targetUserId);
                let rolesToAdd = [config.roles.guildMember];
                if (config.roles.classes[targetClass]) rolesToAdd.push(config.roles.classes[targetClass]);
                
                await member.roles.add(rolesToAdd);
                await member.send(`🎉 恭喜您！您的申請已通過，歡迎正式加入 ENDLESS 大家庭！我們已為您配發公會成員及職業身分組。`);
                await interaction.update({ content: `✅ 已批准 <@${targetUserId}> 的加入申請。`, embeds: [], components: [] });
            } catch (error) {
                await interaction.reply({ content: '無法配發身分組或發送私訊，請確認機器人權限。', ephemeral: true });
            }
        }

        // 審核按鈕：拒絕 (彈出退回理由表單)
        if (interaction.customId.startsWith('reject_')) {
            const targetUserId = interaction.customId.split('_')[1];
            const modal = new ModalBuilder()
                .setCustomId(`modal_reject_${targetUserId}`)
                .setTitle('填寫退回原因');
            const reasonInput = new TextInputBuilder()
                .setCustomId('reject_reason').setLabel("不通過的原因").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            await interaction.showModal(modal);
        }
    }

    // 3️⃣ 處理下拉式選單選取 (觸發彈出表單)
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('select_class_')) {
            const isMember = interaction.customId === 'select_class_member';
            const selectedClass = interaction.values[0]; // 取得選單中選擇的職業
            
            // 我們把選擇的職業暫存到表單的 customId 裡面，例如 modal_member_主教
            const modal = new ModalBuilder()
                .setCustomId(`modal_${isMember ? 'member' : 'friend'}_${selectedClass}`)
                .setTitle(isMember ? '公會成員資料填寫' : '親友團資料填寫');

            if (isMember) {
                const q1 = new TextInputBuilder().setCustomId('game_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short);
                const q2 = new TextInputBuilder().setCustomId('game_level').setLabel("遊戲等級").setStyle(TextInputStyle.Short);
                const q3 = new TextInputBuilder().setCustomId('game_code').setLabel("遊戲代碼").setStyle(TextInputStyle.Short);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(q1),
                    new ActionRowBuilder().addComponents(q2),
                    new ActionRowBuilder().addComponents(q3)
                );
            } else {
                const q1 = new TextInputBuilder().setCustomId('nickname').setLabel("暱稱").setStyle(TextInputStyle.Short);
                modal.addComponents(new ActionRowBuilder().addComponents(q1));
            }
            
            // 彈出表單
            await interaction.showModal(modal);
        }
    }

    // 4️⃣ 處理表單送出
    if (interaction.isModalSubmit()) {
        
        // 公會成員表單送出
        if (interaction.customId.startsWith('modal_member_')) {
            const gameClass = interaction.customId.split('_')[2]; // 從 customId 抓回剛剛選的職業
            const name = interaction.fields.getTextInputValue('game_name');
            const level = interaction.fields.getTextInputValue('game_level');
            const code = interaction.fields.getTextInputValue('game_code');

            const channel = client.channels.cache.get(config.channels.approval);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ 新的公會成員申請')
                    .addFields(
                        { name: '申請人', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '遊戲名稱', value: name, inline: true },
                        { name: '等級', value: level, inline: true },
                        { name: '職業', value: gameClass, inline: true },
                        { name: '代碼', value: code, inline: true }
                    )
                    .setColor('#0099ff');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_${interaction.user.id}_${gameClass}`).setLabel('審核通過').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('不通過').setStyle(ButtonStyle.Danger)
                );
                await channel.send({ embeds: [embed], components: [row] });
            }
            
            // 更新互動狀態，清掉下拉選單
            await interaction.update({ content: `✅ 您的資料 (職業：${gameClass}) 已送出審核，請留意後續私訊通知！`, components: [] });
        }

        // 親友團表單送出
        if (interaction.customId.startsWith('modal_friend_')) {
            const gameClass = interaction.customId.split('_')[2];
            const nickname = interaction.fields.getTextInputValue('nickname');

            let rolesToAdd = [config.roles.familyFriend];
            if (config.roles.classes[gameClass]) rolesToAdd.push(config.roles.classes[gameClass]);

            try {
                await interaction.member.roles.add(rolesToAdd);
                // 更新互動狀態，清掉下拉選單
                await interaction.update({ content: `✅ 登記成功！已為您配發親友團與 **${gameClass}** 身分組！`, components: [] });
            } catch (error) {
                await interaction.update({ content: '❌ 配發身分組失敗，請聯絡管理員確認權限。', components: [] });
            }
        }

        // 拒絕理由表單送出
        if (interaction.customId.startsWith('modal_reject_')) {
            const targetUserId = interaction.customId.split('_')[2];
            const reason = interaction.fields.getTextInputValue('reject_reason');

            try {
                const member = await interaction.guild.members.fetch(targetUserId);
                await member.send(`您好，很抱歉通知您，您在 ENDLESS 的加入申請未通過。\n**原因：** ${reason}\n\n如有任何疑問，歡迎向公會幹部詢問。`);
                await interaction.update({ content: `❌ 已拒絕 <@${targetUserId}> 的申請。原因：${reason}`, embeds: [], components: [] });
            } catch (error) {
                await interaction.reply({ content: '無法發送私訊給該使用者，對方可能已關閉陌生人私訊。', ephemeral: true });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN); 
