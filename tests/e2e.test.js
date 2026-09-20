process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const app = require('../server');
const seedDatabase = require('../database/seed');
const { disconnectMongoDB } = require('../config/mongodb');

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const json = await response.json();
  return { status: response.status, data: json };
}

async function runTests() {
  console.log('🧪 Starting Automated Backend & Workflow Verification Suite...\n');

  // 1. Reseed DB
  seedDatabase();

  // 2. Start Test Server on free port
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`🌐 Test server listening on ${baseUrl}`);
      resolve();
    });
  });

  let adminToken, readerToken, consumerToken;
  let testConsumerId, testMeterId;

  try {
    // -------------------------------------------------------------
    // TEST 1: Health Check
    // -------------------------------------------------------------
    console.log('▶ Test 1: API Health Check...');
    const health = await request('/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.status, 'online');
    console.log('  ✅ API Health check passed.');

    // -------------------------------------------------------------
    // TEST 2: Role-based Logins
    // -------------------------------------------------------------
    console.log('\n▶ Test 2: Authentication for All Roles...');
    
    // Admin Login
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@smartutility.gov', password: 'Admin@123' }
    });
    assert.strictEqual(adminLogin.status, 200);
    assert.strictEqual(adminLogin.data.user.role, 'admin');
    adminToken = adminLogin.data.token;
    console.log('  ✅ Admin login successful.');

    // Meter Reader Login
    const readerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'reader@smartutility.gov', password: 'Reader@123' }
    });
    assert.strictEqual(readerLogin.status, 200);
    assert.strictEqual(readerLogin.data.user.role, 'meter_reader');
    readerToken = readerLogin.data.token;
    console.log('  ✅ Meter Reader login successful.');

    // Consumer Login
    const consumerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'rahul.sharma@example.com', password: 'Consumer@123' }
    });
    assert.strictEqual(consumerLogin.status, 200);
    assert.strictEqual(consumerLogin.data.user.role, 'consumer');
    assert.ok(consumerLogin.data.user.consumerNumber);
    consumerToken = consumerLogin.data.token;
    console.log('  ✅ Consumer login successful.');

    // -------------------------------------------------------------
    // TEST 3: Consumer Self-Registration
    // -------------------------------------------------------------
    console.log('\n▶ Test 3: Consumer Self-Registration...');
    const newConsumerEmail = `rohit.verma.${Date.now()}@example.com`;
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Rohit Verma',
        email: newConsumerEmail,
        password: 'Password@123',
        phone: '+91 99999 88888',
        connectionType: 'Residential',
        address: 'Tower 4, Green View Apartments',
        city: 'Noida',
        state: 'Uttar Pradesh',
        pincode: '201301'
      }
    });
    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.data.user.role, 'consumer');
    assert.ok(regRes.data.user.consumerNumber);
    testConsumerId = regRes.data.user.consumerId;
    console.log(`  ✅ Registered consumer ${regRes.data.user.consumerNumber}.`);

    // -------------------------------------------------------------
    // TEST 4: Admin Creates & Assigns Meter
    // -------------------------------------------------------------
    console.log('\n▶ Test 4: Admin Creates & Assigns Meter to Consumer...');
    const testMeterNo = `MTR-TEST-${Date.now()}`;
    const meterRes = await request('/api/meters', {
      method: 'POST',
      token: adminToken,
      body: {
        meterNumber: testMeterNo,
        meterType: 'Digital Smart Meter',
        consumerId: testConsumerId,
        initialReading: 1500.0,
        readerId: 2 // reader1
      }
    });
    assert.strictEqual(meterRes.status, 201);
    testMeterId = meterRes.data.data.id;
    console.log(`  ✅ Created and linked meter ${testMeterNo} (ID: ${testMeterId}).`);

    // -------------------------------------------------------------
    // TEST 5: Strict Reading Validation - Rejection on Lower Reading
    // -------------------------------------------------------------
    console.log('\n▶ Test 5: Rejection of Lower Current Reading (Rule 1)...');
    const lowerReadingRes = await request('/api/readings', {
      method: 'POST',
      token: readerToken,
      body: {
        meterId: testMeterId,
        currentReading: 1420.0, // Lower than 1500.0!
        billingMonth: '2026-10',
        readingDate: '2026-10-20'
      }
    });
    assert.strictEqual(lowerReadingRes.status, 400);
    assert.strictEqual(lowerReadingRes.data.message, 'Invalid reading. Current reading cannot be lower than the previous reading.');
    console.log('  ✅ Correctly rejected with exact error message: "Invalid reading. Current reading cannot be lower than the previous reading."');

    // -------------------------------------------------------------
    // TEST 6: Meter Reader Submits Valid Reading & Auto Generates Bill
    // -------------------------------------------------------------
    console.log('\n▶ Test 6: Valid Meter Reading & Automatic Bill Generation (Rule 3 & 4)...');
    const validReadingRes = await request('/api/readings', {
      method: 'POST',
      token: readerToken,
      body: {
        meterId: testMeterId,
        currentReading: 1750.0, // 1750 - 1500 = 250 units
        billingMonth: '2026-10',
        readingDate: '2026-10-20',
        notes: 'Verified clear digital LCD display.'
      }
    });
    assert.strictEqual(validReadingRes.status, 201);
    assert.strictEqual(validReadingRes.data.data.unitsConsumed, 250);
    assert.ok(validReadingRes.data.data.billNumber);
    console.log(`  ✅ Submitted reading: 250 units. Auto-generated Bill: ${validReadingRes.data.data.billNumber} (Amount: ₹${validReadingRes.data.data.billAmount}).`);

    // -------------------------------------------------------------
    // TEST 7: Duplicate Monthly Reading Rejection (Rule 2)
    // -------------------------------------------------------------
    console.log('\n▶ Test 7: Duplicate Reading for Same Billing Month Rejection...');
    const dupRes = await request('/api/readings', {
      method: 'POST',
      token: readerToken,
      body: {
        meterId: testMeterId,
        currentReading: 1800.0,
        billingMonth: '2026-10', // Already recorded!
        readingDate: '2026-10-21'
      }
    });
    assert.strictEqual(dupRes.status, 400);
    assert.strictEqual(dupRes.data.message, 'A reading for this meter already exists for this billing month.');
    console.log('  ✅ Correctly rejected with: "A reading for this meter already exists for this billing month."');

    // -------------------------------------------------------------
    // TEST 8: Progressive Tariff Slab Calculation Verification
    // -------------------------------------------------------------
    console.log('\n▶ Test 8: Progressive Tariff Calculation Accuracy...');
    // Residential for 250 units:
    // 0-100: 100 * 5 = 500
    // 101-200: 100 * 7 = 700
    // 201-250: 50 * 9 = 450
    // Energy Charge = 1650
    // Fixed Charge = 100
    // Total Amount = 1750
    assert.strictEqual(validReadingRes.data.data.billAmount, 1750);
    console.log('  ✅ Progressive slab calculation matches exactly (₹1,750 for 250 units).');

    // -------------------------------------------------------------
    // TEST 9: Consumer Views & Pays Generated Bill
    // -------------------------------------------------------------
    console.log('\n▶ Test 9: Consumer Payment Workflow...');
    const billId = validReadingRes.data.data.billId;
    const payRes = await request('/api/payments', {
      method: 'POST',
      token: regRes.data.token,
      body: {
        billId: billId,
        paymentMethod: 'UPI',
        gatewayDetails: { upiId: 'rohit@upi' }
      }
    });
    assert.strictEqual(payRes.status, 200);
    assert.ok(payRes.data.data.transactionId);
    assert.strictEqual(payRes.data.data.status, 'Completed');
    console.log(`  ✅ Payment completed. Generated Transaction ID: ${payRes.data.data.transactionId}`);

    // Verify bill status updated to 'Paid'
    const checkBill = await request(`/api/bills/${billId}`, { token: regRes.data.token });
    assert.strictEqual(checkBill.data.data.payment_status, 'Paid');
    console.log('  ✅ Bill payment status verified as "Paid".');

    // -------------------------------------------------------------
    // TEST 10: Overdue Detection & Surcharge Applicator
    // -------------------------------------------------------------
    console.log('\n▶ Test 10: Overdue Bill Detection & Surcharge Calculation...');
    const overdueScan = await request('/api/bills/check-overdue', {
      method: 'POST',
      token: adminToken
    });
    assert.strictEqual(overdueScan.status, 200);
    assert.ok(overdueScan.data.success);
    console.log(`  ✅ Overdue scanner executed successfully: ${overdueScan.data.message}`);

    // -------------------------------------------------------------
    // TEST 11: Admin Dashboard Analytics
    // -------------------------------------------------------------
    console.log('\n▶ Test 11: Admin Analytics & KPIs Calculation...');
    const adminStats = await request('/api/dashboard/stats', { token: adminToken });
    assert.strictEqual(adminStats.status, 200);
    assert.ok(adminStats.data.data.kpis.totalConsumers > 0);
    assert.ok(adminStats.data.data.monthlyTrends.length > 0);
    assert.ok(adminStats.data.data.topConsumers.length > 0);
    console.log(`  ✅ Admin Dashboard returned valid metrics (Total Consumers: ${adminStats.data.data.kpis.totalConsumers}, Total Bills: ${adminStats.data.data.kpis.totalBills}, Total Revenue: ₹${adminStats.data.data.kpis.totalRevenue}).`);

    // -------------------------------------------------------------
    // TEST 12: Role Restriction & Security
    // -------------------------------------------------------------
    console.log('\n▶ Test 12: Role Restriction & Authorization Enforcement...');
    // Consumer trying to access admin stats
    const unauthorizedRes = await request('/api/dashboard/stats', { token: consumerToken });
    assert.strictEqual(unauthorizedRes.status, 403);
    console.log('  ✅ Blocked unauthorized role access (HTTP 403 Forbidden).');

    // -------------------------------------------------------------
    // TEST 13: Non-Overlapping Tariff Slab Validation
    // -------------------------------------------------------------
    console.log('\n▶ Test 13: Non-Overlapping Tariff Slab Validation...');
    const overlapRes = await request('/api/tariffs/slabs', {
      method: 'POST',
      token: adminToken,
      body: {
        connectionType: 'Residential',
        slabName: 'Overlapping Slab Test',
        minUnits: 50,
        maxUnits: 150, // Overlaps with 0-100 and 100-200!
        ratePerUnit: 6.0
      }
    });
    assert.strictEqual(overlapRes.status, 400);
    assert.ok(overlapRes.data.message.includes('Overlap detected'));
    console.log(`  ✅ Overlapping tariff slab rejected with validation error: "${overlapRes.data.message}"`);

    console.log('\n🎉 ALL 13 BACKEND & WORKFLOW TESTS PASSED SUCCESSFULLY! 🚀\n');
  } finally {
    if (server) {
      server.close();
    }
    await disconnectMongoDB();
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test Suite Failure:', err);
    if (server) server.close();
    disconnectMongoDB().finally(() => process.exit(1));
  });
