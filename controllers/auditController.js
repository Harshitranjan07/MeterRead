const db = require('../config/db');

class AuditController {
  static async getAuditLogs(req, res) {
    try {
      const { search, action, userRole, page = 1, limit = 30 } = req.query;

      let query = `SELECT * FROM audit_logs WHERE 1=1`;
      const params = [];

      if (action && action !== 'ALL') {
        query += ` AND action = ?`;
        params.push(action);
      }

      if (userRole && userRole !== 'ALL') {
        query += ` AND user_role = ?`;
        params.push(userRole);
      }

      if (search) {
        query += ` AND (user_name LIKE ? OR action LIKE ? OR entity LIKE ? OR details LIKE ?)`;
        const s = `%${search.trim()}%`;
        params.push(s, s, s, s);
      }

      const countSql = `SELECT COUNT(*) as total FROM (${query})`;
      const countRow = db.get(countSql, params);
      const total = countRow ? countRow.total : 0;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      query += ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
      params.push(limitNum, offset);

      const logs = db.query(query, params);

      res.json({
        success: true,
        data: logs,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      console.error('getAuditLogs error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve audit logs.' });
    }
  }
}

module.exports = AuditController;
