const mongoose = require('mongoose');

const TariffSlabSchema = new mongoose.Schema(
  {
    connection_type: {
      type: String,
      enum: ['Residential', 'Commercial', 'Industrial'],
      required: [true, 'Connection type is required'],
      index: true
    },
    slab_name: {
      type: String,
      required: [true, 'Slab name is required'],
      trim: true
    },
    min_units: {
      type: Number,
      required: [true, 'Minimum units is required'],
      min: 0
    },
    max_units: {
      type: Number,
      default: null // null indicates unlimited / infinity
    },
    rate_per_unit: {
      type: Number,
      required: [true, 'Rate per unit is required'],
      min: 0
    },
    fixed_charge: {
      type: Number,
      default: 50.0,
      min: 0
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

TariffSlabSchema.index({ connection_type: 1, min_units: 1 });

module.exports = mongoose.models.TariffSlab || mongoose.model('TariffSlab', TariffSlabSchema);
