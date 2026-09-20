const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    transaction_id: {
      type: String,
      required: [true, 'Transaction ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    bill_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bill',
      required: [true, 'Bill reference is required'],
      index: true
    },
    consumer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consumer',
      required: [true, 'Consumer reference is required'],
      index: true
    },
    sqlite_bill_id: {
      type: Number,
      default: null
    },
    sqlite_consumer_id: {
      type: Number,
      default: null
    },
    sqlite_id: {
      type: Number,
      default: null
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: 0
    },
    payment_method: {
      type: String,
      enum: ['UPI', 'NetBanking', 'Card', 'SimulatedGateway'],
      required: [true, 'Payment method is required']
    },
    payment_date: {
      type: Date,
      default: Date.now,
      index: true
    },
    payment_status: {
      type: String,
      enum: ['Completed', 'Failed', 'Pending'],
      default: 'Completed',
      index: true
    },
    reference_number: {
      type: String,
      default: null,
      trim: true
    },
    gateway_response: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

PaymentSchema.index({ consumer_id: 1, payment_date: -1 });

module.exports = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);
