const db = require('../config/db');

class MeterController {
  static async getMeters(req, res) {
    try {
      const { search, status, readerId, page = 1, limit = 20 } = req.query;

      let query = `
        SELECT m.*, 
               c.id as consumer_id, c.consumer_number, c.connection_type, c.address, c.city,
               u.name as consumer_name, u.phone as consumer_phone,
               r.name as reader_name, r.email as reader_email
        FROM meters m
        LEFT JOIN consumers c ON m.consumer_id = c.id
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN users r ON m.assigned_reader_id = r.id
        WHERE 1=1
      `;
      const params = [];

      // If user is meter reader, filter to meters assigned to this reader
      if (req.user.role === 'meter_reader') {
        query += ` AND m.assigned_reader_id = ?`;
        params.push(req.user.id);
      } else if (readerId && readerId !== 'ALL') {
        query += ` AND m.assigned_reader_id = ?`;
        params.push(readerId);
      }

      if (status && status !== 'ALL') {
        query += ` AND m.status = ?`;
        params.push(status);
      }

      if (search) {
        query += ` AND (m.meter_number LIKE ? OR c.consumer_number LIKE ? OR u.name LIKE ? OR c.address LIKE ?)`;
        const s = `%${search.trim()}%`;
        params.push(s, s, s, s);
      }

      const countSql = `SELECT COUNT(*) as total FROM (${query})`;
      const countRow = db.get(countSql, params);
      const total = countRow ? countRow.total : 0;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      query += ` ORDER BY m.id DESC LIMIT ? OFFSET ?`;
      params.push(limitNum, offset);

      const meters = db.query(query, params);

      res.json({
        success: true,
        data: meters,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      console.error('getMeters error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve meters.' });
    }
  }

  static async getMeterById(req, res) {
    try {
      const { id } = req.params;

      const meter = db.get(
        `SELECT m.*, 
                c.id as consumer_id, c.consumer_number, c.connection_type, c.address, c.city, c.state, c.pincode,
                u.name as consumer_name, u.email as consumer_email, u.phone as consumer_phone,
                r.name as reader_name
         FROM meters m
         LEFT JOIN consumers c ON m.consumer_id = c.id
         LEFT JOIN users u ON c.user_id = u.id
         LEFT JOIN users r ON m.assigned_reader_id = r.id
         WHERE m.id = ?`,
        [id]
      );

      if (!meter) {
        return res.status(404).json({ success: false, message: 'Meter not found.' });
      }

      // If consumer, verify ownership
      if (req.user.role === 'consumer' && meter.consumer_id !== req.user.consumerId) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      const readings = db.query(
        `SELECT * FROM meter_readings WHERE meter_id = ? ORDER BY reading_date DESC LIMIT 12`,
        [id]
      );

      res.json({
        success: true,
        data: {
          ...meter,
          readings
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to fetch meter details.' });
    }
  }

  static async createMeter(req, res) {
    try {
      const { meterNumber, meterType = 'Digital Smart Meter', consumerId, initialReading = 0.0, readerId, installationDate } = req.body;

      if (!meterNumber) {
        return res.status(400).json({ success: false, message: 'Meter Number is required.' });
      }

      const existing = db.get(`SELECT id FROM meters WHERE meter_number = ?`, [meterNumber.trim()]);
      if (existing) {
        return res.status(400).json({ success: false, message: 'A meter with this meter number already exists.' });
      }

      if (consumerId) {
        // Check if consumer already has an active meter
        const activeMeter = db.get(`SELECT id, meter_number FROM meters WHERE consumer_id = ? AND status = 'Active'`, [consumerId]);
        if (activeMeter) {
          return res.status(400).json({ 
            success: false, 
            message: `Consumer already has an active meter (${activeMeter.meter_number}). Reassign or deactivate previous meter first.` 
          });
        }
      }

      const tx = db.transaction(() => {
        const insertRes = db.db.prepare(
          `INSERT INTO meters (meter_number, meter_type, consumer_id, installation_date, last_reading, status, assigned_reader_id)
           VALUES (?, ?, ?, COALESCE(?, DATE('now')), ?, 'Active', ?)`
        ).run(
          meterNumber.trim(),
          meterType,
          consumerId || null,
          installationDate || null,
          parseFloat(initialReading) || 0.0,
          readerId || null
        );

        const meterId = insertRes.lastInsertRowid;

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'CREATE_METER', 'METER', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(meterId), JSON.stringify(req.body));

        return meterId;
      });

      const meterId = tx();
      res.status(201).json({ success: true, message: 'Meter created successfully.', data: { id: meterId } });
    } catch (err) {
      console.error('createMeter error:', err);
      res.status(500).json({ success: false, message: 'Failed to create meter.' });
    }
  }

  static async updateMeter(req, res) {
    try {
      const { id } = req.params;
      const { meterType, consumerId, status, readerId } = req.body;

      const meter = db.get(`SELECT * FROM meters WHERE id = ?`, [id]);
      if (!meter) {
        return res.status(404).json({ success: false, message: 'Meter not found.' });
      }

      if (consumerId && consumerId !== meter.consumer_id) {
        // Validate one active meter per consumer rule
        const existingActive = db.get(
          `SELECT id, meter_number FROM meters WHERE consumer_id = ? AND status = 'Active' AND id != ?`,
          [consumerId, id]
        );
        if (existingActive) {
          return res.status(400).json({
            success: false,
            message: `Consumer already has an active meter (${existingActive.meter_number}). Reassign or deactivate it first.`
          });
        }
      }

      const tx = db.transaction(() => {
        db.db.prepare(
          `UPDATE meters 
           SET meter_type = COALESCE(?, meter_type),
               consumer_id = ?,
               status = COALESCE(?, status),
               assigned_reader_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(
          meterType,
          consumerId !== undefined ? (consumerId || null) : meter.consumer_id,
          status,
          readerId !== undefined ? (readerId || null) : meter.assigned_reader_id,
          id
        );

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'UPDATE_METER', 'METER', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(id), JSON.stringify(req.body));
      });

      tx();
      res.json({ success: true, message: 'Meter updated successfully.' });
    } catch (err) {
      console.error('updateMeter error:', err);
      res.status(500).json({ success: false, message: 'Failed to update meter.' });
    }
  }
}

module.exports = MeterController;
