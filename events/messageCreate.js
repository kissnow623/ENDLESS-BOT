const { db } = require('../utils/firebase');
const { config, boosterRedCarpetMessages } = require('../config/constants');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (!config.features.redCarpetEnabled) return;
        if (message.author.bot || message.channel.id !== config.channels.chatLounge) return;

        if (message.member && message.member.premiumSince) {
            try {
                const todayStr = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }); 
                const docRef = db.collection('boosterSettings').doc(message.author.id);
                const doc = await docRef.get();

                let data = doc.exists ? doc.data() : { optOut: false, lastRedCarpet: '', hasSeenHint: false };
                if (data.optOut || data.lastRedCarpet === todayStr) return;

                let randomMsg = boosterRedCarpetMessages[Math.floor(Math.random() * boosterRedCarpetMessages.length)](`<@${message.author.id}>`);
                await message.channel.send(randomMsg);
                
                if (!data.hasSeenHint) {
                    try {
                        await message.author.send(`✨ **關於您的專屬紅毯進場** ✨\n*(💡 貼心小提醒：剛剛在 <#${message.channel.id}> 的浮誇進場是 Booster 專屬特權喔！如果您覺得太高調，隨時可以在伺服器聊天頻道輸入 \`/星光紅毯設定\` 指令將其關閉！)*`);
                    } catch (e) {
                        const hintMsg = await message.channel.send(`<@${message.author.id}> *(💡 貼心小提醒：這是 Booster 專屬特權喔！若覺得太高調，隨時可使用 \`/星光紅毯設定\` 關閉。此提示 15 秒後自動刪除)*`);
                        setTimeout(() => hintMsg.delete().catch(() => null), 15000);
                    }
                }
                await docRef.set({ lastRedCarpet: todayStr, hasSeenHint: true }, { merge: true });
            } catch (err) { 
                console.error('❌ 星光紅毯觸發失敗：', err); 
            }
        }
    }
};
