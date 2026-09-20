-- SMART UTILITY METER READING & BILLING SYSTEM SCHEMA
-- Normalized database tables with foreign keys and indexes

PRAGMA foreign_keys = ON;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'meter_reader', 'consumer')) NOT NULL,
    phone TEXT,
    status TEXT CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. CONSUMERS TABLE
CREATE TABLE IF NOT EXISTS consumers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    consumer_number TEXT UNIQUE NOT NULL,
    connection_type TEXT CHECK(connection_type IN ('Residential', 'Commercial', 'Industrial')) NOT NULL,
    tariff_category TEXT DEFAULT 'Standard',
    address TEXT NOT NULL,
    city TEXT DEFAULT 'New Delhi',
    state TEXT DEFAULT 'Delhi',
    pincode TEXT DEFAULT '110001',
    registration_date DATE DEFAULT (DATE('now')),
    status TEXT CHECK(status IN ('Active', 'Inactive', 'Suspended')) DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. METERS TABLE
CREATE TABLE IF NOT EXISTS meters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_number TEXT UNIQUE NOT NULL,
    meter_type TEXT CHECK(meter_type IN ('Digital Smart Meter', 'Electromechanical', 'Ultrasonic Smart Flow')) DEFAULT 'Digital Smart Meter',
    consumer_id INTEGER UNIQUE,
    installation_date DATE DEFAULT (DATE('now')),
    last_reading REAL DEFAULT 0.0,
    last_reading_date DATE,
    status TEXT CHECK(status IN ('Active', 'Inactive', 'Faulty')) DEFAULT 'Active',
    assigned_reader_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (consumer_id) REFERENCES consumers(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_reader_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. TARIFF SLABS TABLE
CREATE TABLE IF NOT EXISTS tariff_slabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_type TEXT CHECK(connection_type IN ('Residential', 'Commercial', 'Industrial')) NOT NULL,
    slab_name TEXT NOT NULL,
    min_units REAL NOT NULL,
    max_units REAL, -- NULL represents infinity (above min_units)
    rate_per_unit REAL NOT NULL,
    fixed_charge REAL NOT NULL DEFAULT 50.0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. LATE PAYMENT SETTINGS TABLE
CREATE TABLE IF NOT EXISTS late_payment_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_type TEXT CHECK(connection_type IN ('Residential', 'Commercial', 'Industrial')) UNIQUE NOT NULL,
    surcharge_percentage REAL NOT NULL DEFAULT 5.0,
    grace_period_days INTEGER NOT NULL DEFAULT 15,
    max_surcharge REAL DEFAULT 500.0,
    due_days_from_generation INTEGER NOT NULL DEFAULT 20,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. METER READINGS TABLE
CREATE TABLE IF NOT EXISTS meter_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id INTEGER NOT NULL,
    consumer_id INTEGER NOT NULL,
    reader_id INTEGER,
    previous_reading REAL NOT NULL,
    current_reading REAL NOT NULL,
    units_consumed REAL NOT NULL,
    reading_date DATE NOT NULL,
    billing_month TEXT NOT NULL, -- Format: YYYY-MM
    status TEXT CHECK(status IN ('Valid', 'Pending_Review', 'Rejected')) DEFAULT 'Valid',
    notes TEXT,
    photo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meter_id) REFERENCES meters(id) ON DELETE CASCADE,
    FOREIGN KEY (consumer_id) REFERENCES consumers(id) ON DELETE CASCADE,
    FOREIGN KEY (reader_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. BILLS TABLE
CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_number TEXT UNIQUE NOT NULL,
    consumer_id INTEGER NOT NULL,
    meter_id INTEGER NOT NULL,
    reading_id INTEGER NOT NULL,
    billing_month TEXT NOT NULL,
    previous_reading REAL NOT NULL,
    current_reading REAL NOT NULL,
    units_consumed REAL NOT NULL,
    energy_charge REAL NOT NULL,
    fixed_charge REAL NOT NULL,
    late_surcharge REAL DEFAULT 0.0,
    total_amount REAL NOT NULL,
    slab_breakdown TEXT NOT NULL, -- JSON string of detailed calculations
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    payment_status TEXT CHECK(payment_status IN ('Generated', 'Unpaid', 'Paid', 'Overdue', 'Cancelled')) DEFAULT 'Unpaid',
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (consumer_id) REFERENCES consumers(id) ON DELETE CASCADE,
    FOREIGN KEY (meter_id) REFERENCES meters(id) ON DELETE CASCADE,
    FOREIGN KEY (reading_id) REFERENCES meter_readings(id) ON DELETE CASCADE
);

-- 8. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    bill_id INTEGER NOT NULL,
    consumer_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT CHECK(payment_method IN ('UPI', 'NetBanking', 'Card', 'SimulatedGateway')) NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    payment_status TEXT CHECK(payment_status IN ('Completed', 'Failed', 'Pending')) DEFAULT 'Completed',
    reference_number TEXT,
    gateway_response TEXT, -- JSON details
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
    FOREIGN KEY (consumer_id) REFERENCES consumers(id) ON DELETE CASCADE
);

-- 9. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK(type IN ('bill', 'payment', 'reading', 'system', 'alert')) DEFAULT 'system',
    is_read INTEGER DEFAULT 0,
    link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details TEXT, -- JSON string
    ip_address TEXT DEFAULT '127.0.0.1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- INDEXES FOR QUERY OPTIMIZATION
CREATE INDEX IF NOT EXISTS idx_consumers_user_id ON consumers(user_id);
CREATE INDEX IF NOT EXISTS idx_meters_consumer_id ON meters(consumer_id);
CREATE INDEX IF NOT EXISTS idx_meters_reader_id ON meters(assigned_reader_id);
CREATE INDEX IF NOT EXISTS idx_readings_meter_month ON meter_readings(meter_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_readings_consumer ON meter_readings(consumer_id);
CREATE INDEX IF NOT EXISTS idx_bills_consumer ON bills(consumer_id);
CREATE INDEX IF NOT EXISTS idx_bills_month_status ON bills(billing_month, payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
