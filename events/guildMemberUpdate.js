const { config } = require('../config/constants');
const { checkAndThankBooster } = require('../utils/guildHelpers');

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember, client) {
        if (!oldMember.premiumSince && newMember.premiumSince) {
            const boostChannel = await newMember.guild.channels.fetch(config.channels.boostThanks).catch(() => null);
            await checkAndThankBooster(newMember, boostChannel, 'normal');
        }
    }
};
