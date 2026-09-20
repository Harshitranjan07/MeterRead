const express = require('express');
const router = express.Router();
const MeterController = require('../controllers/meterController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', requireRole('admin', 'meter_reader'), MeterController.getMeters);
router.post('/', requireRole('admin'), MeterController.createMeter);
router.get('/:id', MeterController.getMeterById);
router.put('/:id', requireRole('admin'), MeterController.updateMeter);

module.exports = router;
