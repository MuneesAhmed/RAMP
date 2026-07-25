const express = require('express');
const multer = require('multer');
const path = require('path');

module.exports = (db, emailService = null) => {
    const router = express.Router();
    
    // Multer configuration
    const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);
        const allowedExtensions = new Set(['.jpeg', '.jpg', '.png']);
        const mimetype = allowedMimeTypes.has(file.mimetype);
        const extname = allowedExtensions.has(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
    }
});

// Get divisions
router.get('/divisions', (req, res) => {
    db.all('SELECT * FROM divisions ORDER BY name', [], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
    });
});

// Get cities by division
router.get('/cities/:divisionId', (req, res) => {
    const query = `
        SELECT DISTINCT c.id, c.name 
        FROM cities c 
        WHERE c.division_id = ? 
        ORDER BY c.name
    `;
    
    db.all(query, [req.params.divisionId], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        
        // Additional server-side deduplication
        const uniqueCities = [];
        const seen = new Set();
        
        rows.forEach(city => {
            const key = `${city.id}-${city.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueCities.push(city);
            }
        });
        
        res.json(uniqueCities);
    });
});

// Get colonies by city
router.get('/colonies/:cityId', (req, res) => {
    const query = `
        SELECT DISTINCT col.id, col.name 
        FROM colonies col 
        WHERE col.city_id = ? 
        ORDER BY col.name
    `;
    
    db.all(query, [req.params.cityId], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        
        // Additional server-side deduplication
        const uniqueColonies = [];
        const seen = new Set();
        
        rows.forEach(colony => {
            const key = `${colony.id}-${colony.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueColonies.push(colony);
            }
        });
        
        res.json(uniqueColonies);
    });
});

// Get departments
router.get('/departments', (req, res) => {
    db.all('SELECT * FROM departments ORDER BY name', [], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
    });
});

// Save a contact message
router.post('/contact', (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const mobile = String(req.body.mobile || '').trim();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    const requestId = String(req.body.requestId || '').trim();

    if (!name || !email || !mobile || !subject || !message) {
        return res.status(400).json({ error: 'Complete all required contact fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
    }

    db.run(
        `INSERT INTO contact_messages (name, email, mobile, subject, message, request_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, mobile, subject, message, requestId || null],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Unable to save your message' });
            }
            return res.status(201).json({
                message: 'Message received successfully',
                id: this.lastID
            });
        }
    );
});

// Submit maintenance request (legacy)
router.post('/submit-request', upload.single('image'), (req, res) => {
    const {
        division_id, city_id, colony_id, wing, quarter_number,
        department_id, location, description,
        name, designation, mobile, employee_id, email
    } = req.body;

    // Validate required fields
    if (!division_id || !city_id || !colony_id || !department_id || 
        !name || !designation || !mobile || !employee_id || !email) {
        return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Generate unique request ID with prefix and padding
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const requestId = `REQ${timestamp}${random}`;

    const imagePath = req.file ? req.file.filename : null;

    db.run(`
        INSERT INTO maintenance_requests (
            request_id, division_id, city_id, colony_id, wing, quarter_number,
            department_id, location, description, image_path,
            name, designation, mobile, employee_id, email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        requestId, division_id, city_id, colony_id, wing, quarter_number,
        department_id, location, description, imagePath,
        name, designation, mobile, employee_id, email
    ], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // Auto-assign to supervisor
        const requestDbId = this.lastID;
        assignToSupervisor(requestDbId, department_id, city_id);

        // Send unassigned request alert to appropriate admin level
        if (emailService && process.env.SEND_UNASSIGNED_ALERTS === 'true') {
            // Get complete request data with names for email
            db.get(`
                SELECT mr.*, 
                       d.name as department_name,
                       div.name as division_name, 
                       c.name as city_name,
                       col.name as colony_name
                FROM maintenance_requests mr
                LEFT JOIN departments d ON mr.department_id = d.id
                LEFT JOIN divisions div ON mr.division_id = div.id
                LEFT JOIN cities c ON mr.city_id = c.id
                LEFT JOIN colonies col ON mr.colony_id = col.id
                WHERE mr.id = ?
            `, [requestDbId], (err, requestWithNames) => {
                if (!err && requestWithNames) {
                    // Send smart unassigned request alert to appropriate admin level
                    emailService.sendUnassignedRequestAlert(requestWithNames, db)
                        .catch(err => {
                            console.error('Failed to send unassigned request alert:', err);
                        });
                    
                    // Send user confirmation email (text format)
                    emailService.sendRequestConfirmation(requestWithNames)
                        .catch(err => {
                            console.error('Failed to send user confirmation email:', err);
                        });
                } else {
                    console.error('Failed to retrieve request data for email:', err);
                }
            });
        }

        res.json({
            message: 'Request submitted successfully',
            requestId: requestId
        });
    });
});

// Submit maintenance request (API)
router.post('/requests', upload.single('image'), (req, res) => {
    const {
        division_id, city_id, colony_id, wing, quarter_number,
        department_id, location, description,
        name, designation, mobile, employee_id, email
    } = req.body;

    // Validate required fields
    if (!division_id || !city_id || !colony_id || !department_id ||
        !name || !designation || !mobile || !employee_id || !email) {
        return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Generate unique request ID
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const requestId = `REQ${timestamp}${random}`;

    const imagePath = req.file ? req.file.filename : null;

    db.run(
        `INSERT INTO maintenance_requests (
            request_id, division_id, city_id, colony_id, wing, quarter_number,
            department_id, location, description, image_path,
            name, designation, mobile, employee_id, email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            requestId, division_id, city_id, colony_id, wing, quarter_number,
            department_id, location, description, imagePath,
            name, designation, mobile, employee_id, email
        ], function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            const requestDbId = this.lastID;
            assignToSupervisor(requestDbId, department_id, city_id);

            // Send unassigned request alert to appropriate admin level
            if (emailService && process.env.SEND_UNASSIGNED_ALERTS === 'true') {
                // Get complete request data with names for email
                db.get(`
                    SELECT mr.*, 
                           d.name as department_name,
                           div.name as division_name, 
                           c.name as city_name,
                           col.name as colony_name
                    FROM maintenance_requests mr
                    LEFT JOIN departments d ON mr.department_id = d.id
                    LEFT JOIN divisions div ON mr.division_id = div.id
                    LEFT JOIN cities c ON mr.city_id = c.id
                    LEFT JOIN colonies col ON mr.colony_id = col.id
                    WHERE mr.id = ?
                `, [requestDbId], (err, requestWithNames) => {
                    if (!err && requestWithNames) {
                        // Get admin emails
                        // Send smart unassigned request alert to appropriate admin level
                        emailService.sendUnassignedRequestAlert(requestWithNames, db)
                            .catch(err => {
                                console.error('Failed to send unassigned request alert:', err);
                            });
                        
                        // Send user confirmation email (text format)
                        emailService.sendRequestConfirmation(requestWithNames)
                            .catch(err => {
                                console.error('Failed to send user confirmation email:', err);
                            });
                    } else {
                        console.error('Failed to retrieve request data for email:', err);
                    }
                });
            }

            res.status(201).json({
                message: 'Request submitted successfully',
                id: requestDbId,
                requestId
            });
        }
    );
});

// Track request by ID
router.get('/track/:requestId', (req, res) => {
    db.get(`
        SELECT 
            r.id,
            r.request_id,
            d.name as division,
            c.name as city,
            col.name as colony,
            dep.name as department,
            r.location as category,
            r.quarter_number as flat,
            r.description,
            r.image_path,
            r.status,
            r.created_at,
            r.updated_at
        FROM maintenance_requests r
        LEFT JOIN divisions d ON r.division_id = d.id
        LEFT JOIN cities c ON r.city_id = c.id
        LEFT JOIN colonies col ON r.colony_id = col.id
        LEFT JOIN departments dep ON r.department_id = dep.id
        WHERE r.request_id = ?
    `, [req.params.requestId], (err, request) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        // Get status history
        db.all(`
            SELECT sh.status, sh.updated_at, u.username as updated_by
            FROM status_history sh
            LEFT JOIN users u ON sh.updated_by = u.id
            WHERE sh.request_id = (SELECT id FROM maintenance_requests WHERE request_id = ?)
            ORDER BY sh.updated_at DESC
        `, [req.params.requestId], (err, history) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            res.json({
                request: request,
                history: history
            });
        });
    });
});

// Track request by email and employee ID
router.post('/track-by-credentials', (req, res) => {
    const { email, employee_id } = req.body;

    if (!email || !employee_id) {
        return res.status(400).json({ error: 'Email and Employee ID are required' });
    }

    db.all(`
        SELECT r.*, d.name as division_name, c.name as city_name, 
               col.name as colony_name, dep.name as department_name
        FROM maintenance_requests r
        LEFT JOIN divisions d ON r.division_id = d.id
        LEFT JOIN cities c ON r.city_id = c.id
        LEFT JOIN colonies col ON r.colony_id = col.id
        LEFT JOIN departments dep ON r.department_id = dep.id
        WHERE r.email = ? AND r.employee_id = ?
        ORDER BY r.created_at DESC
    `, [email, employee_id], (err, requests) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (!requests.length) {
            return res.status(404).json({ error: 'No requests found' });
        }

        res.json({ requests: requests });
    });
});

    // Helper function to assign request to supervisor
    function assignToSupervisor(requestId, departmentId, cityId) {
    db.get(`
        SELECT id FROM users
        WHERE role = 'supervisor'
        AND department_id = ?
        AND city_id = ?
        AND active = 1
        ORDER BY RANDOM()
        LIMIT 1
    `, [departmentId, cityId], (err, supervisor) => {
        if (err || !supervisor) {
            console.error('Error assigning supervisor:', err);
            return;
        }

        db.run(`
            INSERT INTO assignments (request_id, supervisor_id, status)
            VALUES (?, ?, 'Assigned')
        `, [requestId, supervisor.id], (err) => {
            if (err) {
                console.error('Error creating assignment:', err);
            }
        });
    });
}

    return router;
};
