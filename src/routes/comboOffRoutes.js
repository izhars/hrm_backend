const express = require('express');
const router = express.Router();

const {
  applyComboOff,
  reviewComboOff,
  getAllComboOffs,
  getMyComboOffs,
  getComboOffById,
  deleteComboOff,
  getMonthlyComboOffSummary,
} = require('../controllers/comboOffController');

const { protect, authorize, hrAndAbove } = require('../middleware/auth');

// --------------------------------------
// 🔐 Auth Protected Routes
// --------------------------------------

// 🧾 1️⃣ Employee: Get all my combo offs
router.get('/me', protect, getMyComboOffs);

// ➕ 2️⃣ Employee: Apply for combo off
router.post('/', protect, applyComboOff);

// 👀 3️⃣ HR/Admin: Get all combo offs (optionally filter by status)
router.get('/', protect, hrAndAbove, getAllComboOffs);

// 📅 4️⃣ HR/Admin: Get monthly summary
router.get('/summary/monthly', protect, hrAndAbove, getMonthlyComboOffSummary);

// 🔎 5️⃣ HR/Admin/Employee: Get a single combo off by ID
router.get('/:id', protect, getComboOffById);

// ✅❌ 6️⃣ HR: Approve or Reject combo off (pass { action: "approve" | "reject" } in body)
router.put('/:comboOffId/review', protect, hrAndAbove, reviewComboOff);

// 🗑️ 7️⃣ Employee: Delete own pending combo off
router.delete('/:id', protect, deleteComboOff);

module.exports = router;
