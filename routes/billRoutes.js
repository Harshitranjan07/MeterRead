const express = require('express');
const router = express.Router();
const BillController = require('../controllers/billController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', BillController.getBills);
router.get('/:id', BillController.getBillById);
router.post('/check-overdue', requireRole('admin'), BillController.checkOverdueBills);

module.exports = router;
