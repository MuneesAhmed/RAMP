const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = (db, emailService = null) => {
    const router = express.Router();

    // Login route
    router.post('/login', (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        db.get('SELECT * FROM users WHERE username = ? AND active = 1', [username], (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            bcrypt.compare(password, user.password, (bcryptErr, match) => {
                if (bcryptErr) {
                    console.error('Bcrypt error:', bcryptErr);
                    return res.status(500).json({ error: 'An error occurred during login. Please try again.' });
                }

                if (!match) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                // Store user data in session
                req.session.user = {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    division_id: user.division_id,
                    city_id: user.city_id,
                    department_id: user.department_id
                };

                // Save session
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('Session save error:', saveErr);
                        return res.status(500).json({ error: 'An error occurred during login. Please try again.' });
                    }

                    // Return success response
                    res.json({
                        message: 'Login successful',
                        user: {
                            username: user.username,
                            role: user.role
                        }
                    });
                });
            });
        });
    });

    // Logout route
    router.post('/logout', (req, res) => {
        if (req.session) {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                res.clearCookie('ramp.sid', { path: '/' });
                res.json({ message: 'Logout successful' });
            });
        } else {
            res.json({ message: 'Logout successful' });
        }
    });

    // Get current user info
    router.get('/me', (req, res) => {
        if (req.session && req.session.user) {
            res.json({ user: req.session.user });
        } else {
            res.status(401).json({ error: 'Not authenticated' });
        }
    });

    return router;
};
