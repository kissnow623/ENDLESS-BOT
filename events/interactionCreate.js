// events/interactionCreate.js
const { ALLOWED_GUILDS } = require('../config/constants');
const { handleCommand } = require('../handlers/commandHandler');
const { handleComponent } = require('../handlers/componentHandler');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            // [防護] 只允許在特定伺服器運作 
            if (interaction.guildId && ALLOWED_GUILDS.length > 0 && !ALLOWED_GUILDS.includes(interaction.guildId)) {
                if (interaction.isRepliable()) {
                    return interaction.reply({ content: '❌ 此伺服器尚未開通機器人服務。', ephemeral: true }).catch(() => {});
                }
                return;
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
