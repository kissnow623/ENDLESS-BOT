// utils/firebase.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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

try {
    if (getApps().length === 0) {
        initializeApp({ credential: cert(serviceAccount) });
        console.log("✅ Firebase Firestore 連線成功！");
    }
} catch (error) {
    console.error("❌ Firebase 初始化失敗：", error);
}

const db = getFirestore();

const adminCompat = {
    firestore: { FieldValue: FieldValue }
};

let dbStats = { reads: 0, writes: 0, resetDay: new Date(Date.now() + 8 * 3600000).getUTCDate() };

function addDbStat(type, count = 1) {
    const twDate = new Date(Date.now() + 8 * 3600000).getUTCDate();
    if (dbStats.resetDay !== twDate) {
        dbStats.reads = 0; dbStats.writes = 0; dbStats.resetDay = twDate;
    }
    if (type === 'read') dbStats.reads += count;
    if (type === 'write') dbStats.writes += count;
}

// --- 全域資料快取 ---
const cache = {
    allReservations: [],
    appSettings: {},
    stickers: [], 
    emotes: [],    
    hotSearches: [] // 🌟 新增：存放所有 Discord 玩家熱搜數據的快取陣列
};

const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
db.collection('reservations').where('timestamp', '>=', ninetyDaysAgo).onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length); 
    cache.allReservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

db.collection('settings').onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length);
    snapshot.docs.forEach(doc => { cache.appSettings[doc.id] = doc.data(); });
});

db.collection('stickers').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length);
    cache.stickers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

db.collection('emotes').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length);
    cache.emotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

// 🌟 新增：監聽社群熱搜趨勢，準備給原作者的雙向回饋
db.collection('hotSearches').orderBy('lastActive', 'desc').onSnapshot(snapshot => {
    addDbStat('read', snapshot.docChanges().length);
    cache.hotSearches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});

module.exports = {
    db,
    admin: adminCompat,
    addDbStat,
    getDbStats: () => dbStats,
    getCache: () => cache
};
