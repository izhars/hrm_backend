// utils/firebase.js
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseKey.json"); // path to your Firebase service account

if (!admin.apps.length) { // prevent re-init errors
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
