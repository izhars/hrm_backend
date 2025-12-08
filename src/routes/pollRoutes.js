// routes/pollRoutes.js
const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { 
  create, 
  list, 
  vote, 
  results, 
  edit, 
  close, 
  remove 
} = require('../controllers/pollController');

// Apply authentication to all routes
router.use(protect);

// Public routes (all authenticated users)
router.get('/', list);                    // GET /polls - List all polls
router.post('/:id/vote', vote);           // POST /polls/:id/vote - Vote on poll
router.get('/:id', results);              // GET /polls/:id - Get poll results

// HR/Admin only routes
router.post('/', authorize('hr', 'admin'), create);        // POST /polls - Create poll
router.patch('/:id', authorize('hr', 'admin'), edit);      // PATCH /polls/:id - Edit poll
router.post('/:id/close', authorize('hr', 'admin'), close); // POST /polls/:id/close - Close poll
router.delete('/:id', authorize('hr', 'admin'), remove);    // DELETE /polls/:id - Delete poll

module.exports = router;