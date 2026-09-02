// utils/marketHelpers.js
let marketCache = [];

const updateMarketData = async () => {
    try {
        // 這是你剛剛找到的永久有效 /exec 網址
        const apiUrl = 'https://script.google.com/macros/s/AKfycbyxZWLikYCMoXyZkIqlH0XROpCVBIBPSl1RZbLZAnLa4Dhw6kTY6I4_v-B1T4Jjyio/exec';
        
        console.log('[📦 物價調查局] 開始爬取最新物價資料...');
        
        const response = await fetch(apiUrl);
        const textData = await response.text();

        if (textData.trim().startsWith('<')) {
            console.error('[❌ 物價調查局] 警告！API 拒絕連線，因為網址已失效 (Token過期)。');
            console.error('👉 請更換為 /exec 結尾的永久網址！');
            return; 
        }

        const data = JSON.parse(textData);

        if (data && Array.isArray(data.headers) && Array.isArray(data.rows) && data.rows.length > 0) {
            const headers = data.headers;
            const newCache = [];

            for (let i = 1; i < headers.length; i++) {
                const itemName = headers[i];
                
                let currentPrice = null;
                let prevPrice = null;
                
                // 🌟 升級版智慧回溯：往回尋找時，順便把 0 也濾掉！
                for (let r = data.rows.length - 1; r >= 0; r--) {
                    const cellVal = data.rows[r][i];
                    // 多加了判斷：不能是 0，也不能是字串的 "0"
                    if (cellVal !== "" && cellVal !== null && cellVal !== undefined && cellVal !== 0 && cellVal !== "0") {
                        if (currentPrice === null) {
                            currentPrice = cellVal;
                        } else if (prevPrice === null) {
                            prevPrice = cellVal;
                            break; // 找到上一筆真正有價格的紀錄就停止
                        }
                    }
                }

                // 只有當找到有效價格時，才存入快取
                if (itemName && currentPrice !== null) {
                    let trendStr = '--';
                    const currNum = Number(currentPrice);
                    const prevNum = Number(prevPrice);

                    if (!isNaN(currNum) && prevPrice !== null && !isNaN(prevNum) && prevNum > 0) {
                        const diff = currNum - prevNum;
                        if (diff === 0) {
                            trendStr = '持平 ➖';
                        } else {
                            const percent = ((diff / prevNum) * 100).toFixed(2);
                            trendStr = diff > 0 ? `▲ +${percent}%` : `▼ ${percent}%`;
                        }
                    } else if (prevPrice === null) {
                        trendStr = '🆕 新上架/近期無交易';
                    }

                    const formattedPrice = !isNaN(currNum) ? currNum.toLocaleString('en-US') : currentPrice;

                    newCache.push({
                        name: String(itemName).trim(),
                        price: formattedPrice,
                        trend: trendStr
                    });
                }
            }

            marketCache = newCache;
            console.log(`[📦 物價調查局] 資料更新成功！共載入 ${marketCache.length} 筆有效物品。`);
        } else {
            console.log('[⚠️ 物價調查局] 成功連線，但找不到 headers 結構。');
        }
    } catch (error) {
        console.error('[❌ 物價調查局] 爬取發生例外錯誤:', error.message);
    }
};

const getMarketItem = (itemName) => {
    return marketCache.find(item => item.name === itemName) || null;
};

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
