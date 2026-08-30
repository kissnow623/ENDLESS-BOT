const { db } = require('../utils/firebase');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        try {
            const doc = await db.collection('members').doc(member.id).get();
            if (doc.exists) {
                await db.collection('members').doc(member.id).delete();
                console.log(`🧹 偵測到成員 ${member.user.tag} 離開伺服器，已自動清除其 Firebase 紀錄。`);
            }
            await db.collection('inviteTracking').doc(member.id).delete().catch(()=>{});
        } catch (error) { 
            console.error("❌ 清除離開成員資料失敗：", error); 
        }
    }
};
