const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Parser } = require('json2csv');

module.exports = (db, emailService = null) => {
    const router = express.Router();

    // Helper function to run database queries with promise support
    function queryDB(sql, params = []) {
        return new Promise((resolve, reject) => {
            const operation = sql.trim().split(/\s+/, 1)[0].toUpperCase();
            const returnsRows = ['SELECT', 'PRAGMA', 'WITH'].includes(operation);

            if (returnsRows) {
                db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(rows);
                });
                return;
            }

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    // Middleware to check authentication
    function requireAuth(req, res, next) {
        if (!req.session?.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        next();
    }

    // Middleware to check admin role
    function requireAdmin(req, res, next) {
        if (!req.session?.user || !req.session.user.role.startsWith('admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    }

    // Get dashboard stats with hierarchical filtering
    router.get('/stats', async (req, res) => {
        try {
            const user = req.session.user;
            let params = [];
            let whereClause = '';
            
            // Apply hierarchical filtering based on admin level
            if (user.role === 'admin_l2' && user.division_id) {
                whereClause = 'WHERE mr.division_id = ?';
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                whereClause = 'WHERE mr.city_id = ?';
                params.push(user.city_id);
            }

            // Status breakdown
            const statusSQL = `
                SELECT status, COUNT(*) as count 
                FROM maintenance_requests mr
                ${whereClause}
                GROUP BY status
            `;
            const statusCounts = await queryDB(statusSQL, params);

            // Department breakdown
            const departmentSQL = `
                SELECT d.name as department, COUNT(*) as count
                FROM maintenance_requests mr
                LEFT JOIN departments d ON mr.department_id = d.id
                ${whereClause}
                GROUP BY d.name
                ORDER BY count DESC
            `;
            const departmentCounts = await queryDB(departmentSQL, params);

            // Supervisor workload
            const supervisorSQL = `
                SELECT u.username, COUNT(a.id) as active_assignments
                FROM users u
                LEFT JOIN assignments a ON u.id = a.supervisor_id AND a.status != 'Resolved'
                WHERE u.role = 'supervisor' AND u.active = 1
                ${user.role === 'admin_l2' && user.division_id ? 'AND u.division_id = ?' : ''}
                ${user.role === 'admin_l3' && user.city_id ? 'AND u.city_id = ?' : ''}
                GROUP BY u.id, u.username
                ORDER BY active_assignments DESC
                LIMIT 10
            `;
            const supervisorStats = await queryDB(supervisorSQL, params);

            res.json({
                statusBreakdown: statusCounts,
                departmentBreakdown: departmentCounts,
                supervisorWorkload: supervisorStats,
                userRole: user.role,
                userAccess: {
                    division_id: user.division_id,
                    city_id: user.city_id
                }
            });
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
        }
    });

    // Get overview statistics
    router.get('/overview', async (req, res) => {
        try {
            const userCount = await queryDB('SELECT COUNT(*) as count FROM users WHERE active = 1');
            const activeRequests = await queryDB('SELECT COUNT(*) as count FROM maintenance_requests WHERE status != "Resolved"');
            const pendingApprovals = await queryDB('SELECT COUNT(*) as count FROM maintenance_requests WHERE status = "Pending"');
            const departmentCount = await queryDB('SELECT COUNT(*) as count FROM departments');

            const recentActivities = await queryDB(`
                SELECT mr.request_id, mr.description, mr.status, mr.created_at, mr.name as requester_name
                FROM maintenance_requests mr
                ORDER BY mr.created_at DESC
                LIMIT 5
            `);

            res.json({
                userCount: userCount[0].count,
                activeRequests: activeRequests[0].count,
                pendingApprovals: pendingApprovals[0].count,
                departmentCount: departmentCount[0].count,
                recentActivities
            });
        } catch (error) {
            console.error('Error fetching overview:', error);
            res.status(500).json({ error: 'Failed to fetch overview data' });
        }
    });

    // ====================== FILTER OPTIONS ENDPOINTS ======================
    
    // Get departments for filter dropdown
    router.get('/departments', requireAuth, requireAdmin, async (req, res) => {
        try {
            const departments = await queryDB('SELECT id, name FROM departments ORDER BY name');
            res.json({ departments });
        } catch (error) {
            console.error('Error fetching departments:', error);
            res.status(500).json({ error: 'Failed to fetch departments' });
        }
    });
    
    // Get divisions for filter dropdown
    router.get('/divisions', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            let divisionsQuery = 'SELECT id, name FROM divisions ORDER BY name';
            let queryParams = [];
            
            // Level 2 admin can only see their division
            if (user.role === 'admin_l2' && user.division_id) {
                divisionsQuery = 'SELECT id, name FROM divisions WHERE id = ? ORDER BY name';
                queryParams.push(user.division_id);
            }
            
            const divisions = await queryDB(divisionsQuery, queryParams);
            res.json({ divisions });
        } catch (error) {
            console.error('Error fetching divisions:', error);
            res.status(500).json({ error: 'Failed to fetch divisions' });
        }
    });
    
    // Get cities for filter dropdown
    router.get('/cities', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            let citiesQuery = 'SELECT id, name FROM cities ORDER BY name';
            let queryParams = [];
            
            // Level 3 admin can only see their city
            if (user.role === 'admin_l3' && user.city_id) {
                citiesQuery = 'SELECT id, name FROM cities WHERE id = ? ORDER BY name';
                queryParams.push(user.city_id);
            }
            // Level 2 admin can only see cities in their division
            else if (user.role === 'admin_l2' && user.division_id) {
                citiesQuery = 'SELECT id, name FROM cities WHERE division_id = ? ORDER BY name';
                queryParams.push(user.division_id);
            } else if (req.query.division_id) {
                citiesQuery = 'SELECT id, name FROM cities WHERE division_id = ? ORDER BY name';
                queryParams.push(req.query.division_id);
            }
            
            const cities = await queryDB(citiesQuery, queryParams);
            res.json({ cities });
        } catch (error) {
            console.error('Error fetching cities:', error);
            res.status(500).json({ error: 'Failed to fetch cities' });
        }
    });
    
    // Get colonies for specific city (for supervisor assignment)
    router.get('/colonies', requireAuth, requireAdmin, async (req, res) => {
        try {
            const cityName = String(req.query.city || '').trim();
            const cityId = req.query.city_id;
            if (!cityName && !cityId) {
                return res.status(400).json({ error: 'City or city_id parameter is required' });
            }
            
            const colonies = cityId
                ? await queryDB(
                    'SELECT id, name, city_id FROM colonies WHERE city_id = ? ORDER BY name',
                    [cityId]
                )
                : await queryDB(
                    `SELECT col.id, col.name, col.city_id
                     FROM colonies col
                     JOIN cities c ON c.id = col.city_id
                     WHERE c.name = ?
                     ORDER BY col.name`,
                    [cityName]
                );
            
            res.json(colonies);
        } catch (error) {
            console.error('Error fetching colonies:', error);
            res.status(500).json({ error: 'Failed to fetch colonies' });
        }
    });
    
    // Add new division
    router.post('/divisions', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { name } = req.body;
            
            if (!name || name.trim().length === 0) {
                return res.status(400).json({ error: 'Division name is required' });
            }
            
            // Check if division already exists
            const existingDivision = await queryDB(
                'SELECT id FROM divisions WHERE name = ?',
                [name.trim()]
            );
            
            if (existingDivision.length > 0) {
                return res.status(400).json({ error: 'Division already exists' });
            }
            
            // Insert new division
            await queryDB(
                'INSERT INTO divisions (name) VALUES (?)',
                [name.trim()]
            );
            
            res.json({ message: 'Division added successfully' });
        } catch (error) {
            console.error('Error adding division:', error);
            res.status(500).json({ error: 'Failed to add division' });
        }
    });
    
    // Add new city
    router.post('/cities', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { name, division_id } = req.body;
            
            if (!name || name.trim().length === 0) {
                return res.status(400).json({ error: 'City name is required' });
            }
            
            if (!division_id) {
                return res.status(400).json({ error: 'Division is required' });
            }
            
            // Check if city already exists in this division
            const existingCity = await queryDB(
                'SELECT id FROM cities WHERE name = ? AND division_id = ?',
                [name.trim(), division_id]
            );
            
            if (existingCity.length > 0) {
                return res.status(400).json({ error: 'City already exists in this division' });
            }
            
            // Insert new city
            await queryDB(
                'INSERT INTO cities (name, division_id) VALUES (?, ?)',
                [name.trim(), division_id]
            );
            
            res.json({ message: 'City added successfully' });
        } catch (error) {
            console.error('Error adding city:', error);
            res.status(500).json({ error: 'Failed to add city' });
        }
    });
    
    // Add new colony
    router.post('/colonies', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { name, city_id } = req.body;
            
            if (!name || name.trim().length === 0) {
                return res.status(400).json({ error: 'Colony name is required' });
            }
            
            if (!city_id) {
                return res.status(400).json({ error: 'City is required' });
            }
            
            const cityResult = await queryDB('SELECT id FROM cities WHERE id = ?', [city_id]);
            
            if (cityResult.length === 0) {
                return res.status(400).json({ error: 'Invalid city selected' });
            }
            
            // Check if colony already exists in this city
            const existingColony = await queryDB(
                'SELECT id FROM colonies WHERE name = ? AND city_id = ?',
                [name.trim(), city_id]
            );
            
            if (existingColony.length > 0) {
                return res.status(400).json({ error: 'Colony already exists in this city' });
            }
            
            // Insert new colony
            await queryDB(
                'INSERT INTO colonies (name, city_id) VALUES (?, ?)',
                [name.trim(), city_id]
            );
            
            res.json({ message: 'Colony added successfully' });
        } catch (error) {
            console.error('Error adding colony:', error);
            res.status(500).json({ error: 'Failed to add colony' });
        }
    });

    // Check department availability (for supervisor assignment)
    router.get('/department-availability', requireAuth, requireAdmin, async (req, res) => {
        try {
            const departmentId = req.query.department_id;
            if (!departmentId) {
                return res.status(400).json({ error: 'Department ID parameter is required' });
            }
            
            // Check if department already has a supervisor
            const existingSupervisor = await queryDB(`
                SELECT 
                    u.username as supervisor_name,
                    u.created_at as assigned_date,
                    d.name as department_name,
                    c.name as colony_name
                FROM users u
                JOIN departments d ON d.id = u.department_id
                LEFT JOIN colonies c ON c.id = u.colony_id
                WHERE u.department_id = ? AND u.role = 'supervisor' AND u.active = 1
                LIMIT 1
            `, [departmentId]);
            
            if (existingSupervisor.length > 0) {
                // Department already has a supervisor
                res.json({
                    available: false,
                    current_supervisor: existingSupervisor[0].supervisor_name,
                    assigned_date: existingSupervisor[0].assigned_date,
                    department_name: existingSupervisor[0].department_name,
                    colony_name: existingSupervisor[0].colony_name
                });
            } else {
                // Department is available
                const deptInfo = await queryDB('SELECT name FROM departments WHERE id = ?', [departmentId]);
                res.json({
                    available: true,
                    department_name: deptInfo[0]?.name || 'Unknown Department'
                });
            }
        } catch (error) {
            console.error('Error checking department availability:', error);
            res.status(500).json({ error: 'Failed to check department availability' });
        }
    });
    
    // ====================== END FILTER OPTIONS ENDPOINTS ======================

    // Get pending assignments - requests that have been sent but no one has accepted yet
    router.get('/pending-assignments', requireAuth, requireAdmin, async (req, res) => {
        try {
            console.log('=== PENDING ASSIGNMENTS ENDPOINT HIT ===');
            const user = req.session.user;
            console.log('Current user:', user.username, 'Role:', user.role);
            console.log('Query parameters:', req.query);
            
            // Extract filter parameters
            const {
                assignment_status,
                department_id,
                division_id,
                city_id,
                supervisor_id,
                priority,
                date_from,
                date_to,
                search,
                sort
            } = req.query;
            
            // Get requests that have been sent but no one has accepted yet
            // This includes:
            // 1. Requests assigned to supervisors but not yet accepted (assignment status is 'Assigned' but request status is still 'Pending')
            // 2. Requests that are pending and haven't been assigned yet
            
            let pendingRequestsQuery = `
                SELECT 
                    mr.id,
                    mr.request_id,
                    mr.description,
                    mr.location,
                    mr.status,
                    mr.created_at,
                    mr.name as requester_name,
                    mr.designation,
                    mr.mobile,
                    mr.employee_id,
                    mr.department_id,
                    mr.division_id,
                    mr.city_id,
                    d.name as division_name,
                    c.name as city_name,
                    col.name as colony_name,
                    dept.name as department_name,
                    a.supervisor_id,
                    a.status as assignment_status,
                    u.username as assigned_supervisor
                FROM maintenance_requests mr
                LEFT JOIN divisions d ON mr.division_id = d.id
                LEFT JOIN cities c ON mr.city_id = c.id
                LEFT JOIN colonies col ON mr.colony_id = col.id
                LEFT JOIN departments dept ON mr.department_id = dept.id
                LEFT JOIN assignments a ON mr.id = a.request_id
                LEFT JOIN users u ON a.supervisor_id = u.id
                WHERE (
                    (mr.status = 'Pending' AND a.id IS NULL) OR 
                    (a.status = 'Assigned' AND mr.status = 'Pending')
                )
            `;
            
            let queryParams = [];
            
            // Apply hierarchical filtering based on admin level
            if (user.role === 'admin_l2' && user.division_id) {
                pendingRequestsQuery += ' AND mr.division_id = ?';
                queryParams.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                pendingRequestsQuery += ' AND mr.city_id = ?';
                queryParams.push(user.city_id);
            }
            
            // Apply filters
            if (department_id) {
                pendingRequestsQuery += ' AND mr.department_id = ?';
                queryParams.push(department_id);
            }
            
            if (division_id) {
                pendingRequestsQuery += ' AND mr.division_id = ?';
                queryParams.push(division_id);
            }
            
            if (city_id) {
                pendingRequestsQuery += ' AND mr.city_id = ?';
                queryParams.push(city_id);
            }
            
            if (supervisor_id) {
                if (supervisor_id === 'null') {
                    pendingRequestsQuery += ' AND a.supervisor_id IS NULL';
                } else {
                    pendingRequestsQuery += ' AND a.supervisor_id = ?';
                    queryParams.push(supervisor_id);
                }
            }
            
            if (date_from) {
                pendingRequestsQuery += ' AND DATE(mr.created_at) >= ?';
                queryParams.push(date_from);
            }
            
            if (date_to) {
                pendingRequestsQuery += ' AND DATE(mr.created_at) <= ?';
                queryParams.push(date_to);
            }
            
            if (search) {
                pendingRequestsQuery += ` AND (
                    mr.description LIKE ? OR 
                    mr.location LIKE ? OR 
                    mr.name LIKE ? OR 
                    mr.employee_id LIKE ? OR
                    dept.name LIKE ? OR
                    col.name LIKE ?
                )`;
                const searchTerm = `%${search}%`;
                queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }
            
            // Apply sorting
            switch (sort) {
                case 'created_at_asc':
                    pendingRequestsQuery += ' ORDER BY mr.created_at ASC';
                    break;
                case 'status_asc':
                    pendingRequestsQuery += ' ORDER BY mr.status ASC, mr.created_at DESC';
                    break;
                case 'location_asc':
                    pendingRequestsQuery += ' ORDER BY d.name ASC, c.name ASC, col.name ASC, mr.created_at DESC';
                    break;
                default:
                    pendingRequestsQuery += ' ORDER BY mr.created_at DESC';
            }
            
            console.log('Executing query:', pendingRequestsQuery);
            console.log('Query parameters:', queryParams);
            
            const allPendingRequests = await queryDB(pendingRequestsQuery, queryParams);
            console.log('Raw pending requests found:', allPendingRequests.length);
            
            // Remove duplicates by keeping only the latest request for each description (unless search is being used)
            let pendingRequests = allPendingRequests;
            if (!search) {
                const uniqueRequestsMap = new Map();
                allPendingRequests.forEach(req => {
                    const existing = uniqueRequestsMap.get(req.description);
                    if (!existing || new Date(req.created_at) > new Date(existing.created_at)) {
                        uniqueRequestsMap.set(req.description, req);
                    }
                });
                
                pendingRequests = Array.from(uniqueRequestsMap.values())
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
            
            console.log('Final pending requests found:', pendingRequests.length);
            
            // Apply client-side assignment status filter
            if (assignment_status) {
                switch (assignment_status) {
                    case 'unassigned':
                        pendingRequests = pendingRequests.filter(req => !req.supervisor_id);
                        break;
                    case 'assigned':
                        pendingRequests = pendingRequests.filter(req => req.supervisor_id && req.assignment_status === 'Assigned');
                        break;
                    case 'overdue':
                        const now = new Date();
                        pendingRequests = pendingRequests.filter(req => {
                            const createdDate = new Date(req.created_at);
                            const hoursDiff = (now - createdDate) / (1000 * 60 * 60);
                            return hoursDiff > 24;
                        });
                        break;
                }
            }
            
            // Count different types of pending requests
            const unassignedRequests = pendingRequests.filter(req => !req.supervisor_id).length;
            const assignedButNotAccepted = pendingRequests.filter(req => req.supervisor_id && req.assignment_status === 'Assigned').length;
            
            // Count overdue requests (over 24 hours)
            const now = new Date();
            const overdueRequests = pendingRequests.filter(req => {
                const createdDate = new Date(req.created_at);
                const hoursDiff = (now - createdDate) / (1000 * 60 * 60);
                return hoursDiff > 24;
            }).length;
            
            // Extract pagination parameters
            const limit = parseInt(req.query.limit) || 10;
            const offset = parseInt(req.query.offset) || 0;
            const page = Math.floor(offset / limit) + 1;
            
            // Store total count before pagination
            const totalPendingRequests = pendingRequests.length;
            
            // Apply pagination
            const paginatedRequests = pendingRequests.slice(offset, offset + limit);
            
            // Create summary
            const summary = {
                totalPending: totalPendingRequests,
                unassignedRequests: unassignedRequests,
                assignedButNotAccepted: assignedButNotAccepted,
                overdueRequests: overdueRequests,
                pendingRequests: pendingRequests.filter(req => req.status === 'Pending').length
            };
            
            console.log('Pending requests summary:', summary);
            console.log(`Pagination: page ${page}, limit ${limit}, offset ${offset}, total ${totalPendingRequests}`);
            
            res.json({
                summary,
                pendingRequests: paginatedRequests,
                total: totalPendingRequests,
                page,
                limit,
                totalPages: Math.ceil(totalPendingRequests / limit),
                userRole: user.role,
                userAccess: {
                    division_id: user.division_id,
                    city_id: user.city_id
                },
                appliedFilters: req.query
            });
            
        } catch (error) {
            console.error('Error fetching pending assignments:', error);
            res.status(500).json({ error: 'Failed to fetch pending assignments' });
        }
    });

    // Get maintenance requests with filtering and pagination
    router.get('/requests', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;
            
            let whereClause = '';
            let params = [];
            
            // Apply hierarchical filtering
            if (user.role === 'admin_l2' && user.division_id) {
                whereClause = 'WHERE mr.division_id = ?';
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                whereClause = 'WHERE mr.city_id = ?';
                params.push(user.city_id);
            }
            
            // Add filters from query params
            const filters = [];
            if (req.query.status) {
                filters.push('mr.status = ?');
                params.push(req.query.status);
            }
            if (req.query.department_id) {
                filters.push('mr.department_id = ?');
                params.push(req.query.department_id);
            }
            if (req.query.division_id) {
                filters.push('mr.division_id = ?');
                params.push(req.query.division_id);
            }
            if (req.query.city_id) {
                filters.push('mr.city_id = ?');
                params.push(req.query.city_id);
            }
            
            if (filters.length > 0) {
                whereClause += (whereClause ? ' AND ' : 'WHERE ') + filters.join(' AND ');
            }
            
            const requestsQuery = `
                SELECT 
                    mr.*,
                    d.name as division_name,
                    c.name as city_name,
                    col.name as colony_name,
                    dept.name as department_name
                FROM maintenance_requests mr
                LEFT JOIN divisions d ON mr.division_id = d.id
                LEFT JOIN cities c ON mr.city_id = c.id
                LEFT JOIN colonies col ON mr.colony_id = col.id
                LEFT JOIN departments dept ON mr.department_id = dept.id
                ${whereClause}
                ORDER BY mr.created_at DESC
                LIMIT ? OFFSET ?
            `;
            
            params.push(limit, offset);
            const requests = await queryDB(requestsQuery, params);
            
            // Get total count for pagination
            const countQuery = `SELECT COUNT(*) as total FROM maintenance_requests mr ${whereClause}`;
            const countParams = params.slice(0, -2); // Remove limit and offset
            const totalResult = await queryDB(countQuery, countParams);
            const total = totalResult[0].total;
            
            res.json({
                requests,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });
            
        } catch (error) {
            console.error('Error fetching requests:', error);
            res.status(500).json({ error: 'Failed to fetch requests' });
        }
    });

    // Get individual request details
    router.get('/requests/:id', requireAuth, requireAdmin, async (req, res) => {
        try {
            const requestId = req.params.id;
            const user = req.session.user;
            
            console.log(`📋 Fetching request details for ID: ${requestId}`);
            
            // Get the request details with joins for all related data
            let requestQuery = `
                SELECT 
                    mr.*,
                    d.name as department_name,
                    div.name as division_name,
                    c.name as city_name,
                    col.name as colony_name,
                    mr.name as user_name,
                    mr.email as user_email,
                    mr.mobile as user_phone,
                    mr.employee_id as user_employee_id,
                    mr.designation as user_designation
                FROM maintenance_requests mr
                LEFT JOIN departments d ON mr.department_id = d.id
                LEFT JOIN divisions div ON mr.division_id = div.id
                LEFT JOIN cities c ON mr.city_id = c.id
                LEFT JOIN colonies col ON mr.colony_id = col.id
                WHERE mr.id = ?
            `;
            
            let params = [requestId];
            
            // Apply hierarchical filtering
            if (user.role === 'admin_l2' && user.division_id) {
                requestQuery += ' AND mr.division_id = ?';
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                requestQuery += ' AND mr.city_id = ?';
                params.push(user.city_id);
            }
            
            const request = await queryDB(requestQuery, params);
            
            if (!request || request.length === 0) {
                return res.status(404).json({ error: 'Request not found' });
            }
            
            // Get assignment history for this request
            const historyQuery = `
                SELECT 
                    a.*,
                    u.username as supervisor_name,
                    u.username as supervisor_email
                FROM assignments a
                LEFT JOIN users u ON a.supervisor_id = u.id
                WHERE a.request_id = ?
                ORDER BY a.assigned_at DESC
            `;
            
            const history = await queryDB(historyQuery, [requestId]);
            
            console.log(`  Request found: ${request[0].description}`);
            
            res.json({
                request: request[0],
                history: history || []
            });
            
        } catch (error) {
            console.error('Error fetching request details:', error);
            res.status(500).json({ error: 'Failed to fetch request details' });
        }
    });

    // Get supervisors in hierarchical format
    router.get('/supervisors', requireAuth, requireAdmin, async (req, res) => {
        console.log('=== SUPERVISORS ENDPOINT HIT ===');
        console.log('User:', req.session.user?.username, 'Role:', req.session.user?.role);
        
        try {
            const user = req.session.user;
            let whereClause = '';
            let params = [];
            
            // Apply hierarchical filtering
            if (user.role === 'admin_l2' && user.division_id) {
                whereClause = 'WHERE u.division_id = ?';
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                whereClause = 'WHERE u.city_id = ?';
                params.push(user.city_id);
            }
            
            // Add role filter
            if (whereClause) {
                whereClause += ' AND u.role = "supervisor"';
            } else {
                whereClause = 'WHERE u.role = "supervisor"';
            }
            
            console.log('Where clause:', whereClause);
            console.log('Params:', params);
            
            const supervisorsQuery = `
                SELECT 
                    u.*,
                    d.id as division_id,
                    d.name as division_name,
                    c.id as city_id,
                    c.name as city_name,
                    col.name as colony_name,
                    dept.name as department_name,
                    COUNT(a.id) as active_assignments
                FROM users u
                LEFT JOIN divisions d ON u.division_id = d.id
                LEFT JOIN cities c ON u.city_id = c.id
                LEFT JOIN colonies col ON u.colony_id = col.id
                LEFT JOIN departments dept ON u.department_id = dept.id
                LEFT JOIN assignments a ON u.id = a.supervisor_id AND a.status != 'Resolved'
                ${whereClause}
                GROUP BY u.id
                ORDER BY d.name, c.name, u.username
            `;
            
            const supervisors = await queryDB(supervisorsQuery, params);
            
            console.log('Found supervisors:', supervisors.length);
            console.log('First supervisor:', supervisors[0]);
            
            // Organize supervisors hierarchically by Division -> City -> Colony -> Supervisors
            const hierarchy = {};
            
            // Filter out supervisors without proper location assignment or invalid references
            const assignedSupervisors = supervisors.filter(s => 
                s.division_id && s.city_id && s.colony_id &&
                s.division_name && s.city_name && s.colony_name
            );
            
            const summary = {
                totalSupervisors: assignedSupervisors.length,
                activeSupervisors: assignedSupervisors.filter(s => s.active === 1).length,
                inactiveSupervisors: assignedSupervisors.filter(s => s.active === 0).length,
                unassignedSupervisors: supervisors.length - assignedSupervisors.length
            };
            
            supervisors.forEach(supervisor => {
                // Skip supervisors without proper location assignment or invalid references
                if (!supervisor.division_id || !supervisor.city_id || !supervisor.colony_id ||
                    !supervisor.division_name || !supervisor.city_name || !supervisor.colony_name) {
                    console.log(`Skipping supervisor with incomplete location data: ${supervisor.username}`);
                    return;
                }
                
                const divisionName = supervisor.division_name;
                const cityName = supervisor.city_name;
                const colonyName = supervisor.colony_name;
                
                // Initialize division if it doesn't exist
                if (!hierarchy[divisionName]) {
                    hierarchy[divisionName] = {
                        division_id: supervisor.division_id,
                        division_name: divisionName,
                        cities: {},
                        totalSupervisors: 0
                    };
                }
                
                // Initialize city if it doesn't exist
                if (!hierarchy[divisionName].cities[cityName]) {
                    hierarchy[divisionName].cities[cityName] = {
                        city_id: supervisor.city_id,
                        city_name: cityName,
                        colonies: {},
                        totalSupervisors: 0
                    };
                }
                
                // Initialize colony if it doesn't exist
                if (!hierarchy[divisionName].cities[cityName].colonies[colonyName]) {
                    hierarchy[divisionName].cities[cityName].colonies[colonyName] = {
                        colony_name: colonyName,
                        supervisors: [],
                        totalSupervisors: 0
                    };
                }
                
                // Add supervisor to the colony
                hierarchy[divisionName].cities[cityName].colonies[colonyName].supervisors.push({
                    id: supervisor.id,
                    username: supervisor.username,
                    email: supervisor.email,
                    role: supervisor.role,
                    active: supervisor.active,
                    department_name: supervisor.department_name,
                    active_assignments: supervisor.active_assignments,
                    created_at: supervisor.created_at
                });
                
                // Update counters
                hierarchy[divisionName].cities[cityName].colonies[colonyName].totalSupervisors++;
                hierarchy[divisionName].cities[cityName].totalSupervisors++;
                hierarchy[divisionName].totalSupervisors++;
            });
            
            // Convert to array format for frontend
            const hierarchicalData = Object.values(hierarchy).map(division => ({
                ...division,
                cities: Object.values(division.cities).map(city => ({
                    ...city,
                    colonies: Object.values(city.colonies)
                }))
            }));
            
            res.json({ 
                summary,
                hierarchy: hierarchicalData,
                supervisors, // Keep flat list for backward compatibility
                userRole: user.role,
                userAccess: {
                    division_id: user.division_id,
                    city_id: user.city_id
                }
            });
            
        } catch (error) {
            console.error('Error fetching supervisors:', error);
            res.status(500).json({ error: 'Failed to fetch supervisors' });
        }
    });

    // Get supervisor password by ID (admin only)
    router.get('/supervisors/:id/password', requireAuth, requireAdmin, async (req, res) => {
        try {
            const supervisorId = req.params.id;
            const user = req.session.user;
            
            // Only allow admin_l1 to view passwords for security
            if (user.role !== 'admin_l1') {
                return res.status(403).json({ error: 'Insufficient permissions. Only Level 1 Admins can view passwords.' });
            }
            
            const supervisorQuery = `
                SELECT id, username, password 
                FROM users 
                WHERE id = ? AND role IN ('supervisor', 'admin_l1', 'admin_l2', 'admin_l3')
            `;
            
            const supervisor = await queryDB(supervisorQuery, [supervisorId]);
            
            if (!supervisor || supervisor.length === 0) {
                return res.status(404).json({ error: 'Supervisor not found' });
            }
            
            res.json({ 
                id: supervisor[0].id,
                username: supervisor[0].username,
                password: supervisor[0].password
            });
            
        } catch (error) {
            console.error('Error fetching supervisor password:', error);
            res.status(500).json({ error: 'Failed to fetch supervisor password' });
        }
    });

    // Create supervisor with specific assignment (Division → City → Colony → Department)
    router.post('/supervisors/specific-assignment', requireAuth, requireAdmin, async (req, res) => {
        try {
            const {
                username, password, full_name, employee_id, email, phone,
                role, division_id, city_id, colony_id, department_id,
                skills, notes
            } = req.body;
            
            // Validation for required fields
            if (!username || !password || !full_name || !phone) {
                return res.status(400).json({ error: 'Username, password, full name, and phone are required' });
            }
            
            // Validation for role-specific requirements
            if (role === 'supervisor' && (!division_id || !city_id || !colony_id || !department_id)) {
                return res.status(400).json({ 
                    error: 'Supervisors must have complete assignment: Division → City → Colony → Department' 
                });
            }
            
            if (role === 'admin_l2' && !division_id) {
                return res.status(400).json({ error: 'Level 2 Admins must be assigned to a division' });
            }
            
            if (role === 'admin_l3' && (!division_id || !city_id)) {
                return res.status(400).json({ error: 'Level 3 Admins must be assigned to a division and city' });
            }
            
            // Check if username already exists
            const existingUser = await queryDB('SELECT id FROM users WHERE username = ?', [username]);
            if (existingUser.length > 0) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            
            // For supervisors, check if department already has a supervisor
            if (role === 'supervisor' && department_id) {
                const existingSupervisor = await queryDB(`
                    SELECT username FROM users 
                    WHERE department_id = ? AND role = 'supervisor' AND active = 1
                `, [department_id]);
                
                if (existingSupervisor.length > 0) {
                    return res.status(400).json({ 
                        error: `Department already has a supervisor: ${existingSupervisor[0].username}. Each department can have only ONE supervisor.` 
                    });
                }
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Insert new user with specific assignment
            const insertQuery = `
                INSERT INTO users (
                    username, password, full_name, employee_id, email, phone,
                    role, division_id, city_id, colony_id, department_id,
                    skills, notes, active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
            `;
            
            await queryDB(insertQuery, [
                username, hashedPassword, full_name, employee_id, email, phone,
                role, division_id, city_id, colony_id, department_id,
                skills, notes
            ]);
            
            console.log(`  Created ${role} with specific assignment:`, { username, role, division_id, city_id, colony_id, department_id });
            
            res.json({ 
                message: `${role === 'supervisor' ? 'Supervisor' : 'Admin'} created successfully with specific assignment`,
                username: username,
                role: role,
                assignment: {
                    division_id,
                    city_id,
                    colony_id,
                    department_id
                }
            });
            
        } catch (error) {
            console.error('Error creating supervisor with specific assignment:', error);
            res.status(500).json({ error: 'Failed to create supervisor' });
        }
    });

    // Reset supervisor password (admin only)
    router.post('/supervisors/reset-password', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { username, newPassword } = req.body;
            const user = req.session.user;
            
            // Only allow admin_l1 to reset passwords for security
            if (user.role !== 'admin_l1') {
                return res.status(403).json({ error: 'Insufficient permissions. Only Level 1 Admins can reset passwords.' });
            }
            
            if (!username || !newPassword) {
                return res.status(400).json({ error: 'Username and new password are required' });
            }
            
            // Hash the new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            const updateQuery = `
                UPDATE users 
                SET password = ? 
                WHERE username = ? AND role IN ('supervisor', 'admin_l1', 'admin_l2', 'admin_l3')
            `;
            
            const result = await queryDB(updateQuery, [hashedPassword, username]);
            
            if (result.changes === 0) {
                return res.status(404).json({ error: 'Supervisor not found or no changes made' });
            }
            
            res.json({ 
                message: 'Password reset successfully',
                username: username,
                newPassword: newPassword // Only return for immediate display, not for storage
            });
            
        } catch (error) {
            console.error('Error resetting supervisor password:', error);
            res.status(500).json({ error: 'Failed to reset supervisor password' });
        }
    });

    // Get locations hierarchy
    router.get('/locations-hierarchy', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            
            // Get divisions
            let divisionsQuery = 'SELECT * FROM divisions ORDER BY name';
            let divisionsParams = [];
            
            if (user.role === 'admin_l2' && user.division_id) {
                divisionsQuery = 'SELECT * FROM divisions WHERE id = ? ORDER BY name';
                divisionsParams = [user.division_id];
            }
            
            const divisions = await queryDB(divisionsQuery, divisionsParams);
            
            // Get cities
            let citiesQuery = 'SELECT * FROM cities ORDER BY division_id, name';
            let citiesParams = [];
            
            if (user.role === 'admin_l2' && user.division_id) {
                citiesQuery = 'SELECT * FROM cities WHERE division_id = ? ORDER BY name';
                citiesParams = [user.division_id];
            } else if (user.role === 'admin_l3' && user.city_id) {
                citiesQuery = 'SELECT * FROM cities WHERE id = ? ORDER BY name';
                citiesParams = [user.city_id];
            }
            
            const cities = await queryDB(citiesQuery, citiesParams);
            
            // Get colonies with distinct names
            let coloniesQuery = 'SELECT DISTINCT name, city_id FROM colonies ORDER BY city_id, name';
            let coloniesParams = [];
            
            if (user.role === 'admin_l3' && user.city_id) {
                coloniesQuery = 'SELECT DISTINCT name, city_id FROM colonies WHERE city_id = ? ORDER BY name';
                coloniesParams = [user.city_id];
            }
            
            const colonies = await queryDB(coloniesQuery, coloniesParams);
            
            // Get departments
            const departments = await queryDB('SELECT * FROM departments ORDER BY name');
            
            res.json({
                divisions,
                cities,
                colonies,
                departments,
                userRole: user.role,
                userAccess: {
                    division_id: user.division_id,
                    city_id: user.city_id
                }
            });
            
        } catch (error) {
            console.error('Error fetching locations hierarchy:', error);
            res.status(500).json({ error: 'Failed to fetch locations hierarchy' });
        }
    });

    // Get filter options for requests
    router.get('/filter-options', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            let params = [];
            let whereClause = '';
            
            // Apply hierarchical filtering
            if (user.role === 'admin_l2' && user.division_id) {
                whereClause = 'WHERE mr.division_id = ?';
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                whereClause = 'WHERE mr.city_id = ?';
                params.push(user.city_id);
            }
            
            // Get unique statuses - only allowed ones
            const allowedStatuses = [
                'Pending',
                'Not Operable', 
                'Resolved',
                'Forwarded to Other Department'
            ];
            
            // Filter to only show statuses that exist in the database and are allowed
            const existingStatuses = await queryDB(`
                SELECT DISTINCT status FROM maintenance_requests mr ${whereClause}
                ORDER BY status
            `, params);
            
            const filteredStatuses = existingStatuses
                .filter(s => allowedStatuses.includes(s.status))
                .map(s => ({ value: s.status, label: s.status }));
            
            // Add any missing allowed statuses
            allowedStatuses.forEach(status => {
                if (!filteredStatuses.find(s => s.value === status)) {
                    filteredStatuses.push({ value: status, label: status });
                }
            });
            
            // Get departments
            const departments = await queryDB(`
                SELECT DISTINCT d.id, d.name 
                FROM departments d
                INNER JOIN maintenance_requests mr ON d.id = mr.department_id
                ${whereClause}
                ORDER BY d.name
            `, params);
            
            // Get divisions (only for L1 admin)
            let divisions = [];
            if (user.role === 'admin_l1') {
                divisions = await queryDB('SELECT id, name FROM divisions ORDER BY name');
            }
            
            // Get cities (for L1 and L2 admin)
            let cities = [];
            if (user.role === 'admin_l1') {
                cities = await queryDB('SELECT id, name, division_id FROM cities ORDER BY name');
            } else if (user.role === 'admin_l2' && user.division_id) {
                cities = await queryDB('SELECT id, name FROM cities WHERE division_id = ? ORDER BY name', [user.division_id]);
            }
            
            res.json({
                statuses: filteredStatuses,
                departments,
                divisions,
                cities
            });
            
        } catch (error) {
            console.error('Error fetching filter options:', error);
            res.status(500).json({ error: 'Failed to fetch filter options' });
        }
    });

    // ===== ANALYTICS ENDPOINTS =====

    // Get analytics filter options
    router.get('/analytics/filter-options', requireAuth, requireAdmin, async (req, res) => {
        console.log('📊 Getting analytics filter options for admin level:', req.session.user.role);
        
        try {
            const user = req.session.user;
            let divisions = [];
            let cities = [];
            let departments = [];
            
            // Get departments
            departments = await queryDB('SELECT DISTINCT id, name FROM departments ORDER BY name');
            
            // Apply hierarchical filtering based on admin level
            if (user.role === 'admin_l1') {
                divisions = await queryDB('SELECT DISTINCT id, name FROM divisions ORDER BY name');
                cities = await queryDB('SELECT DISTINCT id, name, division_id FROM cities ORDER BY name');
            } else if (user.role === 'admin_l2' && user.division_id) {
                divisions = await queryDB('SELECT id, name FROM divisions WHERE id = ? ORDER BY name', [user.division_id]);
                cities = await queryDB('SELECT id, name, division_id FROM cities WHERE division_id = ? ORDER BY name', [user.division_id]);
            } else if (user.role === 'admin_l3' && user.city_id) {
                const cityInfo = await queryDB('SELECT division_id FROM cities WHERE id = ?', [user.city_id]);
                if (cityInfo.length > 0) {
                    divisions = await queryDB('SELECT id, name FROM divisions WHERE id = ? ORDER BY name', [cityInfo[0].division_id]);
                    cities = await queryDB('SELECT id, name, division_id FROM cities WHERE id = ? ORDER BY name', [user.city_id]);
                }
            }
            
            console.log('📊 Analytics filter options:', { divisions: divisions.length, cities: cities.length, departments: departments.length });
            
            res.json({
                divisions,
                cities,
                departments
            });
            
        } catch (error) {
            console.error('❌ Error getting analytics filter options:', error);
            res.status(500).json({ error: 'Failed to get filter options' });
        }
    });

    // Get analytics performance data
    router.get('/analytics/performance', requireAuth, requireAdmin, async (req, res) => {
        console.log('📊 Getting analytics performance data for admin level:', req.session.user.role);
        console.log('📊 Query params:', req.query);
        
        try {
            const user = req.session.user;
            const { timePeriod, division, city, department } = req.query;
            
            // Build base WHERE clause and parameters
            let whereConditions = ['1=1'];
            let params = [];
            
            // Apply admin level restrictions first
            if (user.role === 'admin_l2' && user.division_id) {
                whereConditions.push('d.id = ?');
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                whereConditions.push('c.id = ?');
                params.push(user.city_id);
            }
            
            // Apply time filter
            if (timePeriod && timePeriod !== 'all') {
                const days = parseInt(timePeriod);
                whereConditions.push('mr.created_at >= datetime("now", "-' + days + ' days")');
            }
            
            // Apply additional filters from request
            if (division) {
                whereConditions.push('d.id = ?');
                params.push(division);
            }
            if (city) {
                whereConditions.push('c.id = ?');
                params.push(city);
            }
            if (department) {
                whereConditions.push('dept.id = ?');
                params.push(department);
            }
            
            const whereClause = 'WHERE ' + whereConditions.join(' AND ');
            
            // Get summary statistics
            const summaryQuery = `
                SELECT 
                    COUNT(*) as totalRequests,
                    COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) as completedRequests,
                    ROUND(
                        COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 1
                    ) as completionRate,
                    ROUND(
                        AVG(CASE 
                            WHEN mr.status = 'Resolved' AND sh_completed.updated_at IS NOT NULL 
                            THEN julianday(sh_completed.updated_at) - julianday(mr.created_at)
                            ELSE NULL 
                        END), 1
                    ) as avgResolutionTime,
                    COUNT(DISTINCT a.supervisor_id) as activeSupervisors
                FROM maintenance_requests mr
                LEFT JOIN assignments a ON mr.id = a.request_id
                LEFT JOIN users u ON a.supervisor_id = u.id
                LEFT JOIN colonies col ON mr.colony_id = col.id
                LEFT JOIN cities c ON col.city_id = c.id
                LEFT JOIN divisions d ON c.division_id = d.id
                LEFT JOIN departments dept ON mr.department_id = dept.id
                LEFT JOIN status_history sh_completed ON mr.id = sh_completed.request_id 
                    AND sh_completed.status = 'Resolved' 
                    AND sh_completed.updated_at = (
                        SELECT MAX(updated_at) 
                        FROM status_history 
                        WHERE request_id = mr.id AND status = 'Resolved'
                    )
                ${whereClause}
            `;
            
            const summaryResult = await queryDB(summaryQuery, params);
            const summary = summaryResult[0] || {};
            
            // Get supervisor performance
            const supervisorQuery = `
                SELECT 
                    u.id,
                    u.username as name,
                    d.name as division,
                    c.name as city,
                    col.name as colony,
                    dept.name as department,
                    COUNT(mr.id) as totalRequests,
                    COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) as completedRequests,
                    ROUND(
                        COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) * 100.0 / NULLIF(COUNT(mr.id), 0), 1
                    ) as successRate,
                    ROUND(
                        AVG(CASE 
                            WHEN mr.status = 'Resolved' AND sh_completed.updated_at IS NOT NULL 
                            THEN julianday(sh_completed.updated_at) - julianday(mr.created_at)
                            ELSE NULL 
                        END), 1
                    ) as avgResolution
                FROM users u
                INNER JOIN assignments a ON u.id = a.supervisor_id
                INNER JOIN maintenance_requests mr ON a.request_id = mr.id
                LEFT JOIN colonies col ON mr.colony_id = col.id
                LEFT JOIN cities c ON col.city_id = c.id
                LEFT JOIN divisions d ON c.division_id = d.id
                LEFT JOIN departments dept ON mr.department_id = dept.id
                LEFT JOIN status_history sh_completed ON mr.id = sh_completed.request_id 
                    AND sh_completed.status = 'Resolved' 
                    AND sh_completed.updated_at = (
                        SELECT MAX(updated_at) 
                        FROM status_history 
                        WHERE request_id = mr.id AND status = 'Resolved'
                    )
                ${whereClause} AND u.role = 'supervisor'
                GROUP BY u.id, u.username, d.name, c.name, col.name, dept.name
                HAVING COUNT(mr.id) > 0
                ORDER BY successRate DESC, totalRequests DESC
            `;
            
            const supervisorPerformance = await queryDB(supervisorQuery, params);
            
            // Add rating calculation to supervisors
            const supervisorsWithRating = supervisorPerformance.map(s => ({
                ...s,
                rating: s.successRate >= 90 ? 5 : 
                       s.successRate >= 80 ? 4 : 
                       s.successRate >= 70 ? 3 : 
                       s.successRate >= 60 ? 2 : 1
            }));
            
            // Get location performance (adapt based on filters)
            const groupBy = city ? 'colony' : division ? 'city' : 'division';
            let locationQuery, locationNameField, locationTypeField, locationParentField;
            
            if (groupBy === 'colony') {
                locationNameField = 'col.name';
                locationTypeField = '"Colony"';
                locationParentField = 'c.name';
            } else if (groupBy === 'city') {
                locationNameField = 'c.name';
                locationTypeField = '"City"';  
                locationParentField = 'd.name';
            } else {
                locationNameField = 'd.name';
                locationTypeField = '"Division"';
                locationParentField = '"State Level"';
            }
            
            locationQuery = `
                SELECT 
                    ${locationNameField} as name,
                    ${locationTypeField} as type,
                    ${locationParentField} as parent,
                    COUNT(mr.id) as totalRequests,
                    COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) as completedRequests,
                    ROUND(
                        COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) * 100.0 / NULLIF(COUNT(mr.id), 0), 1
                    ) as efficiency,
                    ROUND(
                        AVG(CASE 
                            WHEN mr.status = 'Resolved' AND sh_completed.updated_at IS NOT NULL 
                            THEN julianday(sh_completed.updated_at) - julianday(mr.created_at)
                            ELSE NULL 
                        END), 1
                    ) as avgResolution,
                    CASE 
                        WHEN COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) * 100.0 / NULLIF(COUNT(mr.id), 0) < 70 OR
                             AVG(CASE 
                                WHEN mr.status = 'Resolved' AND sh_completed.updated_at IS NOT NULL 
                                THEN julianday(sh_completed.updated_at) - julianday(mr.created_at)
                                ELSE NULL 
                             END) > 7 THEN 1
                        ELSE 0
                    END as needsImprovement
                FROM maintenance_requests mr
                LEFT JOIN colonies col ON mr.colony_id = col.id
                LEFT JOIN cities c ON col.city_id = c.id
                LEFT JOIN divisions d ON c.division_id = d.id
                LEFT JOIN departments dept ON mr.department_id = dept.id
                LEFT JOIN status_history sh_completed ON mr.id = sh_completed.request_id 
                    AND sh_completed.status = 'Resolved' 
                    AND sh_completed.updated_at = (
                        SELECT MAX(updated_at) 
                        FROM status_history 
                        WHERE request_id = mr.id AND status = 'Resolved'
                    )
                ${whereClause}
                GROUP BY ${locationNameField}
                HAVING COUNT(mr.id) > 0
                ORDER BY efficiency DESC
            `;
            
            const locationPerformance = await queryDB(locationQuery, params);
            
            // Get contract work recommendations
            const contractQuery = `
                SELECT 
                    COALESCE(col.name, c.name, d.name) as location,
                    COUNT(mr.id) as currentWorkload,
                    CASE 
                        WHEN COUNT(mr.id) < 10 THEN 'High'
                        WHEN COUNT(mr.id) < 20 THEN 'Medium'
                        ELSE 'Low'
                    END as priority,
                    CASE 
                        WHEN COUNT(mr.id) < 10 THEN 'Consider contract-based maintenance for low-volume locations'
                        WHEN COUNT(mr.id) < 20 THEN 'Evaluate cost-effectiveness of dedicated vs contract staff'
                        ELSE 'Current staffing model appropriate'
                    END as recommendation,
                    CASE 
                        WHEN COUNT(mr.id) < 10 THEN 'Low request volume makes dedicated supervisor inefficient'
                        WHEN COUNT(mr.id) < 20 THEN 'Moderate volume allows flexibility in staffing approach'
                        ELSE 'High volume justifies dedicated supervisor'
                    END as reason,
                    CASE 
                        WHEN COUNT(mr.id) < 10 THEN '₹15,000-25,000/month'
                        WHEN COUNT(mr.id) < 20 THEN '₹8,000-15,000/month'
                        ELSE 'Minimal savings'
                    END as costSavings,
                    CASE 
                        WHEN COUNT(mr.id) < 10 THEN 'Transition to contract model'
                        WHEN COUNT(mr.id) < 20 THEN 'Pilot hybrid approach'
                        ELSE 'Monitor performance'
                    END as suggestedAction,
                    CASE 
                        WHEN COUNT(mr.id) < 10 THEN '1-2 months'
                        WHEN COUNT(mr.id) < 20 THEN '2-3 months'
                        ELSE 'Ongoing review'
                    END as timeline
                FROM maintenance_requests mr
                LEFT JOIN colonies col ON mr.colony_id = col.id
                LEFT JOIN cities c ON col.city_id = c.id
                LEFT JOIN divisions d ON c.division_id = d.id
                LEFT JOIN departments dept ON mr.department_id = dept.id
                ${whereClause}
                GROUP BY COALESCE(col.id, c.id, d.id)
                HAVING COUNT(mr.id) > 0
                ORDER BY currentWorkload ASC
                LIMIT 10
            `;
            
            const contractRecommendations = await queryDB(contractQuery, params);
            
            // Get department analysis
            const departmentQuery = `
                SELECT 
                    dept.name,
                    COUNT(mr.id) as totalRequests,
                    COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) as completedRequests,
                    ROUND(
                        AVG(CASE 
                            WHEN mr.status = 'Resolved' AND sh_completed.updated_at IS NOT NULL 
                            THEN julianday(sh_completed.updated_at) - julianday(mr.created_at)
                            ELSE NULL 
                        END), 1
                    ) as avgResolution,
                    COUNT(DISTINCT a.supervisor_id) as supervisorCount,
                    ROUND(
                        COUNT(CASE WHEN mr.status = 'Resolved' THEN 1 END) * 100.0 / NULLIF(COUNT(mr.id), 0), 1
                    ) as performance
                FROM departments dept
                LEFT JOIN maintenance_requests mr ON dept.id = mr.department_id
                LEFT JOIN assignments a ON mr.id = a.request_id
                LEFT JOIN colonies col ON mr.colony_id = col.id
                LEFT JOIN cities c ON col.city_id = c.id
                LEFT JOIN divisions d ON c.division_id = d.id
                LEFT JOIN status_history sh_completed ON mr.id = sh_completed.request_id 
                    AND sh_completed.status = 'Resolved' 
                    AND sh_completed.updated_at = (
                        SELECT MAX(updated_at) 
                        FROM status_history 
                        WHERE request_id = mr.id AND status = 'Resolved'
                    )
                ${whereClause}
                GROUP BY dept.id, dept.name
                HAVING COUNT(mr.id) > 0
                ORDER BY performance DESC
            `;
            
            const deptAnalysis = await queryDB(departmentQuery, params);
            
            // Add top issues for each department
            const departmentAnalysis = await Promise.all(deptAnalysis.map(async (dept) => {
                const issuesQuery = `
                    SELECT 
                        CASE 
                            WHEN LOWER(mr.description) LIKE '%plumb%' OR LOWER(mr.description) LIKE '%pipe%' OR LOWER(mr.description) LIKE '%leak%' THEN 'Plumbing'
                            WHEN LOWER(mr.description) LIKE '%electric%' OR LOWER(mr.description) LIKE '%power%' OR LOWER(mr.description) LIKE '%light%' THEN 'Electrical'
                            WHEN LOWER(mr.description) LIKE '%paint%' OR LOWER(mr.description) LIKE '%wall%' OR LOWER(mr.description) LIKE '%roof%' THEN 'Maintenance'
                            WHEN LOWER(mr.description) LIKE '%clean%' OR LOWER(mr.description) LIKE '%garbage%' OR LOWER(mr.description) LIKE '%waste%' THEN 'Cleaning'
                            WHEN LOWER(mr.description) LIKE '%door%' OR LOWER(mr.description) LIKE '%window%' OR LOWER(mr.description) LIKE '%lock%' THEN 'Carpentry'
                            ELSE 'General'
                        END as issue_type, 
                        COUNT(*) as count
                    FROM maintenance_requests mr
                    LEFT JOIN colonies col ON mr.colony_id = col.id
                    LEFT JOIN cities c ON col.city_id = c.id
                    LEFT JOIN divisions d ON c.division_id = d.id
                    WHERE mr.department_id = (SELECT id FROM departments WHERE name = ?) 
                    AND ${whereConditions.join(' AND ')}
                    GROUP BY issue_type
                    ORDER BY count DESC
                    LIMIT 3
                `;                const issueParams = [dept.name, ...params];
                const topIssuesResult = await queryDB(issuesQuery, issueParams);
                const topIssues = topIssuesResult.map(issue => issue.issue_type);
                
                return {
                    ...dept,
                    topIssues: topIssues.length > 0 ? topIssues : ['No specific pattern']
                };
            }));
            
            const responseData = {
                summary: {
                    totalRequests: summary.totalRequests || 0,
                    completedRequests: summary.completedRequests || 0,
                    completionRate: summary.completionRate || 0,
                    avgResolutionTime: summary.avgResolutionTime || 0,
                    activeSupervisors: summary.activeSupervisors || 0
                },
                supervisorPerformance: supervisorsWithRating.map(s => ({
                    ...s,
                    successRate: s.successRate || 0,
                    avgResolution: s.avgResolution || 0
                })),
                locationPerformance: locationPerformance.map(l => ({
                    ...l,
                    efficiency: l.efficiency || 0,
                    avgResolution: l.avgResolution || 0,
                    needsImprovement: Boolean(l.needsImprovement)
                })),
                contractRecommendations,
                departmentAnalysis
            };
            
            console.log('📊 Analytics data generated:', {
                summary: responseData.summary,
                supervisors: responseData.supervisorPerformance.length,
                locations: responseData.locationPerformance.length,
                contracts: responseData.contractRecommendations.length,
                departments: responseData.departmentAnalysis.length
            });
            
            res.json(responseData);
            
        } catch (error) {
            console.error('❌ Error getting analytics performance data:', error);
            res.status(500).json({ error: 'Failed to get analytics data' });
        }
    });

    // Assign request to supervisor
    router.post('/assign-request', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { requestId, supervisorId, notes } = req.body;
            const user = req.session.user;
            
            console.log(`📋 Assigning request ${requestId} to supervisor ${supervisorId}`);
            
            if (!requestId || !supervisorId) {
                return res.status(400).json({ error: 'Request ID and Supervisor ID are required' });
            }
            
            // Verify the request exists and admin has access
            let requestQuery = `
                SELECT mr.*, d.name as department_name, div.name as division_name, c.name as city_name
                FROM maintenance_requests mr
                LEFT JOIN departments d ON mr.department_id = d.id
                LEFT JOIN divisions div ON mr.division_id = div.id
                LEFT JOIN cities c ON mr.city_id = c.id
                WHERE mr.id = ?
            `;
            let params = [requestId];
            
            // Apply hierarchical filtering
            if (user.role === 'admin_l2' && user.division_id) {
                requestQuery += ' AND mr.division_id = ?';
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                requestQuery += ' AND mr.city_id = ?';
                params.push(user.city_id);
            }
            
            const request = await queryDB(requestQuery, params);
            
            if (!request || request.length === 0) {
                return res.status(404).json({ error: 'Request not found or access denied' });
            }
            
            // Verify the supervisor exists and admin has access
            let supervisorQuery = `
                SELECT u.*, d.name as division_name, c.name as city_name
                FROM users u
                LEFT JOIN divisions d ON u.division_id = d.id
                LEFT JOIN cities c ON u.city_id = c.id
                WHERE u.id = ? AND u.role = 'supervisor' AND u.active = 1
            `;
            let supervisorParams = [supervisorId];
            
            // Apply hierarchical filtering for supervisor
            if (user.role === 'admin_l2' && user.division_id) {
                supervisorQuery += ' AND u.division_id = ?';
                supervisorParams.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                supervisorQuery += ' AND u.city_id = ?';
                supervisorParams.push(user.city_id);
            }
            
            const supervisor = await queryDB(supervisorQuery, supervisorParams);
            
            if (!supervisor || supervisor.length === 0) {
                return res.status(404).json({ error: 'Supervisor not found or access denied' });
            }
            
            // Check if there's already an active assignment for this request
            const existingAssignment = await queryDB(`
                SELECT * FROM assignments 
                WHERE request_id = ? AND status != 'Resolved'
            `, [requestId]);
            
            if (existingAssignment.length > 0) {
                return res.status(400).json({ error: 'Request is already assigned to a supervisor' });
            }
            
            // Create the assignment
            const assignmentResult = await queryDB(`
                INSERT INTO assignments (request_id, supervisor_id, assigned_worker, status, assigned_at)
                VALUES (?, ?, ?, 'Assigned', CURRENT_TIMESTAMP)
            `, [requestId, supervisorId, supervisor[0].username]);
            
            console.log(`  Assignment created with ID: ${assignmentResult.lastID}`);
            
            // Send assignment email notification
            if (emailService && process.env.SEND_ASSIGNMENT_EMAILS === 'true') {
                const requestData = {
                    id: request[0].id,
                    request_id: request[0].request_id,
                    name: request[0].name,
                    employee_id: request[0].employee_id,
                    mobile: request[0].mobile,
                    department_name: request[0].department_name,
                    location: request[0].location,
                    description: request[0].description
                };
                
                emailService.sendAssignmentNotification(
                    requestData,
                    supervisor[0].email,
                    user.username
                ).catch(err => {
                    console.error('Failed to send assignment email:', err);
                });
            }
            
            res.json({
                message: 'Request assigned successfully',
                assignmentId: assignmentResult.lastID,
                requestId: requestId,
                supervisorId: supervisorId,
                supervisorName: supervisor[0].username,
                assignedAt: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error assigning request:', error);
            res.status(500).json({ error: 'Failed to assign request' });
        }
    });

    // Get status summary for request cards
    router.get('/status-summary', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            let params = [];
            let whereClause = '';
            
            // Apply hierarchical filtering based on admin level
            if (user.role === 'admin_l2' && user.division_id) {
                whereClause = 'WHERE mr.division_id = ?';
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                whereClause = 'WHERE mr.city_id = ?';
                params.push(user.city_id);
            }
            
            // Get total count
            const totalResult = await queryDB(`
                SELECT COUNT(*) as count
                FROM maintenance_requests mr
                ${whereClause}
            `, params);
            
            // Get status counts
            const statusCounts = await queryDB(`
                SELECT 
                    status,
                    COUNT(*) as count
                FROM maintenance_requests mr
                ${whereClause}
                GROUP BY status
                ORDER BY count DESC
            `, params);
            
            // Structure the response with the 4 allowed statuses
            const allowedStatuses = ['Pending', 'Not Operable', 'Resolved', 'Forwarded to Other Department'];
            const statusSummary = {
                total: totalResult[0]?.count || 0,
                statuses: {}
            };
            
            // Initialize all allowed statuses with 0
            allowedStatuses.forEach(status => {
                statusSummary.statuses[status] = 0;
            });
            
            // Fill in actual counts
            statusCounts.forEach(item => {
                if (allowedStatuses.includes(item.status)) {
                    statusSummary.statuses[item.status] = item.count;
                }
            });
            
            res.json(statusSummary);
        } catch (error) {
            console.error('Error fetching status summary:', error);
            res.status(500).json({ error: 'Failed to fetch status summary' });
        }
    });

    // Get status breakdown for charts
    router.get('/status-breakdown', requireAuth, requireAdmin, async (req, res) => {
        try {
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
            
            let whereConditions = [];
            let params = [];
            
            // Apply hierarchical filtering based on admin level
            if (user.role === 'admin_l2' && user.division_id) {
                whereConditions.push('mr.division_id = ?');
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                whereConditions.push('mr.city_id = ?');
                params.push(user.city_id);
            }
            
            // Apply filters (excluding status filter for breakdown)
            if (department_id) {
                whereConditions.push('mr.department_id = ?');
                params.push(department_id);
            }
            
            if (division_id) {
                whereConditions.push('mr.division_id = ?');
                params.push(division_id);
            }
            
            if (city_id) {
                whereConditions.push('mr.city_id = ?');
                params.push(city_id);
            }
            
            if (date_from) {
                whereConditions.push('DATE(mr.created_at) >= ?');
                params.push(date_from);
            }
            
            if (date_to) {
                whereConditions.push('DATE(mr.created_at) <= ?');
                params.push(date_to);
            }
            
            if (search) {
                whereConditions.push('(mr.description LIKE ? OR mr.location LIKE ? OR mr.name LIKE ?)');
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }
            
            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
            
            // Get status breakdown
            const statusBreakdown = await queryDB(`
                SELECT 
                    mr.status,
                    COUNT(*) as count
                FROM maintenance_requests mr
                ${whereClause}
                GROUP BY mr.status
                ORDER BY count DESC
            `, params);
            
            // Get total count
            const totalResult = await queryDB(`
                SELECT COUNT(*) as total
                FROM maintenance_requests mr
                ${whereClause}
            `, params);
            
            const total = totalResult[0]?.total || 0;
            
            // Format data for charts
            const chartData = statusBreakdown.map(item => ({
                status: item.status,
                count: item.count,
                percentage: total > 0 ? Math.round((item.count / total) * 100) : 0
            }));
            
            res.json({ 
                breakdown: chartData,
                total: total
            });
        } catch (error) {
            console.error('Error fetching status breakdown:', error);
            res.status(500).json({ error: 'Failed to fetch status breakdown' });
        }
    });

    // Check if supervisor can be safely deleted
    router.get('/check-supervisor-deletion/:id', async (req, res) => {
        try {
            const supervisorId = req.params.id;
            
            // Check if supervisor exists
            const supervisor = await queryDB(
                'SELECT id, username, role FROM users WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            if (supervisor.length === 0) {
                return res.status(404).json({ 
                    error: 'Supervisor not found',
                    canDelete: false 
                });
            }
            
            const safetyCheck = await checkSupervisorDeletionSafety(supervisorId, db);
            
            res.json({
                supervisor: supervisor[0],
                ...safetyCheck
            });
            
        } catch (error) {
            console.error('Error checking supervisor deletion safety:', error);
            res.status(500).json({ 
                error: 'Failed to check deletion safety',
                canDelete: false 
            });
        }
    });

    // Get supervisor deletion safety information
    router.get('/supervisor/:id/deletion-safety', async (req, res) => {
        try {
            const supervisorId = req.params.id;
            
            // Check if supervisor exists
            const supervisor = await queryDB(
                'SELECT id, username, role FROM users WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            if (supervisor.length === 0) {
                return res.status(404).json({ 
                    error: 'Supervisor not found',
                    canDelete: false 
                });
            }
            
            const safetyCheck = await checkSupervisorDeletionSafety(supervisorId, db);
            
            res.json({
                supervisor: supervisor[0],
                ...safetyCheck
            });
            
        } catch (error) {
            console.error('Error checking supervisor deletion safety:', error);
            res.status(500).json({ 
                error: 'Failed to check deletion safety',
                canDelete: false 
            });
        }
    });

    // Legacy endpoint for backwards compatibility
    router.get('/check-supervisor-deletion/:id', async (req, res) => {
        try {
            const supervisorId = req.params.id;
            
            // Check if supervisor exists
            const supervisor = await queryDB(
                'SELECT id, username, role FROM users WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            if (supervisor.length === 0) {
                return res.status(404).json({ 
                    error: 'Supervisor not found',
                    canDelete: false 
                });
            }
            
            const safetyCheck = await checkSupervisorDeletionSafety(supervisorId, db);
            
            res.json({
                supervisor: supervisor[0],
                ...safetyCheck
            });
            
        } catch (error) {
            console.error('Error checking supervisor deletion safety:', error);
            res.status(500).json({ 
                error: 'Failed to check deletion safety',
                canDelete: false 
            });
        }
    });

    // Create supervisor (simple version for transfer functionality)
    router.post('/supervisor', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { username, password, division_id, city_id, colony_id, department_id } = req.body;
            
            if (!username || !password || !division_id || !city_id || !department_id) {
                return res.status(400).json({ 
                    error: 'Username, password, division, city, and department are required' 
                });
            }
            
            // Check if username already exists
            const existingUser = await queryDB('SELECT id FROM users WHERE username = ?', [username]);
            if (existingUser.length > 0) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Create supervisor
            const insertResult = await queryDB(`
                INSERT INTO users (username, password, role, division_id, city_id, colony_id, department_id, active)
                VALUES (?, ?, 'supervisor', ?, ?, ?, ?, 1)
            `, [username, hashedPassword, division_id, city_id, colony_id, department_id]);
            
            // Get the created supervisor details
            const supervisor = await queryDB(`
                SELECT u.*, d.name as division_name, c.name as city_name, 
                       col.name as colony_name, dept.name as department_name
                FROM users u
                LEFT JOIN divisions d ON u.division_id = d.id
                LEFT JOIN cities c ON u.city_id = c.id
                LEFT JOIN colonies col ON u.colony_id = col.id
                LEFT JOIN departments dept ON u.department_id = dept.id
                WHERE u.id = ?
            `, [insertResult.lastID]);
            
            console.log(`  New supervisor created: ${username} (ID: ${insertResult.lastID})`);
            
            res.json({
                success: true,
                message: 'Supervisor created successfully',
                supervisor: supervisor[0]
            });
            
        } catch (error) {
            console.error('❌ Error creating supervisor:', error);
            res.status(500).json({ error: 'Failed to create supervisor' });
        }
    });

    // Transfer assignments to another supervisor
    router.post('/transfer-assignments', async (req, res) => {
        try {
            const { fromSupervisorId, toSupervisorId, assignmentIds } = req.body;
            
            if (!fromSupervisorId || !toSupervisorId || !assignmentIds?.length) {
                return res.status(400).json({ 
                    error: 'Missing required fields: fromSupervisorId, toSupervisorId, assignmentIds' 
                });
            }
            
            // Verify both supervisors exist
            const supervisors = await queryDB(
                'SELECT id, username FROM users WHERE id IN (?, ?) AND role = "supervisor"',
                [fromSupervisorId, toSupervisorId]
            );
            
            if (supervisors.length !== 2) {
                return res.status(400).json({ 
                    error: 'One or both supervisors not found' 
                });
            }
            
            // Transfer assignments
            const placeholders = assignmentIds.map(() => '?').join(',');
            const transferQuery = `
                UPDATE assignments 
                SET supervisor_id = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id IN (${placeholders}) AND supervisor_id = ?
            `;
            
            await queryDB(transferQuery, [toSupervisorId, ...assignmentIds, fromSupervisorId]);
            
            // Log the transfer
            console.log(`📋 Transferred ${assignmentIds.length} assignments from supervisor ${fromSupervisorId} to ${toSupervisorId}`);
            
            res.json({ 
                success: true, 
                message: `Successfully transferred ${assignmentIds.length} assignments`,
                transferredCount: assignmentIds.length
            });
            
        } catch (error) {
            console.error('Error transferring assignments:', error);
            res.status(500).json({ error: 'Failed to transfer assignments' });
        }
    });

    // Safe supervisor deletion
    router.delete('/supervisor/:id', async (req, res) => {
        try {
            const supervisorId = req.params.id;
            const { forceDelete = false } = req.body;
            
            // Check deletion safety
            const safetyCheck = await checkSupervisorDeletionSafety(supervisorId, db);
            
            if (!safetyCheck.canDelete && !forceDelete) {
                return res.status(400).json({
                    error: 'Cannot delete supervisor with active assignments',
                    ...safetyCheck,
                    suggestion: 'Transfer assignments to another supervisor first, or use forceDelete option'
                });
            }
            
            // If force delete is requested, handle assignments
            if (forceDelete && safetyCheck.activeAssignments > 0) {
                // Set assignments to unassigned state
                await queryDB(
                    'UPDATE assignments SET status = "unassigned", supervisor_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE supervisor_id = ?',
                    [supervisorId]
                );
                
                // Update related maintenance requests
                await queryDB(
                    'UPDATE maintenance_requests SET status = "Pending" WHERE id IN (SELECT request_id FROM assignments WHERE supervisor_id IS NULL)',
                    []
                );
                
                console.log(`⚠️ Force deleted supervisor ${supervisorId}, ${safetyCheck.activeAssignments} assignments became unassigned`);
            }
            
            // Delete the supervisor (soft delete by setting active = 0)
            await queryDB(
                'UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            res.json({ 
                success: true, 
                message: 'Supervisor deleted successfully',
                orphanedAssignments: forceDelete ? safetyCheck.activeAssignments : 0
            });
            
        } catch (error) {
            console.error('Error deleting supervisor:', error);
            res.status(500).json({ error: 'Failed to delete supervisor' });
        }
    });

    // Deactivate supervisor
    router.put('/supervisor/:id/deactivate', async (req, res) => {
        try {
            const supervisorId = req.params.id;
            
            // Check if supervisor exists
            const supervisor = await queryDB(
                'SELECT id, username, role, active FROM users WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            if (supervisor.length === 0) {
                return res.status(404).json({ 
                    error: 'Supervisor not found'
                });
            }
            
            if (supervisor[0].active === 0) {
                return res.status(400).json({ 
                    error: 'Supervisor is already inactive'
                });
            }
            
            // Check for active assignments before deactivating
            const safetyCheck = await checkSupervisorDeletionSafety(supervisorId, db);
            
            if (safetyCheck.activeAssignments > 0) {
                return res.status(400).json({
                    error: 'Cannot deactivate supervisor with active assignments',
                    activeAssignments: safetyCheck.activeAssignments,
                    assignments: safetyCheck.assignments,
                    suggestion: 'Transfer assignments to another supervisor first'
                });
            }
            
            // Deactivate the supervisor
            await queryDB(
                'UPDATE users SET active = 0 WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            console.log(`👤 Supervisor ${supervisorId} (${supervisor[0].username}) deactivated`);
            
            res.json({ 
                success: true, 
                message: `Supervisor ${supervisor[0].username} has been deactivated`,
                supervisor: supervisor[0]
            });
            
        } catch (error) {
            console.error('Error deactivating supervisor:', error);
            res.status(500).json({ error: 'Failed to deactivate supervisor' });
        }
    });

    // Activate supervisor
    router.put('/supervisor/:id/activate', async (req, res) => {
        try {
            const supervisorId = req.params.id;
            
            // Check if supervisor exists
            const supervisor = await queryDB(
                'SELECT id, username, role, active FROM users WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            if (supervisor.length === 0) {
                return res.status(404).json({ 
                    error: 'Supervisor not found'
                });
            }
            
            if (supervisor[0].active === 1) {
                return res.status(400).json({ 
                    error: 'Supervisor is already active'
                });
            }
            
            // Activate the supervisor
            await queryDB(
                'UPDATE users SET active = 1 WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            console.log(`👤 Supervisor ${supervisorId} (${supervisor[0].username}) activated`);
            
            res.json({ 
                success: true, 
                message: `Supervisor ${supervisor[0].username} has been activated`,
                supervisor: supervisor[0]
            });
            
        } catch (error) {
            console.error('Error activating supervisor:', error);
            res.status(500).json({ error: 'Failed to activate supervisor' });
        }
    });

    // Get supervisor status and details
    router.get('/supervisor/:id/status', async (req, res) => {
        try {
            const supervisorId = req.params.id;
            
            // Get supervisor details with assignment count
            const supervisorQuery = `
                SELECT 
                    u.id,
                    u.username,
                    u.role,
                    u.active,
                    u.division_id,
                    u.city_id,
                    u.colony_id,
                    u.department_id,
                    d.name as division_name,
                    c.name as city_name,
                    col.name as colony_name,
                    dept.name as department_name,
                    COUNT(a.id) as active_assignments
                FROM users u
                LEFT JOIN divisions d ON u.division_id = d.id
                LEFT JOIN cities c ON u.city_id = c.id
                LEFT JOIN colonies col ON u.colony_id = col.id
                LEFT JOIN departments dept ON u.department_id = dept.id
                LEFT JOIN assignments a ON u.id = a.supervisor_id AND a.status IN ('active', 'assigned', 'in_progress')
                WHERE u.id = ? AND u.role = "supervisor"
                GROUP BY u.id
            `;
            
            const supervisor = await queryDB(supervisorQuery, [supervisorId]);
            
            if (supervisor.length === 0) {
                return res.status(404).json({ 
                    error: 'Supervisor not found'
                });
            }
            
            res.json({ 
                success: true,
                supervisor: supervisor[0]
            });
            
        } catch (error) {
            console.error('Error getting supervisor status:', error);
            res.status(500).json({ error: 'Failed to get supervisor status' });
        }
    });

    // Safe delete supervisor endpoint
    router.delete('/supervisor/:id/safe-delete', async (req, res) => {
        try {
            const supervisorId = req.params.id;
            const { forceDelete = false } = req.body;
            
            console.log(`🗑️ Safe delete request for supervisor ${supervisorId}, force: ${forceDelete}`);
            
            // Check if supervisor exists
            const supervisor = await queryDB(
                'SELECT id, username, role FROM users WHERE id = ? AND role = "supervisor"',
                [supervisorId]
            );
            
            if (supervisor.length === 0) {
                return res.status(404).json({ 
                    error: 'Supervisor not found'
                });
            }
            
            // Check deletion safety
            const safetyCheck = await checkSupervisorDeletionSafety(supervisorId, db);
            
            if (!forceDelete && safetyCheck.activeAssignments > 0) {
                return res.status(400).json({
                    error: 'Cannot delete supervisor with active assignments',
                    activeAssignments: safetyCheck.activeAssignments,
                    assignments: safetyCheck.assignments,
                    suggestion: 'Transfer assignments first or use forceDelete=true'
                });
            }
            
            let orphanedAssignments = 0;
            
            if (forceDelete && safetyCheck.activeAssignments > 0) {
                // Mark assignments as unassigned
                await queryDB(
                    'UPDATE assignments SET supervisor_id = NULL, status = ? WHERE supervisor_id = ? AND status IN (?, ?, ?)',
                    ['unassigned', supervisorId, 'active', 'assigned', 'in_progress']
                );
                orphanedAssignments = safetyCheck.activeAssignments;
                console.log(`⚠️ Force delete: ${orphanedAssignments} assignments became unassigned`);
            }
            
            // Delete the supervisor
            await queryDB('DELETE FROM users WHERE id = ? AND role = "supervisor"', [supervisorId]);
            
            console.log(`  Supervisor ${supervisor[0].username} (ID: ${supervisorId}) deleted successfully`);
            
            res.json({
                success: true,
                message: `Supervisor "${supervisor[0].username}" has been deleted`,
                deletedSupervisor: supervisor[0],
                orphanedAssignments: orphanedAssignments,
                forceDelete: forceDelete
            });
            
        } catch (error) {
            console.error('❌ Error in safe delete supervisor:', error);
            res.status(500).json({ 
                error: 'Failed to delete supervisor',
                details: error.message 
            });
        }
    });

    // Dashboard Stats API for AI Analytics
    router.get('/dashboard-stats', requireAuth, async (req, res) => {
        try {
            const userLevel = req.session.user?.level;
            const userLocation = req.session.user?.location;
            const userDivision = req.session.user?.division;
            
            // Check for division filter in query params (for AI Analytics)
            const divisionFilter = req.query.division;
            
            // Build base condition and params based on user level or division filter
            let baseCondition = '';
            let params = [];
            
            if (divisionFilter) {
                // Use division filter from query (for AI Analytics)
                baseCondition = `WHERE div.name = ?`;
                params = [divisionFilter];
            } else if (userLevel === 'division') {
                baseCondition = `WHERE div.name = ?`;
                params = [userDivision];
            } else if (userLevel === 'station' || userLevel === 'location') {
                baseCondition = `WHERE r.location = ?`;
                params = [userLocation];
            }

            // Get comprehensive statistics
            const stats = await Promise.all([
                // Total requests
                queryDB(`
                    SELECT COUNT(*) as total 
                    FROM maintenance_requests r 
                    ${divisionFilter ? 'JOIN divisions div ON r.division_id = div.id' : ''} 
                    ${baseCondition}
                `, params),
                
                // Status distribution
                queryDB(`
                    SELECT status, COUNT(*) as count 
                    FROM maintenance_requests r 
                    ${divisionFilter ? 'JOIN divisions div ON r.division_id = div.id' : ''} 
                    ${baseCondition} 
                    GROUP BY status
                `, params),
                
                // Department distribution (using departments table)
                queryDB(`
                    SELECT d.name as department, COUNT(r.id) as count 
                    FROM maintenance_requests r 
                    JOIN departments d ON r.department_id = d.id 
                    ${divisionFilter ? 'JOIN divisions div ON r.division_id = div.id' : ''} 
                    ${baseCondition} 
                    GROUP BY d.name 
                    ORDER BY count DESC
                `, params),
                
                // Location distribution
                queryDB(`
                    SELECT location, COUNT(*) as count 
                    FROM maintenance_requests r 
                    ${divisionFilter ? 'JOIN divisions div ON r.division_id = div.id' : ''} 
                    ${baseCondition} 
                    GROUP BY location 
                    ORDER BY count DESC LIMIT 10
                `, params),
                
                // Division distribution (using divisions table)
                queryDB(`
                    SELECT div.name as division_name, COUNT(r.id) as count 
                    FROM maintenance_requests r 
                    JOIN divisions div ON r.division_id = div.id 
                    ${baseCondition.replace('WHERE div.name = ?', '') ? baseCondition : ''} 
                    GROUP BY div.name
                `, divisionFilter ? [] : params),
                
                // Monthly trends (last 12 months)
                queryDB(`
                    SELECT 
                        strftime('%Y-%m', created_at) as month,
                        COUNT(*) as count
                    FROM maintenance_requests r 
                    ${divisionFilter ? 'JOIN divisions div ON r.division_id = div.id' : ''} 
                    ${baseCondition}
                    ${baseCondition ? 'AND' : 'WHERE'} created_at >= date('now', '-12 months')
                    GROUP BY strftime('%Y-%m', created_at)
                    ORDER BY month
                `, params),
                
                // Recent activity (last 30 days)
                queryDB(`
                    SELECT 
                        DATE(created_at) as date,
                        COUNT(*) as count
                    FROM maintenance_requests r 
                    ${divisionFilter ? 'JOIN divisions div ON r.division_id = div.id' : ''} 
                    ${baseCondition}
                    ${baseCondition ? 'AND' : 'WHERE'} created_at >= date('now', '-30 days')
                    GROUP BY DATE(created_at)
                    ORDER BY date DESC
                `, params),
                
                // User statistics
                queryDB(`SELECT role, COUNT(*) as count FROM users GROUP BY role`),
                
                // Assignment statistics
                queryDB(`
                    SELECT 
                        a.status,
                        COUNT(*) as count,
                        AVG(julianday('now') - julianday(a.assigned_at)) as avg_days_assigned
                    FROM assignments a
                    JOIN maintenance_requests r ON a.request_id = r.id
                    ${divisionFilter ? 'JOIN divisions div ON r.division_id = div.id' : ''} 
                    ${baseCondition}
                    GROUP BY a.status
                `, params)
            ]);

            const dashboardData = {
                totalRequests: stats[0][0]?.total || 0,
                statusDistribution: stats[1] || [],
                departmentDistribution: stats[2] || [],
                locationDistribution: stats[3] || [],
                divisionDistribution: stats[4] || [],
                monthlyTrends: stats[5] || [],
                recentActivity: stats[6] || [],
                userStatistics: stats[7] || [],
                assignmentStatistics: stats[8] || [],
                userContext: {
                    level: userLevel,
                    location: userLocation,
                    division: userDivision
                },
                filterApplied: divisionFilter || 'All Divisions'
            };

            res.json(dashboardData);
        } catch (error) {
            console.error('Dashboard stats error:', error);
            res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
        }
    });

    // Lightweight location endpoints used by supervisor creation and transfer modals
    router.get('/locations/divisions', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            const rows = user.role === 'admin_l2' && user.division_id
                ? await queryDB('SELECT id, name FROM divisions WHERE id = ? ORDER BY name', [user.division_id])
                : await queryDB('SELECT id, name FROM divisions ORDER BY name');
            res.json(rows);
        } catch (error) {
            console.error('Error fetching divisions:', error);
            res.status(500).json({ error: 'Failed to fetch divisions' });
        }
    });

    router.get('/locations/departments', requireAuth, requireAdmin, async (req, res) => {
        try {
            res.json(await queryDB('SELECT id, name FROM departments ORDER BY name'));
        } catch (error) {
            console.error('Error fetching departments:', error);
            res.status(500).json({ error: 'Failed to fetch departments' });
        }
    });

    router.get('/locations/cities/:divisionId', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            if (user.role === 'admin_l2' && String(user.division_id) !== String(req.params.divisionId)) {
                return res.status(403).json({ error: 'Division access denied' });
            }
            const rows = await queryDB(
                'SELECT id, name FROM cities WHERE division_id = ? ORDER BY name',
                [req.params.divisionId]
            );
            return res.json(rows);
        } catch (error) {
            console.error('Error fetching cities:', error);
            return res.status(500).json({ error: 'Failed to fetch cities' });
        }
    });

    router.get('/locations/colonies/:cityId', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            if (user.role === 'admin_l3' && String(user.city_id) !== String(req.params.cityId)) {
                return res.status(403).json({ error: 'City access denied' });
            }
            const rows = await queryDB(
                'SELECT id, name FROM colonies WHERE city_id = ? ORDER BY name',
                [req.params.cityId]
            );
            return res.json(rows);
        } catch (error) {
            console.error('Error fetching colonies:', error);
            return res.status(500).json({ error: 'Failed to fetch colonies' });
        }
    });

    // Admin request status update
    router.put('/requests/:id/status', requireAuth, requireAdmin, async (req, res) => {
        const allowedStatuses = new Set([
            'Pending',
            'Not Operable',
            'Resolved',
            'Forwarded to Other Department'
        ]);
        const status = String(req.body.status || '').trim();

        if (!allowedStatuses.has(status)) {
            return res.status(400).json({ error: 'Invalid request status' });
        }

        try {
            const user = req.session.user;
            const conditions = ['id = ?'];
            const params = [req.params.id];
            if (user.role === 'admin_l2' && user.division_id) {
                conditions.push('division_id = ?');
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                conditions.push('city_id = ?');
                params.push(user.city_id);
            }

            const result = await queryDB(
                `UPDATE maintenance_requests
                 SET status = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE ${conditions.join(' AND ')}`,
                [status, ...params]
            );
            if (result.changes === 0) {
                return res.status(404).json({ error: 'Request not found or access denied' });
            }

            await queryDB(
                'INSERT INTO status_history (request_id, status, updated_by) VALUES (?, ?, ?)',
                [req.params.id, status, user.id]
            );
            await queryDB(
                'UPDATE assignments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?',
                [status, req.params.id]
            );
            return res.json({ message: 'Request status updated successfully', status });
        } catch (error) {
            console.error('Error updating request status:', error);
            return res.status(500).json({ error: 'Failed to update request status' });
        }
    });

    // CSV export used by the admin dashboard
    router.get('/export', requireAuth, requireAdmin, async (req, res) => {
        try {
            const user = req.session.user;
            const conditions = [];
            const params = [];

            if (user.role === 'admin_l2' && user.division_id) {
                conditions.push('mr.division_id = ?');
                params.push(user.division_id);
            } else if (user.role === 'admin_l3' && user.city_id) {
                conditions.push('mr.city_id = ?');
                params.push(user.city_id);
            }
            if (req.query.status) {
                conditions.push('mr.status = ?');
                params.push(req.query.status);
            }
            if (req.query.department_id) {
                conditions.push('mr.department_id = ?');
                params.push(req.query.department_id);
            }

            const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
            const rows = await queryDB(`
                SELECT mr.request_id, mr.name, mr.employee_id, mr.designation,
                       mr.email, mr.mobile, d.name AS division, c.name AS city,
                       col.name AS colony, dept.name AS department, mr.location,
                       mr.description, mr.priority, mr.status, mr.created_at, mr.updated_at
                FROM maintenance_requests mr
                LEFT JOIN divisions d ON d.id = mr.division_id
                LEFT JOIN cities c ON c.id = mr.city_id
                LEFT JOIN colonies col ON col.id = mr.colony_id
                LEFT JOIN departments dept ON dept.id = mr.department_id
                ${whereClause}
                ORDER BY mr.created_at DESC
            `, params);

            const csv = new Parser().parse(rows);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="ramp-requests.csv"');
            return res.send(csv);
        } catch (error) {
            console.error('Error exporting requests:', error);
            return res.status(500).json({ error: 'Failed to export requests' });
        }
    });

    // Supervisor detail and compatibility management endpoints
    router.get('/supervisors/:id', requireAuth, requireAdmin, async (req, res) => {
        try {
            const rows = await queryDB(`
                SELECT u.id, u.username, u.full_name, u.employee_id, u.email, u.phone,
                       u.role, u.division_id, u.city_id, u.colony_id, u.department_id,
                       u.skills, u.notes, u.active, u.created_at, u.updated_at,
                       d.name AS division_name, c.name AS city_name,
                       col.name AS colony_name, dept.name AS department_name
                FROM users u
                LEFT JOIN divisions d ON d.id = u.division_id
                LEFT JOIN cities c ON c.id = u.city_id
                LEFT JOIN colonies col ON col.id = u.colony_id
                LEFT JOIN departments dept ON dept.id = u.department_id
                WHERE u.id = ? AND u.role = 'supervisor'
            `, [req.params.id]);
            if (!rows.length) {
                return res.status(404).json({ error: 'Supervisor not found' });
            }
            return res.json({ supervisor: rows[0] });
        } catch (error) {
            console.error('Error fetching supervisor:', error);
            return res.status(500).json({ error: 'Failed to fetch supervisor' });
        }
    });

    router.delete('/supervisors/:id', requireAuth, requireAdmin, async (req, res) => {
        try {
            const safety = await checkSupervisorDeletionSafety(req.params.id, db);
            if (!safety.canDelete) {
                return res.status(409).json({
                    error: 'Transfer active assignments before deleting this supervisor',
                    ...safety
                });
            }
            const result = await queryDB(
                `UPDATE users
                 SET active = 0, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND role = 'supervisor'`,
                [req.params.id]
            );
            if (result.changes === 0) {
                return res.status(404).json({ error: 'Supervisor not found' });
            }
            return res.json({ message: 'Supervisor deactivated successfully' });
        } catch (error) {
            console.error('Error deleting supervisor:', error);
            return res.status(500).json({ error: 'Failed to delete supervisor' });
        }
    });

    router.post('/reset-password/:id', requireAuth, requireAdmin, async (req, res) => {
        if (req.session.user.role !== 'admin_l1') {
            return res.status(403).json({ error: 'Only Level 1 admins can reset passwords' });
        }

        try {
            const newPassword = `${crypto.randomBytes(4).toString('hex')}Aa1!`;
            const passwordHash = await bcrypt.hash(newPassword, 10);
            const userRows = await queryDB(
                `SELECT username FROM users
                 WHERE id = ? AND role IN ('supervisor', 'admin_l2', 'admin_l3')`,
                [req.params.id]
            );
            if (!userRows.length) {
                return res.status(404).json({ error: 'User not found' });
            }
            await queryDB(
                'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [passwordHash, req.params.id]
            );
            return res.json({
                message: 'Password reset successfully',
                username: userRows[0].username,
                newPassword
            });
        } catch (error) {
            console.error('Error resetting password:', error);
            return res.status(500).json({ error: 'Failed to reset password' });
        }
    });

    const deleteLocation = async (tableName, id, dependencyQueries) => {
        for (const { sql, message } of dependencyQueries) {
            const rows = await queryDB(sql, [id]);
            if (rows[0].count > 0) {
                const error = new Error(message);
                error.status = 409;
                throw error;
            }
        }
        const result = await queryDB(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
        if (result.changes === 0) {
            const error = new Error('Location not found');
            error.status = 404;
            throw error;
        }
    };

    router.delete('/divisions/:id', requireAuth, requireAdmin, async (req, res) => {
        try {
            await deleteLocation('divisions', req.params.id, [
                { sql: 'SELECT COUNT(*) AS count FROM cities WHERE division_id = ?', message: 'Delete or move this division’s cities first' },
                { sql: 'SELECT COUNT(*) AS count FROM users WHERE division_id = ?', message: 'Reassign users from this division first' },
                { sql: 'SELECT COUNT(*) AS count FROM maintenance_requests WHERE division_id = ?', message: 'This division is used by maintenance requests' }
            ]);
            return res.json({ message: 'Division deleted successfully' });
        } catch (error) {
            return res.status(error.status || 500).json({ error: error.message });
        }
    });

    router.delete('/cities/:id', requireAuth, requireAdmin, async (req, res) => {
        try {
            await deleteLocation('cities', req.params.id, [
                { sql: 'SELECT COUNT(*) AS count FROM colonies WHERE city_id = ?', message: 'Delete or move this city’s colonies first' },
                { sql: 'SELECT COUNT(*) AS count FROM users WHERE city_id = ?', message: 'Reassign users from this city first' },
                { sql: 'SELECT COUNT(*) AS count FROM maintenance_requests WHERE city_id = ?', message: 'This city is used by maintenance requests' }
            ]);
            return res.json({ message: 'City deleted successfully' });
        } catch (error) {
            return res.status(error.status || 500).json({ error: error.message });
        }
    });

    router.delete('/colonies/:id', requireAuth, requireAdmin, async (req, res) => {
        try {
            await deleteLocation('colonies', req.params.id, [
                { sql: 'SELECT COUNT(*) AS count FROM users WHERE colony_id = ?', message: 'Reassign users from this colony first' },
                { sql: 'SELECT COUNT(*) AS count FROM maintenance_requests WHERE colony_id = ?', message: 'This colony is used by maintenance requests' }
            ]);
            return res.json({ message: 'Colony deleted successfully' });
        } catch (error) {
            return res.status(error.status || 500).json({ error: error.message });
        }
    });

    return router;
};

// Safe Supervisor Deletion Handler
async function checkSupervisorDeletionSafety(supervisorId, db) {
    return new Promise((resolve, reject) => {
        // Check for active assignments - include all statuses that indicate active work
        const activeAssignmentsQuery = `
            SELECT COUNT(*) as count 
            FROM assignments 
            WHERE supervisor_id = ? 
            AND LOWER(status) NOT IN ('resolved', 'completed', 'closed', 'cancelled', 'rejected')
        `;
        
        db.get(activeAssignmentsQuery, [supervisorId], (err, result) => {
            if (err) {
                console.error('Error checking active assignments:', err);
                return reject(err);
            }
            
            const activeCount = result.count;
            console.log(`🔍 Safety check for supervisor ${supervisorId}: ${activeCount} active assignments found`);
            
            if (activeCount > 0) {
                // Get assignment details
                const assignmentDetailsQuery = `
                    SELECT a.id, a.request_id, a.status, a.assigned_at,
                           mr.request_id as maintenance_request_id, 
                           mr.description
                    FROM assignments a
                    LEFT JOIN maintenance_requests mr ON a.request_id = mr.id
                    WHERE a.supervisor_id = ? 
                    AND LOWER(a.status) NOT IN ('resolved', 'completed', 'closed', 'cancelled', 'rejected')
                    ORDER BY a.assigned_at DESC
                `;
                
                db.all(assignmentDetailsQuery, [supervisorId], (err, assignments) => {
                    if (err) {
                        console.error('Error getting assignment details:', err);
                        return reject(err);
                    }
                    
                    console.log(`📋 Found ${assignments.length} active assignments for supervisor ${supervisorId}:`, 
                               assignments.map(a => `Request #${a.request_id} (${a.status})`));
                    
                    resolve({
                        canDelete: false,
                        reason: 'supervisor_has_active_assignments',
                        activeAssignments: activeCount,
                        assignments: assignments
                    });
                });
            } else {
                console.log(`  Supervisor ${supervisorId} has no active assignments - safe to delete`);
                resolve({
                    canDelete: true,
                    reason: 'no_active_assignments',
                    activeAssignments: 0,
                    assignments: []
                });
            }
        });
    });
}
