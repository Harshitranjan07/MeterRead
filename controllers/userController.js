const bcrypt = require('bcryptjs');
const db = require('../config/db');

class UserController {
  static async getUsers(req, res) {
    try {
      const { role, search, status } = req.query;
      let query = `SELECT id, name, email, role, phone, status, created_at, updated_at FROM users WHERE 1=1`;
      const params = [];

      if (role && role !== 'ALL') {
        query += ` AND role = ?`;
        params.push(role);
      }

      if (status && status !== 'ALL') {
        query += ` AND status = ?`;
        params.push(status);
      }

      if (search) {
        query += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
        const s = `%${search.trim()}%`;
        params.push(s, s, s);
      }

      query += ` ORDER BY id DESC`;
      const users = db.query(query, params);

      // If fetching meter readers, also attach assigned meters count and submitted readings count
      const enrichedUsers = users.map(u => {
        if (u.role === 'meter_reader') {
          const assignedCount = db.get(`SELECT COUNT(*) as count FROM meters WHERE assigned_reader_id = ?`, [u.id])?.count || 0;
          const readingsCount = db.get(`SELECT COUNT(*) as count FROM meter_readings WHERE reader_id = ?`, [u.id])?.count || 0;
          return {
            ...u,
            assignedMetersCount: assignedCount,
            readingsSubmittedCount: readingsCount
          };
        }
        return u;
      });

      res.json({
        success: true,
        data: enrichedUsers
      });
    } catch (err) {
      console.error('getUsers error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
    }
  }

  static async createUser(req, res) {
    try {
      const { name, email, password, role = 'meter_reader', phone } = req.body;

      if (!name || !email || !password || !role) {
        return res.status(400).json({ success: false, message: 'Name, email, password, and role are required.' });
      }

      const existing = db.get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
      if (existing) {
        return res.status(400).json({ success: false, message: 'A user with this email already exists.' });
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password, salt);

      const tx = db.transaction(() => {
        const insertRes = db.db.prepare(
          `INSERT INTO users (name, email, password_hash, role, phone, status)
           VALUES (?, ?, ?, ?, ?, 'active')`
        ).run(name.trim(), email.toLowerCase().trim(), passwordHash, role, phone || null);

        const userId = insertRes.lastInsertRowid;

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'CREATE_USER', 'USER', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(userId), JSON.stringify({ role, email, name }));

        return userId;
      });

      const userId = tx();
      res.status(201).json({
        success: true,
        message: `${role.replace('_', ' ')} created successfully.`,
        data: { id: userId, name, email, role, phone, status: 'active' }
      });
    } catch (err) {
      console.error('createUser error:', err);
      res.status(500).json({ success: false, message: 'Failed to create user.' });
    }
  }

  static async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Status must be active or inactive.' });
      }

      const user = db.get(`SELECT * FROM users WHERE id = ?`, [id]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      if (user.id === req.user.id) {
        return res.status(400).json({ success: false, message: 'You cannot deactivate your own administrative account.' });
      }

      const tx = db.transaction(() => {
        db.db.prepare(`UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, id);

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'UPDATE_USER_STATUS', 'USER', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(id), JSON.stringify({ status }));
      });

      tx();
      res.json({ success: true, message: `User account status updated to ${status}.` });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to update user status.' });
    }
  }
}

module.exports = UserController;
