const express = require('express');

module.exports = (db, emailService = null) => {
    const router = express.Router();

// Get assigned requests with filtering
router.get('/requests', (req, res) => {
    const user = req.session.user;
    const { 
        status, 
        department_id, 
        division_id, 
        city_id, 
        date_from, 
        date_to,
        search,
        limit = 50,
        offset = 0
    } = req.query;

    let whereConditions = ['a.supervisor_id = ?'];
    let params = [user.id];

    // Apply filters
    if (status) {
        whereConditions.push('r.status = ?');
        params.push(status);
    }
    
    if (department_id) {
        whereConditions.push('r.department_id = ?');
        params.push(department_id);
    }
    
    if (division_id) {
        whereConditions.push('r.division_id = ?');
        params.push(division_id);
    }
    
    if (city_id) {
        whereConditions.push('r.city_id = ?');
        params.push(city_id);
    }
    
    if (date_from) {
        whereConditions.push('r.created_at >= ?');
        params.push(date_from + ' 00:00:00');
    }
    
    if (date_to) {
        whereConditions.push('r.created_at <= ?');
        params.push(date_to + ' 23:59:59');
    }
    
    if (search) {
        whereConditions.push('(r.description LIKE ? OR r.location LIKE ? OR r.name LIKE ? OR r.employee_id LIKE ?)');
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    db.all(`
        SELECT r.*, 
               d.name as division_name,
               c.name as city_name,
               col.name as colony_name,
               dep.name as department_name,
               a.assigned_worker
        FROM maintenance_requests r
        JOIN assignments a ON r.id = a.request_id
        LEFT JOIN divisions d ON r.division_id = d.id
        LEFT JOIN cities c ON r.city_id = c.id
        LEFT JOIN colonies col ON r.colony_id = col.id
        LEFT JOIN departments dep ON r.department_id = dep.id
        WHERE ${whereClause}
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        
        // Get total count for pagination
        db.get(`
            SELECT COUNT(*) as total
            FROM maintenance_requests r
            JOIN assignments a ON r.id = a.request_id
            WHERE ${whereClause}
        `, params, (countErr, countResult) => {
            if (countErr) {
                console.error('Count query error:', countErr);
                return res.status(500).json({ error: 'Internal server error' });
            }
            
            res.json({
                requests: rows || [],
                total: countResult?.total || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        });
    });
});

// Get individual request details
router.get('/requests/:id', (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    // First verify this request is assigned to this supervisor
    db.get(`
        SELECT r.*, 
               d.name as division,
               c.name as city,
               col.name as colony,
               dep.name as department,
               a.assigned_worker
        FROM maintenance_requests r
        JOIN assignments a ON r.id = a.request_id
        LEFT JOIN divisions d ON r.division_id = d.id
        LEFT JOIN cities c ON r.city_id = c.id
        LEFT JOIN colonies col ON r.colony_id = col.id
        LEFT JOIN departments dep ON r.department_id = dep.id
        WHERE r.id = ? AND a.supervisor_id = ?
    `, [id, user.id], (err, request) => {
        if (err) {
            console.error('Database error in request query:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (!request) {
            return res.status(404).json({ error: 'Request not found or not assigned to you' });
        }

        // Get status history
        db.all(`
            SELECT status, updated_at as timestamp, updated_by
            FROM status_history 
            WHERE request_id = ? 
            ORDER BY updated_at ASC
        `, [id], (historyErr, history) => {
            if (historyErr) {
                console.error('History query error:', historyErr);
                return res.status(500).json({ error: 'Internal server error' });
            }

            res.json({
                request: request,
                history: history || []
            });
        });
    });
});

// Update request status
router.put('/requests/:id/status', (req, res) => {
    const { status, assigned_worker, forward_department_id, forward_supervisor_id, remarks } = req.body;
    const user = req.session.user;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }
    const allowedStatuses = new Set([
        'Pending',
        'Not Operable',
        'Resolved',
        'Forwarded to Other Department'
    ]);
    if (!allowedStatuses.has(status)) {
        return res.status(400).json({ error: 'Invalid request status' });
    }

    // Validation for forwarding
    if (status === 'Forwarded to Other Department') {
        if (!forward_department_id || !forward_supervisor_id) {
            return res.status(400).json({ 
                error: 'Department and supervisor are required for forwarding' 
            });
        }
    }

    // Start a transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Update request status and assigned worker
        const updateQuery = `
            UPDATE maintenance_requests
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            AND EXISTS (
                SELECT 1 FROM assignments
                WHERE request_id = maintenance_requests.id AND supervisor_id = ?
            )
        `;
            
        db.run(updateQuery, [status, req.params.id, user.id], function(err) {
            if (err) {
                console.error('Database error:', err);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Internal server error' });
            }
            if (this.changes === 0) {
                db.run('ROLLBACK');
                return res.status(404).json({ error: 'Request not found or not assigned to you' });
            }

            // Add status history
            db.run(`
                INSERT INTO status_history (request_id, status, updated_by)
                VALUES (?, ?, ?)
            `, [req.params.id, status, user.id], (err) => {
                if (err) {
                    console.error('Database error:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Internal server error' });
                }

                // Handle different status updates
                if (status === 'Forwarded to Other Department' && forward_department_id && forward_supervisor_id) {
                    // Update request department
                    db.run('UPDATE maintenance_requests SET department_id = ? WHERE id = ?',
                        [forward_department_id, req.params.id], (err) => {
                        if (err) {
                            console.error('Database error:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Internal server error' });
                        }

                        // Update assignment to new supervisor
                        db.run(`
                            UPDATE assignments 
                            SET supervisor_id = ?, status = 'Forwarded', assigned_worker = NULL
                            WHERE request_id = ? AND supervisor_id = ?
                        `, [forward_supervisor_id, req.params.id, user.id], (err) => {
                            if (err) {
                                console.error('Database error:', err);
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Internal server error' });
                            }

                            db.run('COMMIT');
                            res.json({ 
                                message: 'Request forwarded successfully',
                                forwarded_to: forward_supervisor_id 
                            });
                        });
                    });
                } else {
                    // Update assignment with worker info if provided
                    if (assigned_worker) {
                        db.run(`
                            UPDATE assignments 
                            SET assigned_worker = ?, status = ?
                            WHERE request_id = ? AND supervisor_id = ?
                        `, [assigned_worker, status, req.params.id, user.id], (err) => {
                            if (err) {
                                console.error('Database error:', err);
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Internal server error' });
                            }

                            db.run('COMMIT');
                            
                            // Send status update email notification
                            if (emailService && process.env.SEND_STATUS_UPDATE_EMAILS === 'true') {
                                // Get request details for email
                                db.get(`
                                    SELECT mr.request_id, mr.name, mr.email, mr.description, mr.location,
                                           d.name as department_name
                                    FROM maintenance_requests mr
                                    LEFT JOIN departments d ON mr.department_id = d.id
                                    WHERE mr.id = ?
                                `, [req.params.id], (err, request) => {
                                    if (!err && request) {
                                        const requestData = {
                                            id: req.params.id,
                                            request_id: request.request_id,
                                            newStatus: status,
                                            description: request.description,
                                            location: request.location,
                                            assignedWorker: assigned_worker
                                        };
                                        
                                        emailService.sendStatusUpdateNotification(
                                            requestData,
                                            request.email,
                                            user.username
                                        ).catch(err => {
                                            console.error('Failed to send status update email:', err);
                                        });
                                    }
                                });
                            }
                            
                            res.json({ message: 'Status updated successfully' });
                        });
                    } else {
                        // Just update assignment status
                        db.run(`
                            UPDATE assignments 
                            SET status = ?
                            WHERE request_id = ? AND supervisor_id = ?
                        `, [status, req.params.id, user.id], (err) => {
                            if (err) {
                                console.error('Database error:', err);
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Internal server error' });
                            }

                            db.run('COMMIT');
                            
                            // Send status update email notification
                            if (emailService && process.env.SEND_STATUS_UPDATE_EMAILS === 'true') {
                                // Get request details for email
                                db.get(`
                                    SELECT mr.request_id, mr.name, mr.email, mr.description, mr.location,
                                           d.name as department_name
                                    FROM maintenance_requests mr
                                    LEFT JOIN departments d ON mr.department_id = d.id
                                    WHERE mr.id = ?
                                `, [req.params.id], (err, request) => {
                                    if (!err && request) {
                                        const requestData = {
                                            id: req.params.id,
                                            request_id: request.request_id,
                                            newStatus: status,
                                            description: request.description,
                                            location: request.location
                                        };
                                        
                                        emailService.sendStatusUpdateNotification(
                                            requestData,
                                            request.email,
                                            user.username
                                        ).catch(err => {
                                            console.error('Failed to send status update email:', err);
                                        });
                                    }
                                });
                            }
                            
                            res.json({ message: 'Status updated successfully' });
                        });
                    }
                }
            });
        });
    });
});

// Get supervisor stats for dashboard
router.get('/stats', (req, res) => {
    const user = req.session.user;

    db.get(`
        SELECT 
            COUNT(*) as totalAssigned,
            SUM(CASE WHEN r.status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
            SUM(CASE WHEN r.status = 'Pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN r.status = 'Not Operable' THEN 1 ELSE 0 END) as notOperable,
            SUM(CASE WHEN r.status = 'Forwarded to Other Department' THEN 1 ELSE 0 END) as forwarded,
            AVG(CASE 
                WHEN r.status = 'Resolved' 
                THEN (julianday(r.updated_at) - julianday(r.created_at)) * 24
                ELSE NULL 
            END) as avgResolutionTime
        FROM assignments a
        JOIN maintenance_requests r ON a.request_id = r.id
        WHERE a.supervisor_id = ?
    `, [user.id], (err, stats) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // Get monthly performance data (last 6 months)
        db.all(`
            SELECT 
                strftime('%Y-%m', r.updated_at) as month,
                COUNT(*) as resolved
            FROM assignments a
            JOIN maintenance_requests r ON a.request_id = r.id
            WHERE a.supervisor_id = ?
            AND r.status = 'Resolved'
            AND r.updated_at >= date('now', '-6 months')
            GROUP BY strftime('%Y-%m', r.updated_at)
            ORDER BY month
        `, [user.id], (err, monthlyData) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            const response = {
                totalAssigned: stats.totalAssigned || 0,
                pending: stats.pending || 0,
                resolved: stats.resolved || 0,
                notOperable: stats.notOperable || 0,
                forwarded: stats.forwarded || 0,
                avgResolutionTime: stats.avgResolutionTime ? Math.round(stats.avgResolutionTime) : 0,
                monthly: monthlyData || []
            };

            res.json(response);
        });
    });
});

// Get supervisor performance stats
router.get('/performance', (req, res) => {
    const user = req.session.user;

    db.get(`
        SELECT 
            COUNT(*) as total_assigned,
            SUM(CASE WHEN r.status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
            SUM(CASE WHEN r.status = 'Pending' THEN 1 ELSE 0 END) as pending,
            AVG(CASE 
                WHEN r.status = 'Resolved' 
                THEN julianday(r.updated_at) - julianday(r.created_at)
                ELSE NULL 
            END) as avg_resolution_time
        FROM assignments a
        JOIN maintenance_requests r ON a.request_id = r.id
        WHERE a.supervisor_id = ?
    `, [user.id], (err, stats) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        res.json(stats);
    });
});

    
    const checkInterval = setInterval(() => {
    db.all(`
        SELECT r.id, r.status, a.supervisor_id, 
               julianday('now') - julianday(r.created_at) as age_days
        FROM maintenance_requests r
        JOIN assignments a ON r.id = a.request_id
        WHERE r.status = 'Pending'
        AND age_days >= 1
    `, [], (err, requests) => {
        if (err) {
            console.error('Error checking old pending complaints:', err);
            return;
        }

        // Old requests remain as Pending - no status change needed
        // This maintains consistent status handling
        console.log(`Found ${requests.length} old pending requests (keeping as Pending)`);
    });
    }, 60 * 60 * 1000); // Check every hour
    checkInterval.unref();

    // Get filter options for supervisor
    router.get('/filter-options', (req, res) => {
        const user = req.session.user;
        
        // Get departments
        db.all('SELECT DISTINCT id, name FROM departments ORDER BY name', (err, departments) => {
            if (err) {
                console.error('Error fetching departments:', err);
                return res.status(500).json({ error: 'Failed to fetch filter options' });
            }
            
            // Get unique divisions and cities from supervisor's assigned requests
            db.all(`
                SELECT DISTINCT 
                    d.id as division_id, 
                    d.name as division_name,
                    c.id as city_id, 
                    c.name as city_name
                FROM maintenance_requests r
                JOIN assignments a ON r.id = a.request_id
                LEFT JOIN divisions d ON r.division_id = d.id
                LEFT JOIN cities c ON r.city_id = c.id
                WHERE a.supervisor_id = ?
                ORDER BY d.name, c.name
            `, [user.id], (err, locations) => {
                if (err) {
                    console.error('Error fetching locations:', err);
                    return res.status(500).json({ error: 'Failed to fetch filter options' });
                }
                
                // Extract unique divisions and cities
                const divisions = [];
                const cities = [];
                const seenDivisions = new Set();
                const seenCities = new Set();
                
                locations.forEach(loc => {
                    if (loc.division_id && !seenDivisions.has(loc.division_id)) {
                        divisions.push({
                            id: loc.division_id,
                            name: loc.division_name
                        });
                        seenDivisions.add(loc.division_id);
                    }
                    
                    if (loc.city_id && !seenCities.has(loc.city_id)) {
                        cities.push({
                            id: loc.city_id,
                            name: loc.city_name,
                            division_id: loc.division_id,
                            division_name: loc.division_name
                        });
                        seenCities.add(loc.city_id);
                    }
                });
                
                res.json({
                    divisions,
                    cities,
                    departments,
                    statuses: [
                        { value: 'Pending', label: 'Pending' },
                        { value: 'Not Operable', label: 'Not Operable' },
                        { value: 'Resolved', label: 'Resolved' },
                        { value: 'Forwarded to Other Department', label: 'Forwarded to Other Department' }
                    ]
                });
            });
        });
    });

    // Get forwarding options (departments and supervisors)
    router.get('/forwarding-options', (req, res) => {
        // Get all departments
        db.all('SELECT id, name FROM departments ORDER BY name', [], (err, departments) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            // Get all supervisors with their departments and colonies
            db.all(`
                SELECT DISTINCT u.id, u.username, c.name as colony_name, u.department_id
                FROM users u
                LEFT JOIN colonies c ON u.colony_id = c.id
                WHERE u.role = 'supervisor' AND u.active = 1
                ORDER BY u.username
            `, [], (err, supervisors) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                // Process supervisors to include department arrays
                const processedSupervisors = supervisors.map(sup => ({
                    ...sup,
                    departments: sup.department_id ? [sup.department_id] : []
                }));

                res.json({
                    departments: departments || [],
                    supervisors: processedSupervisors || []
                });
            });
        });
    });

    // Get status breakdown for supervisor's assigned requests
    router.get('/status-breakdown', (req, res) => {
        const user = req.session.user;
        const { 
            status, 
            department_id, 
            division_id, 
            city_id, 
            date_from, 
            date_to,
            search
        } = req.query;

        let whereConditions = ['a.supervisor_id = ?'];
        let params = [user.id];

        // Apply filters (same as requests endpoint but excluding status filter)
        if (department_id) {
            whereConditions.push('r.department_id = ?');
            params.push(department_id);
        }
        
        if (division_id) {
            whereConditions.push('r.division_id = ?');
            params.push(division_id);
        }
        
        if (city_id) {
            whereConditions.push('r.city_id = ?');
            params.push(city_id);
        }
        
        if (date_from) {
            whereConditions.push('r.created_at >= ?');
            params.push(date_from + ' 00:00:00');
        }
        
        if (date_to) {
            whereConditions.push('r.created_at <= ?');
            params.push(date_to + ' 23:59:59');
        }
        
        if (search) {
            whereConditions.push('(r.description LIKE ? OR r.location LIKE ? OR r.name LIKE ? OR r.employee_id LIKE ?)');
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        const whereClause = whereConditions.join(' AND ');

        // Get status breakdown
        const statusQuery = `
            SELECT 
                COALESCE(r.status, 'Unknown') as status,
                COUNT(*) as count
            FROM assignments a
            INNER JOIN maintenance_requests r ON a.request_id = r.id
            WHERE ${whereClause}
            GROUP BY r.status
            ORDER BY count DESC
        `;

        db.all(statusQuery, params, (err, breakdown) => {
            if (err) {
                console.error('Error fetching supervisor status breakdown:', err);
                return res.status(500).json({ error: 'Failed to fetch status breakdown' });
            }

            // Get total count
            const totalQuery = `
                SELECT COUNT(*) as total
                FROM assignments a
                INNER JOIN maintenance_requests r ON a.request_id = r.id
                WHERE ${whereClause}
            `;

            db.all(totalQuery, params, (err, totalResult) => {
                if (err) {
                    console.error('Error fetching supervisor total count:', err);
                    return res.status(500).json({ error: 'Failed to fetch total count' });
                }

                const total = totalResult[0]?.total || 0;

                // Format data for charts
                const chartData = breakdown.map(item => ({
                    status: item.status,
                    count: item.count,
                    percentage: total > 0 ? Math.round((item.count / total) * 100) : 0
                }));

                res.json({ 
                    breakdown: chartData,
                    total: total
                });
            });
        });
    });

    return router;
};
