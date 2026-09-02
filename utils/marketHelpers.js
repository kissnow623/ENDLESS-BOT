// utils/marketHelpers.js
let marketCache = [];

// 🌟 新增：專門用來產生 QuickChart 高質感圖表網址的函式
const generateChartUrl = (labels, history) => {
    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '價格 (萬)',
                data: history,
                borderColor: '#4facfe', // 科技感漸層藍
                backgroundColor: 'rgba(79, 172, 254, 0.1)',
                borderWidth: 2,
                pointRadius: 0, // 隱藏折線點，讓曲線更平滑
                fill: true,
                tension: 0.4    // 曲線平滑度
            }]
        },
        options: {
            legend: { display: false },
            scales: {
                xAxes: [{ ticks: { fontColor: '#8b9bbb', fontSize: 10 }, gridLines: { display: false } }],
                yAxes: [{ ticks: { fontColor: '#8b9bbb', fontSize: 10 }, gridLines: { color: '#1e293b' } }]
            }
        }
    };
    
    // 將設定轉為 JSON 字串並編碼，套用深色背景 (#0B132B)
    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}&w=500&h=250&bkg=%230f172a`;
};

const updateMarketData = async () => {
    try {
        const apiUrl = 'https://script.google.com/macros/s/AKfycbyxZWLikYCMoXyZkIqlH0XROpCVBIBPSl1RZbLZAnLa4Dhw6kTY6I4_v-B1T4Jjyio/exec';
        
        console.log('[📦 物價調查局] 開始爬取最新物價資料與走勢圖...');
        const response = await fetch(apiUrl);
        const textData = await response.text();

        if (textData.trim().startsWith('<')) {
            console.error('[❌ 物價調查局] 警告！API 拒絕連線，請確認網址。');
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
                let historyData = [];
                let historyLabels = [];
                
                // 🌟 收集歷史資料 (從舊到新，最多取最後 15 筆)
                for (let r = 0; r < data.rows.length; r++) {
                    const timeStr = data.rows[r][0];
                    const cellVal = data.rows[r][i];
                    
                    if (cellVal !== "" && cellVal !== null && cellVal !== undefined && cellVal !== 0 && cellVal !== "0") {
                        const numVal = Number(cellVal);
                        if (!isNaN(numVal)) {
                            // 價格除以 10000 變成「萬」，圖表才不會被巨大的零塞爆
                            historyData.push((numVal / 10000).toFixed(0));
                            
                            // 格式化時間標籤 (例如：09/02 21:00)
                            const d = new Date(timeStr);
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            const hh = String(d.getHours()).padStart(2, '0');
                            historyLabels.push(`${mm}/${dd} ${hh}:00`);
                            
                            prevPrice = currentPrice;
                            currentPrice = cellVal;
                        }
                    }
                }

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
                    
                    // 只取最近 15 筆畫圖，避免圖表太擠
                    const recentLabels = historyLabels.slice(-15);
                    const recentData = historyData.slice(-15);
                    const finalChartUrl = generateChartUrl(recentLabels, recentData);

                    newCache.push({
                        name: String(itemName).trim(),
                        price: formattedPrice,
                        trend: trendStr,
                        chartUrl: finalChartUrl // 🌟 將產生的圖表網址存入快取
                    });
                }
            }

            marketCache = newCache;
            console.log(`[📦 物價調查局] 資料與圖表更新成功！共載入 ${marketCache.length} 筆有效物品。`);
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
