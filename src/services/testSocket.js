const { io } = require("socket.io-client");

const SOCKET_URL = "http://localhost:5000";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5MjY4YTRhYzE4N2Y3ZGJhMTQxMzhmYSIsInJvbGUiOiJociIsImVtcGxveWVlSWQiOiJTQ0FJUExIMDE5IiwiaWF0IjoxNzY1MzQyMzg3LCJleHAiOjE3Njc5MzQzODd9.fhnAv0nTsZorLQozCUaEEvw1MzI1UFwvi97CfDCTK0E"; // paste your generated token here

console.log("🟡 Connecting to", SOCKET_URL);

const socket = io(SOCKET_URL, {
  auth: { token: TOKEN },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("✅ Connected with socket ID:", socket.id);

  // send a test message
  socket.emit("send-message", { toUserId: "671e0e3b4c8a4e1b245d9999", text: "Hello from HR test!" });
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err.message);
});

socket.on("receive-message", (msg) => {
  console.log("📩 Received message:", msg);
});
