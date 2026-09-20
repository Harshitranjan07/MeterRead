const mongoose = require('mongoose');

let isConnecting = false;
let lastError = null;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_utility';
const MONGODB_ENABLED = process.env.MONGODB_ENABLED !== 'false';

// Setup connection event listeners
mongoose.connection.on('connected', () => {
  lastError = null;
  console.log(`🍃 [MongoDB] Successfully connected to: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
});

mongoose.connection.on('error', (err) => {
  lastError = err.message;
  console.warn(`⚠️  [MongoDB] Connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.log('🍃 [MongoDB] Disconnected from database.');
});

mongoose.connection.on('reconnected', () => {
  lastError = null;
  console.log('🍃 [MongoDB] Reconnected to database.');
});

/**
 * Connect to MongoDB with graceful fallback
 * @param {Object} options
 * @param {boolean} [options.autoSeed=true] - Auto-seed if database is empty
 * @param {boolean} [options.log=false] - Verbose log
 * @returns {Promise<typeof mongoose | null>}
 */
async function connectMongoDB(options = {}) {
  if (!MONGODB_ENABLED) {
    if (options.log) console.log('🍃 [MongoDB] MongoDB is disabled via MONGODB_ENABLED=false');
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (isConnecting) {
    return mongoose;
  }

  isConnecting = true;

  try {
    const uri = process.env.MONGODB_URI || MONGODB_URI;
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 4000,
      autoIndex: true
    });

    isConnecting = false;

    // Auto seed if requested and empty
    const shouldSeed = options.autoSeed !== undefined ? options.autoSeed : (process.env.MONGODB_AUTO_SEED !== 'false');
    if (shouldSeed) {
      try {
        const seedMongo = require('../database/mongoSeed');
        await seedMongo({ ifEmptyOnly: true, silent: true });
      } catch (seedErr) {
        // Non-fatal if seeding fails
        console.warn('⚠️  [MongoDB] Auto-seeding check failed:', seedErr.message);
      }
    }

    return mongoose;
  } catch (err) {
    isConnecting = false;
    lastError = err.message;
    console.warn(`⚠️  [MongoDB] Could not establish connection (${err.message}). Application will continue in SQLite mode.`);
    return null;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectMongoDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/**
 * Check if MongoDB is currently connected
 * @returns {boolean}
 */
function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Get detailed MongoDB connection status and metrics
 * @returns {Object}
 */
function getMongoStatus() {
  const readyStates = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
  const stateCode = mongoose.connection.readyState;
  const isConnected = stateCode === 1;

  let maskedUri = (process.env.MONGODB_URI || MONGODB_URI);
  if (maskedUri.includes('@')) {
    maskedUri = maskedUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  }

  return {
    enabled: MONGODB_ENABLED,
    connected: isConnected,
    state: readyStates[stateCode] || 'Unknown',
    stateCode,
    host: isConnected ? mongoose.connection.host : null,
    port: isConnected ? mongoose.connection.port : null,
    databaseName: isConnected ? mongoose.connection.name : (maskedUri.split('/').pop().split('?')[0] || 'smart_utility'),
    uri: maskedUri,
    lastError: lastError,
    modelsLoaded: Object.keys(mongoose.models).length,
    registeredModels: Object.keys(mongoose.models)
  };
}

module.exports = {
  mongoose,
  connectMongoDB,
  disconnectMongoDB,
  isMongoConnected,
  getMongoStatus
};
