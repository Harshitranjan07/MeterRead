const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboardController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.get('/stats', requireRole('admin'), DashboardController.getAdminStats);
router.get('/consumer-stats', requireRole('consumer'), DashboardController.getConsumerStats);
router.get('/reader-stats', requireRole('meter_reader'), DashboardController.getReaderStats);

module.exports = router;
