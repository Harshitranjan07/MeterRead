const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

class AuthController {
  static async register(req, res) {
    try {
      const { name, email, password, phone, connectionType = 'Residential', address, city, state, pincode } = req.body;

      if (!name || !email || !password || !address) {
        return res.status(400).json({ success: false, message: 'Please provide all required fields: name, email, password, and address.' });
      }

      // Check existing email
      const existingUser = db.get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'An account with this email address already exists.' });
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password, salt);

      // Perform transaction to create user and consumer
      const tx = db.transaction(() => {
        const userRes = db.db.prepare(
          `INSERT INTO users (name, email, password_hash, role, phone, status)
           VALUES (?, ?, ?, 'consumer', ?, 'active')`
        ).run(name.trim(), email.toLowerCase().trim(), passwordHash, phone || null);

        const userId = userRes.lastInsertRowid;

        // Generate unique Consumer Number: CONS-10XX
        const lastConsumer = db.get(`SELECT id FROM consumers ORDER BY id DESC LIMIT 1`);
        const nextId = (lastConsumer?.id || 1000) + 1;
        const consumerNumber = `CONS-${1000 + nextId}`;

        const consumerRes = db.db.prepare(
          `INSERT INTO consumers 
            (user_id, consumer_number, connection_type, tariff_category, address, city, state, pincode, status)
           VALUES (?, ?, ?, 'Standard Tier', ?, ?, ?, ?, 'Active')`
        ).run(
          userId,
          consumerNumber,
          connectionType,
          address.trim(),
          city || 'New Delhi',
          state || 'Delhi',
          pincode || '110001'
        );

        const consumerId = consumerRes.lastInsertRowid;

        // Create Welcome Notification
        db.db.prepare(
          `INSERT INTO notifications (user_id, title, message, type, link)
           VALUES (?, 'Welcome to Smart Utility System', 'Your consumer account has been created. A digital meter will be linked to your address shortly.', 'system', '/consumer/dashboard')`
        ).run(userId);

        // Audit Log
        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, 'consumer', 'REGISTER_CONSUMER', 'USER', ?, ?)`
        ).run(userId, name, String(userId), JSON.stringify({ consumerNumber, connectionType, email }));

        return { userId, consumerId, consumerNumber };
      });

      const result = tx();

      // Issue JWT
      const token = jwt.sign(
        { id: result.userId, role: 'consumer', email: email.toLowerCase().trim() },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        message: 'Account registered successfully.',
        token,
        user: {
          id: result.userId,
          name: name.trim(),
          email: email.toLowerCase().trim(),
          role: 'consumer',
          phone,
          consumerId: result.consumerId,
          consumerNumber: result.consumerNumber,
          connectionType
        }
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Server error during registration. Please try again.' });
    }
  }

  static async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
      }

      const user = db.get(
        `SELECT id, name, email, password_hash, role, phone, status FROM users WHERE email = ?`,
        [email.toLowerCase().trim()]
      );

      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Your account is currently inactive. Contact administrator.' });
      }

      const isMatch = bcrypt.compareSync(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      // Fetch role-specific details
      let consumerDetails = null;
      let meterDetails = null;

      if (user.role === 'consumer') {
        consumerDetails = db.get(
          `SELECT c.id as consumer_id, c.consumer_number, c.connection_type, c.tariff_category, c.address, c.city, c.state, c.pincode, c.status as consumer_status,
                  m.id as meter_id, m.meter_number, m.meter_type, m.last_reading, m.last_reading_date, m.status as meter_status
           FROM consumers c
           LEFT JOIN meters m ON m.consumer_id = c.id
           WHERE c.user_id = ?`,
          [user.id]
        );
      }

      // Generate JWT
      const token = jwt.sign(
        { id: user.id, role: user.role, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Audit Log for Login
      db.run(
        `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
         VALUES (?, ?, ?, 'USER_LOGIN', 'SESSION', ?, ?)`,
        [user.id, user.name, user.role, String(user.id), JSON.stringify({ role: user.role, ip: req.ip || '127.0.0.1' })]
      );

      res.json({
        success: true,
        message: 'Login successful.',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          ...(consumerDetails ? {
            consumerId: consumerDetails.consumer_id,
            consumerNumber: consumerDetails.consumer_number,
            connectionType: consumerDetails.connection_type,
            address: consumerDetails.address,
            meterNumber: consumerDetails.meter_number,
            meterId: consumerDetails.meter_id,
            meterStatus: consumerDetails.meter_status
          } : {})
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'An unexpected server error occurred during login.' });
    }
  }

  static async getMe(req, res) {
    try {
      const user = req.user;
      let consumerDetails = null;

      if (user.role === 'consumer') {
        consumerDetails = db.get(
          `SELECT c.id as consumer_id, c.consumer_number, c.connection_type, c.tariff_category, c.address, c.city, c.state, c.pincode, c.status as consumer_status,
                  m.id as meter_id, m.meter_number, m.meter_type, m.last_reading, m.last_reading_date, m.status as meter_status
           FROM consumers c
           LEFT JOIN meters m ON m.consumer_id = c.id
           WHERE c.user_id = ?`,
          [user.id]
        );
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          status: user.status,
          ...(consumerDetails ? {
            consumerId: consumerDetails.consumer_id,
            consumerNumber: consumerDetails.consumer_number,
            connectionType: consumerDetails.connection_type,
            address: consumerDetails.address,
            city: consumerDetails.city,
            state: consumerDetails.state,
            pincode: consumerDetails.pincode,
            meterId: consumerDetails.meter_id,
            meterNumber: consumerDetails.meter_number,
            meterType: consumerDetails.meter_type,
            lastReading: consumerDetails.last_reading,
            lastReadingDate: consumerDetails.last_reading_date,
            meterStatus: consumerDetails.meter_status
          } : {})
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to retrieve profile.' });
    }
  }

  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email address is required.' });
      }

      const user = db.get(`SELECT id, name FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
      if (!user) {
        // Return friendly message even if email not found for security
        return res.json({
          success: true,
          message: 'If an account exists with this email, password reset instructions have been sent.'
        });
      }

      // Record audit log
      db.run(
        `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
         VALUES (?, ?, 'user', 'REQUEST_PASSWORD_RESET', 'USER', ?, ?)`,
        [user.id, user.name, String(user.id), JSON.stringify({ email })]
      );

      res.json({
        success: true,
        message: 'Password reset instructions have been sent to your registered email address (Simulated).'
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error during password recovery.' });
    }
  }
}

module.exports = AuthController;
