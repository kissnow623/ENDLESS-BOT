// events/ready.js
const { PermissionFlagsBits, ApplicationCommandOptionType } = require('discord.js');
const { config } = require('../config/constants');
const { checkAndThankBooster } = require('../utils/guildHelpers');
const { startScheduler } = require('../utils/scheduler');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`🤖 機器人登入成功：${client.user.tag}!`);
        const adminPerms = PermissionFlagsBits.Administrator.toString();

        // 快取伺服器內所有的邀請連結
        client.guilds.cache.forEach(async guild => {
            try {
                const invites = await guild.invites.fetch();
                const codeUses = new Map();
                invites.forEach(inv => codeUses.set(inv.code, inv.uses));
                client.guildInvites.set(guild.id, codeUses);
                console.log(`✅ 已快取伺服器 [${guild.name}] 的邀請碼資料，邀請追蹤啟動。`);
            } catch (err) {
                console.log(`⚠️ 無法獲取伺服器 [${guild.name}] 的邀請碼。`);
            }
        });

        // 定義所有指令
        const echoCommands = [
            { name: '預約', description: '開啟王團預約表單', options: [{ name: '地點', type: 3, description: '請選擇預約地點', required: true, choices: [ { name: '闇黑龍王', value: '闇黑龍王' }, { name: '艾畢奈亞', value: '艾畢奈亞' }, { name: '道館', value: '道館' }, { name: '其他', value: '其他' } ] }] },
            { name: '我的紀錄', description: '查詢個人的預約統計與排單狀態' },
            { name: '接單統計', description: '查詢各專員的接單績效與收益 (管理員/專員)' },
            { name: '查詢預約', description: '分頁檢視未來的完整預約清單 (管理員)' },
            { name: '刷新看板', description: '強制手動刷新所有預約看板 (管理員)' },
            { name: '註冊迴響專員', description: '申請註冊成為專屬迴響專員 (需管理員審核)' },
            { name: '指定迴響專員', description: '直接指定玩家成為迴響專員 (管理員)', options: [{ name: '玩家', type: 6, description: '選擇目標玩家', required: true }] },
            { name: '刪除迴響專員', description: '移除玩家的迴響專員身分 (管理員)', options: [{ name: '玩家', type: 6, description: '選擇要移除身分的玩家', required: true }] },
            { name: '清理訊息', description: '批次清理頻道內的訊息 (管理員)', options: [{ name: '數量', type: 4, description: '要刪除的訊息數量 (1-100)', required: true }] },
            { name: '設定公開看板', description: '將此頻道加入或移除「公開看板區」' },
            { name: '設定管理看板', description: '將此頻道加入或移除「真實名單看板區」' },
            { name: '迴響管理區', description: '將此頻道加入或移除「迴響管理區」' },
            { name: '價格', description: '設定價格', options: [ { name: '地點', type: 3, description: '地點', required: true, choices: [ { name: '闇黑龍王', value: '闇黑龍王' }, { name: '艾畢奈亞', value: '艾畢奈亞' }, { name: '道館', value: '道館' }, { name: '其他', value: '其他' } ] }, { name: '價格', type: 4, description: '萬', required: true } ] },
            { name: '迴響鬧鐘', description: '設定鬧鐘提前分鐘', options: [{ name: '分鐘', type: 4, description: '分鐘', required: true }] },
            { name: '優惠設定', description: '設定VIP規則', options: [ { name: '地點', type: 3, description: '地點', required: true, choices: [ { name: '闇黑龍王', value: '闇黑龍王' }, { name: '艾畢奈亞', value: '艾畢奈亞' }, { name: '道館', value: '道館' }, { name: '其他', value: '其他' } ] }, { name: '滿幾次', type: 4, description: '次數', required: true }, { name: '送幾次', type: 4, description: '次數', required: true } ] },
            { name: '系統狀態', description: '查詢機器人本日資料庫讀寫次數估算與連線狀態 (管理員)' },
            { name: '營運設定', description: '自動審核、更新與凍結時段設定 (管理員)', options: [
                { name: '自動審核', type: 1, description: '開啟或關閉自動審核', options: [{ name: '狀態', type: 3, description: '是否開啟自動審核', required: true, choices: [ { name: '開啟', value: 'true' }, { name: '關閉', value: 'false' } ] }] },
                { name: '自動更新看板', type: 1, description: '每分鐘自動刷新看板時間 (注意資源額度)', options: [{ name: '狀態', type: 3, description: '是否開啟自動更新', required: true, choices: [ { name: '開啟', value: 'true' }, { name: '關閉', value: 'false' } ] }] },
                { name: '新增凍結時段', type: 1, description: '新增無法預約的時間範圍 (24H制)', options: [
                    { name: '類型', type: 3, description: '適用日', required: true, choices: [ { name: '平日 (週一至週五)', value: 'weekday' }, { name: '假日 (週六與週日)', value: 'weekend' }, { name: '不分平假日', value: 'all' } ] }, { name: '開始時間', type: 3, description: '例如 23:00', required: true }, { name: '結束時間', type: 3, description: '例如 08:00', required: true }
                ]},
                { name: '清空凍結時段', type: 1, description: '清除所有已設定的凍結時段' }, { name: '查看目前設定', type: 1, description: '查看自動審核狀態與凍結時段' }
            ]},
            { name: '玩家管理', description: '管理玩家的違規點數與封鎖狀態 (管理員)', options: [
                { name: '玩家', type: 6, description: '選擇目標玩家', required: true }, { name: '動作', type: 3, description: '執行的動作', required: true, choices: [ { name: '解除封鎖 (解Ban)', value: 'unban' }, { name: '清除違規點數 (歸零)', value: 'clear_points' }, { name: '增加違規點數 (+1)', value: 'add_point' }, { name: '扣除違規點數 (-1)', value: 'remove_point' } ]}
            ]},
            { name: '刪除訂單', description: '列出近期歷史訂單以供刪除 (管理員)', options: [ { name: '玩家', type: 6, description: '選擇玩家以縮小搜尋範圍 (選填)', required: false }, { name: '訂單id', type: 3, description: '直接輸入訂單 ID 進行單獨刪除 (選填)', required: false } ] }
        ];

        const guildCommands = [
            { name: '解鎖權限', description: '發布加入 ENDLESS 或是成為親友團的申請面板 (僅限幹部)', default_member_permissions: adminPerms },
            { name: '發布小指南', description: '發布 ENDLESS 實用功能小指南面板 (僅限幹部)', default_member_permissions: adminPerms },
            { name: '查詢目前公會成員', description: '查詢公會成員列表與總人數 (僅限幹部)', default_member_permissions: adminPerms },
            { name: '查詢目前親友團', description: '查詢親友團成員列表與總人數 (僅限幹部)', default_member_permissions: adminPerms },
            { name: '同步更名', description: '批次同步資料庫中所有成員的最新暱稱格式與符號 (僅限幹部)', default_member_permissions: adminPerms },
            { name: '清除資料', description: '清除指定成員的資料庫紀錄與身分組 (僅限幹部)', default_member_permissions: adminPerms, options: [{ name: '目標', description: '請選擇要重置資料的成員', type: ApplicationCommandOptionType.User, required: true }] },
            { name: '清除訊息', description: '快速清除當前頻道指定數量的訊息 (僅限幹部)', default_member_permissions: adminPerms, options: [{ name: '數量', description: '請輸入要清除的訊息數量 (1 到 100)', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 100 }] },
            { name: '星光紅毯設定', description: '開啟或關閉專屬的進場浮誇歡迎詞 (僅限加成者)', options: [{ name: '狀態', type: 3, description: '選擇開啟或關閉', required: true, choices: [{name:'開啟', value:'on'}, {name:'關閉', value:'off'}] }] }
        ];

        try {
            await client.application.commands.set([]); 
            const guild = client.guilds.cache.get(config.guildId);
            if (guild) {
                await guild.commands.set([...echoCommands, ...guildCommands]);
                console.log('✅ 所有指令已專屬註冊至 ENDLESS 伺服器，並清空全域重複指令！');
            }
        } catch (error) { 
            console.error('❌ 指令註冊失敗：', error); 
        }

        // 開機掃描 Booster
        try {
            const guild = client.guilds.cache.get(config.guildId);
            if (guild) {
                const boostChannel = await guild.channels.fetch(config.channels.boostThanks).catch(() => null);
                if (boostChannel) {
                    const members = await guild.members.fetch();
                    for (const [id, member] of members) {
                        if (member.premiumSince) {
                            await checkAndThankBooster(member, boostChannel, 'normal');
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                    console.log('✅ 啟動加成狀態掃描完成！');
                }
            }
        } catch (err) { console.error('❌ 啟動掃描加成者失敗：', err); }

        // 啟動 60 秒定時排程引擎
        startScheduler(client);
    }
};
