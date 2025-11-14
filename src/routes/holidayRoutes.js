const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  addHoliday,
  getHolidays,
  deleteHoliday,
  updateHoliday,
  getHolidayById,
  getHolidaysByYear,
  getUpcomingHolidays,
  getHolidaysByType,
  bulkImportHolidays,
  exportHolidays,
  getHolidayStats,
  permanentDeleteHoliday
} = require('../controllers/holidayController');

// Middleware
const validateObjectId = require('../middleware/validateObjectId');
const validateHolidayInput = require('../middleware/validateHolidayInput');
const multer = require('multer');
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and JSON files are allowed'), false);
    }
  }
});

// ========== PROTECTED ROUTES (all require authentication) ==========
router.use(protect);

// ========== PUBLIC ACCESS (authenticated users only) ==========
// Get all holidays with filtering and pagination
router.get('/', getHolidays);

// Get holidays for a specific year
router.get('/year/:year', getHolidaysByYear);

// Get upcoming holidays (next 30 days)
router.get('/upcoming', getUpcomingHolidays);

// Get holidays by type
router.get('/type/:type', getHolidaysByType);

// Get single holiday by ID
router.get('/:id', validateObjectId, getHolidayById);

// ========== HR ACCESS ==========
// router.use(authorize('hr'));

// Add single or multiple holidays
router.post('/', validateHolidayInput, authorize('hr','superadmin'), addHoliday);

// Update holiday
router.put('/:id', validateObjectId, validateHolidayInput, authorize('hr','superadmin'), updateHoliday);

// Delete holiday (soft delete)
router.delete('/:id', validateObjectId, authorize('hr','superadmin'), deleteHoliday);

// ========== SUPERADMIN ACCESS ==========

// Bulk import holidays (CSV/JSON file upload)
router.post('/bulk-import', upload.single('file'), authorize('hr', 'superadmin'), bulkImportHolidays);

// Permanent delete holiday
router.delete('/:id/permanent', validateObjectId, authorize('superadmin'), permanentDeleteHoliday);

// Export holidays as CSV/JSON
router.get('/export', authorize('superadmin'), exportHolidays);

// Get holiday statistics
router.get('/stats', authorize('superadmin'),  getHolidayStats);

// ========== ALTERNATIVE: Role-specific route groups ==========
/*
router.use('/hr', authorize('hr'), hrRoutes);
router.use('/admin', authorize('superadmin'), adminRoutes);
*/

module.exports = router;