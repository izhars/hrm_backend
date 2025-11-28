const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const feedbackController = require('../controllers/feedbackController');

router.use(protect); // require authentication for all feedback routes

// Employees submit feedback
router.post('/', feedbackController.createFeedback);
// HR/Admin view analytics, summaries and management
router.get('/summary', authorize('admin', 'hr'), feedbackController.getFeedbackSummary);
router.get('/analytics', authorize('admin', 'hr'), feedbackController.getFeedbackAnalytics);
router.get('/export', authorize('admin', 'hr'), feedbackController.exportFeedbacks);
router.get('/', authorize('admin', 'hr'), feedbackController.getAllFeedbacks);
router.put('/:id/respond', authorize('admin', 'hr'), feedbackController.respondToFeedback);


module.exports = router;