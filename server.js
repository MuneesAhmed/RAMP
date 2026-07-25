require('dotenv').config({
    path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
});

const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const EmailService = require('./services/emailService');
const EmailScheduler = require('./services/emailScheduler');
const AIAssistantService = require('./services/aiAssistantService');

const app = express();
const port = Number(process.env.PORT) || 3000;
const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, 'db', 'ramp.db'));
const uploadsDir = path.join(__dirname, 'uploads');

let db = null;
let emailScheduler = null;
let setupPromise = null;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use('/api', (req, res, next) => {
    res.type('json');
    next();
});
app.use(session({
    secret: process.env.SESSION_SECRET || 'ramp-local-development-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'ramp.sid',
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/'
    }
}));

function openDatabase() {
    return new Promise((resolve, reject) => {
        const connection = new sqlite3.Database(
            dbPath,
            sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
            error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(connection);
            }
        );
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(error) {
            if (error) {
                reject(error);
                return;
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(rows);
        });
    });
}

async function addMissingColumns(tableName, columnDefinitions) {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    const existing = new Set(columns.map(column => column.name));

    for (const [columnName, definition] of columnDefinitions) {
        if (!existing.has(columnName)) {
            await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
        }
    }
}

async function createSchema() {
    await run('PRAGMA foreign_keys = ON');
    await run('PRAGMA journal_mode = WAL');

    await run(`CREATE TABLE IF NOT EXISTS divisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS cities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        division_id INTEGER NOT NULL,
        FOREIGN KEY (division_id) REFERENCES divisions(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS colonies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        city_id INTEGER NOT NULL,
        FOREIGN KEY (city_id) REFERENCES cities(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        full_name TEXT,
        employee_id TEXT,
        email TEXT,
        phone TEXT,
        role TEXT NOT NULL,
        division_id INTEGER,
        city_id INTEGER,
        colony_id INTEGER,
        department_id INTEGER,
        skills TEXT,
        notes TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (division_id) REFERENCES divisions(id),
        FOREIGN KEY (city_id) REFERENCES cities(id),
        FOREIGN KEY (colony_id) REFERENCES colonies(id),
        FOREIGN KEY (department_id) REFERENCES departments(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS maintenance_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL UNIQUE,
        division_id INTEGER NOT NULL,
        city_id INTEGER NOT NULL,
        colony_id INTEGER NOT NULL,
        wing TEXT,
        quarter_number TEXT,
        department_id INTEGER NOT NULL,
        location TEXT,
        description TEXT,
        image_path TEXT,
        name TEXT NOT NULL,
        designation TEXT NOT NULL,
        mobile TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        email TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (division_id) REFERENCES divisions(id),
        FOREIGN KEY (city_id) REFERENCES cities(id),
        FOREIGN KEY (colony_id) REFERENCES colonies(id),
        FOREIGN KEY (department_id) REFERENCES departments(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        supervisor_id INTEGER,
        assigned_worker TEXT,
        status TEXT DEFAULT 'Assigned',
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES maintenance_requests(id),
        FOREIGN KEY (supervisor_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES maintenance_requests(id),
        FOREIGN KEY (updated_by) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS contact_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        mobile TEXT,
        subject TEXT,
        message TEXT NOT NULL,
        request_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migrate databases created by older RAMP versions.
    await addMissingColumns('users', [
        ['full_name', 'TEXT'],
        ['employee_id', 'TEXT'],
        ['email', 'TEXT'],
        ['phone', 'TEXT'],
        ['colony_id', 'INTEGER REFERENCES colonies(id)'],
        ['skills', 'TEXT'],
        ['notes', 'TEXT'],
        ['created_at', 'DATETIME'],
        ['updated_at', 'DATETIME']
    ]);
    await addMissingColumns('maintenance_requests', [
        ['priority', "TEXT DEFAULT 'medium'"]
    ]);
    await addMissingColumns('contact_messages', [
        ['mobile', 'TEXT'],
        ['request_id', 'TEXT']
    ]);

    await run(`UPDATE users
        SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
            updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)`);

    await run('CREATE UNIQUE INDEX IF NOT EXISTS unique_city_division ON cities (name, division_id)');
    await run('CREATE UNIQUE INDEX IF NOT EXISTS unique_colony_city ON colonies (name, city_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_requests_status ON maintenance_requests (status)');
    await run('CREATE INDEX IF NOT EXISTS idx_requests_location ON maintenance_requests (division_id, city_id, colony_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_assignments_supervisor ON assignments (supervisor_id, status)');
}

async function seedReferenceData() {
    const departments = [
        'Plumbing', 'Electrical', 'Civil', 'Carpentry', 'Cleaning',
        'Air Conditioning', 'Painting', 'Water Supply', 'Sanitation',
        'Pest Control', 'Others'
    ];
    for (const department of departments) {
        await run('INSERT OR IGNORE INTO departments (name) VALUES (?)', [department]);
    }

    const divisions = [
        'Jaipur Division', 'Ajmer Division', 'Bikaner Division', 'Jodhpur Division'
    ];
    for (const division of divisions) {
        await run('INSERT OR IGNORE INTO divisions (name) VALUES (?)', [division]);
    }

    const cities = [
        ['Jaipur', 'Jaipur Division'], ['Alwar', 'Jaipur Division'],
        ['Sikar', 'Jaipur Division'], ['Bharatpur', 'Jaipur Division'],
        ['Sawai Madhopur', 'Jaipur Division'], ['Ajmer', 'Ajmer Division'],
        ['Beawar', 'Ajmer Division'], ['Marwar Junction', 'Ajmer Division'],
        ['Phulera', 'Ajmer Division'], ['Kishangarh', 'Ajmer Division'],
        ['Bikaner', 'Bikaner Division'], ['Hanumangarh', 'Bikaner Division'],
        ['Suratgarh', 'Bikaner Division'], ['Lalgarh', 'Bikaner Division'],
        ['Padampur', 'Bikaner Division'], ['Jodhpur', 'Jodhpur Division'],
        ['Pali', 'Jodhpur Division'], ['Barmer', 'Jodhpur Division'],
        ['Jaisalmer', 'Jodhpur Division'], ['Pokaran', 'Jodhpur Division']
    ];
    const colonyNames = ['Officers Colony', 'Railway Colony - A', 'Staff Quarters'];

    for (const [cityName, divisionName] of cities) {
        const division = await get('SELECT id FROM divisions WHERE name = ?', [divisionName]);
        await run(
            'INSERT OR IGNORE INTO cities (name, division_id) VALUES (?, ?)',
            [cityName, division.id]
        );
        const city = await get(
            'SELECT id FROM cities WHERE name = ? AND division_id = ?',
            [cityName, division.id]
        );

        for (const colonyName of colonyNames) {
            await run(
                'INSERT OR IGNORE INTO colonies (name, city_id) VALUES (?, ?)',
                [colonyName, city.id]
            );
        }
    }
}

async function seedInitialAdmin() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const existingAdmin = await get('SELECT id FROM users WHERE username = ?', [username]);
    if (existingAdmin) return;

    const password = process.env.ADMIN_PASSWORD || 'password123';
    await run(
        `INSERT INTO users (username, password, role, active)
         VALUES (?, ?, 'admin_l1', 1)`,
        [username, bcrypt.hashSync(password, 10)]
    );
    console.log(`Default admin user "${username}" created`);
}

async function initializeDatabase() {
    if (db) return db;

    db = await openDatabase();
    console.log('Connected to database at:', dbPath);
    await createSchema();
    await seedReferenceData();
    await seedInitialAdmin();
    return db;
}

function authenticate(req, res, next) {
    const user = req.session?.user;
    if (!user?.id || !user?.username || !user?.role) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
}

function authorizeAdmin(req, res, next) {
    if (!req.session.user.role.startsWith('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    return next();
}

function authorizeSupervisor(req, res, next) {
    const role = req.session.user.role;
    if (role !== 'supervisor' && !role.startsWith('admin')) {
        return res.status(403).json({ error: 'Supervisor access required' });
    }
    return next();
}

async function setupOptionalServices() {
    let emailService = null;
    let aiAssistant = null;

    if (process.env.EMAIL_ENABLED === 'true') {
        try {
            emailService = new EmailService();
            emailScheduler = new EmailScheduler(emailService, db);
            emailScheduler.start();
            console.log('Email system initialized');
        } catch (error) {
            console.error('Email system disabled after initialization error:', error.message);
        }
    } else {
        console.log('Email system disabled in configuration');
    }

    if (process.env.AI_ASSISTANT_ENABLED === 'true') {
        try {
            aiAssistant = new AIAssistantService();
            await aiAssistant.initialize();
            console.log('AI Assistant initialized');
        } catch (error) {
            console.error('AI Assistant disabled after initialization error:', error.message);
        }
    } else {
        console.log('AI Assistant disabled in configuration');
    }

    return { emailService, aiAssistant };
}

function configureRoutes(emailService, aiAssistant) {
    const authRoutes = require('./routes/auth')(db);
    const publicRoutes = require('./routes/public')(db, emailService);
    const adminRoutes = require('./routes/admin')(db, emailService);
    const supervisorRoutes = require('./routes/supervisor')(db, emailService);
    const aiAssistantRoutes = require('./routes/aiAssistant')(db, aiAssistant);

    app.get('/', (req, res) => res.redirect('/index.html'));
    app.get('/admin', (req, res) => res.redirect('/admin/dashboard.html'));

    app.use('/auth', authRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api', publicRoutes);
    app.use('/api/admin', authenticate, authorizeAdmin, adminRoutes);
    app.use('/api/supervisor', authenticate, authorizeSupervisor, supervisorRoutes);
    app.use('/api/ai', authenticate, aiAssistantRoutes);

    app.use((req, res) => {
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }
        return res.status(404).send('Page not found');
    });

    app.use((error, req, res, next) => {
        console.error('Request failed:', error.message);
        if (res.headersSent) return next(error);
        if (error instanceof SyntaxError && error.status === 400) {
            return res.status(400).json({ error: 'Invalid JSON' });
        }
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Image must be 5 MB or smaller' });
        }
        if (error.message?.includes('Only .png, .jpg and .jpeg')) {
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
    });
}

async function setupApp() {
    if (!setupPromise) {
        setupPromise = (async () => {
            await initializeDatabase();
            const services = await setupOptionalServices();
            configureRoutes(services.emailService, services.aiAssistant);
            return app;
        })();
    }
    return setupPromise;
}

function closeDatabase() {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve();
            return;
        }
        db.close(error => {
            if (error) {
                reject(error);
                return;
            }
            db = null;
            resolve();
        });
    });
}

if (require.main === module) {
    setupApp()
        .then(() => {
            const server = app.listen(port, () => {
                console.log(`Server running on port ${port}`);
            });

            server.on('error', error => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`Port ${port} is already in use`);
                } else {
                    console.error('Server error:', error);
                }
                process.exitCode = 1;
            });

            const shutdown = signal => {
                console.log(`${signal} received; shutting down`);
                server.close(async () => {
                    try {
                        emailScheduler?.stop();
                        await closeDatabase();
                        process.exit(0);
                    } catch (error) {
                        console.error('Shutdown failed:', error);
                        process.exit(1);
                    }
                });
            };
            process.once('SIGTERM', () => shutdown('SIGTERM'));
            process.once('SIGINT', () => shutdown('SIGINT'));
        })
        .catch(error => {
            console.error('Failed to initialize server:', error);
            process.exit(1);
        });
}

module.exports = {
    setupApp,
    initializeDatabase,
    closeDatabase,
    getDatabase: () => db,
    EmailService,
    EmailScheduler
};
