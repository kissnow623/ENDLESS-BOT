// utils/marketHelpers.js
let marketCache = [];

const updateMarketData = async () => {
    try {
        const apiUrl = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTLmDW_ZCkGLcAPNsRq-fJz2q3Wn-o4NrBKgiZWwEPCZ1CRTEiv5smhX-8TYkDsqsmvEtBqaeDzX37yLUDSXNu5JcIAazXX_RzD5QXeI48WOwXAHwL1AIQ-4U6TD3jv_2hV7Pj8nRrlIvYPTfMZvujKsTVIs9mRv2aDUuZNWLAoWiSfCezUMMB_MUM_LeU6ayTPKKNQLElLxxnIV_nqqTdwd3Il9eqMK1WDuLk-Ta6bVgrf12h0XmI9BBHwyt1BCyUo-XmeC16rJdouYD4&lib=MSazkfjKFScE872l7DO2-5uaMJ5Q-zlzu';
        
        console.log('[📦 物價調查局] 開始爬取最新物價資料...');
        const response = await fetch(apiUrl);
        const data = await response.json();

        // 針對該 API 特殊的 headers 與 rows 結構進行解析
        if (data && Array.isArray(data.headers) && Array.isArray(data.rows) && data.rows.length > 0) {
            const headers = data.headers;
            const latestRow = data.rows[data.rows.length - 1]; // 取得最後一筆最新報價
            const newCache = [];

            // 迴圈從 1 開始，跳過索引 0 的 'Timestamp'
            for (let i = 1; i < headers.length; i++) {
                const itemName = headers[i];
                const itemPrice = latestRow[i];

                if (itemName && itemPrice !== undefined && itemPrice !== null && itemPrice !== '') {
                    newCache.push({
                        name: String(itemName).trim(),
                        price: String(itemPrice),
                        trend: '--' // 此 API 未提供漲跌幅，預設為 '--'
                    });
                }
            }

            marketCache = newCache;
            console.log(`[📦 物價調查局] 資料更新成功！共載入 ${marketCache.length} 筆物品。`);
        } else {
            console.log('[⚠️ 物價調查局] 成功連線，但找不到 headers 或 rows 結構，請確認 API 格式。');
        }
    } catch (error) {
        console.error('[❌ 物價調查局] 爬取失敗:', error);
    }
};

// 精準查詢 (給指令用)
const getMarketItem = (itemName) => {
    return marketCache.find(item => item.name === itemName) || null;
};

// 模糊搜尋 (給自動補全 Autocomplete 用)
const searchMarketItems = (query) => {
    if (!query) return marketCache.slice(0, 25);
    return marketCache
        .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 25); // Discord 選單最多只能顯示 25 筆
};

module.exports = {
    updateMarketData,
    getMarketItem,
    searchMarketItems
};
