const admin = require("firebase-admin");
const path = require("path");

console.log("🚀 Initializing Firebase Admin...");

let serviceAccount = null;

// Railway: Always use environment variable if available
if (process.env.FIREBASE_ADMINSDK) {
  console.log("📦 Loading from Railway environment variable...");
  try {
    // Parse the JSON from environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_ADMINSDK);
    
    // Fix newline characters in private key
    if (serviceAccount.private_key) {
      // Handle escaped newlines
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      
      // Debug: Check key format
      console.log("🔑 Private key format check:");
      console.log("   Has BEGIN:", serviceAccount.private_key.includes("BEGIN PRIVATE KEY"));
      console.log("   Has END:", serviceAccount.private_key.includes("END PRIVATE KEY"));
      console.log("   Key length:", serviceAccount.private_key.length);
    }
    
    console.log("✅ Loaded from Railway environment variable");
    console.log(`   Project: ${serviceAccount.project_id}`);
    console.log(`   Service Account: ${serviceAccount.client_email}`);
    
  } catch (error) {
    console.error("❌ Failed to parse FIREBASE_ADMINSDK:", error.message);
    console.error("First 200 chars of env var:", process.env.FIREBASE_ADMINSDK?.substring(0, 200));
    process.exit(1);
  }
} 
// Local development: Try to load from file
else {
  console.log("💻 Running in local mode, checking for service account file...");
  
  const possiblePaths = [
    path.join(process.cwd(), "service-account.json"),
    path.join(process.cwd(), "staffsync-23b9b-firebase-adminsdk-fbsvc-6fde4c9990.json"),
    path.join(__dirname, "..", "..", "service-account.json"),
    path.join(__dirname, "..", "..", "staffsync-23b9b-firebase-adminsdk-fbsvc-6fde4c9990.json")
  ];
  
  for (const filePath of possiblePaths) {
    try {
      if (require('fs').existsSync(filePath)) {
        serviceAccount = require(filePath);
        console.log(`✅ Loaded from file: ${filePath}`);
        console.log(`   Project: ${serviceAccount.project_id}`);
        break;
      }
    } catch (err) {
      // Continue to next path
    }
  }
  
  if (!serviceAccount) {
    console.error("❌ No service account found locally!");
    console.error("Please create a service-account.json file or set FIREBASE_ADMINSDK env variable");
    process.exit(1);
  }
}

// Initialize Firebase
try {
  console.log("🔥 Initializing Firebase App...");
  
  const firebaseConfig = {
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DB_URL || "https://staffsync-23b9b.firebaseio.com",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "staffsync-23b9b.appspot.com"
  };
  
  // Initialize the app
  admin.initializeApp(firebaseConfig);
  
  console.log("🎉 Firebase Admin SDK initialized successfully!");
  
  // Test the connection
  console.log("🧪 Testing Firebase services...");
  
  // Test Auth
  const auth = admin.auth();
  console.log("   ✅ Auth service ready");
  
  // Test Storage
  try {
    const bucket = admin.storage().bucket();
    console.log(`   ✅ Storage bucket: ${bucket.name}`);
  } catch (storageErr) {
    console.log("   ⚠️  Storage bucket might need configuration");
  }
  
  // Test Firestore (if you use it)
  try {
    const firestore = admin.firestore();
    console.log("   ✅ Firestore ready");
  } catch (firestoreErr) {
    console.log("   ℹ️  Firestore not configured");
  }
  
  console.log("\n✨ All Firebase services are ready!");
  
} catch (error) {
  console.error("❌ Firebase initialization failed!");
  console.error("Error:", error.message);
  
  // Provide detailed error info
  if (error.errorInfo) {
    console.error("Error details:", error.errorInfo);
  }
  
  // Specific help for common issues
  if (error.message.includes('PEM formatted')) {
    console.error("\n🔧 PEM Format Issue Detected!");
    console.error("The private key might have incorrect newline characters.");
    console.error("Current private key preview:");
    if (serviceAccount?.private_key) {
      const key = serviceAccount.private_key;
      console.error("First line:", key.split('\n')[0]);
      console.error("Second line (first 20 chars):", key.split('\n')[1]?.substring(0, 20));
      console.error("Last line:", key.split('\n').pop());
    }
  }
  
  process.exit(1);
}

module.exports = admin;