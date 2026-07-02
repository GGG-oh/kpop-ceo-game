const admin = require("firebase-admin");

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} catch (err) {
  console.error(
    "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON 파싱 실패. .env 파일을 확인하세요."
  );
  throw err;
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const rtdb = admin.database();

module.exports = { admin, db, rtdb };
