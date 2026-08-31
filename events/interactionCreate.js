// events/interactionCreate.js
const { config } = require('../config/constants');
const { handleCommand } = require('../handlers/commandHandler');
const { handleComponent } = require('../handlers/componentHandler');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            // [防護] 絕對防呆機制：只允許在你的專屬伺服器運作 (直接比對 config 裡面的 guildId)
            if (interaction.guildId && interaction.guildId !== config.guildId) {
                if (interaction.isRepliable()) {
                    return interaction.reply({ content: '❌ 此伺服器尚未開通迴響機器人服務。', ephemeral: true }).catch(() => {});
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
