const db = require('../config/db');

class PaymentService {
  /**
   * Process a bill payment with database transaction, audit log, and consumer notification
   * @param {Object} params
   * @param {number} params.billId
   * @param {number} params.consumerId
   * @param {string} params.paymentMethod - 'UPI', 'NetBanking', 'Card', 'SimulatedGateway'
   * @param {string} [params.referenceNumber]
   * @param {Object} [params.gatewayDetails]
   * @param {number} [params.userId]
   * @param {string} [params.userName]
   */
  static processPayment({
    billId,
    consumerId,
    paymentMethod = 'UPI',
    referenceNumber = null,
    gatewayDetails = {},
    userId = null,
    userName = 'Consumer'
  }) {
    // 1. Fetch bill
    const bill = db.get(
      `SELECT b.*, c.user_id as consumer_user_id, c.consumer_number
       FROM bills b
       JOIN consumers c ON b.consumer_id = c.id
       WHERE b.id = ?`,
      [billId]
    );

    if (!bill) {
      throw new Error('Bill not found in system.');
    }

    if (consumerId && bill.consumer_id !== parseInt(consumerId)) {
      throw new Error('Access denied: You are not authorized to pay this bill.');
    }

    if (bill.payment_status === 'Paid') {
      throw new Error(`This bill (${bill.bill_number}) has already been paid on ${bill.paid_at}.`);
    }

    if (bill.payment_status === 'Cancelled') {
      throw new Error('Cannot pay a cancelled bill.');
    }

    // Generate unique transaction ID: TXN-YYYYMMDD-RANDOM
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionId = `TXN-${dateStr}-${rand}`;
    const paymentDate = now.toISOString();

    const tx = db.transaction(() => {
      // 1. Insert into payments table
      const payResult = db.db.prepare(
        `INSERT INTO payments 
          (transaction_id, bill_id, consumer_id, amount, payment_method, payment_date, payment_status, reference_number, gateway_response)
         VALUES (?, ?, ?, ?, ?, ?, 'Completed', ?, ?)`
      ).run(
        transactionId,
        billId,
        bill.consumer_id,
        bill.total_amount,
        paymentMethod,
        paymentDate,
        referenceNumber || `REF-${Math.floor(10000000 + Math.random() * 90000000)}`,
        JSON.stringify({
          provider: 'SmartUtility Gateway Simulator (Razorpay/Stripe Ready)',
          status: 'SUCCESS',
          fee: 0,
          captured: true,
          ...gatewayDetails
        })
      );

      // 2. Update bill status
      db.db.prepare(
        `UPDATE bills 
         SET payment_status = 'Paid', 
             paid_at = ?, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`
      ).run(paymentDate, billId);

      // 3. Create consumer notification
      if (bill.consumer_user_id) {
        db.db.prepare(
          `INSERT INTO notifications (user_id, title, message, type, link)
           VALUES (?, ?, ?, 'payment', ?)`
        ).run(
          bill.consumer_user_id,
          'Payment Successful',
          `Payment of ₹${bill.total_amount} for bill ${bill.bill_number} was successful. Transaction ID: ${transactionId}.`,
          '/consumer/payments'
        );
      }

      // 4. Create audit log
      db.db.prepare(
        `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details)
         VALUES (?, ?, 'consumer', 'COMPLETE_PAYMENT', 'PAYMENT', ?, ?)`
      ).run(
        userId,
        userName,
        transactionId,
        JSON.stringify({
          billNumber: bill.bill_number,
          amount: bill.total_amount,
          paymentMethod,
          transactionId
        })
      );

      return {
        paymentId: payResult.lastInsertRowid,
        transactionId,
        billNumber: bill.bill_number,
        amount: bill.total_amount,
        paymentMethod,
        paymentDate,
        status: 'Completed'
      };
    });

    return tx();
  }
}

module.exports = PaymentService;
