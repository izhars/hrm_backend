const admin = require("firebase-admin");
const path = require("path");
const fs = require('fs');

console.log("🔍 Initializing Firebase Admin...");

// Use the existing file path
const serviceAccountPath = path.join(
  __dirname, // Current directory: src/firebase/
  "..", // Go up to src/
  "..", // Go up to project root
  "staffsync-23b9b-firebase-adminsdk-fbsvc-6fde4c9990.json"
);

console.log(`📁 Looking for service account at: ${serviceAccountPath}`);

// Check if the file exists
if (fs.existsSync(serviceAccountPath)) {
  console.log("✅ Found service account file");
  
  try {
    // Load the service account
    const serviceAccount = require(serviceAccountPath);
    
    console.log(`
📊 Service Account Details:
   Project ID: ${serviceAccount.project_id}
   Client Email: ${serviceAccount.client_email}
   Private Key ID: ${serviceAccount.private_key_id?.substring(0, 10)}...
   Key Type: ${serviceAccount.type}
`);
    
    // Initialize Firebase
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DB_URL || "https://staffsync-23b9b.firebaseio.com",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "staffsync-23b9b.appspot.com",
    });
    
    console.log("🎉 Firebase Admin initialized successfully!");
    
    // Test Firebase connection
    try {
      const auth = admin.auth();
      console.log("✅ Firebase Auth service ready");
      
      // Test storage bucket
      const bucket = admin.storage().bucket();
      console.log(`✅ Firebase Storage bucket: ${bucket.name}`);
      
    } catch (testErr) {
      console.warn("⚠️  Some Firebase services might not be available:", testErr.message);
    }
    
  } catch (error) {
    console.error("❌ Failed to load/parse service account file:", error.message);
    
    // Provide more specific error details
    if (error.message.includes('PEM formatted message')) {
      console.error("\n🔧 Possible fixes:");
      console.error("1. Make sure the private_key in the JSON file has proper line breaks (\\n)");
      console.error("2. Verify the file is valid JSON (no syntax errors)");
      console.error("3. Try downloading a new service account key from Firebase Console");
    }
    
    process.exit(1);
  }
} else {
  console.error("❌ Service account file not found!");
  console.error("Expected file at:", serviceAccountPath);
  console.error("\n💡 Solutions:");
  console.error("1. Make sure the file 'staffsync-23b9b-firebase-adminsdk-fbsvc-6fde4c9990.json' exists in your project root");
  console.error("2. Or set FIREBASE_ADMINSDK environment variable");
  console.error("3. Or download a new service account key from Firebase Console");
  
  // List files in parent directory for debugging
  const parentDir = path.dirname(serviceAccountPath);
  console.error(`\n📂 Files in ${parentDir}:`);
  try {
    const files = fs.readdirSync(parentDir);
    files.forEach(file => {
      console.error(`   - ${file}`);
    });
  } catch (err) {
    console.error(`   Could not read directory: ${err.message}`);
  }
  
  process.exit(1);
}

module.exports = admin;