// utils/marketHelpers.js
let marketCache = [];

const generateChartUrl = (labels, history) => {
    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '價格 (萬)',
                data: history,
                borderColor: '#4facfe', 
                backgroundColor: 'rgba(79, 172, 254, 0.1)',
                borderWidth: 2,
                pointRadius: 0, 
                fill: true,
                tension: 0.4    
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
    
    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}&w=500&h=250&bkg=%230f172a`;
};

const updateMarketData = async () => {
    try {
        const apiUrl = 'https://script.google.com/macros/s/AKfycbyxZWLikYCMoXyZkIqlH0XROpCVBIBPSl1RZbLZAnLa4Dhw6kTY6I4_v-B1T4Jjyio/exec';
        
        console.log('[📦 物價調查局] 開始爬取最新物價資料並動態繪製圖表...');
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
                let rawHistory = [];
                
                for (let r = 0; r < data.rows.length; r++) {
                    const timeStr = data.rows[r][0];
                    const cellVal = data.rows[r][i];
                    
                    if (cellVal !== "" && cellVal !== null && cellVal !== undefined && cellVal !== 0 && cellVal !== "0") {
                        const numVal = Number(cellVal);
                        if (!isNaN(numVal)) {
                            const d = new Date(timeStr);
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            const hh = String(d.getHours()).padStart(2, '0');
                            
                            // 儲存原始時間戳 (毫秒) 以便後續篩選
                            rawHistory.push({
                                timeMs: d.getTime(),
                                priceWan: (numVal / 10000).toFixed(0),
                                label: `${mm}/${dd} ${hh}:00`
                            });
                            currentPrice = cellVal;
                        }
                    }
                }

                if (itemName && currentPrice !== null && rawHistory.length > 0) {
                    const currNum = Number(currentPrice);
                    const lastTime = rawHistory[rawHistory.length - 1].timeMs;
                    
                    // 🌟 動態推算 24H 與 48H 前的價格，算出真正的區間漲跌幅
                    const getTrend = (hours) => {
                        const threshold = lastTime - (hours * 60 * 60 * 1000);
                        let pastPoint = rawHistory.find(h => h.timeMs >= threshold);
                        if (!pastPoint) pastPoint = rawHistory[0]; // 若找不到足夠舊的資料，取最舊的那筆
                        
                        const pastPrice = Number(pastPoint.priceWan);
                        const currentPriceWan = Number(rawHistory[rawHistory.length - 1].priceWan);
                        
                        let trendStr = '持平 ➖';
                        let rawTrendValue = 0;
                        
                        if (pastPrice > 0) {
                            const diff = currentPriceWan - pastPrice;
                            if (diff !== 0) {
                                rawTrendValue = (diff / pastPrice) * 100;
                                trendStr = diff > 0 ? `▲ +${rawTrendValue.toFixed(2)}%` : `▼ ${Math.abs(rawTrendValue).toFixed(2)}%`;
                            }
                        } else if (pastPrice === 0 && currentPriceWan > 0) {
                            trendStr = '🆕 新上架';
                        }
                        return { trendStr, rawTrendValue };
                    };

                    const t24 = getTrend(24);
                    const t48 = getTrend(48);

                    const getHistoryByHours = (hours) => {
                        const threshold = lastTime - (hours * 60 * 60 * 1000);
                        let filtered = rawHistory.filter(h => h.timeMs >= threshold);
                        if (filtered.length < 2) filtered = rawHistory.slice(-2);
                        return filtered;
                    };

                    const data6h = getHistoryByHours(6);
                    const data12h = getHistoryByHours(12);
                    const data24h = getHistoryByHours(24);
                    const data48h = getHistoryByHours(48);

                    const chartUrl6h = generateChartUrl(data6h.map(d => d.label), data6h.map(d => d.priceWan));
                    const chartUrl12h = generateChartUrl(data12h.map(d => d.label), data12h.map(d => d.priceWan));
                    const chartUrl24h = generateChartUrl(data24h.map(d => d.label), data24h.map(d => d.priceWan));
                    const chartUrl48h = generateChartUrl(data48h.map(d => d.label), data48h.map(d => d.priceWan));
                    const chartUrlAll = generateChartUrl(rawHistory.map(d => d.label), rawHistory.map(d => d.priceWan));

                    const formattedPrice = !isNaN(currNum) ? currNum.toLocaleString('en-US') : currentPrice;

                    newCache.push({
                        name: String(itemName).trim(),
                        price: formattedPrice,
                        rawPrice: isNaN(currNum) ? 0 : currNum, 
                        trend: t24.trendStr,            // 預設為 24H
                        rawTrend: t24.rawTrendValue,
                        trend24h: t24.trendStr,         // 獨立 24H 數值
                        rawTrend24h: t24.rawTrendValue, 
                        trend48h: t48.trendStr,         // 獨立 48H 數值
                        rawTrend48h: t48.rawTrendValue,
                        chartUrl: chartUrlAll,
                        chartUrl6h: chartUrl6h,
                        chartUrl12h: chartUrl12h,
                        chartUrl24h: chartUrl24h,
                        chartUrl48h: chartUrl48h
                    });
                }
            }

            marketCache = newCache;
            console.log(`[📦 物價調查局] 資料庫圖表自動繪製完畢！共追蹤 ${marketCache.length} 筆有效物品。`);
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

const getAllMarketItems = () => {
    return marketCache;
};

module.exports = {
    updateMarketData,
    getMarketItem,
    searchMarketItems,
    getAllMarketItems
};
