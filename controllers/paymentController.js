const db = require('../config/db');
const PaymentService = require('../services/paymentService');

class PaymentController {
  static async getPayments(req, res) {
    try {
      const { search, consumerId, paymentMethod, page = 1, limit = 20 } = req.query;

      let query = `
        SELECT p.*,
               b.bill_number, b.billing_month, b.units_consumed,
               c.consumer_number, c.connection_type,
               u.name as consumer_name, u.email as consumer_email
        FROM payments p
        JOIN bills b ON p.bill_id = b.id
        JOIN consumers c ON p.consumer_id = c.id
        JOIN users u ON c.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      // If consumer, restrict to own payments
      if (req.user.role === 'consumer') {
        query += ` AND p.consumer_id = ?`;
        params.push(req.user.consumerId);
      } else if (consumerId) {
        query += ` AND p.consumer_id = ?`;
        params.push(consumerId);
      }

      if (paymentMethod && paymentMethod !== 'ALL') {
        query += ` AND p.payment_method = ?`;
        params.push(paymentMethod);
      }

      if (search) {
        query += ` AND (p.transaction_id LIKE ? OR b.bill_number LIKE ? OR c.consumer_number LIKE ? OR u.name LIKE ?)`;
        const s = `%${search.trim()}%`;
        params.push(s, s, s, s);
      }

      const countSql = `SELECT COUNT(*) as total FROM (${query})`;
      const countRow = db.get(countSql, params);
      const total = countRow ? countRow.total : 0;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      query += ` ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?`;
      params.push(limitNum, offset);

      const payments = db.query(query, params);

      res.json({
        success: true,
        data: payments,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      console.error('getPayments error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve payment logs.' });
    }
  }

  static async processPayment(req, res) {
    try {
      const { billId, paymentMethod = 'UPI', referenceNumber, gatewayDetails } = req.body;

      if (!billId) {
        return res.status(400).json({ success: false, message: 'Bill ID is required.' });
      }

      const consumerId = req.user.role === 'consumer' ? req.user.consumerId : null;

      const result = PaymentService.processPayment({
        billId: parseInt(billId),
        consumerId,
        paymentMethod,
        referenceNumber,
        gatewayDetails,
        userId: req.user.id,
        userName: req.user.name
      });

      res.status(200).json({
        success: true,
        message: 'Payment completed successfully. Invoice marked as Paid.',
        data: result
      });
    } catch (err) {
      console.warn('Payment failed:', err.message);
      res.status(400).json({
        success: false,
        message: err.message || 'Payment processing failed. Please try again.'
      });
    }
  }

  static async getPaymentById(req, res) {
    try {
      const { id } = req.params;

      const payment = db.get(
        `SELECT p.*,
                b.bill_number, b.billing_month, b.units_consumed, b.energy_charge, b.fixed_charge, b.late_surcharge, b.total_amount as bill_total,
                c.consumer_number, c.connection_type, c.address, c.city,
                u.name as consumer_name, u.email as consumer_email, u.phone as consumer_phone,
                m.meter_number
         FROM payments p
         JOIN bills b ON p.bill_id = b.id
         JOIN consumers c ON p.consumer_id = c.id
         JOIN users u ON c.user_id = u.id
         JOIN meters m ON b.meter_id = m.id
         WHERE p.id = ? OR p.transaction_id = ?`,
        [id, id]
      );

      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment record not found.' });
      }

      if (req.user.role === 'consumer' && payment.consumer_id !== req.user.consumerId) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      res.json({
        success: true,
        data: payment
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to retrieve payment details.' });
    }
  }
}

module.exports = PaymentController;
