const mongoose = require('mongoose');

const MeterReadingSchema = new mongoose.Schema(
  {
    meter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meter',
      required: [true, 'Meter reference is required'],
      index: true
    },
    consumer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consumer',
      required: [true, 'Consumer reference is required'],
      index: true
    },
    reader_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    sqlite_meter_id: {
      type: Number,
      default: null
    },
    sqlite_consumer_id: {
      type: Number,
      default: null
    },
    sqlite_reader_id: {
      type: Number,
      default: null
    },
    sqlite_id: {
      type: Number,
      default: null
    },
    previous_reading: {
      type: Number,
      required: [true, 'Previous reading is required'],
      min: 0
    },
    current_reading: {
      type: Number,
      required: [true, 'Current reading is required'],
      min: 0
    },
    units_consumed: {
      type: Number,
      required: [true, 'Units consumed is required'],
      min: 0
    },
    reading_date: {
      type: Date,
      required: [true, 'Reading date is required'],
      default: Date.now
    },
    billing_month: {
      type: String, // Format: YYYY-MM
      required: [true, 'Billing month is required (YYYY-MM)'],
      trim: true,
      index: true
    },
    status: {
      type: String,
      enum: ['Valid', 'Pending_Review', 'Rejected'],
      default: 'Valid',
      index: true
    },
    notes: {
      type: String,
      default: null,
      trim: true
    },
    photo_url: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

MeterReadingSchema.index({ meter_id: 1, billing_month: 1 });
MeterReadingSchema.index({ consumer_id: 1, reading_date: -1 });

module.exports = mongoose.models.MeterReading || mongoose.model('MeterReading', MeterReadingSchema);
