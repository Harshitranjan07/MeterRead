const express = require('express');
const router = express.Router();
const AuditController = require('../controllers/auditController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken, requireRole('admin'));

router.get('/', AuditController.getAuditLogs);

module.exports = router;
