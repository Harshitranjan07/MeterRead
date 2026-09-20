const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', PaymentController.getPayments);
router.post('/', PaymentController.processPayment);
router.get('/:id', PaymentController.getPaymentById);

module.exports = router;
