// handlers/commandHandler.js
const { PermissionsBitField } = require('discord.js');
const { config } = require('../config/constants');

// 🌟 引入兩大核心部門
const { handleMarketInteraction, handleMarketCommand } = require('./marketHandler');
const { handleSystemCommand } = require('./systemHandler');

async function handleCommand(interaction, client) {
    // 🛡️ 集中進行權限驗證，統一派發給下游模組
    const isOwner = interaction.user.id === interaction.guild?.ownerId; 
    const hasAdminRole = interaction.member?.roles?.cache?.hasAny(...config.roles.adminRoles); 
    const hasAdminPerm = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator); 
    const isGuildMember = interaction.member?.roles?.cache?.has(config.roles.guildMember) || interaction.member?.roles?.cache?.some(r => r.name.includes('公會'));

    // ==========================================
    // 1️⃣ 元件互動攔截 (按鈕、下拉選單、彈出表單)
    // ==========================================
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const cId = interaction.customId;
        // 只要是市場金融相關的 ID，全部丟給市場部處理
        if (cId && (cId.includes('market_') || cId.includes('publish_') || cId.includes('portfolio_') || cId.includes('paper_'))) {
            return handleMarketInteraction(interaction, client, isGuildMember);
        }
        // 其他系統的元件可能由 componentHandler 處理，這裡直接 return 放行
        return; 
    }

    // ==========================================
    // 2️⃣ 斜線指令分流 (Slash Commands)
    // ==========================================
    if (!interaction.isChatInputCommand()) return;
    const cmd = interaction.commandName;

    // 定義市場部負責的指令清單
    const marketCmds = ['查價', '折溢排行', '課金指南', '新增資產', '我的資產', '巨鯨雷達'];

    if (marketCmds.includes(cmd)) {
        // 📈 轉交給市場金融部
        return handleMarketCommand(interaction, client, isGuildMember);
    } else {
        // 👑 轉交給公會營運部 (包含預約、貼圖、管理設定等)
        return handleSystemCommand(interaction, client, isOwner, hasAdminRole, hasAdminPerm, isGuildMember);
    }
}

module.exports = { handleCommand };
