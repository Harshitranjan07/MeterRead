const db = require('../config/db');
const BillingEngine = require('../services/billingEngine');

class BillController {
  static async getBills(req, res) {
    try {
      const { search, billingMonth, paymentStatus, consumerId, page = 1, limit = 20 } = req.query;

      let query = `
        SELECT b.*,
               c.consumer_number, c.connection_type, c.tariff_category, c.address, c.city,
               u.name as consumer_name, u.email as consumer_email, u.phone as consumer_phone,
               m.meter_number, m.meter_type
        FROM bills b
        JOIN consumers c ON b.consumer_id = c.id
        JOIN users u ON c.user_id = u.id
        JOIN meters m ON b.meter_id = m.id
        WHERE 1=1
      `;
      const params = [];

      // If consumer, restrict exclusively to own bills
      if (req.user.role === 'consumer') {
        query += ` AND b.consumer_id = ?`;
        params.push(req.user.consumerId);
      } else if (consumerId) {
        query += ` AND b.consumer_id = ?`;
        params.push(consumerId);
      }

      if (billingMonth && billingMonth !== 'ALL') {
        query += ` AND b.billing_month = ?`;
        params.push(billingMonth);
      }

      if (paymentStatus && paymentStatus !== 'ALL') {
        query += ` AND b.payment_status = ?`;
        params.push(paymentStatus);
      }

      if (search) {
        query += ` AND (b.bill_number LIKE ? OR c.consumer_number LIKE ? OR u.name LIKE ? OR m.meter_number LIKE ?)`;
        const s = `%${search.trim()}%`;
        params.push(s, s, s, s);
      }

      const countSql = `SELECT COUNT(*) as total FROM (${query})`;
      const countRow = db.get(countSql, params);
      const total = countRow ? countRow.total : 0;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      query += ` ORDER BY b.billing_month DESC, b.id DESC LIMIT ? OFFSET ?`;
      params.push(limitNum, offset);

      const bills = db.query(query, params);

      // Parse JSON breakdown safely for each bill
      const parsedBills = bills.map(b => {
        let breakdown = [];
        try {
          breakdown = JSON.parse(b.slab_breakdown || '[]');
        } catch (e) {
          breakdown = [];
        }
        return {
          ...b,
          slab_breakdown: breakdown
        };
      });

      res.json({
        success: true,
        data: parsedBills,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      console.error('getBills error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve bills.' });
    }
  }

  static async getBillById(req, res) {
    try {
      const { id } = req.params;

      const bill = db.get(
        `SELECT b.*,
                c.id as consumer_id, c.consumer_number, c.connection_type, c.tariff_category, c.address, c.city, c.state, c.pincode,
                u.name as consumer_name, u.email as consumer_email, u.phone as consumer_phone,
                m.meter_number, m.meter_type, m.installation_date,
                p.transaction_id, p.payment_method, p.payment_date as txn_payment_date, p.reference_number
         FROM bills b
         JOIN consumers c ON b.consumer_id = c.id
         JOIN users u ON c.user_id = u.id
         JOIN meters m ON b.meter_id = m.id
         LEFT JOIN payments p ON p.bill_id = b.id
         WHERE b.id = ?`,
        [id]
      );

      if (!bill) {
        return res.status(404).json({ success: false, message: 'Bill not found.' });
      }

      // Restrict access for consumer
      if (req.user.role === 'consumer' && bill.consumer_id !== req.user.consumerId) {
        return res.status(403).json({ success: false, message: 'Access denied to this bill.' });
      }

      let breakdown = [];
      try {
        breakdown = JSON.parse(bill.slab_breakdown || '[]');
      } catch (e) {
        breakdown = [];
      }

      res.json({
        success: true,
        data: {
          ...bill,
          slab_breakdown: breakdown
        }
      });
    } catch (err) {
      console.error('getBillById error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve bill invoice.' });
    }
  }

  static async checkOverdueBills(req, res) {
    try {
      const result = BillingEngine.processOverdueBills();
      res.json({
        success: true,
        message: `Overdue scan completed. Evaluated ${result.processed} bills; updated ${result.updatedCount} overdue bills with applicable late surcharge.`,
        data: result
      });
    } catch (err) {
      console.error('checkOverdueBills error:', err);
      res.status(500).json({ success: false, message: 'Failed to process overdue bills.' });
    }
  }
}

module.exports = BillController;
