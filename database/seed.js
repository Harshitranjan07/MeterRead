const bcrypt = require('bcryptjs');
const db = require('../config/db');
const BillingEngine = require('../services/billingEngine');

function seedDatabase() {
  console.log('🌱 Starting comprehensive database seed for Smart Utility System...');

  // 1. Wipe existing tables to ensure a clean slate
  const tables = [
    'audit_logs', 'notifications', 'payments', 'bills', 
    'meter_readings', 'late_payment_configs', 'tariff_slabs', 
    'meters', 'consumers', 'users'
  ];
  
  db.run('PRAGMA foreign_keys = OFF;');
  for (const table of tables) {
    db.run(`DELETE FROM ${table}`);
    db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
  }
  db.run('PRAGMA foreign_keys = ON;');

  const salt = bcrypt.genSaltSync(10);
  const adminHash = bcrypt.hashSync('Admin@123', salt);
  const readerHash = bcrypt.hashSync('Reader@123', salt);
  const consumerHash = bcrypt.hashSync('Consumer@123', salt);

  // 2. Insert Users
  const insertUser = db.db.prepare(
    `INSERT INTO users (name, email, password_hash, role, phone, status)
     VALUES (?, ?, ?, ?, ?, 'active')`
  );

  // Admin
  const adminId = insertUser.run(
    'Chief Utility Admin (Superintendent)',
    'admin@smartutility.gov',
    adminHash,
    'admin',
    '+91 98765 00001'
  ).lastInsertRowid;

  // Meter Readers
  const reader1Id = insertUser.run(
    'Rajesh Kumar (Field Officer - North Zone)',
    'reader@smartutility.gov',
    readerHash,
    'meter_reader',
    '+91 98765 00002'
  ).lastInsertRowid;

  const reader2Id = insertUser.run(
    'Vikram Singh (Field Officer - South Zone)',
    'vikram.reader@smartutility.gov',
    readerHash,
    'meter_reader',
    '+91 98765 00003'
  ).lastInsertRowid;

  // 3. Insert Tariff Slabs
  const insertSlab = db.db.prepare(
    `INSERT INTO tariff_slabs (connection_type, slab_name, min_units, max_units, rate_per_unit, fixed_charge)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  // Residential Slabs
  insertSlab.run('Residential', '0 - 100 Units', 0, 100, 5.00, 100.0);
  insertSlab.run('Residential', '101 - 200 Units', 100, 200, 7.00, 100.0);
  insertSlab.run('Residential', '201 - 300 Units', 200, 300, 9.00, 100.0);
  insertSlab.run('Residential', 'Above 300 Units', 300, null, 12.00, 100.0);

  // Commercial Slabs
  insertSlab.run('Commercial', '0 - 100 Units', 0, 100, 8.50, 250.0);
  insertSlab.run('Commercial', '101 - 300 Units', 100, 300, 11.00, 250.0);
  insertSlab.run('Commercial', '301 - 500 Units', 300, 500, 14.00, 250.0);
  insertSlab.run('Commercial', 'Above 500 Units', 500, null, 17.50, 250.0);

  // Industrial Slabs
  insertSlab.run('Industrial', '0 - 500 Units', 0, 500, 10.50, 600.0);
  insertSlab.run('Industrial', '501 - 1500 Units', 500, 1500, 13.00, 600.0);
  insertSlab.run('Industrial', '1501 - 3000 Units', 1500, 3000, 16.00, 600.0);
  insertSlab.run('Industrial', 'Above 3000 Units', 3000, null, 20.00, 600.0);

  // 4. Insert Late Payment Configs
  const insertLateConfig = db.db.prepare(
    `INSERT INTO late_payment_configs (connection_type, surcharge_percentage, grace_period_days, max_surcharge, due_days_from_generation)
     VALUES (?, ?, ?, ?, ?)`
  );
  insertLateConfig.run('Residential', 5.0, 15, 500.0, 20);
  insertLateConfig.run('Commercial', 7.5, 10, 1500.0, 15);
  insertLateConfig.run('Industrial', 10.0, 7, 5000.0, 10);

  // 5. Seed 12 Consumers
  const consumerSeedList = [
    {
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      phone: '+91 98111 22334',
      type: 'Residential',
      address: 'Flat 402, Royal Palms Heights, Sector 18, Dwarka',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110075',
      meterNo: 'MTR-DL-10492',
      meterType: 'Digital Smart Meter',
      readerId: reader1Id,
      baseConsumption: 240
    },
    {
      name: 'Priya Patel',
      email: 'priya.patel@example.com',
      phone: '+91 98222 33445',
      type: 'Residential',
      address: '12-B, Green Horizon Apts, Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      meterNo: 'MTR-MH-20381',
      meterType: 'Digital Smart Meter',
      readerId: reader1Id,
      baseConsumption: 185
    },
    {
      name: 'Amit Verma (TechSpace Solutions)',
      email: 'amit.verma@example.com',
      phone: '+91 98333 44556',
      type: 'Commercial',
      address: 'Suite 301, Global Infotech Park, Whitefield',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
      meterNo: 'MTR-KA-30812',
      meterType: 'Digital Smart Meter',
      readerId: reader2Id,
      baseConsumption: 460
    },
    {
      name: 'Sunita Rao',
      email: 'sunita.rao@example.com',
      phone: '+91 98444 55667',
      type: 'Residential',
      address: 'Plot 77, Jubilee Enclave, Hitec City',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500081',
      meterNo: 'MTR-TS-40911',
      meterType: 'Ultrasonic Smart Flow',
      readerId: reader1Id,
      baseConsumption: 210
    },
    {
      name: 'Apex Heavy Forgings Ltd',
      email: 'apex.industries@example.com',
      phone: '+91 98555 66778',
      type: 'Industrial',
      address: 'Plot A-14, Chakan Industrial Area, Phase II',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '410501',
      meterNo: 'MTR-IND-50190',
      meterType: 'Digital Smart Meter',
      readerId: reader2Id,
      baseConsumption: 2450
    },
    {
      name: 'Grand Metro Retail Mall',
      email: 'metro.retail@example.com',
      phone: '+91 98666 77889',
      type: 'Commercial',
      address: 'Ring Road, Near Metro Station, Saket District Centre',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110017',
      meterNo: 'MTR-DL-60281',
      meterType: 'Digital Smart Meter',
      readerId: reader1Id,
      baseConsumption: 1250
    },
    {
      name: 'Deepak Joshi',
      email: 'deepak.joshi@example.com',
      phone: '+91 98777 88990',
      type: 'Residential',
      address: 'House 45, Malviya Nagar Sector 4',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302017',
      meterNo: 'MTR-RJ-70192',
      meterType: 'Electromechanical',
      readerId: reader1Id,
      baseConsumption: 160
    },
    {
      name: 'Ananya Sen',
      email: 'ananya.sen@example.com',
      phone: '+91 98888 99001',
      type: 'Residential',
      address: 'Flat 3C, Salt Lake City Block CF',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '700064',
      meterNo: 'MTR-WB-80923',
      meterType: 'Digital Smart Meter',
      readerId: reader2Id,
      baseConsumption: 190
    },
    {
      name: 'Zen Pharma Formulations',
      email: 'zen.pharma@example.com',
      phone: '+91 98999 00112',
      type: 'Industrial',
      address: 'Survey 112, Sanand GIDC Estate',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '382110',
      meterNo: 'MTR-IND-90812',
      meterType: 'Digital Smart Meter',
      readerId: reader2Id,
      baseConsumption: 3800
    },
    {
      name: 'Kabir Malhotra (Cyber Hub Cafe & Co)',
      email: 'kabir.malhotra@example.com',
      phone: '+91 98000 11223',
      type: 'Commercial',
      address: 'DLF Cyber City, Building 10, Ground Floor',
      city: 'Gurugram',
      state: 'Haryana',
      pincode: '122002',
      meterNo: 'MTR-HR-10928',
      meterType: 'Digital Smart Meter',
      readerId: reader1Id,
      baseConsumption: 620
    },
    {
      name: 'Pooja Nair',
      email: 'pooja.nair@example.com',
      phone: '+91 98123 45678',
      type: 'Residential',
      address: 'Rose Villa, Marine Drive',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682011',
      meterNo: 'MTR-KL-11029',
      meterType: 'Ultrasonic Smart Flow',
      readerId: reader2Id,
      baseConsumption: 140
    },
    {
      name: 'Star Mega Logistics Park',
      email: 'star.logistics@example.com',
      phone: '+91 98234 56789',
      type: 'Industrial',
      address: 'NH 48 Logistics Corridor, Sriperumbudur',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '602105',
      meterNo: 'MTR-IND-12093',
      meterType: 'Digital Smart Meter',
      readerId: reader2Id,
      baseConsumption: 1950
    }
  ];

  const months = [
    { month: '2026-03', daysInMonth: 31, readDate: '2026-03-28', dueDate: '2026-04-17', status: 'Paid', factor: 0.85 },
    { month: '2026-04', daysInMonth: 30, readDate: '2026-04-28', dueDate: '2026-05-18', status: 'Paid', factor: 0.95 },
    { month: '2026-05', daysInMonth: 31, readDate: '2026-05-28', dueDate: '2026-06-17', status: 'Paid', factor: 1.25 }, // Summer peak
    { month: '2026-06', daysInMonth: 30, readDate: '2026-06-28', dueDate: '2026-07-18', status: 'Paid', factor: 1.20 }, // Summer peak
    { month: '2026-07', daysInMonth: 31, readDate: '2026-07-28', dueDate: '2026-08-17', status: 'Paid', factor: 1.05 },
    { month: '2026-08', daysInMonth: 31, readDate: '2026-08-28', dueDate: '2026-09-17', status: 'Mixed', factor: 0.98 }, // Some overdue
    { month: '2026-09', daysInMonth: 30, readDate: '2026-09-20', dueDate: '2026-10-10', status: 'Unpaid', factor: 1.02 } // Current active bill
  ];

  const insertConsumer = db.db.prepare(
    `INSERT INTO consumers (user_id, consumer_number, connection_type, tariff_category, address, city, state, pincode, registration_date, status)
     VALUES (?, ?, ?, 'Standard Tier', ?, ?, ?, ?, '2026-01-15', 'Active')`
  );

  const insertMeter = db.db.prepare(
    `INSERT INTO meters (meter_number, meter_type, consumer_id, installation_date, last_reading, last_reading_date, status, assigned_reader_id)
     VALUES (?, ?, ?, '2026-01-20', ?, ?, 'Active', ?)`
  );

  const insertReading = db.db.prepare(
    `INSERT INTO meter_readings (meter_id, consumer_id, reader_id, previous_reading, current_reading, units_consumed, reading_date, billing_month, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Valid', ?)`
  );

  const insertBill = db.db.prepare(
    `INSERT INTO bills (bill_number, consumer_id, meter_id, reading_id, billing_month, previous_reading, current_reading, units_consumed, energy_charge, fixed_charge, late_surcharge, total_amount, slab_breakdown, bill_date, due_date, payment_status, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertPayment = db.db.prepare(
    `INSERT INTO payments (transaction_id, bill_id, consumer_id, amount, payment_method, payment_date, payment_status, reference_number, gateway_response)
     VALUES (?, ?, ?, ?, ?, ?, 'Completed', ?, ?)`
  );

  const insertNotif = db.db.prepare(
    `INSERT INTO notifications (user_id, title, message, type, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertAudit = db.db.prepare(
    `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let globalBillCounter = 1000;
  let globalTxnCounter = 5000;

  for (let i = 0; i < consumerSeedList.length; i++) {
    const c = consumerSeedList[i];
    const consNum = `CONS-${1000 + i + 1}`;
    
    // 1. Create consumer user
    const uId = insertUser.run(
      c.name,
      c.email,
      consumerHash,
      'consumer',
      c.phone
    ).lastInsertRowid;

    // 2. Create consumer record
    const consId = insertConsumer.run(
      uId,
      consNum,
      c.type,
      c.address,
      c.city,
      c.state,
      c.pincode
    ).lastInsertRowid;

    // 3. Create meter record
    let cumulativeReading = Math.floor(1200 + Math.random() * 500);
    const initialInstallReading = cumulativeReading;

    const meterId = insertMeter.run(
      c.meterNo,
      c.meterType,
      consId,
      cumulativeReading,
      '2026-01-20',
      c.readerId
    ).lastInsertRowid;

    // 4. Generate 7 months of reading, bill, and payment history
    let prevReading = initialInstallReading;

    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      const m = months[mIdx];
      const variance = (Math.random() * 0.2 - 0.1); // +/- 10%
      const unitsConsumed = Math.round(c.baseConsumption * m.factor * (1 + variance));
      const currReading = prevReading + unitsConsumed;

      // Insert reading
      const rId = insertReading.run(
        meterId,
        consId,
        c.readerId,
        prevReading,
        currReading,
        unitsConsumed,
        m.readDate,
        m.month,
        `Regular scheduled meter reading by ${c.readerId === reader1Id ? 'Rajesh Kumar' : 'Vikram Singh'}`
      ).lastInsertRowid;

      // Calculate bill using BillingEngine
      const billCalc = BillingEngine.calculateBill(c.type, unitsConsumed);
      globalBillCounter++;
      const billNumber = `BILL-${m.month.replace('-', '')}-${globalBillCounter}`;

      let paymentStatus = m.status;
      let paidAt = null;
      let lateSurcharge = 0.0;
      let finalBillTotal = billCalc.totalAmount;

      if (m.month === '2026-08') {
        // In August, make half of them Paid and half Overdue (past due date)
        if (i % 2 === 0) {
          paymentStatus = 'Paid';
          paidAt = `${m.month}-12 14:32:00`;
        } else {
          paymentStatus = 'Overdue';
          const lateRate = c.type === 'Industrial' ? 0.10 : (c.type === 'Commercial' ? 0.075 : 0.05);
          lateSurcharge = Math.round(billCalc.totalAmount * lateRate * 100) / 100;
          finalBillTotal = Math.round((billCalc.totalAmount + lateSurcharge) * 100) / 100;
        }
      } else if (m.status === 'Paid') {
        paidAt = `${m.month}-10 11:20:00`;
      } else if (m.status === 'Unpaid') {
        paymentStatus = 'Unpaid';
      }

      // Insert Bill
      const billId = insertBill.run(
        billNumber,
        consId,
        meterId,
        rId,
        m.month,
        prevReading,
        currReading,
        unitsConsumed,
        billCalc.energyCharge,
        billCalc.fixedCharge,
        lateSurcharge,
        finalBillTotal,
        JSON.stringify(billCalc.breakdown),
        m.readDate,
        m.dueDate,
        paymentStatus,
        paidAt
      ).lastInsertRowid;

      // If Paid, insert Payment record
      if (paymentStatus === 'Paid') {
        globalTxnCounter++;
        const payMethods = ['UPI', 'NetBanking', 'Card', 'SimulatedGateway'];
        const method = payMethods[(i + mIdx) % payMethods.length];
        const txnId = `TXN-${m.month.replace('-', '')}-${globalTxnCounter}`;

        insertPayment.run(
          txnId,
          billId,
          consId,
          finalBillTotal,
          method,
          paidAt,
          `REF-${Math.floor(10000000 + Math.random() * 90000000)}`,
          JSON.stringify({
            gateway: 'SmartUtility Instant Settlement Gateway',
            authCode: `AUTH-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
            status: 'CAPTURED'
          })
        );
      }

      prevReading = currReading;
    }

    // Update meter's final latest reading
    db.run(
      `UPDATE meters SET last_reading = ?, last_reading_date = '2026-09-20' WHERE id = ?`,
      [prevReading, meterId]
    );

    // Add initial notifications for consumer
    insertNotif.run(
      uId,
      'Welcome to Smart Utility Portal',
      `Your smart meter ${c.meterNo} has been activated. Track your consumption, bills, and payments in real-time.`,
      'system',
      '/consumer/dashboard',
      '2026-01-20 10:00:00'
    );

    insertNotif.run(
      uId,
      'September 2026 Bill Ready',
      `Your current utility bill for September 2026 is ready for payment. Due date is 10 October 2026.`,
      'bill',
      '/consumer/bills',
      '2026-09-20 18:30:00'
    );
  }

  // Insert Admin Notifications & Audit Logs
  insertNotif.run(
    adminId,
    'System Setup Complete',
    'Database initialized with active tariff slabs, consumers, and field meter readers.',
    'system',
    '/admin/dashboard',
    '2026-09-20 09:00:00'
  );

  insertNotif.run(
    adminId,
    'Monthly Reading Cycle 95% Complete',
    'Field readers have submitted 12 of 12 scheduled meter readings for cycle September 2026.',
    'alert',
    '/admin/bills',
    '2026-09-20 19:00:00'
  );

  insertAudit.run(
    adminId,
    'Chief Utility Admin',
    'admin',
    'INITIALIZE_SYSTEM',
    'SYSTEM',
    '1',
    JSON.stringify({ note: 'Platform seeded with production utility configurations.' }),
    '2026-09-20 09:00:00'
  );

  insertAudit.run(
    reader1Id,
    'Rajesh Kumar',
    'meter_reader',
    'SUBMIT_BATCH_READINGS',
    'METER_READINGS',
    'NORTH_ZONE',
    JSON.stringify({ totalMeters: 6, billingMonth: '2026-09' }),
    '2026-09-20 18:00:00'
  );

  console.log('✅ Database seeded successfully!');
  console.log('--------------------------------------------------');
  console.log('🔑 TEST CREDENTIALS:');
  console.log('👑 Admin:        admin@smartutility.gov      / Admin@123');
  console.log('📱 Meter Reader: reader@smartutility.gov     / Reader@123');
  console.log('👤 Consumer:     rahul.sharma@example.com    / Consumer@123');
  console.log('   (Additional consumers: priya.patel@example.com, amit.verma@example.com, etc.)');
  console.log('--------------------------------------------------');
}

// Run if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
