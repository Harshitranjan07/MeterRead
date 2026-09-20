const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema(
  {
    bill_number: {
      type: String,
      required: [true, 'Bill number is required'],
      unique: true,
      trim: true,
      index: true
    },
    consumer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consumer',
      required: [true, 'Consumer reference is required'],
      index: true
    },
    meter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meter',
      required: [true, 'Meter reference is required'],
      index: true
    },
    reading_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MeterReading',
      default: null,
      index: true
    },
    sqlite_consumer_id: {
      type: Number,
      default: null
    },
    sqlite_meter_id: {
      type: Number,
      default: null
    },
    sqlite_reading_id: {
      type: Number,
      default: null
    },
    sqlite_id: {
      type: Number,
      default: null
    },
    billing_month: {
      type: String, // Format: YYYY-MM
      required: [true, 'Billing month is required'],
      index: true
    },
    previous_reading: {
      type: Number,
      required: true,
      min: 0
    },
    current_reading: {
      type: Number,
      required: true,
      min: 0
    },
    units_consumed: {
      type: Number,
      required: true,
      min: 0
    },
    energy_charge: {
      type: Number,
      required: true,
      min: 0
    },
    fixed_charge: {
      type: Number,
      required: true,
      min: 0
    },
    late_surcharge: {
      type: Number,
      default: 0.0,
      min: 0
    },
    total_amount: {
      type: Number,
      required: true,
      min: 0
    },
    slab_breakdown: {
      type: mongoose.Schema.Types.Mixed, // Array of slab breakdown objects or JSON
      required: true,
      default: []
    },
    bill_date: {
      type: Date,
      required: true,
      default: Date.now
    },
    due_date: {
      type: Date,
      required: true
    },
    payment_status: {
      type: String,
      enum: ['Generated', 'Unpaid', 'Paid', 'Overdue', 'Cancelled'],
      default: 'Unpaid',
      index: true
    },
    paid_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

BillSchema.index({ consumer_id: 1, billing_month: -1 });
BillSchema.index({ payment_status: 1, due_date: 1 });

module.exports = mongoose.models.Bill || mongoose.model('Bill', BillSchema);
