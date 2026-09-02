// events/interactionCreate.js
const { config } = require('../config/constants');
const { handleCommand } = require('../handlers/commandHandler');
const { handleComponent } = require('../handlers/componentHandler');
const { getCache } = require('../utils/firebase'); // 🌟 引入快取來做即時搜尋

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            // [防護] 絕對防呆機制：只允許在你的專屬伺服器運作
            if (interaction.guildId && interaction.guildId !== config.guildId) {
                if (interaction.isRepliable()) {
                    return interaction.reply({ content: '❌ 此伺服器尚未開通迴響機器人服務。', ephemeral: true }).catch(() => {});
                }
                return;
            }

            // 🌟 分流：自動補全 (Autocomplete) 專門給「表情包」搜尋用
            if (interaction.isAutocomplete()) {
                try {
                    if (interaction.commandName === '表情包') {
                        // 防呆：確保 focusedValue 不會是 undefined，如果沒打字預設為空字串
                        const focusedValue = interaction.options.getFocused() || '';
                        const { emotes } = getCache();
                        
                        if (!emotes || emotes.length === 0) {
                            return await interaction.respond([]);
                        }
                        
                        // 模糊搜尋 (過濾包含玩家輸入關鍵字的表情包)，最多回傳25筆
                        const filtered = emotes.filter(e => e.name.includes(focusedValue)).slice(0, 25);
                        
                        await interaction.respond(
                            filtered.map(choice => ({ name: choice.name, value: choice.name }))
                        );
                    }
                } catch (err) {
                    console.error("⚠️ Autocomplete 搜尋發生錯誤：", err);
                }
                return; // 自動補全處理完必須 return
            }

            // 分流：斜線指令 (Chat Input Commands)
            if (interaction.isChatInputCommand()) {
                await handleCommand(interaction, client);
            } 
            // 分流：按鈕、下拉選單、表單 (Buttons, Select Menus, Modals)
            else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
                await handleComponent(interaction, client);
            }

        } catch (globalError) {
            if (globalError.code === 10062) return; // 忽略 Discord 逾時錯誤
            console.error("🚨 互動處理發生未預期錯誤：", globalError);
        }
    }
};
