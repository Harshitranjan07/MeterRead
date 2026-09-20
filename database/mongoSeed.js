const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectMongoDB } = require('../config/mongodb');
const {
  User,
  Consumer,
  Meter,
  TariffSlab,
  LatePaymentConfig,
  MeterReading,
  Bill,
  Payment,
  Notification,
  AuditLog
} = require('../models');
const BillingEngine = require('../services/billingEngine');

/**
 * Seed MongoDB with comprehensive test data
 * @param {Object} options
 * @param {boolean} [options.ifEmptyOnly=false] - Only seed if User collection is empty
 * @param {boolean} [options.silent=false] - Suppress console output
 * @returns {Promise<Object>}
 */
async function seedMongo(options = {}) {
  const { ifEmptyOnly = false, silent = false } = options;

  if (mongoose.connection.readyState !== 1) {
    await connectMongoDB({ autoSeed: false });
  }

  if (mongoose.connection.readyState !== 1) {
    if (!silent) console.warn('⚠️ [MongoSeed] MongoDB not connected. Skipping MongoDB seeding.');
    return { success: false, message: 'MongoDB not connected' };
  }

  if (ifEmptyOnly) {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return { success: true, message: 'MongoDB already seeded' };
    }
  }

  if (!silent) console.log('🌱 Starting comprehensive MongoDB seeding for Smart Utility System...');

  // 1. Clear existing collections
  await Promise.all([
    User.deleteMany({}),
    Consumer.deleteMany({}),
    Meter.deleteMany({}),
    TariffSlab.deleteMany({}),
    LatePaymentConfig.deleteMany({}),
    MeterReading.deleteMany({}),
    Bill.deleteMany({}),
    Payment.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({})
  ]);

  const salt = bcrypt.genSaltSync(10);
  const adminHash = bcrypt.hashSync('Admin@123', salt);
  const readerHash = bcrypt.hashSync('Reader@123', salt);
  const consumerHash = bcrypt.hashSync('Consumer@123', salt);

  // 2. Insert Users
  const admin = await User.create({
    name: 'Chief Utility Admin (Superintendent)',
    email: 'admin@smartutility.gov',
    password_hash: adminHash,
    role: 'admin',
    phone: '+91 98765 00001',
    status: 'active'
  });

  const reader1 = await User.create({
    name: 'Rajesh Kumar (Field Officer - North Zone)',
    email: 'reader@smartutility.gov',
    password_hash: readerHash,
    role: 'meter_reader',
    phone: '+91 98765 00002',
    status: 'active'
  });

  const reader2 = await User.create({
    name: 'Vikram Singh (Field Officer - South Zone)',
    email: 'vikram.reader@smartutility.gov',
    password_hash: readerHash,
    role: 'meter_reader',
    phone: '+91 98765 00003',
    status: 'active'
  });

  // 3. Insert Tariff Slabs
  const tariffSlabsData = [
    // Residential
    { connection_type: 'Residential', slab_name: '0 - 100 Units', min_units: 0, max_units: 100, rate_per_unit: 5.00, fixed_charge: 100.0 },
    { connection_type: 'Residential', slab_name: '101 - 200 Units', min_units: 100, max_units: 200, rate_per_unit: 7.00, fixed_charge: 100.0 },
    { connection_type: 'Residential', slab_name: '201 - 300 Units', min_units: 200, max_units: 300, rate_per_unit: 9.00, fixed_charge: 100.0 },
    { connection_type: 'Residential', slab_name: 'Above 300 Units', min_units: 300, max_units: null, rate_per_unit: 12.00, fixed_charge: 100.0 },

    // Commercial
    { connection_type: 'Commercial', slab_name: '0 - 100 Units', min_units: 0, max_units: 100, rate_per_unit: 8.50, fixed_charge: 250.0 },
    { connection_type: 'Commercial', slab_name: '101 - 300 Units', min_units: 100, max_units: 300, rate_per_unit: 11.00, fixed_charge: 250.0 },
    { connection_type: 'Commercial', slab_name: '301 - 500 Units', min_units: 300, max_units: 500, rate_per_unit: 14.00, fixed_charge: 250.0 },
    { connection_type: 'Commercial', slab_name: 'Above 500 Units', min_units: 500, max_units: null, rate_per_unit: 17.50, fixed_charge: 250.0 },

    // Industrial
    { connection_type: 'Industrial', slab_name: '0 - 500 Units', min_units: 0, max_units: 500, rate_per_unit: 10.50, fixed_charge: 600.0 },
    { connection_type: 'Industrial', slab_name: '501 - 1500 Units', min_units: 500, max_units: 1500, rate_per_unit: 13.00, fixed_charge: 600.0 },
    { connection_type: 'Industrial', slab_name: '1501 - 3000 Units', min_units: 1500, max_units: 3000, rate_per_unit: 16.00, fixed_charge: 600.0 },
    { connection_type: 'Industrial', slab_name: 'Above 3000 Units', min_units: 3000, max_units: null, rate_per_unit: 20.00, fixed_charge: 600.0 }
  ];

  await TariffSlab.insertMany(tariffSlabsData);

  // 4. Late Payment Configs
  await LatePaymentConfig.insertMany([
    { connection_type: 'Residential', surcharge_percentage: 5.0, grace_period_days: 15, max_surcharge: 500.0, due_days_from_generation: 20 },
    { connection_type: 'Commercial', surcharge_percentage: 7.5, grace_period_days: 10, max_surcharge: 1500.0, due_days_from_generation: 15 },
    { connection_type: 'Industrial', surcharge_percentage: 10.0, grace_period_days: 7, max_surcharge: 5000.0, due_days_from_generation: 10 }
  ]);

  // 5. Seed Consumers, Meters, Readings, Bills, Payments
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
      reader: reader1,
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
      reader: reader1,
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
      reader: reader2,
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
      reader: reader1,
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
      reader: reader2,
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
      reader: reader1,
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
      reader: reader1,
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
      reader: reader2,
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
      reader: reader2,
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
      reader: reader1,
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
      reader: reader2,
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
      reader: reader2,
      baseConsumption: 1950
    }
  ];

  const months = [
    { month: '2026-03', daysInMonth: 31, readDate: new Date('2026-03-28'), dueDate: new Date('2026-04-17'), status: 'Paid', factor: 0.85 },
    { month: '2026-04', daysInMonth: 30, readDate: new Date('2026-04-28'), dueDate: new Date('2026-05-18'), status: 'Paid', factor: 0.95 },
    { month: '2026-05', daysInMonth: 31, readDate: new Date('2026-05-28'), dueDate: new Date('2026-06-17'), status: 'Paid', factor: 1.25 },
    { month: '2026-06', daysInMonth: 30, readDate: new Date('2026-06-28'), dueDate: new Date('2026-07-18'), status: 'Paid', factor: 1.20 },
    { month: '2026-07', daysInMonth: 31, readDate: new Date('2026-07-28'), dueDate: new Date('2026-08-17'), status: 'Paid', factor: 1.05 },
    { month: '2026-08', daysInMonth: 31, readDate: new Date('2026-08-28'), dueDate: new Date('2026-09-17'), status: 'Mixed', factor: 0.98 },
    { month: '2026-09', daysInMonth: 30, readDate: new Date('2026-09-20'), dueDate: new Date('2026-10-10'), status: 'Unpaid', factor: 1.02 }
  ];

  let globalBillCounter = 1000;
  let globalTxnCounter = 5000;

  for (let i = 0; i < consumerSeedList.length; i++) {
    const c = consumerSeedList[i];
    const consNum = `CONS-${1000 + i + 1}`;

    // 1. Create User
    const userDoc = await User.create({
      name: c.name,
      email: c.email,
      password_hash: consumerHash,
      role: 'consumer',
      phone: c.phone,
      status: 'active'
    });

    // 2. Create Consumer
    const consumerDoc = await Consumer.create({
      user_id: userDoc._id,
      consumer_number: consNum,
      connection_type: c.type,
      tariff_category: 'Standard Tier',
      address: c.address,
      city: c.city,
      state: c.state,
      pincode: c.pincode,
      registration_date: new Date('2026-01-15'),
      status: 'Active'
    });

    // 3. Create Meter
    let cumulativeReading = Math.floor(1200 + Math.random() * 500);
    const initialInstallReading = cumulativeReading;

    const meterDoc = await Meter.create({
      meter_number: c.meterNo,
      meter_type: c.meterType,
      consumer_id: consumerDoc._id,
      installation_date: new Date('2026-01-20'),
      last_reading: cumulativeReading,
      last_reading_date: new Date('2026-01-20'),
      status: 'Active',
      assigned_reader_id: c.reader._id
    });

    // 4. Generate 7 months history
    let prevReading = initialInstallReading;

    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      const m = months[mIdx];
      const variance = (Math.random() * 0.2 - 0.1);
      const unitsConsumed = Math.round(c.baseConsumption * m.factor * (1 + variance));
      const currReading = prevReading + unitsConsumed;

      // MeterReading
      const readingDoc = await MeterReading.create({
        meter_id: meterDoc._id,
        consumer_id: consumerDoc._id,
        reader_id: c.reader._id,
        previous_reading: prevReading,
        current_reading: currReading,
        units_consumed: unitsConsumed,
        reading_date: m.readDate,
        billing_month: m.month,
        status: 'Valid',
        notes: `Regular scheduled meter reading by ${c.reader.name}`
      });

      // Calculate bill
      const billCalc = BillingEngine.calculateBill(c.type, unitsConsumed);
      globalBillCounter++;
      const billNumber = `BILL-${m.month.replace('-', '')}-${globalBillCounter}`;

      let paymentStatus = m.status;
      let paidAt = null;
      let lateSurcharge = 0.0;
      let finalBillTotal = billCalc.totalAmount;

      if (m.month === '2026-08') {
        if (i % 2 === 0) {
          paymentStatus = 'Paid';
          paidAt = new Date(`${m.month}-12T14:32:00Z`);
        } else {
          paymentStatus = 'Overdue';
          const lateRate = c.type === 'Industrial' ? 0.10 : (c.type === 'Commercial' ? 0.075 : 0.05);
          lateSurcharge = Math.round(billCalc.totalAmount * lateRate * 100) / 100;
          finalBillTotal = Math.round((billCalc.totalAmount + lateSurcharge) * 100) / 100;
        }
      } else if (m.status === 'Paid') {
        paidAt = new Date(`${m.month}-10T11:20:00Z`);
      } else if (m.status === 'Unpaid') {
        paymentStatus = 'Unpaid';
      }

      // Create Bill
      const billDoc = await Bill.create({
        bill_number: billNumber,
        consumer_id: consumerDoc._id,
        meter_id: meterDoc._id,
        reading_id: readingDoc._id,
        billing_month: m.month,
        previous_reading: prevReading,
        current_reading: currReading,
        units_consumed: unitsConsumed,
        energy_charge: billCalc.energyCharge,
        fixed_charge: billCalc.fixedCharge,
        late_surcharge: lateSurcharge,
        total_amount: finalBillTotal,
        slab_breakdown: billCalc.breakdown,
        bill_date: m.readDate,
        due_date: m.dueDate,
        payment_status: paymentStatus,
        paid_at: paidAt
      });

      // If Paid, create Payment
      if (paymentStatus === 'Paid') {
        globalTxnCounter++;
        const payMethods = ['UPI', 'NetBanking', 'Card', 'SimulatedGateway'];
        const method = payMethods[(i + mIdx) % payMethods.length];
        const txnId = `TXN-${m.month.replace('-', '')}-${globalTxnCounter}`;

        await Payment.create({
          transaction_id: txnId,
          bill_id: billDoc._id,
          consumer_id: consumerDoc._id,
          amount: finalBillTotal,
          payment_method: method,
          payment_date: paidAt || new Date(),
          payment_status: 'Completed',
          reference_number: `REF-${Math.floor(10000000 + Math.random() * 90000000)}`,
          gateway_response: {
            gateway: 'SmartUtility Instant Settlement Gateway',
            authCode: `AUTH-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
            status: 'CAPTURED'
          }
        });
      }

      prevReading = currReading;
    }

    // Update meter's final latest reading
    await Meter.findByIdAndUpdate(meterDoc._id, {
      last_reading: prevReading,
      last_reading_date: new Date('2026-09-20')
    });

    // Add notifications
    await Notification.create([
      {
        user_id: userDoc._id,
        title: 'Welcome to Smart Utility Portal',
        message: `Your smart meter ${c.meterNo} has been activated. Track your consumption, bills, and payments in real-time.`,
        type: 'system',
        link: '/consumer/dashboard',
        created_at: new Date('2026-01-20T10:00:00Z')
      },
      {
        user_id: userDoc._id,
        title: 'September 2026 Bill Ready',
        message: 'Your current utility bill for September 2026 is ready for payment. Due date is 10 October 2026.',
        type: 'bill',
        link: '/consumer/bills',
        created_at: new Date('2026-09-20T18:30:00Z')
      }
    ]);
  }

  // Admin notifications & audit logs
  await Notification.create([
    {
      user_id: admin._id,
      title: 'System Setup Complete',
      message: 'Database initialized with active tariff slabs, consumers, and field meter readers.',
      type: 'system',
      link: '/admin/dashboard',
      created_at: new Date('2026-09-20T09:00:00Z')
    },
    {
      user_id: admin._id,
      title: 'Monthly Reading Cycle 95% Complete',
      message: 'Field readers have submitted 12 of 12 scheduled meter readings for cycle September 2026.',
      type: 'alert',
      link: '/admin/bills',
      created_at: new Date('2026-09-20T19:00:00Z')
    }
  ]);

  await AuditLog.create([
    {
      user_id: admin._id,
      user_name: 'Chief Utility Admin',
      user_role: 'admin',
      action: 'INITIALIZE_SYSTEM',
      entity: 'SYSTEM',
      entity_id: '1',
      details: { note: 'MongoDB database initialized with production utility configurations.' },
      created_at: new Date('2026-09-20T09:00:00Z')
    },
    {
      user_id: reader1._id,
      user_name: 'Rajesh Kumar',
      user_role: 'meter_reader',
      action: 'SUBMIT_BATCH_READINGS',
      entity: 'METER_READINGS',
      entity_id: 'NORTH_ZONE',
      details: { totalMeters: 6, billingMonth: '2026-09' },
      created_at: new Date('2026-09-20T18:00:00Z')
    }
  ]);

  if (!silent) {
    console.log('✅ MongoDB database seeded successfully!');
    console.log('--------------------------------------------------');
    console.log(`📊 Users:         ${await User.countDocuments()}`);
    console.log(`👤 Consumers:     ${await Consumer.countDocuments()}`);
    console.log(`⚡ Meters:        ${await Meter.countDocuments()}`);
    console.log(`📜 Tariff Slabs:  ${await TariffSlab.countDocuments()}`);
    console.log(`🧾 Bills:         ${await Bill.countDocuments()}`);
    console.log(`💳 Payments:      ${await Payment.countDocuments()}`);
    console.log('--------------------------------------------------');
  }

  return { success: true, message: 'MongoDB seeded successfully' };
}

if (require.main === module) {
  seedMongo()
    .then(() => {
      console.log('Seeding script finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ MongoDB seed error:', err);
      process.exit(1);
    });
}

module.exports = seedMongo;
