const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken, requireRole('admin'));

router.get('/', UserController.getUsers);
router.post('/', UserController.createUser);
router.put('/:id/status', UserController.updateUserStatus);

module.exports = router;
