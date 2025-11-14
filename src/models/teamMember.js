const mongoose = require('mongoose');
const teamMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  imageUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('TeamMember', teamMemberSchema);