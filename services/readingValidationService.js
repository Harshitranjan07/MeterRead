const db = require('../config/db');
const BillingEngine = require('./billingEngine');

class ReadingValidationService {
  /**
   * Validate and submit meter reading with atomic bill generation
   * @param {Object} params
   * @param {number} params.meterId
   * @param {number} params.currentReading
   * @param {string} params.billingMonth - YYYY-MM
   * @param {string} params.readingDate - YYYY-MM-DD
   * @param {number} params.readerId
   * @param {string} params.readerName
   * @param {string} params.notes
   * @param {string} params.photoUrl
   */
  static submitReading({
    meterId,
    currentReading,
    billingMonth,
    readingDate = new Date().toISOString().slice(0, 10),
    readerId = null,
    readerName = 'Field Reader',
    notes = '',
    photoUrl = null
  }) {
    // 1. Fetch meter and assigned consumer
    const meter = db.get(
      `SELECT m.*, c.id as consumer_id, c.user_id as consumer_user_id, c.connection_type, c.consumer_number
       FROM meters m
       LEFT JOIN consumers c ON m.consumer_id = c.id
       WHERE m.id = ?`,
      [meterId]
    );

    if (!meter) {
      throw new Error('Meter not found in system.');
    }

    if (!meter.consumer_id) {
      throw new Error('Meter is not assigned to any active consumer.');
    }

    if (meter.status === 'Faulty') {
      throw new Error('Cannot submit reading for a meter marked as Faulty.');
    }

    const previousReading = meter.last_reading !== null ? parseFloat(meter.last_reading) : 0.0;
    const current = parseFloat(currentReading);

    if (isNaN(current) || current < 0) {
      throw new Error('Current reading must be a valid positive number.');
    }

    // RULE 1: Current reading must be greater than or equal to previous reading
    if (current < previousReading) {
      throw new Error('Invalid reading. Current reading cannot be lower than the previous reading.');
    }

    // Default billing month to current YYYY-MM if omitted
    const month = billingMonth || new Date().toISOString().slice(0, 7);

    // RULE 2: Prevent duplicate readings for the same meter and billing month
    const existingReading = db.get(
      `SELECT id FROM meter_readings 
       WHERE meter_id = ? AND billing_month = ?`,
      [meterId, month]
    );

    if (existingReading) {
      throw new Error('A reading for this meter already exists for this billing month.');
    }

    // RULE 3: Calculate units consumed
    const unitsConsumed = Math.round((current - previousReading) * 100) / 100;

    // RULE 4: Perform atomic transaction:
    // a. Insert reading
    // b. Update meter's latest reading and date
    // c. Calculate bill via billing engine
    // d. Insert bill record
    // e. Create notification
    // f. Create audit log

    const tx = db.transaction(() => {
      // a. Insert reading
      const readingResult = db.db.prepare(
        `INSERT INTO meter_readings 
          (meter_id, consumer_id, reader_id, previous_reading, current_reading, units_consumed, reading_date, billing_month, status, notes, photo_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Valid', ?, ?)`
      ).run(
        meterId,
        meter.consumer_id,
        readerId,
        previousReading,
        current,
        unitsConsumed,
        readingDate,
        month,
        notes,
        photoUrl
      );

      const readingId = readingResult.lastInsertRowid;

      // b. Update meter latest reading
      db.db.prepare(
        `UPDATE meters 
         SET last_reading = ?, 
             last_reading_date = ?, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`
      ).run(current, readingDate, meterId);

      // c. Calculate bill using progressive slabs
      const billCalc = BillingEngine.calculateBill(meter.connection_type, unitsConsumed);

      // Generate unique bill number: BILL-YYYYMM-RANDOM
      const monthClean = month.replace('-', '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const billNumber = `BILL-${monthClean}-${randomSuffix}`;

      // Calculate due date (e.g. 20 days from reading/generation date)
      const lateConfig = db.get(
        `SELECT due_days_from_generation FROM late_payment_configs WHERE connection_type = ?`,
        [meter.connection_type]
      );
      const dueDays = lateConfig?.due_days_from_generation || 20;
      
      const billDateObj = new Date(readingDate);
      const dueDateObj = new Date(billDateObj);
      dueDateObj.setDate(dueDateObj.getDate() + dueDays);
      const dueDateStr = dueDateObj.toISOString().slice(0, 10);

      // d. Insert bill record
      const billResult = db.db.prepare(
        `INSERT INTO bills 
          (bill_number, consumer_id, meter_id, reading_id, billing_month, previous_reading, current_reading, units_consumed, energy_charge, fixed_charge, late_surcharge, total_amount, slab_breakdown, bill_date, due_date, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, 'Unpaid')`
      ).run(
        billNumber,
        meter.consumer_id,
        meterId,
        readingId,
        month,
        previousReading,
        current,
        unitsConsumed,
        billCalc.energyCharge,
        billCalc.fixedCharge,
        billCalc.totalAmount,
        JSON.stringify(billCalc.breakdown),
        readingDate,
        dueDateStr
      );

      const billId = billResult.lastInsertRowid;

      // e. Create notification for consumer
      if (meter.consumer_user_id) {
        db.db.prepare(
          `INSERT INTO notifications (user_id, title, message, type, link)
           VALUES (?, ?, ?, 'bill', ?)`
        ).run(
          meter.consumer_user_id,
          `Bill Generated for ${month}`,
          `Your utility bill of ₹${billCalc.totalAmount} for ${month} (${unitsConsumed} units) is ready. Due date: ${dueDateStr}.`,
          `/consumer/bills`
        );
      }

      // f. Create audit log
      db.db.prepare(
        `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
         VALUES (?, ?, 'meter_reader', 'SUBMIT_READING_AND_GENERATE_BILL', 'METER_READING', ?, ?)`
      ).run(
        readerId,
        readerName,
        String(readingId),
        JSON.stringify({
          meterNumber: meter.meter_number,
          consumerNumber: meter.consumer_number,
          previousReading,
          currentReading: current,
          unitsConsumed,
          billNumber,
          totalAmount: billCalc.totalAmount
        })
      );

      return {
        readingId,
        billId,
        billNumber,
        previousReading,
        currentReading: current,
        unitsConsumed,
        billAmount: billCalc.totalAmount,
        dueDate: dueDateStr
      };
    });

    return tx();
  }
}

module.exports = ReadingValidationService;
