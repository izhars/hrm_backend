const express = require('express');
const { 
  startCall, 
  acceptCall, 
  declineCall, 
  endCall,
  getCallById,
  getOngoingCalls 
} = require('../controllers/callController');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.post('/start', protect, startCall);
router.post('/accept', protect, acceptCall);
router.post('/decline', protect, declineCall);
router.post('/end', protect, endCall);
router.get('/:callId', protect, getCallById);
router.get('/ongoing/:userId', protect, getOngoingCalls);

module.exports = router;