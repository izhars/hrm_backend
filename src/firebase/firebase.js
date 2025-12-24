// utils/firebase.js
const admin = require("firebase-admin");
require("dotenv").config();

const serviceAccount = {
  project_info: {
    project_number: process.env.FIREBASE_PROJECT_NUMBER,
    project_id: process.env.FIREBASE_PROJECT_ID,
    storage_bucket: process.env.FIREBASE_STORAGE_BUCKET
  },
  client: [
    {
      client_info: {
        mobilesdk_app_id: process.env.FIREBASE_MOBILESDK_APP_ID,
        android_client_info: {
          package_name: process.env.FIREBASE_PACKAGE_NAME
        }
      },
      oauth_client: [],
      api_key: [
        {
          current_key: process.env.FIREBASE_API_KEY
        }
      ],
      services: {
        appinvite_service: {
          other_platform_oauth_client: []
        }
      }
    }
  ],
  configuration_version: process.env.FIREBASE_CONFIG_VERSION
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: serviceAccount.project_info.storage_bucket
  });
}

module.exports = admin;
