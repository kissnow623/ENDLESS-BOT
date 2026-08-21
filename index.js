require('dotenv').config();
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
    console.error("❌ Firebase 金鑰解析失敗！請確認 Render 環境變數設定。");
    process.exit(1);
}

if (serviceAccount && !admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
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
// 🤖 4️⃣ 建立 Discord Client 與指令註冊
// ==========================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.User, Partials.GuildMember]
});

client.once('ready', async () => {
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
    
    // ==========================================
    // 🔘 處理斜線指令
    // ==========================================
    if (interaction.isChatInputCommand()) {
        const cmd = interaction.commandName;
        
        // 🛡️ 權限檢查：解鎖權限 & 查詢成員 只能由管理員使用
        const isOwner = interaction.user.id === interaction.guild?.ownerId; 
        const hasAdminRole = interaction.member.roles.cache.hasAny(...config.roles.adminRoles); 
        const hasAdminPerm = interaction.member.permissions.has(PermissionFlagsBits.Administrator); 

        if ((cmd === '解鎖權限' || cmd === '查詢目前公會成員') && !isOwner && !hasAdminRole && !hasAdminPerm) {
            return interaction.reply({ content: '❌ 很抱歉，您沒有權限使用此指令。', ephemeral: true });
        }

        // 🟢 指令 1：/解鎖權限
        if (cmd === '解鎖權限') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_member').setLabel('公會成員').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_friend').setLabel('親友團').setStyle(ButtonStyle.Success)
            );
            return interaction.reply({ content: '歡迎來到 ENDLESS，這裡是一個大家庭，請告訴我們，您是我們的…', components: [row], ephemeral: true });
        }

        // 🟢 指令 2：/查詢目前公會成員
        if (cmd === '查詢目前公會成員') {
            await interaction.deferReply({ ephemeral: true }); // 先延遲回覆，避免資料庫撈太久超時
            
            try {
                const snapshot = await db.collection('members').where('role', '==', '公會成員').get();
                if (snapshot.empty) return interaction.editReply('目前資料庫中沒有公會成員紀錄。');

                let members = [];
                snapshot.forEach(doc => members.push(doc.data()));

                // 依照等級由高到低排序 (轉為數字比較)
                members.sort((a, b) => parseInt(b.gameLevel) - parseInt(a.gameLevel));

                // 組合列表字串 (避免超過字數限制，每10人一組顯示或簡化顯示)
                let description = `目前公會總人數：**${members.length}** 人\n\n`;
                description += `**【 成員等級排行榜 】**\n`;
                
                members.forEach((m, index) => {
                    // Discord Embed Description 限制 4096 字，若人數過多這裡未來需做分頁
                    description += `${index + 1}. **${m.gameName}** (LV.${m.gameLevel}) - ${m.gameClass}\n`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('🛡️ ENDLESS 公會成員名冊')
                    .setDescription(description.substring(0, 4000)) // 防呆裁切
                    .setColor('#FFD700');

                return interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error(error);
                return interaction.editReply('❌ 查詢資料庫時發生錯誤。');
            }
        }

        // 🟢 指令 3：/更新資料 (所有人可用)
        if (cmd === '更新資料') {
            const modal = new ModalBuilder()
                .setCustomId('modal_update_data')
                .setTitle('更新遊戲資料');

            const q1 = new TextInputBuilder().setCustomId('update_name').setLabel("新遊戲名稱 (若無更改請填原名)").setStyle(TextInputStyle.Short);
            const q2 = new TextInputBuilder().setCustomId('update_level').setLabel("目前最新等級").setStyle(TextInputStyle.Short);
            
            modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(q2));
            return interaction.showModal(modal);
        }
    }

    // ==========================================
    // 🔘 處理按鈕點擊 (身分選擇與審核)
    // ==========================================
    if (interaction.isButton()) {
        if (interaction.customId === 'btn_member' || interaction.customId === 'btn_friend') {
            const isMember = interaction.customId === 'btn_member';
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_class_${isMember ? 'member' : 'friend'}`)
                .setPlaceholder('請選擇您的遊戲職業...')
                .addOptions(classOptionsList);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            return interaction.update({ 
                content: isMember ? '您選擇了「公會成員」，請先選擇您的遊戲職業：' : '您選擇了「親友團」，請先選擇您的遊戲職業：', 
                components: [row] 
            });
        }

        // 幹部點擊「審核通過」
        if (interaction.customId.startsWith('approve_')) {
            const [_, targetUserId, targetClass] = interaction.customId.split('_');
            
            try {
                // 1. 抓取卡片資料
                const embed = interaction.message.embeds[0];
                const gameName = embed.fields.find(f => f.name === '遊戲名稱')?.value || '未知';
                const gameLevel = embed.fields.find(f => f.name === '等級')?.value || '未知';
                const gameCode = embed.fields.find(f => f.name === '代碼')?.value || '未知';

                // 2. 配發身分組
                const member = await interaction.guild.members.fetch(targetUserId);
                let rolesToAdd = [config.roles.guildMember];
                if (config.roles.classes[targetClass]) rolesToAdd.push(config.roles.classes[targetClass]);
                await member.roles.add(rolesToAdd);

                // 3. 💾 寫入資料庫
                await db.collection('members').doc(targetUserId).set({
                    discordId: targetUserId,
                    discordTag: member.user.tag,
                    gameName: gameName,
                    gameClass: targetClass,
                    gameLevel: gameLevel,
                    gameCode: gameCode,
                    role: '公會成員',
                    joinDate: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                // 4. 📝 修改伺服器暱稱 (遊戲名稱 遊戲等級 遊戲職業)
                const newNickname = `${gameName} LV${gameLevel} ${targetClass}`.substring(0, 32);
                try {
                    await member.setNickname(newNickname);
                } catch (nickError) {
                    console.log(`⚠️ 權限不足，無法修改 ${member.user.tag} 的暱稱`);
                }

                await member.send(`🎉 恭喜您！申請已通過，歡迎加入 ENDLESS！您的專屬身分組與暱稱已自動設定完畢。`);
                return interaction.update({ content: `✅ 已批准 <@${targetUserId}>，資料已寫入且暱稱已修改。`, embeds: [], components: [] });

            } catch (error) {
                console.error(error);
                return interaction.reply({ content: '❌ 處理失敗，請確認機器人權限。', ephemeral: true });
            }
        }

        // 幹部點擊「不通過」
        if (interaction.customId.startsWith('reject_')) {
            const targetUserId = interaction.customId.split('_')[1];
            const modal = new ModalBuilder().setCustomId(`modal_reject_${targetUserId}`).setTitle('填寫退回原因');
            const reasonInput = new TextInputBuilder().setCustomId('reject_reason').setLabel("不通過的原因").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            return interaction.showModal(modal);
        }
    }

    // ==========================================
    // 🔘 處理下拉式選單 (觸發彈出表單)
    // ==========================================
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('select_class_')) {
            const isMember = interaction.customId === 'select_class_member';
            const selectedClass = interaction.values[0]; 
            
            const modal = new ModalBuilder()
                .setCustomId(`modal_${isMember ? 'member' : 'friend'}_${selectedClass}`)
                .setTitle(isMember ? '公會成員資料填寫' : '親友團資料填寫');

            if (isMember) {
                const q1 = new TextInputBuilder().setCustomId('game_name').setLabel("遊戲名稱").setStyle(TextInputStyle.Short);
                const q2 = new TextInputBuilder().setCustomId('game_level').setLabel("遊戲等級 (請填純數字)").setStyle(TextInputStyle.Short);
                const q3 = new TextInputBuilder().setCustomId('game_code').setLabel("遊戲代碼").setStyle(TextInputStyle.Short);
                modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(q2), new ActionRowBuilder().addComponents(q3));
            } else {
                const q1 = new TextInputBuilder().setCustomId('nickname').setLabel("暱稱").setStyle(TextInputStyle.Short);
                modal.addComponents(new ActionRowBuilder().addComponents(q1));
            }
            return interaction.showModal(modal);
        }
    }

    // ==========================================
    // 🔘 處理表單送出 (Modal Submit)
    // ==========================================
    if (interaction.isModalSubmit()) {
        
        // 📝 提交公會成員申請
        if (interaction.customId.startsWith('modal_member_')) {
            const gameClass = interaction.customId.split('_')[2]; 
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
                    ).setColor('#0099ff');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_${interaction.user.id}_${gameClass}`).setLabel('審核通過').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('不通過').setStyle(ButtonStyle.Danger)
                );
                await channel.send({ embeds: [embed], components: [row] });
            }
            return interaction.update({ content: `✅ 資料已送出審核！`, components: [] });
        }

        // 📝 提交親友團申請
        if (interaction.customId.startsWith('modal_friend_')) {
            const gameClass = interaction.customId.split('_')[2];
            const nicknameInput = interaction.fields.getTextInputValue('nickname');

            let rolesToAdd = [config.roles.familyFriend];
            if (config.roles.classes[gameClass]) rolesToAdd.push(config.roles.classes[gameClass]);

            try {
                await interaction.member.roles.add(rolesToAdd);
                
                // 自動修改親友團暱稱 (暱稱 遊戲職業)
                const newNickname = `${nicknameInput} ${gameClass}`.substring(0, 32);
                try { await interaction.member.setNickname(newNickname); } catch(e) {}

                return interaction.update({ content: `✅ 登記成功！已為您配發親友團與 **${gameClass}** 身分組！`, components: [] });
            } catch (error) {
                return interaction.update({ content: '❌ 配發身分組失敗，請聯絡管理員確認權限。', components: [] });
            }
        }

        // 📝 拒絕申請理由
        if (interaction.customId.startsWith('modal_reject_')) {
            const targetUserId = interaction.customId.split('_')[2];
            const reason = interaction.fields.getTextInputValue('reject_reason');
            try {
                const member = await interaction.guild.members.fetch(targetUserId);
                await member.send(`您好，很抱歉通知您，您在 ENDLESS 的加入申請未通過。\n**原因：** ${reason}`);
                return interaction.update({ content: `❌ 已拒絕 <@${targetUserId}> 的申請。原因：${reason}`, embeds: [], components: [] });
            } catch (error) {
                return interaction.reply({ content: '❌ 無法發送私訊。', ephemeral: true });
            }
        }

        // 📝 會員自主更新資料
        if (interaction.customId === 'modal_update_data') {
            const newName = interaction.fields.getTextInputValue('update_name');
            const newLevel = interaction.fields.getTextInputValue('update_level');
            const userId = interaction.user.id;

            try {
                // 先去資料庫抓原本的職業資料
                const doc = await db.collection('members').doc(userId).get();
                if (!doc.exists) {
                    return interaction.reply({ content: '❌ 找不到您的公會成員資料，請先透過 `/解鎖權限` 申請加入！', ephemeral: true });
                }

                const userData = doc.data();
                const gameClass = userData.gameClass;

                // 更新資料庫
                await db.collection('members').doc(userId).update({
                    gameName: newName,
                    gameLevel: newLevel,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });

                // 同步修改 Discord 暱稱
                const newNickname = `${newName} LV${newLevel} ${gameClass}`.substring(0, 32);
                try { await interaction.member.setNickname(newNickname); } catch(e) {}

                return interaction.reply({ content: `✅ 資料更新成功！您的暱稱已更新為：**${newNickname}**`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: '❌ 更新失敗。', ephemeral: true });
            }
        }
    }
});

// ==========================================
// 💌 5️⃣ 處理新成員加入
// ==========================================
client.on('guildMemberAdd', async member => {
    try {
        await member.send(
            `👋 歡迎來到 **ENDLESS** 大家庭！\n\n` +
            `請前往伺服器內的任意頻道，輸入 \`/解鎖權限\` 指令來申請身分。\n` +
            `日後若等級有提升，您可以隨時在頻道輸入 \`/更新資料\` 來同步您的最新等級喔！`
        );
    } catch (error) {
        console.log(`⚠️ 無法發送私訊給：${member.user.tag}`);
    }
});

client.login(process.env.DISCORD_TOKEN);
