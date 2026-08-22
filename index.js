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
// 🤖 4️⃣ 建立 Discord Client 與 指令註冊 (新增 DM 與 Message 權限)
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.DirectMessages,   // 允許接收私訊
        GatewayIntentBits.MessageContent    // 允許讀取訊息內容 (圖片/文字)
    ],
    partials: [
        Partials.User, 
        Partials.GuildMember, 
        Partials.Channel, // 必須要有 Channel 才能在私訊尚未快取時接收
        Partials.Message
    ]
});

client.on('debug', info => console.log(`[DJS 連線追蹤] ${info}`));
client.on('warn', info => console.log(`[DJS 警告] ${info}`));
client.on('error', error => console.error(`[DJS 錯誤]`, error));

client.once('clientReady', async () => {
    console.log(`🤖 機器人登入成功：${client.user.tag}!`);
    const commands = [
        { name: '解鎖權限', description: '發布加入 ENDLESS 或是成為親友團的申請面板' },
        { name: '查詢目前公會成員', description: '查詢公會成員列表與總人數 (僅限管理員)' },
        { name: '更新資料', description: '更新您的遊戲名稱或等級 (同步修改暱稱)' }
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

            if ((cmd === '解鎖權限' || cmd === '查詢目前公會成員') && !isOwner && !hasAdminRole && !hasAdminPerm) {
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
                return interaction.reply({ 
                    content: isMember ? '您選擇了「公會成員」，請選擇職業：' : '您選擇了「親友團」，請選擇職業：', 
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
                    let rolesToAdd = [config.roles.guildMember];
                    if (config.roles.classes[targetClass]) rolesToAdd.push(config.roles.classes[targetClass]);
                    await member.roles.add(rolesToAdd);

                    await db.collection('members').doc(targetUserId).set({
                        discordId: targetUserId, discordTag: member.user.tag, gameName: gameName,
                        gameClass: targetClass, gameLevel: gameLevel, gameCode: gameCode, role: '公會成員', joinDate: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    const newNickname = `［${gameName}］☀️［${targetClass}］`.substring(0, 32);
                    try { await member.setNickname(newNickname); } 
                    catch(e) { await member.send(`⚠️ 溫馨提醒：請手動修改暱稱為：**${newNickname}**`).catch(() => {}); }

                    await member.send(`🎉 恭喜！申請已通過，歡迎加入 ENDLESS！`).catch(() => {});

                    const updatedEmbed = EmbedBuilder.from(originalEmbed)
                        .setColor('#00FF00')
                        .setTitle('✅ 審核已通過')
                        .setFooter({ text: `由 ${interaction.user.tag} 批准`, iconURL: interaction.user.displayAvatarURL() });
                    await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

                } catch (error) { 
                    return interaction.followUp({ content: '❌ 處理失敗，請確認機器人權限。', ephemeral: true }); 
                }
            }

            // 🛡️ 審核拒絕
            if (interaction.customId.startsWith('reject_')) {
                const targetUserId = interaction.customId.split('_')[1];
                const msgId = interaction.message.id; 
                
                const reasonSelect = new StringSelectMenuBuilder()
                    .setCustomId(`select_reject_reason_${targetUserId}_${msgId}`)
                    .setPlaceholder('請選擇退回原因...')
                    .addOptions([
                        { label: '等級未達標', description: '未達公會招收門檻', value: '等級未達標，請繼續加油！期待你變強後再來申請！', emoji: '📈' },
                        { label: '資料填寫錯誤', description: '遊戲名稱或代碼有誤', value: '資料填寫有誤，請確認後重新申請。', emoji: '📝' },
                        { label: '查無此人 / 資格不符', description: '遊戲內查無此人或黑名單', value: '經查核帳號資料有疑慮，或查無此代碼。', emoji: '🚫' },
                        { label: '✍️ 自行輸入理由...', description: '手動輸入其他原因', value: 'custom' }
                    ]);

                return interaction.reply({
                    content: '請選擇要退回該申請的原因：',
                    components: [new ActionRowBuilder().addComponents(reasonSelect)],
                    ephemeral: true
                });
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
                        // ❌ 已移除 URL 欄位，因為我們現在用 DM 直接收圖！
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
                    const reasonInput = new TextInputBuilder().setCustomId('reject_reason').setLabel("請輸入原因").setStyle(TextInputStyle.Paragraph).setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                    return interaction.showModal(modal);
                } else {
                    await interaction.deferUpdate();
                    try {
                        const member = await interaction.guild.members.fetch(targetUserId);
                        await member.send(`您的申請未通過。\n**原因：** ${reason}`).catch(() => {});
                        
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
            
            // ✨ 升級版：公會申請 + 私訊索取照片系統
            if (interaction.customId.startsWith('modal_member_')) {
                const gameClass = interaction.customId.split('_')[2]; 
                const name = interaction.fields.getTextInputValue('game_name');
                const level = interaction.fields.getTextInputValue('game_level');
                const code = interaction.fields.getTextInputValue('game_code');
                
                await interaction.deferReply({ ephemeral: true }); 

                // 建立一個打包發送至審核頻道的函式
                const sendToApprovalChannel = async (photoUrl = null, timeoutNote = false) => {
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

                            if (photoUrl) embed.setImage(photoUrl); // 貼上玩家在私訊傳的截圖
                            if (timeoutNote) embed.addFields({ name: '⚠️ 備註', value: '玩家未在 5 分鐘內附上截圖。' });

                            const row = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`approve_${interaction.user.id}_${gameClass}`).setLabel('✅ 審核通過').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('❌ 拒絕/退回').setStyle(ButtonStyle.Danger)
                            );
                            await channel.send({ embeds: [embed], components: [row] });
                        }
                    } catch (error) {
                        console.error("❌ 送出審核表單失敗：", error);
                    }
                };

                // 嘗試開啟私訊通道索取圖片
                try {
                    const dmChannel = await interaction.user.createDM();
                    await interaction.editReply({ content: `✅ 第一步完成！\n\n📸 **請立刻去查看我給你的「私訊 (DM)」**，並直接把你的遊戲截圖傳送給我，才能完成最後的申請步驟喔！` });

                    await dmChannel.send(`👋 嗨！你剛剛填寫了 ENDLESS 的入會申請。\n\n📸 **請在 5 分鐘內，直接將你的「遊戲截圖」上傳/發送在這個聊天室。**\n*(這張截圖會直接附在你的申請單上給幹部看)*\n\n如果不需要上傳截圖，請直接回覆文字：\`跳過\``);

                    // 建立私訊收集器 (時限 5 分鐘，只收一則訊息)
                    const filter = m => m.author.id === interaction.user.id;
                    const collector = dmChannel.createMessageCollector({ filter, time: 5 * 60 * 1000, max: 1 });

                    collector.on('collect', async m => {
                        let photoUrl = null;
                        if (m.attachments.size > 0) {
                            photoUrl = m.attachments.first().url; // 抓取使用者上傳的圖片
                            await m.reply(`✅ 收到截圖！你的申請單已經完整送出給幹部審核囉！請靜候佳音。`);
                        } else {
                            await m.reply(`✅ 收到指示！已略過截圖步驟，你的申請單已經送出給幹部審核囉！請靜候佳音。`);
                        }
                        // 將圖片傳給審核頻道
                        await sendToApprovalChannel(photoUrl, false);
                    });

                    collector.on('end', async (collected, reason) => {
                        if (reason === 'time') {
                            await dmChannel.send(`⚠️ 5 分鐘時間到！系統已自動將「無截圖」的申請單送出給幹部審核。`);
                            await sendToApprovalChannel(null, true);
                        }
                    });

                } catch (error) {
                    // 如果使用者關閉了「允許來自伺服器成員的私人訊息」，就會跳到這裡
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
                    
                    await db.collection('members').doc(interaction.user.id).set({
                        discordId: interaction.user.id, discordTag: interaction.user.tag, gameName: nicknameInput,
                        gameClass: gameClass, gameLevel: 'N/A', gameCode: 'N/A', role: '親友團', joinDate: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    const newNickname = `［${nicknameInput}］🌙［${gameClass}］`.substring(0, 32);
                    try { await interaction.member.setNickname(newNickname); } 
                    catch(e) { await interaction.member.send(`⚠️ 溫馨提醒：因為您的權限位階較高，機器人無法幫您自動改名，請手動修改為：**${newNickname}**`).catch(() => {}); }
                    
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
                    await member.send(`您的申請未通過。\n**原因：** ${reason}`).catch(() => {});

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
                    const gameClass = userData.gameClass;
                    const roleType = userData.role; 
                    
                    const updateData = { gameName: newName, lastUpdated: admin.firestore.FieldValue.serverTimestamp() };
                    if (newLevel && newLevel !== 'N/A') updateData.gameLevel = newLevel;
                    await db.collection('members').doc(interaction.user.id).update(updateData);
                    
                    const newNickname = roleType === '公會成員' ? `［${newName}］☀️［${gameClass}］`.substring(0, 32) : `［${newName}］🌙［${gameClass}］`.substring(0, 32);
                    
                    try { await interaction.member.setNickname(newNickname); } 
                    catch(e) { await interaction.member.send(`⚠️ 溫馨提醒：請手動將暱稱修改為：**${newNickname}**`).catch(() => {}); }
                    
                    return interaction.editReply({ content: `✅ 資料更新成功！您的暱稱已同步更新！` });
                } catch (error) { return interaction.editReply({ content: '❌ 更新失敗，請稍後再試。' }); }
            }
        }
    } catch (globalError) {
        console.error("🚨 互動處理發生未預期錯誤：", globalError);
    }
});

// ==========================================
// 💌 5️⃣ 處理新成員加入
// ==========================================
client.on('guildMemberAdd', async member => {
    try { await member.send(`👋 歡迎來到 **ENDLESS**！請前往伺服器內的任意頻道，輸入 \`/解鎖權限\` 指令來申請身分。`).catch(() => {}); } catch (error) {}
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
