// src/routes/projectRoutes.js
const express = require('express');
const router = express.Router();

const { createProject, getAllProjects, getProject, updateProject, deleteProject, addExpense, getExpenseHistory, isUserInProject,getMyExpenseHistory } = require('../controllers/projectController');
const { addTeamMember, updateTeamMember, removeTeamMember, getTeamMembers } = require('../controllers/teamController');
const { addResponsibility, getProjectResponsibilities } = require('../controllers/roleController');
const { protect, managerAndAbove } = require('../middleware/auth');

/* =========================
   📦 Project Routes
========================= */

// 👀 Read → anyone logged in
router.route('/')
  .get(protect, getAllProjects)
  .post(protect, managerAndAbove, createProject);

router.route('/:id')
  .get(protect, getProject)
  .put(protect, managerAndAbove, updateProject)
  .delete(protect, managerAndAbove, deleteProject);

/* =========================
   👥 Team Members
========================= */

router.route('/:projectId/team-members')
  .get(protect, getTeamMembers)
  .post(protect, managerAndAbove, addTeamMember);

router.route('/:projectId/team-members/:memberId')
  .put(protect, managerAndAbove, updateTeamMember)
  .delete(protect, managerAndAbove, removeTeamMember);

/* =========================
   🎯 Responsibilities
========================= */

router.route('/:projectId/responsibilities')
  .get(protect, getProjectResponsibilities)
  .post(protect, managerAndAbove, addResponsibility);

/* =========================
 💸 Expenses / Spending
========================= */

router.route('/:id/expenses')
  .post(protect, addExpense)     // Record a new spend
  .get(protect, getExpenseHistory);              // View full history

router.get(
  '/:id/expenses/me',
  protect,
  getMyExpenseHistory
);

/* =========================
   ✅ Check if user is member of project
========================= */

router.route('/:projectId/is-member')
  .get(protect, isUserInProject);

module.exports = router;
