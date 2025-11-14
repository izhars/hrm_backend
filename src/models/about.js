const mongoose = require('mongoose');
const aboutSchema = new mongoose.Schema({
  appName: { type: String, required: true },
  tagline: { type: String },
  description: { type: String },
  version: { type: String, default: "1.0.0" },
  features: [{ title: String, description: String, icon: String }],
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('About', aboutSchema);