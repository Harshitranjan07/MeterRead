const bcrypt = require('bcryptjs');
const db = require('../config/db');

class ConsumerController {
  static async getConsumers(req, res) {
    try {
      const { search, connectionType, status, page = 1, limit = 10, sortBy = 'c.id', sortOrder = 'DESC' } = req.query;

      let query = `
        SELECT c.*, u.name, u.email, u.phone, u.status as user_status,
               m.id as meter_id, m.meter_number, m.meter_type, m.last_reading, m.last_reading_date, m.status as meter_status
        FROM consumers c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN meters m ON m.consumer_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (search) {
        query += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR c.consumer_number LIKE ? OR m.meter_number LIKE ?)`;
        const s = `%${search.trim()}%`;
        params.push(s, s, s, s, s);
      }

      if (connectionType && connectionType !== 'ALL') {
        query += ` AND c.connection_type = ?`;
        params.push(connectionType);
      }

      if (status && status !== 'ALL') {
        query += ` AND c.status = ?`;
        params.push(status);
      }

      // Count total matching records for pagination
      const countSql = `SELECT COUNT(*) as total FROM (${query})`;
      const countRow = db.get(countSql, params);
      const total = countRow ? countRow.total : 0;

      // Safe sorting
      const allowedSortCols = ['c.id', 'u.name', 'c.consumer_number', 'c.connection_type', 'c.status', 'c.registration_date'];
      const sortCol = allowedSortCols.includes(sortBy) ? sortBy : 'c.id';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      query += ` ORDER BY ${sortCol} ${order} LIMIT ? OFFSET ?`;
      params.push(limitNum, offset);

      const consumers = db.query(query, params);

      res.json({
        success: true,
        data: consumers,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      console.error('getConsumers error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve consumers list.' });
    }
  }

  static async getConsumerById(req, res) {
    try {
      const { id } = req.params;

      // Restrict access if consumer role
      if (req.user.role === 'consumer' && req.user.consumerId !== parseInt(id)) {
        return res.status(403).json({ success: false, message: 'Access denied to this consumer profile.' });
      }

      const consumer = db.get(
        `SELECT c.*, u.name, u.email, u.phone, u.status as user_status,
                m.id as meter_id, m.meter_number, m.meter_type, m.last_reading, m.last_reading_date, m.status as meter_status,
                r.name as assigned_reader_name
         FROM consumers c
         JOIN users u ON c.user_id = u.id
         LEFT JOIN meters m ON m.consumer_id = c.id
         LEFT JOIN users r ON m.assigned_reader_id = r.id
         WHERE c.id = ?`,
        [id]
      );

      if (!consumer) {
        return res.status(404).json({ success: false, message: 'Consumer not found.' });
      }

      // Fetch recent readings
      const readings = db.query(
        `SELECT r.*, u.name as reader_name
         FROM meter_readings r
         LEFT JOIN users u ON r.reader_id = u.id
         WHERE r.consumer_id = ?
         ORDER BY r.reading_date DESC LIMIT 12`,
        [id]
      );

      // Fetch recent bills
      const bills = db.query(
        `SELECT * FROM bills WHERE consumer_id = ? ORDER BY billing_month DESC LIMIT 12`,
        [id]
      );

      res.json({
        success: true,
        data: {
          ...consumer,
          readings,
          bills
        }
      });
    } catch (err) {
      console.error('getConsumerById error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch consumer details.' });
    }
  }

  static async createConsumer(req, res) {
    try {
      const { name, email, password, phone, connectionType, address, city, state, pincode, meterNumber, meterType, readerId } = req.body;

      if (!name || !email || !address || !connectionType) {
        return res.status(400).json({ success: false, message: 'Name, email, address, and connection type are required.' });
      }

      const existingUser = db.get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
      }

      if (meterNumber) {
        const existingMeter = db.get(`SELECT id FROM meters WHERE meter_number = ?`, [meterNumber.trim()]);
        if (existingMeter) {
          return res.status(400).json({ success: false, message: 'A meter with this meter number already exists.' });
        }
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password || 'Consumer@123', salt);

      const tx = db.transaction(() => {
        // 1. User
        const userRes = db.db.prepare(
          `INSERT INTO users (name, email, password_hash, role, phone, status)
           VALUES (?, ?, ?, 'consumer', ?, 'active')`
        ).run(name.trim(), email.toLowerCase().trim(), passwordHash, phone || null);
        const userId = userRes.lastInsertRowid;

        // 2. Consumer
        const lastConsumer = db.get(`SELECT id FROM consumers ORDER BY id DESC LIMIT 1`);
        const nextId = (lastConsumer?.id || 1000) + 1;
        const consumerNumber = `CONS-${1000 + nextId}`;

        const consRes = db.db.prepare(
          `INSERT INTO consumers (user_id, consumer_number, connection_type, tariff_category, address, city, state, pincode, status)
           VALUES (?, ?, ?, 'Standard Tier', ?, ?, ?, ?, 'Active')`
        ).run(userId, consumerNumber, connectionType, address.trim(), city || 'New Delhi', state || 'Delhi', pincode || '110001');
        const consumerId = consRes.lastInsertRowid;

        // 3. Meter (optional on creation)
        let meterId = null;
        if (meterNumber) {
          const meterRes = db.db.prepare(
            `INSERT INTO meters (meter_number, meter_type, consumer_id, installation_date, last_reading, status, assigned_reader_id)
             VALUES (?, ?, ?, DATE('now'), 0.0, 'Active', ?)`
          ).run(meterNumber.trim(), meterType || 'Digital Smart Meter', consumerId, readerId || null);
          meterId = meterRes.lastInsertRowid;
        }

        // 4. Audit Log
        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'ADMIN_CREATE_CONSUMER', 'CONSUMER', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(consumerId), JSON.stringify({ consumerNumber, name, email, meterNumber }));

        return { consumerId, consumerNumber, meterId };
      });

      const result = tx();
      res.status(201).json({
        success: true,
        message: 'Consumer created and provisioned successfully.',
        data: result
      });
    } catch (err) {
      console.error('createConsumer error:', err);
      res.status(500).json({ success: false, message: 'Failed to create consumer.' });
    }
  }

  static async updateConsumer(req, res) {
    try {
      const { id } = req.params;
      const { name, phone, connectionType, tariffCategory, address, city, state, pincode, status } = req.body;

      const consumer = db.get(`SELECT * FROM consumers WHERE id = ?`, [id]);
      if (!consumer) {
        return res.status(404).json({ success: false, message: 'Consumer not found.' });
      }

      const tx = db.transaction(() => {
        // Update user name/phone
        if (name || phone) {
          db.db.prepare(
            `UPDATE users 
             SET name = COALESCE(?, name), 
                 phone = COALESCE(?, phone), 
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`
          ).run(name ? name.trim() : null, phone ? phone.trim() : null, consumer.user_id);
        }

        // Update consumer details
        db.db.prepare(
          `UPDATE consumers 
           SET connection_type = COALESCE(?, connection_type),
               tariff_category = COALESCE(?, tariff_category),
               address = COALESCE(?, address),
               city = COALESCE(?, city),
               state = COALESCE(?, state),
               pincode = COALESCE(?, pincode),
               status = COALESCE(?, status),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(connectionType, tariffCategory, address, city, state, pincode, status, id);

        // Audit Log
        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'UPDATE_CONSUMER', 'CONSUMER', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(id), JSON.stringify(req.body));
      });

      tx();
      res.json({ success: true, message: 'Consumer updated successfully.' });
    } catch (err) {
      console.error('updateConsumer error:', err);
      res.status(500).json({ success: false, message: 'Failed to update consumer.' });
    }
  }

  static async deleteConsumer(req, res) {
    try {
      const { id } = req.params;
      const consumer = db.get(`SELECT * FROM consumers WHERE id = ?`, [id]);
      if (!consumer) {
        return res.status(404).json({ success: false, message: 'Consumer not found.' });
      }

      // Soft delete / deactivate to preserve historical billing integrity
      const tx = db.transaction(() => {
        db.db.prepare(`UPDATE consumers SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
        db.db.prepare(`UPDATE users SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(consumer.user_id);
        db.db.prepare(`UPDATE meters SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE consumer_id = ?`).run(id);

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'DEACTIVATE_CONSUMER', 'CONSUMER', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(id), JSON.stringify({ consumerNumber: consumer.consumer_number }));
      });

      tx();
      res.json({ success: true, message: 'Consumer account deactivated successfully.' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to deactivate consumer.' });
    }
  }
}

module.exports = ConsumerController;
