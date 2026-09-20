require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Database initialization
const db = require('./config/db');
const { connectMongoDB, getMongoStatus, isMongoConnected } = require('./config/mongodb');

// Connect to MongoDB asynchronously
connectMongoDB({ autoSeed: true }).catch(err => {
  console.warn('MongoDB initial connection attempt:', err.message);
});

// Route imports
const authRoutes = require('./routes/authRoutes');
const consumerRoutes = require('./routes/consumerRoutes');
const meterRoutes = require('./routes/meterRoutes');
const readingRoutes = require('./routes/readingRoutes');
const billRoutes = require('./routes/billRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const tariffRoutes = require('./routes/tariffRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const auditRoutes = require('./routes/auditRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5050;

// Enable trust proxy for serverless/reverse-proxy environments (Netlify, Vercel)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const isServerless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

// URL prefix normalization for serverless environments (Netlify / Vercel only)
if (isServerless) {
  app.use((req, res, next) => {
    if (!req.url.startsWith('/api') && !req.url.startsWith('/assets') && !req.url.includes('.')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    next();
  });
}

// Basic Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false, xForwardedForHeader: false },
  message: { success: false, message: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', apiLimiter);

// Root & Health Endpoints
app.get(['/', '/api'], (req, res) => {
  res.json({
    status: 'online',
    system: 'Smart Utility Meter Reading & Billing Platform API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      dbStatus: '/api/system/db-status',
      auth: '/api/auth/login',
      consumers: '/api/consumers',
      meters: '/api/meters',
      readings: '/api/readings',
      bills: '/api/bills',
      payments: '/api/payments',
      tariffs: '/api/tariffs/slabs',
      dashboard: '/api/dashboard/stats'
    }
  });
});

// Health Check & System Status
app.get('/api/health', (req, res) => {
  const mongoStatus = getMongoStatus();
  res.json({
    status: 'online',
    system: 'Smart Utility Meter Reading & Billing Platform',
    version: '1.0.0 (SIH Production Grade)',
    timestamp: new Date().toISOString(),
    databases: {
      sqlite: {
        status: 'connected',
        engine: 'better-sqlite3',
        path: process.env.DB_PATH || './data/smart_utility.db'
      },
      mongodb: {
        status: mongoStatus.connected ? 'connected' : (mongoStatus.enabled ? 'disconnected' : 'disabled'),
        state: mongoStatus.state,
        host: mongoStatus.host,
        port: mongoStatus.port,
        database: mongoStatus.databaseName,
        modelsLoaded: mongoStatus.modelsLoaded
      }
    }
  });
});

// Dedicated Database Status & Diagnostics API
app.get('/api/system/db-status', (req, res) => {
  let sqliteStats = null;
  try {
    const userCount = db.get('SELECT COUNT(*) as c FROM users')?.c || 0;
    const consumerCount = db.get('SELECT COUNT(*) as c FROM consumers')?.c || 0;
    const meterCount = db.get('SELECT COUNT(*) as c FROM meters')?.c || 0;
    const billCount = db.get('SELECT COUNT(*) as c FROM bills')?.c || 0;
    sqliteStats = {
      status: 'connected',
      userCount,
      consumerCount,
      meterCount,
      billCount
    };
  } catch (err) {
    sqliteStats = { status: 'error', error: err.message };
  }

  const mongoStatus = getMongoStatus();

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    sqlite: sqliteStats,
    mongodb: mongoStatus
  });
});

// API Routes Mount
app.use('/api/auth', authRoutes);
app.use('/api/consumers', consumerRoutes);
app.use('/api/meters', meterRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tariffs', tariffRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/users', userRoutes);

// Central Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled API Error:', err.stack || err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Serve client in production build if present
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Fallback for SPA routing
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(clientDist, 'index.html');
    res.sendFile(indexPath, err => {
      if (err) {
        res.status(200).send('Smart Utility System API is running. Frontend dev server is active at port 5173.');
      }
    });
  } else {
    res.status(404).json({ success: false, message: 'API route not found' });
  }
});

// Start Server if executed directly
if (require.main === module && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`⚡ SMART UTILITY SERVER IS RUNNING ON PORT ${PORT}`);
    console.log(`🔗 API Base: http://localhost:${PORT}/api`);
    console.log(`🩺 Health:   http://localhost:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
