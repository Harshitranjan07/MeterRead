const mongoose = require('mongoose');

const LatePaymentConfigSchema = new mongoose.Schema(
  {
    connection_type: {
      type: String,
      enum: ['Residential', 'Commercial', 'Industrial'],
      required: [true, 'Connection type is required'],
      unique: true,
      index: true
    },
    surcharge_percentage: {
      type: Number,
      required: true,
      default: 5.0,
      min: 0
    },
    grace_period_days: {
      type: Number,
      required: true,
      default: 15,
      min: 0
    },
    max_surcharge: {
      type: Number,
      default: 500.0,
      min: 0
    },
    due_days_from_generation: {
      type: Number,
      required: true,
      default: 20,
      min: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

module.exports = mongoose.models.LatePaymentConfig || mongoose.model('LatePaymentConfig', LatePaymentConfigSchema);
