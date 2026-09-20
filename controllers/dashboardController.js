const db = require('../config/db');

class DashboardController {
  static async getAdminStats(req, res) {
    try {
      // 1. Top KPI Metrics
      const totalConsumers = db.get(`SELECT COUNT(*) as count FROM consumers WHERE status = 'Active'`)?.count || 0;
      const totalMeters = db.get(`SELECT COUNT(*) as count FROM meters WHERE status = 'Active'`)?.count || 0;
      const totalReaders = db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'meter_reader' AND status = 'active'`)?.count || 0;
      
      const billCounts = db.get(`
        SELECT 
          COUNT(*) as totalBills,
          SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) as paidBills,
          SUM(CASE WHEN payment_status = 'Unpaid' THEN 1 ELSE 0 END) as unpaidBills,
          SUM(CASE WHEN payment_status = 'Overdue' THEN 1 ELSE 0 END) as overdueBills,
          SUM(units_consumed) as totalUnitsBilled,
          SUM(total_amount) as totalBilledAmount
        FROM bills
      `) || { totalBills: 0, paidBills: 0, unpaidBills: 0, overdueBills: 0, totalUnitsBilled: 0, totalBilledAmount: 0 };

      const revenueCollected = db.get(`
        SELECT SUM(amount) as totalRevenue FROM payments WHERE payment_status = 'Completed'
      `)?.totalRevenue || 0;

      // 2. Monthly Revenue & Billed Trends (past 7 months)
      const monthlyTrends = db.query(`
        SELECT 
          b.billing_month as month,
          SUM(b.units_consumed) as totalUnits,
          SUM(b.total_amount) as billedAmount,
          SUM(CASE WHEN b.payment_status = 'Paid' THEN b.total_amount ELSE 0 END) as collectedRevenue,
          COUNT(b.id) as billCount
        FROM bills b
        GROUP BY b.billing_month
        ORDER BY b.billing_month ASC
      `);

      // 3. Payment Status Distribution
      const paymentStatusStats = [
        { name: 'Paid', value: billCounts.paidBills || 0, color: '#10b981' },
        { name: 'Unpaid', value: billCounts.unpaidBills || 0, color: '#3b82f6' },
        { name: 'Overdue', value: billCounts.overdueBills || 0, color: '#ef4444' }
      ];

      // 4. Connection Type Breakdown
      const connectionTypeStats = db.query(`
        SELECT 
          c.connection_type as name,
          COUNT(DISTINCT c.id) as consumersCount,
          COALESCE(SUM(b.units_consumed), 0) as totalUnits,
          COALESCE(SUM(b.total_amount), 0) as totalBilled
        FROM consumers c
        LEFT JOIN bills b ON b.consumer_id = c.id
        GROUP BY c.connection_type
      `);

      // 5. Top 5 Consuming Consumers
      const topConsumers = db.query(`
        SELECT 
          c.consumer_number,
          u.name as consumer_name,
          c.connection_type,
          SUM(b.units_consumed) as totalUnitsConsumed,
          SUM(b.total_amount) as totalBilled
        FROM consumers c
        JOIN users u ON c.user_id = u.id
        JOIN bills b ON b.consumer_id = c.id
        GROUP BY c.id
        ORDER BY totalUnitsConsumed DESC
        LIMIT 5
      `);

      // 6. Recent System Activity
      const recentActivity = db.query(`
        SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 6
      `);

      res.json({
        success: true,
        data: {
          kpis: {
            totalConsumers,
            activeMeters: totalMeters,
            meterReaders: totalReaders,
            totalBills: billCounts.totalBills,
            paidBills: billCounts.paidBills,
            unpaidBills: billCounts.unpaidBills,
            overdueBills: billCounts.overdueBills,
            totalRevenue: Math.round(revenueCollected * 100) / 100,
            totalUnitsBilled: Math.round((billCounts.totalUnitsBilled || 0) * 100) / 100
          },
          monthlyTrends,
          paymentStatusStats,
          connectionTypeStats,
          topConsumers,
          recentActivity
        }
      });
    } catch (err) {
      console.error('getAdminStats error:', err);
      res.status(500).json({ success: false, message: 'Failed to compute admin analytics.' });
    }
  }

  static async getConsumerStats(req, res) {
    try {
      const consumerId = req.user.consumerId;
      if (!consumerId) {
        return res.status(404).json({ success: false, message: 'No consumer profile attached to user.' });
      }

      // Fetch active meter
      const meter = db.get(
        `SELECT m.*, r.name as reader_name
         FROM meters m
         LEFT JOIN users r ON m.assigned_reader_id = r.id
         WHERE m.consumer_id = ?`,
        [consumerId]
      );

      // Fetch all bills for consumer ordered by month
      const bills = db.query(
        `SELECT * FROM bills WHERE consumer_id = ? ORDER BY billing_month DESC`,
        [consumerId]
      );

      // Latest active bill
      const currentBill = bills[0] || null;

      // Dynamic MoM Insight Calculation
      let momInsight = 'No previous billing cycle data available.';
      let percentChange = 0;
      let trendDirection = 'flat';

      if (bills.length >= 2) {
        const latestUnits = bills[0].units_consumed;
        const prevUnits = bills[1].units_consumed;

        if (prevUnits > 0) {
          percentChange = Math.round(((latestUnits - prevUnits) / prevUnits) * 100 * 10) / 10;
          if (percentChange > 0) {
            trendDirection = 'increase';
            momInsight = `Your consumption increased by ${percentChange}% compared with the previous month (${bills[1].billing_month}).`;
          } else if (percentChange < 0) {
            trendDirection = 'decrease';
            momInsight = `Great job! Your consumption decreased by ${Math.abs(percentChange)}% compared with the previous month (${bills[1].billing_month}).`;
          } else {
            trendDirection = 'flat';
            momInsight = `Your consumption remained identical to the previous month.`;
          }
        }
      }

      // Monthly consumption data array for charts (chronological order)
      const consumptionHistory = [...bills]
        .reverse()
        .map(b => ({
          month: b.billing_month,
          units: b.units_consumed,
          amount: b.total_amount,
          status: b.payment_status,
          billNumber: b.bill_number
        }));

      // Total paid to date
      const totalPaid = db.get(
        `SELECT SUM(amount) as total FROM payments WHERE consumer_id = ? AND payment_status = 'Completed'`,
        [consumerId]
      )?.total || 0;

      // Unread notifications
      const unreadNotifs = db.get(
        `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
        [req.user.id]
      )?.count || 0;

      res.json({
        success: true,
        data: {
          meter,
          currentBill,
          insight: {
            text: momInsight,
            percentChange,
            trendDirection
          },
          consumptionHistory,
          totalPaid,
          unreadNotifs,
          totalBillsCount: bills.length
        }
      });
    } catch (err) {
      console.error('getConsumerStats error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve consumer dashboard metrics.' });
    }
  }

  static async getReaderStats(req, res) {
    try {
      const readerId = req.user.id;
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Meters assigned to this reader
      const assignedMeters = db.query(
        `SELECT m.*, 
                c.consumer_number, c.connection_type, c.address, c.city,
                u.name as consumer_name, u.phone as consumer_phone,
                (SELECT r.id FROM meter_readings r WHERE r.meter_id = m.id AND r.billing_month = ?) as current_month_reading_id,
                (SELECT r.current_reading FROM meter_readings r WHERE r.meter_id = m.id AND r.billing_month = ?) as current_month_reading_val,
                (SELECT r.reading_date FROM meter_readings r WHERE r.meter_id = m.id AND r.billing_month = ?) as current_month_reading_date
         FROM meters m
         JOIN consumers c ON m.consumer_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE m.assigned_reader_id = ? AND m.status = 'Active'
         ORDER BY m.id ASC`,
        [currentMonth, currentMonth, currentMonth, readerId]
      );

      const totalAssigned = assignedMeters.length;
      const completedCount = assignedMeters.filter(m => m.current_month_reading_id).length;
      const pendingCount = totalAssigned - completedCount;

      // Recent submissions by this reader
      const recentSubmissions = db.query(
        `SELECT r.*, m.meter_number, c.consumer_number, u.name as consumer_name
         FROM meter_readings r
         JOIN meters m ON r.meter_id = m.id
         JOIN consumers c ON r.consumer_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE r.reader_id = ?
         ORDER BY r.created_at DESC
         LIMIT 10`,
        [readerId]
      );

      res.json({
        success: true,
        data: {
          currentMonth,
          totalAssigned,
          completedCount,
          pendingCount,
          assignedMeters,
          recentSubmissions
        }
      });
    } catch (err) {
      console.error('getReaderStats error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve meter reader dashboard.' });
    }
  }
}

module.exports = DashboardController;
