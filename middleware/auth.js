const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'smart-utility-sih-secret-key-2026-secure-jwt';

/**
 * Middleware to verify JWT token and attach user to request
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch fresh user from DB
    const user = db.get(
      `SELECT id, name, email, role, phone, status FROM users WHERE id = ?`,
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'User account no longer exists.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
    }

    req.user = user;

    // If consumer, attach consumer record details
    if (user.role === 'consumer') {
      const consumer = db.get(
        `SELECT id as consumer_id, consumer_number, connection_type, tariff_category, address, city, state, pincode, status as consumer_status
         FROM consumers WHERE user_id = ?`,
        [user.id]
      );
      if (consumer) {
        req.consumer = consumer;
        req.user.consumerId = consumer.consumer_id;
        req.user.consumerNumber = consumer.consumer_number;
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
}

/**
 * Middleware to restrict route to specific roles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Forbidden: User role '${req.user.role}' is not authorized to access this resource.` 
      });
    }

    next();
  };
}

module.exports = {
  JWT_SECRET,
  verifyToken,
  requireRole
};
