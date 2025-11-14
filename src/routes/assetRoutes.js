const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAllAssets,
  getMyAssets,
  getAsset,
  createAsset,
  updateAsset,
  assignAsset,
  returnAsset,
  deleteAsset
} = require('../controllers/assetController');

router.use(protect);

router.route('/')
  .get(authorize('hr', 'superadmin'), getAllAssets)
  .post(authorize('hr', 'superadmin'), createAsset);

router.get('/my-assets', getMyAssets);

router.route('/:id')
  .get(getAsset)
  .put(authorize('hr', 'superadmin'), updateAsset)
  .delete(authorize('superadmin'), deleteAsset);

router.put('/:id/assign', 
  authorize('hr', 'superadmin'), 
  assignAsset
);

router.put('/:id/return', 
  authorize('hr', 'superadmin'), 
  returnAsset
);

module.exports = router;
