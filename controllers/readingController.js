const db = require('../config/db');
const ReadingValidationService = require('../services/readingValidationService');

class ReadingController {
  static async getReadings(req, res) {
    try {
      const { meterId, consumerId, billingMonth, readerId, page = 1, limit = 20 } = req.query;

      let query = `
        SELECT r.*,
               m.meter_number, m.meter_type,
               c.consumer_number, c.connection_type, c.address,
               u.name as consumer_name,
               rd.name as reader_name
        FROM meter_readings r
        JOIN meters m ON r.meter_id = m.id
        JOIN consumers c ON r.consumer_id = c.id
        JOIN users u ON c.user_id = u.id
        LEFT JOIN users rd ON r.reader_id = rd.id
        WHERE 1=1
      `;
      const params = [];

      // If consumer, restrict strictly to own consumer readings
      if (req.user.role === 'consumer') {
        query += ` AND r.consumer_id = ?`;
        params.push(req.user.consumerId);
      } else if (consumerId) {
        query += ` AND r.consumer_id = ?`;
        params.push(consumerId);
      }

      if (meterId) {
        query += ` AND r.meter_id = ?`;
        params.push(meterId);
      }

      if (billingMonth && billingMonth !== 'ALL') {
        query += ` AND r.billing_month = ?`;
        params.push(billingMonth);
      }

      if (readerId && readerId !== 'ALL') {
        query += ` AND r.reader_id = ?`;
        params.push(readerId);
      }

      const countSql = `SELECT COUNT(*) as total FROM (${query})`;
      const countRow = db.get(countSql, params);
      const total = countRow ? countRow.total : 0;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      query += ` ORDER BY r.reading_date DESC, r.id DESC LIMIT ? OFFSET ?`;
      params.push(limitNum, offset);

      const readings = db.query(query, params);

      res.json({
        success: true,
        data: readings,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      console.error('getReadings error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve readings.' });
    }
  }

  static async submitReading(req, res) {
    try {
      const { meterId, currentReading, billingMonth, readingDate, notes, photoUrl } = req.body;

      if (!meterId || currentReading === undefined || currentReading === null) {
        return res.status(400).json({ success: false, message: 'Meter ID and Current Reading are required.' });
      }

      const result = ReadingValidationService.submitReading({
        meterId: parseInt(meterId),
        currentReading: parseFloat(currentReading),
        billingMonth,
        readingDate,
        readerId: req.user.id,
        readerName: req.user.name,
        notes,
        photoUrl
      });

      res.status(201).json({
        success: true,
        message: 'Meter reading recorded and utility bill generated successfully.',
        data: result
      });
    } catch (err) {
      console.warn('Reading validation rejected:', err.message);
      // Return 400 with user-friendly validation error message
      res.status(400).json({
        success: false,
        message: err.message || 'Validation failed. Please verify meter reading values.'
      });
    }
  }
}

module.exports = ReadingController;
