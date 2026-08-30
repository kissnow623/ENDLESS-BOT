const { db, admin } = require('../utils/firebase');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        try {
            const cachedInvites = client.guildInvites.get(member.guild.id);
            if (!cachedInvites) return;

            const newInvites = await member.guild.invites.fetch().catch(() => null);
            if (!newInvites) return;

            const usedInvite = newInvites.find(inv => inv.uses > (cachedInvites.get(inv.code) || 0));
            let inviterData = '無法追蹤 / 未知';

            if (usedInvite && usedInvite.inviter) {
                inviterData = `<@${usedInvite.inviter.id}>`; 
            }

            newInvites.forEach(inv => cachedInvites.set(inv.code, inv.uses));
            client.guildInvites.set(member.guild.id, cachedInvites);

            await db.collection('inviteTracking').doc(member.id).set({
                inviter: inviterData,
                joinedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            console.error("❌ 追蹤邀請人發生錯誤：", error);
        }
    }
};
