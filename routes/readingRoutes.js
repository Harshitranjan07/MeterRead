const express = require('express');
const router = express.Router();
const ReadingController = require('../controllers/readingController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', ReadingController.getReadings);
router.post('/', requireRole('admin', 'meter_reader'), ReadingController.submitReading);

module.exports = router;
