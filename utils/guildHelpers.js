// utils/guildHelpers.js
const { EmbedBuilder } = require('discord.js');
const { db, admin } = require('./firebase');
const { config, boostBannerImages } = require('../config/constants');

async function updateNickname(member, gameName, roleType, classesArray) {
    const icon = roleType === '公會成員' ? '🌟' : '🍁';
    const classesStr = classesArray.join('｜');
    let newNick = `${gameName} ${icon} ${classesStr}`; 
    if (newNick.length > 32) newNick = newNick.substring(0, 32); 
    try { 
        await member.setNickname(newNick); 
    } catch (e) { 
        console.log(`⚠️ 無法修改 ${member.user?.tag} 的暱稱`); 
    }
    return newNick;
}

async function generateMemberLeaderboard() {
    try {
        const snapshot = await db.collection('members').where('role', '==', '公會成員').get();
        if (snapshot.empty) return '目前資料庫中沒有公會成員紀錄。';
        
        let members = [];
        snapshot.forEach(doc => members.push(doc.data()));
        members.sort((a, b) => (parseInt(b.gameLevel) || 0) - (parseInt(a.gameLevel) || 0));
        
        let description = `目前公會總人數：**${members.length}** 人\n\n**【 成員等級排行榜 】**\n`;
        members.forEach((m, index) => { 
            const classes = m.gameClasses ? m.gameClasses.join('｜') : m.gameClass;
            description += `${index + 1}.**(LV.${m.gameLevel})-** ${m.gameName} 🌟 ${classes}\n`; 
        });
        return new EmbedBuilder().setTitle('🛡️ ENDLESS 公會成員名冊').setDescription(description.substring(0, 4000)).setColor('#FFD700');
    } catch (error) {
        console.error('❌ 產生公會成員排行榜失敗：', error);
        return null;
    }
}

async function generateFriendLeaderboard() {
    try {
        const snapshot = await db.collection('members').where('role', '==', '親友團').get();
        if (snapshot.empty) return '目前資料庫中沒有親友團紀錄。';
        
        let members = [];
        snapshot.forEach(doc => members.push(doc.data()));
        members.sort((a, b) => (a.joinDate?.toDate() || 0) - (b.joinDate?.toDate() || 0));
        
        let description = `目前親友團總人數：**${members.length}** 人\n\n**【 🌙 親友團名單 】**\n`;
        members.forEach((m, index) => { 
            const classes = m.gameClasses ? m.gameClasses.join('｜') : m.gameClass;
            description += `${index + 1}.- ${m.gameName} 🍁 ${classes}\n`; 
        });
        return new EmbedBuilder().setTitle('🌙 ENDLESS 親友團名冊').setDescription(description.substring(0, 4000)).setColor('#FF99CC');
    } catch (error) {
         console.error('❌ 產生親友團排行榜失敗：', error);
         return null;
    }
}

async function checkAndThankBooster(member, boostChannel, mode = 'normal', interaction = null) {
    if (mode === 'normal' && !member.premiumSince) return false;

    const docRef = db.collection('boostedUsers').doc(member.id);
    const doc = await docRef.get();
    if (mode === 'normal' && doc.exists) return false;

    try {
        const boostCount = member.guild.premiumSubscriptionCount || 0;
        const randomImage = boostBannerImages[Math.floor(Math.random() * boostBannerImages.length)];
        
        const boostVariations = [
            { title: '🌸 星光閃耀！感謝加成 🌸', text: '**太感動啦！** 你的支持化作了滿天星光，點亮了整個 ENDLESS！✨' },
            { title: '💖 愛心爆擊！伺服器升級 💖', text: '**滴答滴答！** 是誰送來了滿滿的愛？超級感謝你的加成火力支援！😍' },
            { title: '🚀 動力引擎啟動！ 🚀', text: '**轟隆隆！** 因為你的專屬加成，公會正全速向更棒的未來起飛啦！🛸' },
            { title: '🏰 ENDLESS 的堅固基石 🏰', text: '**致敬守護者！** 每一座偉大的城堡，都需要最堅固的基石，感謝贊助！🛡️' },
            { title: '💎 尊榮 VIP 降臨 💎', text: '**粉紅徽章亮起！** 讓我們掌聲歡迎 VIP，這份心意我們一定會好好珍惜！✨' },
            { title: '🌟 奇蹟守護者 🌟', text: '**無私奉獻！** 你的支持就像守護 ENDLESS 的魔法護盾，讓伺服器與眾不同！🔮' },
            { title: '🍷 酒館的最強金主 🍷', text: '**大金主降臨！** 謝謝老闆幫公會酒館升級高級沙發，讓我們敬你一杯！🍻' },
            { title: '👑 無可取代的寶藏 👑', text: '**捕捉到寶藏！** 系統偵測到一枚閃閃發光的寶藏夥伴，你絕對是最珍貴的！🎁' },
            { title: '🎆 煙火為你綻放 🎆', text: '**砰砰砰！** 因為你的加成，伺服器的夜空綻放了最美的專屬煙火！🎇' },
            { title: '🎀 溫暖的擁抱 🎀', text: '**溫暖的擁抱！** 你的支持就像冬天裡的一杯熱可可，暖暖地流進了我們心裡... ☕' },
            { title: '💸 乾爹/乾媽撒幣啦 💸', text: '**財力展示！** 感謝您為伺服器注入了滿滿的魔法金幣，ENDLESS 因為您而更加奢華！💰' },
            { title: '👑 絕對領域展開 👑', text: '**超強氣場！** 專屬的加成領域已經啟動，感謝您為公會帶來無與倫比的榮耀與光芒！✨' },
            { title: '🍄 頂級超級藥水 🍄', text: '**能量滿滿！** 您的 Boost 就像一罐超級藥水，讓整個伺服器的活力瞬間回滿啦！❤️‍🔥' },
            { title: '🌌 星際航線解鎖 🌌', text: '**飛向宇宙！** 有了您的推進器加持，ENDLESS 已經準備好突破天際，航向未知的新星系！🚀' },
            { title: '🏅 殿堂級 MVP 降臨 🏅', text: '**全場歡呼！** 您就是我們公會最耀眼的 MVP，感謝您賜予伺服器這份尊貴的加成力量！🏆' }
        ];

        const randomChoice = boostVariations[Math.floor(Math.random() * boostVariations.length)];

        const thankYouEmbed = new EmbedBuilder()
            .setColor('#FF99CC') 
            .setTitle(randomChoice.title) 
            .setDescription(`💖 **Thank you for Ur boost** 💖\n\n${randomChoice.text}\n\n• 目前伺服器累計已有\n ✨ **${boostCount} 個加成** ✨ \n\n• 已解鎖屬於您的專屬出場 BGM！\n 貼心小助手已經私訊音效設定教學給您，趕緊去看看吧 💌`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true })) 
            .setImage(randomImage) 
            .setFooter({ text: `ENDLESS 感謝您的支持與陪伴，祝您一切順利 🤍`, iconURL: member.guild.iconURL() }) 
            .setTimestamp();

        let pingContent = `🎊 **<@${member.id}> 觸發了伺服器感謝加成 💕** 🎊`;
        if (mode === 'test') {
            pingContent = `🎊 **[私密測試預覽] <@${member.id}> 觸發了伺服器感謝加成 💕** 🎊`;
        } else if (mode === 'replay') {
            pingContent = `🎊 **[經典回顧] 再次感謝 <@${member.id}> 對伺服器的偉大加成 💕** 🎊`;
        }

        let sentMessage = null;
        if (mode === 'test' && interaction) {
            sentMessage = await interaction.editReply({ content: pingContent, embeds: [thankYouEmbed], fetchReply: true });
        } else if (boostChannel) {
            sentMessage = await boostChannel.send({ content: pingContent, embeds: [thankYouEmbed] });
            if (sentMessage) {
                try {
                    await sentMessage.react('🎉'); await sentMessage.react('🎊');
                    await sentMessage.react('💖'); await sentMessage.react('✨');
                } catch (e) {}
            }
        }

        if (mode === 'normal') {
            const tutorialEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎶 【 Booster 專屬特權：語音頻道出場 BGM 設定指南 】 🎶')
                .setDescription(`🎀 **叮咚！親愛的乾爹/乾媽您好！(抱大腿)**\n超級無敵感謝您用閃亮亮的 Server Boost 支持 ENDLESS 呀！🥰\n\n你知道嗎？身為尊貴的 Booster，Discord 有送您一個超神氣的隱藏特權喔！就是——**「專屬語音進場 BGM」**！✨\n\n只要設定好，以後您每次踩進公會的語音頻道，系統就會自動幫您播專屬的出場配樂！是不是超有排場、超像巨星登場！😎\n\n👇 **快跟著我的超簡單 3 步驟把專屬 BGM 裝起來吧：**\n\n**Step 1.** 點擊 Discord 左下角您的名字旁邊的 ⚙️ **「使用者設定 (小齒輪)」**。\n**Step 2.** 在左邊清單找到 🔊 **「語音和視訊」**。\n**Step 3.** 往下滾動找到 **「音效板 (Soundboard)」** 區塊，點一下 **「入用語音頻道音效」** 右邊的 ✏️ 鉛筆圖示，就可以挑選您最愛的音效啦！\n\n*(💡 悄悄話：您可以直接選我們 ENDLESS 伺服器自己專屬的可愛音效喔！趕快去挑一首，今晚來語音頻道讓我們驚豔一下吧！)*`)
                .setFooter({ text: 'ENDLESS 專屬貼心小秘書', iconURL: member.guild.iconURL() });

            await member.send({ embeds: [tutorialEmbed] }).catch(() => {});
            await docRef.set({ thankedAt: admin.firestore.FieldValue.serverTimestamp(), tag: member.user.tag });
        }
        return true;
    } catch (err) {
        console.error('❌ 處理加成感謝失敗：', err);
        return false;
    }
}

module.exports = { updateNickname, generateMemberLeaderboard, generateFriendLeaderboard, checkAndThankBooster };
