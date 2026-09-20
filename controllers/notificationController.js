const db = require('../config/db');

class NotificationController {
  static async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const notifications = db.query(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );

      const unreadCount = db.get(
        `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
        [userId]
      )?.count || 0;

      res.json({
        success: true,
        data: notifications,
        unreadCount
      });
    } catch (err) {
      console.error('getNotifications error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve notifications.' });
    }
  }

  static async markAsRead(req, res) {
    try {
      const { id } = req.params;
      db.run(
        `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
        [id, req.user.id]
      );
      res.json({ success: true, message: 'Notification marked as read.' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to update notification.' });
    }
  }

  static async markAllAsRead(req, res) {
    try {
      db.run(
        `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
        [req.user.id]
      );
      res.json({ success: true, message: 'All notifications marked as read.' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to update notifications.' });
    }
  }
}

module.exports = NotificationController;
