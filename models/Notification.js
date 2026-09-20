const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true
    },
    sqlite_user_id: {
      type: Number,
      default: null
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    message: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true
    },
    type: {
      type: String,
      enum: ['bill', 'payment', 'reading', 'system', 'alert'],
      default: 'system',
      index: true
    },
    is_read: {
      type: Boolean,
      default: false,
      index: true
    },
    link: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

NotificationSchema.index({ user_id: 1, is_read: 1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
