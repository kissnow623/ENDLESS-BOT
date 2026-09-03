// events/interactionCreate.js
const { config } = require('../config/constants');
const { handleCommand } = require('../handlers/commandHandler');
const { handleComponent } = require('../handlers/componentHandler');
const { getCache } = require('../utils/firebase');
const { searchMarketItems } = require('../utils/marketHelpers'); // 🌟 引入物價搜尋引擎

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            if (interaction.guildId && interaction.guildId !== config.guildId) {
                if (interaction.isRepliable()) {
                    return interaction.reply({ content: '❌ 此伺服器尚未開通迴響機器人服務。', ephemeral: true }).catch(() => {});
                }
                return;
            }

            // 自動補全 (Autocomplete) 處理
            if (interaction.isAutocomplete()) {
                try {
                    const focusedValue = interaction.options.getFocused() || '';

                    // 🎭 表情包搜尋
                    if (interaction.commandName === '表情包') {
                        const { emotes } = getCache();
                        if (!emotes || emotes.length === 0) return await interaction.respond([]);
                        const filtered = emotes.filter(e => e.name.includes(focusedValue)).slice(0, 25);
                        await interaction.respond(filtered.map(choice => ({ name: choice.name, value: choice.name })));
                    }
                    
                    // 📈 🌟 物價搜尋
                    if (interaction.commandName === '查價') {
                        const choices = searchMarketItems(focusedValue);
                        await interaction.respond(choices.map(choice => ({ name: choice.name, value: choice.name })));
                    }
                } catch (err) {
                    console.error("⚠️ Autocomplete 搜尋發生錯誤：", err);
                }
                return; 
            }

            // 斜線指令 (Chat Input Commands)
            if (interaction.isChatInputCommand()) {
                await handleCommand(interaction, client);
            } 
            // 按鈕、下拉選單、表單 (Buttons, Select Menus, Modals)
            else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
                const cId = interaction.customId || '';
                
                // 🌟 攔截市場看板的專屬元件，強制導向 commandHandler 處理
                if (cId.includes('market_') || cId.startsWith('publish_')) {
                    await handleCommand(interaction, client);
                } else {
                    // 其他舊有功能依然交由 componentHandler 處理
                    await handleComponent(interaction, client);
                }
            }

        } catch (globalError) {
            if (globalError.code === 10062) return;
            console.error("🚨 互動處理發生未預期錯誤：", globalError);
        }
    }
};
