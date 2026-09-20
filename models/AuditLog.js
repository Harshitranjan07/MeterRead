const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    sqlite_user_id: {
      type: Number,
      default: null
    },
    user_name: {
      type: String,
      required: true,
      trim: true
    },
    user_role: {
      type: String,
      required: true,
      trim: true
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    entity: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    entity_id: {
      type: String,
      default: null
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    ip_address: {
      type: String,
      default: '127.0.0.1'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

AuditLogSchema.index({ created_at: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
