const express = require('express');
const router = express.Router();
const ConsumerController = require('../controllers/consumerController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', requireRole('admin', 'meter_reader'), ConsumerController.getConsumers);
router.post('/', requireRole('admin'), ConsumerController.createConsumer);
router.get('/:id', ConsumerController.getConsumerById);
router.put('/:id', requireRole('admin'), ConsumerController.updateConsumer);
router.delete('/:id', requireRole('admin'), ConsumerController.deleteConsumer);

module.exports = router;
