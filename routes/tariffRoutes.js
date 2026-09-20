const express = require('express');
const router = express.Router();
const TariffController = require('../controllers/tariffController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Public read of active tariffs for consumers/landing preview
router.get('/', TariffController.getTariffs);

// Admin-only management
router.use(verifyToken);
router.post('/slabs', requireRole('admin'), TariffController.createSlab);
router.put('/slabs/:id', requireRole('admin'), TariffController.updateSlab);
router.delete('/slabs/:id', requireRole('admin'), TariffController.deleteSlab);
router.put('/settings', requireRole('admin'), TariffController.updateLateConfig);

module.exports = router;
