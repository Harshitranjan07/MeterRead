const db = require('../config/db');
const BillingEngine = require('../services/billingEngine');

class TariffController {
  static async getTariffs(req, res) {
    try {
      const slabs = db.query(
        `SELECT * FROM tariff_slabs WHERE is_active = 1 ORDER BY connection_type, min_units ASC`
      );

      const lateConfigs = db.query(
        `SELECT * FROM late_payment_configs ORDER BY connection_type ASC`
      );

      // Group slabs by connection type
      const groupedSlabs = {
        Residential: slabs.filter(s => s.connection_type === 'Residential'),
        Commercial: slabs.filter(s => s.connection_type === 'Commercial'),
        Industrial: slabs.filter(s => s.connection_type === 'Industrial')
      };

      res.json({
        success: true,
        data: {
          slabs: groupedSlabs,
          rawSlabs: slabs,
          lateConfigs
        }
      });
    } catch (err) {
      console.error('getTariffs error:', err);
      res.status(500).json({ success: false, message: 'Failed to retrieve tariff configurations.' });
    }
  }

  static async createSlab(req, res) {
    try {
      const { connectionType, slabName, minUnits, maxUnits, ratePerUnit, fixedCharge = 50.0 } = req.body;

      if (!connectionType || !slabName || minUnits === undefined || ratePerUnit === undefined) {
        return res.status(400).json({ success: false, message: 'Connection type, slab name, min units, and rate per unit are required.' });
      }

      const min = parseFloat(minUnits);
      const max = maxUnits !== null && maxUnits !== '' && maxUnits !== undefined ? parseFloat(maxUnits) : null;
      const rate = parseFloat(ratePerUnit);
      const fixed = parseFloat(fixedCharge);

      if (max !== null && min >= max) {
        return res.status(400).json({ success: false, message: 'Minimum units must be strictly less than maximum units.' });
      }

      // Fetch existing active slabs for this connection type to check overlap
      const existing = db.query(
        `SELECT * FROM tariff_slabs WHERE connection_type = ? AND is_active = 1`,
        [connectionType]
      );

      const candidateList = [...existing, { slab_name: slabName, min_units: min, max_units: max }];
      const validation = BillingEngine.validateSlabRanges(connectionType, candidateList);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      const tx = db.transaction(() => {
        const insertRes = db.db.prepare(
          `INSERT INTO tariff_slabs (connection_type, slab_name, min_units, max_units, rate_per_unit, fixed_charge, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        ).run(connectionType, slabName.trim(), min, max, rate, fixed);

        const slabId = insertRes.lastInsertRowid;

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'CREATE_TARIFF_SLAB', 'TARIFF', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(slabId), JSON.stringify(req.body));

        return slabId;
      });

      const slabId = tx();
      res.status(201).json({ success: true, message: 'Tariff slab created successfully.', data: { id: slabId } });
    } catch (err) {
      console.error('createSlab error:', err);
      res.status(500).json({ success: false, message: 'Failed to create tariff slab.' });
    }
  }

  static async updateSlab(req, res) {
    try {
      const { id } = req.params;
      const { slabName, minUnits, maxUnits, ratePerUnit, fixedCharge } = req.body;

      const slab = db.get(`SELECT * FROM tariff_slabs WHERE id = ?`, [id]);
      if (!slab) {
        return res.status(404).json({ success: false, message: 'Tariff slab not found.' });
      }

      const min = minUnits !== undefined ? parseFloat(minUnits) : slab.min_units;
      const max = maxUnits !== undefined ? (maxUnits !== null && maxUnits !== '' ? parseFloat(maxUnits) : null) : slab.max_units;

      if (max !== null && min >= max) {
        return res.status(400).json({ success: false, message: 'Minimum units must be less than maximum units.' });
      }

      // Check overlap with other slabs
      const otherSlabs = db.query(
        `SELECT * FROM tariff_slabs WHERE connection_type = ? AND is_active = 1 AND id != ?`,
        [slab.connection_type, id]
      );
      const candidateList = [...otherSlabs, { slab_name: slabName || slab.slab_name, min_units: min, max_units: max }];
      const validation = BillingEngine.validateSlabRanges(slab.connection_type, candidateList);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      const tx = db.transaction(() => {
        db.db.prepare(
          `UPDATE tariff_slabs 
           SET slab_name = COALESCE(?, slab_name),
               min_units = ?,
               max_units = ?,
               rate_per_unit = COALESCE(?, rate_per_unit),
               fixed_charge = COALESCE(?, fixed_charge),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(
          slabName ? slabName.trim() : null,
          min,
          max,
          ratePerUnit !== undefined ? parseFloat(ratePerUnit) : null,
          fixedCharge !== undefined ? parseFloat(fixedCharge) : null,
          id
        );

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'UPDATE_TARIFF_SLAB', 'TARIFF', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(id), JSON.stringify(req.body));
      });

      tx();
      res.json({ success: true, message: 'Tariff slab updated successfully.' });
    } catch (err) {
      console.error('updateSlab error:', err);
      res.status(500).json({ success: false, message: 'Failed to update tariff slab.' });
    }
  }

  static async deleteSlab(req, res) {
    try {
      const { id } = req.params;
      const slab = db.get(`SELECT * FROM tariff_slabs WHERE id = ?`, [id]);
      if (!slab) {
        return res.status(404).json({ success: false, message: 'Tariff slab not found.' });
      }

      const tx = db.transaction(() => {
        db.db.prepare(`UPDATE tariff_slabs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'DEACTIVATE_TARIFF_SLAB', 'TARIFF', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, String(id), JSON.stringify({ slabName: slab.slab_name }));
      });

      tx();
      res.json({ success: true, message: 'Tariff slab deactivated successfully.' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to delete tariff slab.' });
    }
  }

  static async updateLateConfig(req, res) {
    try {
      const { connectionType, surchargePercentage, gracePeriodDays, maxSurcharge, dueDaysFromGeneration } = req.body;

      if (!connectionType) {
        return res.status(400).json({ success: false, message: 'Connection type is required.' });
      }

      const tx = db.transaction(() => {
        db.db.prepare(
          `UPDATE late_payment_configs 
           SET surcharge_percentage = COALESCE(?, surcharge_percentage),
               grace_period_days = COALESCE(?, grace_period_days),
               max_surcharge = COALESCE(?, max_surcharge),
               due_days_from_generation = COALESCE(?, due_days_from_generation),
               updated_at = CURRENT_TIMESTAMP
           WHERE connection_type = ?`
        ).run(
          surchargePercentage !== undefined ? parseFloat(surchargePercentage) : null,
          gracePeriodDays !== undefined ? parseInt(gracePeriodDays) : null,
          maxSurcharge !== undefined ? parseFloat(maxSurcharge) : null,
          dueDaysFromGeneration !== undefined ? parseInt(dueDaysFromGeneration) : null,
          connectionType
        );

        db.db.prepare(
          `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
           VALUES (?, ?, ?, 'UPDATE_LATE_SURCHARGE_CONFIG', 'CONFIG', ?, ?)`
        ).run(req.user.id, req.user.name, req.user.role, connectionType, JSON.stringify(req.body));
      });

      tx();
      res.json({ success: true, message: 'Late payment settings updated successfully.' });
    } catch (err) {
      console.error('updateLateConfig error:', err);
      res.status(500).json({ success: false, message: 'Failed to update late surcharge configuration.' });
    }
  }
}

module.exports = TariffController;
