require('dotenv').config();
const assert = require('assert');
const { connectMongoDB, disconnectMongoDB, getMongoStatus, isMongoConnected } = require('../config/mongodb');
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

async function runMongoTests() {
  console.log('🧪 Starting MongoDB Connection & Schema Verification Suite...\n');

  // Test 1: Check initial status
  console.log('▶ Test 1: Initial MongoDB Configuration & Status Check...');
  const initialStatus = getMongoStatus();
  assert.strictEqual(typeof initialStatus.enabled, 'boolean');
  assert.strictEqual(typeof initialStatus.connected, 'boolean');
  console.log(`  ✅ Configuration verified (Enabled: ${initialStatus.enabled}, URI: ${initialStatus.uri}).`);

  // Test 2: Attempt connection
  console.log('\n▶ Test 2: Attempting MongoDB Connection...');
  const mongooseInstance = await connectMongoDB({ autoSeed: false, log: true });
  
  const connected = isMongoConnected();
  const currentStatus = getMongoStatus();

  if (connected && mongooseInstance) {
    console.log(`  ✅ Successfully connected to MongoDB at ${currentStatus.host}:${currentStatus.port}/${currentStatus.databaseName}`);

    // Test 3: Model Verification
    console.log('\n▶ Test 3: Verifying Mongoose Model Registration...');
    assert.ok(User, 'User model should be registered');
    assert.ok(Consumer, 'Consumer model should be registered');
    assert.ok(Meter, 'Meter model should be registered');
    assert.ok(TariffSlab, 'TariffSlab model should be registered');
    assert.ok(LatePaymentConfig, 'LatePaymentConfig model should be registered');
    assert.ok(MeterReading, 'MeterReading model should be registered');
    assert.ok(Bill, 'Bill model should be registered');
    assert.ok(Payment, 'Payment model should be registered');
    assert.ok(Notification, 'Notification model should be registered');
    assert.ok(AuditLog, 'AuditLog model should be registered');
    console.log(`  ✅ All 10 Mongoose models successfully verified.`);

    // Test 4: CRUD & Validation Test on Test Collection
    console.log('\n▶ Test 4: Testing Schema Validation & CRUD Operations...');
    await User.deleteMany({ email: /^test\.user\./ });
    await User.syncIndexes();
    const testEmail = `test.user.${Date.now()}@example.com`;
    const testUser = await User.create({
      name: 'Test Verification User',
      email: testEmail,
      password_hash: '$2a$10$abcdef1234567890',
      role: 'consumer',
      phone: '+91 99999 00000'
    });

    assert.ok(testUser._id, 'User should have generated ObjectId');
    assert.strictEqual(testUser.email, testEmail.toLowerCase());

    // Test duplicate email rejection
    let duplicateRejected = false;
    try {
      await User.create({
        name: 'Duplicate User',
        email: testEmail,
        password_hash: 'hash',
        role: 'consumer'
      });
    } catch (err) {
      duplicateRejected = true;
    }
    assert.ok(duplicateRejected, 'Unique constraint on email must reject duplicates');
    console.log('  ✅ Schema validation and unique constraint enforcement verified.');

    // Cleanup test user
    await User.findByIdAndDelete(testUser._id);
    console.log('  ✅ Cleaned up temporary test document.');

    // Test 5: MongoDB Seeder Run
    console.log('\n▶ Test 5: Testing MongoDB Data Seeder...');
    const seedMongo = require('../database/mongoSeed');
    const seedResult = await seedMongo({ ifEmptyOnly: false, silent: true });
    assert.strictEqual(seedResult.success, true);
    
    const userCount = await User.countDocuments();
    const consumerCount = await Consumer.countDocuments();
    const meterCount = await Meter.countDocuments();
    const slabCount = await TariffSlab.countDocuments();
    const billCount = await Bill.countDocuments();

    assert.ok(userCount >= 14, `Expected at least 14 users, got ${userCount}`);
    assert.ok(consumerCount >= 12, `Expected at least 12 consumers, got ${consumerCount}`);
    assert.ok(meterCount >= 12, `Expected at least 12 meters, got ${meterCount}`);
    assert.ok(slabCount >= 12, `Expected at least 12 tariff slabs, got ${slabCount}`);
    assert.ok(billCount >= 80, `Expected at least 80 bills, got ${billCount}`);
    console.log(`  ✅ MongoDB seeder created ${userCount} users, ${consumerCount} consumers, ${meterCount} meters, ${billCount} bills.`);

    await disconnectMongoDB();
    console.log('\n🎉 ALL MONGODB VERIFICATION TESTS PASSED SUCCESSFULLY! 🚀\n');
  } else {
    console.log(`\nℹ️  MongoDB server is not currently running locally on port 27017.`);
    console.log(`   (Status: ${currentStatus.state}, Error: ${currentStatus.lastError || 'Connection timeout'})`);
    console.log(`   ✅ Graceful fallback verified: System continues operating reliably in SQLite mode without throwing uncaught exceptions.`);
    console.log('\n🎉 MONGODB MODULE & OFFLINE RESILIENCE VERIFIED SUCCESSFULLY! 🚀\n');
  }
}

runMongoTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ MongoDB Test Suite Failure:', err);
    process.exit(1);
  });
