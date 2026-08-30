module.exports = {
    name: 'inviteDelete',
    execute(invite, client) {
        const invites = client.guildInvites.get(invite.guild.id);
        if (invites) invites.delete(invite.code);
    }
};
