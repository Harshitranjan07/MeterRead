const mongoose = require('mongoose');

const ConsumerSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID reference is required'],
      unique: true,
      index: true
    },
    sqlite_user_id: {
      type: Number,
      default: null,
      index: true
    },
    sqlite_id: {
      type: Number,
      default: null,
      index: true
    },
    consumer_number: {
      type: String,
      required: [true, 'Consumer number is required'],
      unique: true,
      trim: true,
      index: true
    },
    connection_type: {
      type: String,
      enum: ['Residential', 'Commercial', 'Industrial'],
      required: [true, 'Connection type is required'],
      index: true
    },
    tariff_category: {
      type: String,
      default: 'Standard Tier'
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    city: {
      type: String,
      default: 'New Delhi',
      trim: true
    },
    state: {
      type: String,
      default: 'Delhi',
      trim: true
    },
    pincode: {
      type: String,
      default: '110001',
      trim: true
    },
    registration_date: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Suspended'],
      default: 'Active',
      index: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

ConsumerSchema.index({ connection_type: 1, status: 1 });

module.exports = mongoose.models.Consumer || mongoose.model('Consumer', ConsumerSchema);
