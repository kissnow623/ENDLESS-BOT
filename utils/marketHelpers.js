// utils/marketHelpers.js
// 註：Node.js 18+ 已經內建 fetch，如果不支援請 npm install axios 並改用 axios
let marketCache = [];

const updateMarketData = async () => {
    try {
        // 這是你剛剛辛苦抓出來的 API 網址
        const apiUrl = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTLmDW_ZCkGLcAPNsRq-fJz2q3Wn-o4NrBKgiZWwEPCZ1CRTEiv5smhX-8TYkDsqsmvEtBqaeDzX37yLUDSXNu5JcIAazXX_RzD5QXeI48WOwXAHwL1AIQ-4U6TD3jv_2hV7Pj8nRrlIvYPTfMZvujKsTVIs9mRv2aDUuZNWLAoWiSfCezUMMB_MUM_LeU6ayTPKKNQLElLxxnIV_nqqTdwd3Il9eqMK1WDuLk-Ta6bVgrf12h0XmI9BBHwyt1BCyUo-XmeC16rJdouYD4&lib=MSazkfjKFScE872l7DO2-5uaMJ5Q-zlzu';
        
        console.log('[📦 物價調查局] 開始爬取最新物價資料...');
        const response = await fetch(apiUrl);
        const data = await response.json();

        // 整理資料：假設 API 回傳的是陣列，或者包在某個屬性裡 (例如 data.data)
        // ⚠️ 這裡的 data 結構可能需要根據實際 JSON 欄位微調
        // 假設 JSON 結構是陣列，且欄位名稱為 "Item_Name" 和 "Price" (請依照實際欄位修改)
        if (Array.isArray(data)) {
             marketCache = data.map(item => ({
                 name: item['ItemName'] || item['物品名稱'] || item.name || '未知物品',
                 price: item['Price'] || item['價格'] || item.price || '未知價格',
                 trend: item['Trend'] || item['漲跌'] || item.trend || '--' 
             }));
        } else if (data.data && Array.isArray(data.data)) {
             marketCache = data.data.map(item => ({
                 name: item['ItemName'] || item['物品名稱'] || item.name || '未知物品',
                 price: item['Price'] || item['價格'] || item.price || '未知價格',
                 trend: item['Trend'] || item['漲跌'] || item.trend || '--' 
             }));
        }

        console.log(`[📦 物價調查局] 資料更新成功！共載入 ${marketCache.length} 筆物品。`);
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
        .slice(0, 25);
};

module.exports = {
    updateMarketData,
    getMarketItem,
    searchMarketItems
};
