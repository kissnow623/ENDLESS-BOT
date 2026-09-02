// utils/marketHelpers.js
let marketCache = [];

const updateMarketData = async () => {
    try {
        const apiUrl = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTLmDW_ZCkGLcAPNsRq-fJz2q3Wn-o4NrBKgiZWwEPCZ1CRTEiv5smhX-8TYkDsqsmvEtBqaeDzX37yLUDSXNu5JcIAazXX_RzD5QXeI48WOwXAHwL1AIQ-4U6TD3jv_2hV7Pj8nRrlIvYPTfMZvujKsTVIs9mRv2aDUuZNWLAoWiSfCezUMMB_MUM_LeU6ayTPKKNQLElLxxnIV_nqqTdwd3Il9eqMK1WDuLk-Ta6bVgrf12h0XmI9BBHwyt1BCyUo-XmeC16rJdouYD4&lib=MSazkfjKFScE872l7DO2-5uaMJ5Q-zlzu';
        
        console.log('[📦 物價調查局] 開始爬取最新物價資料...');
        const response = await fetch(apiUrl);
        const data = await response.json();

        let rawArray = [];
        // 應對各種可能的 API 回傳格式
        if (Array.isArray(data)) rawArray = data;
        else if (data.data && Array.isArray(data.data)) rawArray = data.data;
        else if (data.result && Array.isArray(data.result)) rawArray = data.result;

        if (rawArray.length > 0) {
            marketCache = rawArray.map(item => ({
                // 多重防呆：盡可能涵蓋所有中英文的命名可能
                name: String(item['ItemName'] || item['物品名稱'] || item['name'] || item['Name'] || item['item'] || '未知物品'),
                price: String(item['Price'] || item['價格'] || item['price'] || item['cost'] || '未知價格'),
                trend: String(item['Trend'] || item['漲跌'] || item['trend'] || item['status'] || '--') 
            }));
            console.log(`[📦 物價調查局] 資料更新成功！共載入 ${marketCache.length} 筆物品。`);
        } else {
            console.log('[⚠️ 物價調查局] 成功連線，但找不到陣列資料，請確認 API 格式。');
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
