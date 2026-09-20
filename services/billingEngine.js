const db = require('../config/db');

class BillingEngine {
  /**
   * Calculate progressive bill breakdown and totals for a given connection type and units consumed
   * @param {string} connectionType - 'Residential', 'Commercial', 'Industrial'
   * @param {number} unitsConsumed - Number of units consumed
   * @returns {Object} { energyCharge, fixedCharge, totalAmount, breakdown }
   */
  static calculateBill(connectionType, unitsConsumed) {
    const units = Math.max(0, parseFloat(unitsConsumed) || 0);

    // Fetch active tariff slabs for connection type, ordered by min_units
    const slabs = db.query(
      `SELECT * FROM tariff_slabs 
       WHERE connection_type = ? AND is_active = 1 
       ORDER BY min_units ASC`,
      [connectionType]
    );

    if (!slabs || slabs.length === 0) {
      // Fallback standard slabs if none configured in database
      return this._calculateFallback(connectionType, units);
    }

    let remainingUnits = units;
    let totalEnergyCharge = 0;
    const breakdown = [];
    const fixedCharge = slabs[0]?.fixed_charge || 100.0;

    for (const slab of slabs) {
      if (remainingUnits <= 0) break;

      const min = slab.min_units;
      const max = slab.max_units !== null && slab.max_units !== undefined ? slab.max_units : Infinity;
      const slabCapacity = max === Infinity ? Infinity : (max - min);

      // How many units fall into this slab
      const unitsInThisSlab = Math.min(remainingUnits, slabCapacity);

      if (unitsInThisSlab > 0) {
        const slabCost = Math.round(unitsInThisSlab * slab.rate_per_unit * 100) / 100;
        totalEnergyCharge += slabCost;
        remainingUnits -= unitsInThisSlab;

        breakdown.push({
          slabId: slab.id,
          slabName: slab.slab_name,
          minUnits: min,
          maxUnits: slab.max_units,
          ratePerUnit: slab.rate_per_unit,
          unitsBilled: unitsInThisSlab,
          amount: slabCost
        });
      }
    }

    totalEnergyCharge = Math.round(totalEnergyCharge * 100) / 100;
    const totalAmount = Math.round((totalEnergyCharge + fixedCharge) * 100) / 100;

    return {
      unitsConsumed: units,
      energyCharge: totalEnergyCharge,
      fixedCharge: fixedCharge,
      lateSurcharge: 0.0,
      totalAmount: totalAmount,
      breakdown: breakdown
    };
  }

  /**
   * Fallback progressive tariff calculator
   */
  static _calculateFallback(connectionType, units) {
    let fixedCharge = 100.0;
    let breakdown = [];
    let energyCharge = 0;

    if (connectionType === 'Commercial') {
      fixedCharge = 250.0;
      // 0-100 @ 8, 101-300 @ 10, >300 @ 14
      let rem = units;
      const b1 = Math.min(rem, 100);
      if (b1 > 0) {
        breakdown.push({ slabName: '0 - 100 Units', ratePerUnit: 8.0, unitsBilled: b1, amount: b1 * 8 });
        energyCharge += b1 * 8;
        rem -= b1;
      }
      const b2 = Math.min(rem, 200);
      if (b2 > 0) {
        breakdown.push({ slabName: '101 - 300 Units', ratePerUnit: 10.0, unitsBilled: b2, amount: b2 * 10 });
        energyCharge += b2 * 10;
        rem -= b2;
      }
      if (rem > 0) {
        breakdown.push({ slabName: 'Above 300 Units', ratePerUnit: 14.0, unitsBilled: rem, amount: rem * 14 });
        energyCharge += rem * 14;
      }
    } else if (connectionType === 'Industrial') {
      fixedCharge = 500.0;
      // Flat commercial/industrial tiered: 0-500 @ 10, >500 @ 15
      let rem = units;
      const b1 = Math.min(rem, 500);
      if (b1 > 0) {
        breakdown.push({ slabName: '0 - 500 Units', ratePerUnit: 10.0, unitsBilled: b1, amount: b1 * 10 });
        energyCharge += b1 * 10;
        rem -= b1;
      }
      if (rem > 0) {
        breakdown.push({ slabName: 'Above 500 Units', ratePerUnit: 15.0, unitsBilled: rem, amount: rem * 15 });
        energyCharge += rem * 15;
      }
    } else {
      // Residential: 0-100 @ 5, 101-200 @ 7, 201-300 @ 9, >300 @ 12
      let rem = units;
      const b1 = Math.min(rem, 100);
      if (b1 > 0) {
        breakdown.push({ slabName: '0 - 100 Units', ratePerUnit: 5.0, unitsBilled: b1, amount: b1 * 5 });
        energyCharge += b1 * 5;
        rem -= b1;
      }
      const b2 = Math.min(rem, 100);
      if (b2 > 0) {
        breakdown.push({ slabName: '101 - 200 Units', ratePerUnit: 7.0, unitsBilled: b2, amount: b2 * 7 });
        energyCharge += b2 * 7;
        rem -= b2;
      }
      const b3 = Math.min(rem, 100);
      if (b3 > 0) {
        breakdown.push({ slabName: '201 - 300 Units', ratePerUnit: 9.0, unitsBilled: b3, amount: b3 * 9 });
        energyCharge += b3 * 9;
        rem -= b3;
      }
      if (rem > 0) {
        breakdown.push({ slabName: 'Above 300 Units', ratePerUnit: 12.0, unitsBilled: rem, amount: rem * 12 });
        energyCharge += rem * 12;
      }
    }

    return {
      unitsConsumed: units,
      energyCharge,
      fixedCharge,
      lateSurcharge: 0,
      totalAmount: energyCharge + fixedCharge,
      breakdown
    };
  }

  /**
   * Scan for unpaid bills past due date, compute late surcharge, and update status to 'Overdue'
   */
  static processOverdueBills() {
    const today = new Date().toISOString().slice(0, 10);
    
    // Find all unpaid or generated bills whose due_date has passed
    const overdueBills = db.query(
      `SELECT b.*, c.connection_type, c.user_id as consumer_user_id
       FROM bills b
       JOIN consumers c ON b.consumer_id = c.id
       WHERE b.payment_status IN ('Unpaid', 'Generated')
         AND b.due_date < ?`,
      [today]
    );

    let updatedCount = 0;
    const updateStmt = db.db.prepare(
      `UPDATE bills 
       SET payment_status = 'Overdue', 
           late_surcharge = ?, 
           total_amount = ?, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    );

    const notifStmt = db.db.prepare(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, ?, ?, 'alert', ?)`
    );

    const auditStmt = db.db.prepare(
      `INSERT INTO audit_logs (user_name, user_role, action, entity, entity_id, details)
       VALUES ('SYSTEM_CRON', 'system', 'APPLY_LATE_SURCHARGE', 'BILL', ?, ?)`
    );

    const tx = db.transaction(() => {
      for (const bill of overdueBills) {
        // Get config for connection type
        const config = db.get(
          `SELECT * FROM late_payment_configs WHERE connection_type = ?`,
          [bill.connection_type]
        ) || { surcharge_percentage: 5.0, max_surcharge: 500.0 };

        const surchargeRate = (config.surcharge_percentage || 5.0) / 100;
        const baseAmount = bill.energy_charge + bill.fixed_charge;
        let surcharge = Math.round(baseAmount * surchargeRate * 100) / 100;
        if (config.max_surcharge && surcharge > config.max_surcharge) {
          surcharge = config.max_surcharge;
        }

        const newTotal = Math.round((baseAmount + surcharge) * 100) / 100;

        updateStmt.run(surcharge, newTotal, bill.id);

        // Notify consumer
        if (bill.consumer_user_id) {
          notifStmt.run(
            bill.consumer_user_id,
            `Bill Overdue: ${bill.bill_number}`,
            `Your bill of ₹${newTotal} for ${bill.billing_month} is now overdue. A late fee of ₹${surcharge} has been applied.`,
            `/consumer/bills`
          );
        }

        auditStmt.run(
          String(bill.id),
          JSON.stringify({ billNumber: bill.bill_number, surcharge, newTotal })
        );

        updatedCount++;
      }
    });

    tx();
    return { processed: overdueBills.length, updatedCount };
  }

  /**
   * Validate that tariff slab ranges do not overlap
   */
  static validateSlabRanges(connectionType, slabs) {
    const sorted = [...slabs].sort((a, b) => a.min_units - b.min_units);
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (cur.max_units !== null && cur.max_units !== undefined && cur.min_units >= cur.max_units) {
        return { valid: false, error: `Invalid range in slab '${cur.slab_name}': min (${cur.min_units}) must be less than max (${cur.max_units}).` };
      }
      if (i > 0) {
        const prev = sorted[i - 1];
        const prevMax = prev.max_units !== null && prev.max_units !== undefined ? prev.max_units : Infinity;
        if (cur.min_units < prevMax) {
          return { valid: false, error: `Overlap detected between slab '${prev.slab_name}' and slab '${cur.slab_name}'.` };
        }
      }
    }
    return { valid: true };
  }
}

module.exports = BillingEngine;
