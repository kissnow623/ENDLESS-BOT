// utils/firebase.js
const admin = require('firebase-admin');

let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    let key = serviceAccount.private_key;
    let pureKey = key.replace(/\\n/g, '').replace(/\\\\n/g, '').replace(/\n/g, '').replace(/\r/g, '')
                     .replace(/-----BEGIN PRIVATE KEY-----/gi, '').replace(/-----END PRIVATE KEY-----/gi, '')
                     .replace(/\s+/g, '');
    const chunks = pureKey.match(/.{1,64}/g) || [];
    serviceAccount.private_key = '-----BEGIN PRIVATE KEY-----\n' + chunks.join('\n') + '\n-----END PRIVATE KEY-----\n';
} catch (error) {
    console.error("❌ [錯誤] Firebase 金鑰解析失敗！");
    process.exit(1); 
}

// 🔥 修正區塊：使用 try-catch 取代原本的 admin.apps.length 檢查
try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Firestore 連線成功！");
} catch (error) {
    // 攔截重複初始化的警告，其他錯誤則報錯
    if (error.code !== 'app/duplicate-app') {
        console.error("❌ Firebase 初始化失敗：", error);
    }
}

const db = admin.firestore();

// --- 讀寫計數器 ---
let dbStats = { reads: 0, writes: 0, resetDay: new Date(Date.now() + 8 * 3600000).getUTCDate() };

function addDbStat(type, count = 1) {
    const twDate = new Date(Date.now() + 8 * 3600000).getUTCDate();
    if (dbStats.resetDay !== twDate) {
        dbStats.reads = 0; dbStats.writes = 0; dbStats.resetDay = twDate;
    }
    if (type === 'read') dbStats.reads += count;
    if (type === 'write') dbStats.writes += count;
}

// --- 全域資料快取 (迴響預約用) ---
const cache = {
    allReservations: [],
    appSettings: {}
};

// 監聽近期訂單
const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
db.collection('reservations').where('timestamp', '>=', ninetyDaysAgo).onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length); 
    cache.allReservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

// 監聽設定檔
db.collection('settings').onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length);
    snapshot.docs.forEach(doc => { cache.appSettings[doc.id] = doc.data(); });
});

module.exports = {
    db,
    admin,
    addDbStat,
    getDbStats: () => dbStats,
    getCache: () => cache
};
