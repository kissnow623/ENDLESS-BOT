module.exports = {
    name: 'inviteCreate',
    execute(invite, client) {
        const invites = client.guildInvites.get(invite.guild.id);
        if (invites) invites.set(invite.code, invite.uses);
    }
};
