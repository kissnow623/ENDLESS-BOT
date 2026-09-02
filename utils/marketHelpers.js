// utils/marketHelpers.js
let marketCache = [];

const updateMarketData = async () => {
    try {
        const apiUrl = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTLmDW_ZCkGLcAPNsRq-fJz2q3Wn-o4NrBKgiZWwEPCZ1CRTEiv5smhX-8TYkDsqsmvEtBqaeDzX37yLUDSXNu5JcIAazXX_RzD5QXeI48WOwXAHwL1AIQ-4U6TD3jv_2hV7Pj8nRrlIvYPTfMZvujKsTVIs9mRv2aDUuZNWLAoWiSfCezUMMB_MUM_LeU6ayTPKKNQLElLxxnIV_nqqTdwd3Il9eqMK1WDuLk-Ta6bVgrf12h0XmI9BBHwyt1BCyUo-XmeC16rJdouYD4&lib=MSazkfjKFScE872l7DO2-5uaMJ5Q-zlzu';
        
        console.log('[📦 物價調查局] 開始爬取最新物價資料...');
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data && Array.isArray(data.headers) && Array.isArray(data.rows) && data.rows.length > 0) {
            const headers = data.headers;
            const latestRow = data.rows[data.rows.length - 1]; // 最新報價
            
            // 嘗試取得「上一筆」報價來計算漲跌 (如果資料只有一筆就拿最新的一筆)
            const previousRow = data.rows.length > 1 ? data.rows[data.rows.length - 2] : latestRow;
            const newCache = [];

            // 迴圈從 1 開始，跳過索引 0 的 'Timestamp'
            for (let i = 1; i < headers.length; i++) {
                const itemName = headers[i];
                const currentPrice = latestRow[i];
                const prevPrice = previousRow[i];

                if (itemName && currentPrice !== undefined && currentPrice !== null && currentPrice !== '') {
                    let trendStr = '--';
                    
                    // 將字串轉換為數字以進行計算
                    const currNum = Number(currentPrice);
                    const prevNum = Number(prevPrice);

                    // 判斷是否為有效數字，並計算漲跌幅
                    if (!isNaN(currNum) && !isNaN(prevNum) && prevNum > 0) {
                        const diff = currNum - prevNum;
                        if (diff === 0) {
                            trendStr = '持平 ➖';
                        } else {
                            // 計算百分比並取小數點後兩位
                            const percent = ((diff / prevNum) * 100).toFixed(2);
                            trendStr = diff > 0 ? `▲ +${percent}%` : `▼ ${percent}%`;
                        }
                    }

                    // 為價格加上千分位逗號 (例如 148,000,000)
                    const formattedPrice = !isNaN(currNum) ? currNum.toLocaleString('en-US') : currentPrice;

                    newCache.push({
                        name: String(itemName).trim(),
                        price: formattedPrice,
                        trend: trendStr
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
