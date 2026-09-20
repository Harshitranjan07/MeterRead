const mongoose = require('mongoose');

const MeterSchema = new mongoose.Schema(
  {
    meter_number: {
      type: String,
      required: [true, 'Meter number is required'],
      unique: true,
      trim: true,
      index: true
    },
    meter_type: {
      type: String,
      enum: ['Digital Smart Meter', 'Electromechanical', 'Ultrasonic Smart Flow'],
      default: 'Digital Smart Meter'
    },
    consumer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consumer',
      default: null,
      index: true
    },
    sqlite_consumer_id: {
      type: Number,
      default: null
    },
    sqlite_id: {
      type: Number,
      default: null
    },
    installation_date: {
      type: Date,
      default: Date.now
    },
    last_reading: {
      type: Number,
      default: 0.0,
      min: 0
    },
    last_reading_date: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Faulty'],
      default: 'Active',
      index: true
    },
    assigned_reader_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    sqlite_reader_id: {
      type: Number,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

MeterSchema.index({ assigned_reader_id: 1, status: 1 });

module.exports = mongoose.models.Meter || mongoose.model('Meter', MeterSchema);
