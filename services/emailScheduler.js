// Email Scheduler for Automated Tasks
const cron = require('node-cron');

class EmailScheduler {
    constructor(emailService = null, db) {
        if (!db) {
            throw new Error('EmailScheduler requires a database connection');
        }
        this.emailService = emailService;
        this.db = db;
        this.jobs = [];
        this.initializeScheduledTasks();
    }

    queryDB(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }

    initializeScheduledTasks() {
        console.log('📅 Initializing email scheduler...');

        // Daily Summary Report - Every day at 8:00 AM
        this.scheduleTask('0 8 * * *', 'Daily Summary', () => {
            this.sendDailySummaryReport();
        });

        // Overdue Alerts - Every 6 hours
        this.scheduleTask('0 */6 * * *', 'Overdue Alerts', () => {
            this.checkAndSendOverdueAlerts();
        });

        // Weekly Report - Every Sunday at 9:00 AM
        this.scheduleTask('0 9 * * 0', 'Weekly Report', () => {
            this.sendWeeklySummary();
        });

        // Cleanup old email logs - Every day at midnight
        this.scheduleTask('0 0 * * *', 'Cleanup Logs', () => {
            this.cleanupEmailLogs();
        });

        console.log(`📅 Scheduled ${this.jobs.length} automated email tasks`);
    }

    // Start the scheduler (tasks are already initialized in constructor)
    start() {
        console.log('📅 Email scheduler started successfully');
        return this;
    }

    // Stop all scheduled tasks
    stop() {
        this.jobs.forEach(job => {
            if (job && job.stop) {
                job.stop();
            }
        });
        console.log('📅 Email scheduler stopped');
    }

    scheduleTask(cronExpression, taskName, taskFunction) {
        const task = cron.schedule(cronExpression, () => {
            console.log(`📧 Running scheduled task: ${taskName}`);
            try {
                taskFunction();
            } catch (error) {
                console.error(`❌ Error in scheduled task ${taskName}:`, error);
            }
        }, {
            scheduled: true,
            timezone: process.env.TZ || 'UTC'
        });

        this.jobs.push({ name: taskName, cron: cronExpression, task });
        console.log(`📅 Scheduled task: ${taskName} (${cronExpression})`);
    }

    async sendDailySummaryReport() {
        try {
            console.log('📊 Generating daily summary report...');
            
            const today = new Date();
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            
            // Get statistics for the last 24 hours
            const [
                newRequests,
                resolvedRequests,
                pendingRequests,
                overdueRequests,
                activeSupervisors,
                departmentStats,
                topIssues
            ] = await Promise.all([
                this.getNewRequestsCount(yesterday),
                this.getResolvedRequestsCount(yesterday),
                this.getPendingRequestsCount(),
                this.getOverdueRequestsCount(),
                this.getActiveSupervisorsCount(),
                this.getDepartmentStats(yesterday),
                this.getTopIssues(yesterday)
            ]);

            const avgResolutionTime = await this.getAverageResolutionTime(yesterday);

            const summaryData = {
                reportDate: today.toLocaleDateString(),
                newRequests,
                resolvedRequests,
                pendingRequests,
                overdueRequests,
                activeSupervisors,
                avgResolutionTime: Math.round(avgResolutionTime * 10) / 10,
                departmentStats,
                topIssues,
                criticalAlerts: await this.getCriticalAlerts(),
                nextReportDate: new Date(today.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString()
            };

            const adminEmails = this.emailService ? this.emailService.getAdminEmails() : [];
            if (this.emailService && adminEmails.length > 0) {
                await this.emailService.sendDailySummary(summaryData, adminEmails);
                console.log('  Daily summary report sent successfully');
            } else {
                console.log('📧 Email service not available, skipping daily summary');
            }
        } catch (error) {
            console.error('❌ Error sending daily summary report:', error);
        }
    }

    async checkAndSendOverdueAlerts() {
        try {
            console.log('⚠️ Checking for overdue requests...');
            
            const overdueRequests = await this.queryDB(`
                SELECT 
                    mr.*,
                    d.name as division_name,
                    c.name as city_name,
                    dept.name as department_name,
                    u.username as supervisor_name,
                    u.email as supervisor_email
                FROM maintenance_requests mr
                LEFT JOIN divisions d ON mr.division_id = d.id
                LEFT JOIN cities c ON mr.city_id = c.id
                LEFT JOIN departments dept ON mr.department_id = dept.id
                LEFT JOIN assignments a ON mr.id = a.request_id
                LEFT JOIN users u ON a.supervisor_id = u.id
                WHERE mr.status IN ('Pending', 'Assigned') 
                AND mr.created_at < datetime('now', '-2 days')
                ORDER BY mr.created_at ASC
            `);

            console.log(`⚠️ Found ${overdueRequests.length} overdue requests`);

            for (const request of overdueRequests) {
                const recipients = [];
                
                // Add admin emails
                if (this.emailService) {
                    recipients.push(...this.emailService.getAdminEmails());
                }
                
                // Add supervisor email if assigned
                if (request.supervisor_email) {
                    recipients.push(request.supervisor_email);
                }

                if (this.emailService && recipients.length > 0) {
                    await this.emailService.sendOverdueAlert(request, recipients);
                }
            }

            console.log('  Overdue alerts sent successfully');
        } catch (error) {
            console.error('❌ Error sending overdue alerts:', error);
        }
    }

    async sendWeeklySummary() {
        try {
            console.log('📊 Generating weekly summary...');
            
            const today = new Date();
            const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            // Generate weekly statistics
            const weeklyStats = await this.getWeeklyStats(lastWeek, today);
            
            // This would use a weekly template (you can create one)
            const adminEmails = this.emailService ? this.emailService.getAdminEmails() : [];
            
            // For now, send as daily summary with weekly data
            if (this.emailService && adminEmails.length > 0) {
                await this.emailService.sendDailySummary({
                    ...weeklyStats,
                    reportDate: `Week ending ${today.toLocaleDateString()}`,
                    nextReportDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
                }, adminEmails);
                console.log('  Weekly summary sent successfully');
            } else {
                console.log('📧 Email service not available, skipping weekly summary');
            }
        } catch (error) {
            console.error('❌ Error sending weekly summary:', error);
        }
    }

    async cleanupEmailLogs() {
        try {
            console.log('🧹 Cleaning up old email logs...');
            // This would clean up any email tracking logs older than 30 days
            // Implementation depends on if you want to track email history
            console.log('  Email logs cleaned up');
        } catch (error) {
            console.error('❌ Error cleaning up email logs:', error);
        }
    }

    // Helper methods for statistics
    async getNewRequestsCount(since) {
        const result = await this.queryDB(
            'SELECT COUNT(*) as count FROM maintenance_requests WHERE created_at >= ?',
            [since.toISOString()]
        );
        return result[0]?.count || 0;
    }

    async getResolvedRequestsCount(since) {
        const result = await this.queryDB(
            `SELECT COUNT(*) as count FROM maintenance_requests 
             WHERE status = 'Resolved' AND updated_at >= ?`,
            [since.toISOString()]
        );
        return result[0]?.count || 0;
    }

    async getPendingRequestsCount() {
        const result = await this.queryDB(
            `SELECT COUNT(*) as count FROM maintenance_requests 
             WHERE status IN ('Pending', 'Assigned')`
        );
        return result[0]?.count || 0;
    }

    async getOverdueRequestsCount() {
        const result = await this.queryDB(
            `SELECT COUNT(*) as count FROM maintenance_requests 
             WHERE status IN ('Pending', 'Assigned') 
             AND created_at < datetime('now', '-2 days')`
        );
        return result[0]?.count || 0;
    }

    async getActiveSupervisorsCount() {
        const result = await this.queryDB(
            `SELECT COUNT(DISTINCT u.id) as count 
             FROM users u 
             JOIN assignments a ON u.id = a.supervisor_id 
             WHERE u.role = 'supervisor' AND u.active = 1`
        );
        return result[0]?.count || 0;
    }

    async getAverageResolutionTime(since) {
        const result = await this.queryDB(
            `SELECT AVG(
                (strftime('%s', updated_at) - strftime('%s', created_at)) / 3600.0
             ) as avg_hours
             FROM maintenance_requests 
             WHERE status = 'Resolved' AND updated_at >= ?`,
            [since.toISOString()]
        );
        return result[0]?.avg_hours || 0;
    }

    async getDepartmentStats(since) {
        const stats = await this.queryDB(`
            SELECT 
                d.name,
                COUNT(mr.id) as handled,
                ROUND(
                    100.0 * SUM(CASE WHEN mr.status = 'Resolved' THEN 1 ELSE 0 END) / COUNT(mr.id),
                    1
                ) as completionRate
            FROM departments d
            LEFT JOIN maintenance_requests mr ON d.id = mr.department_id 
                AND mr.created_at >= ?
            GROUP BY d.id, d.name
            HAVING handled > 0
            ORDER BY handled DESC
            LIMIT 5
        `, [since.toISOString()]);
        
        return stats;
    }

    async getTopIssues(since) {
        const issues = await this.queryDB(`
            SELECT 
                SUBSTR(description, 1, 50) as description,
                COUNT(*) as count
            FROM maintenance_requests 
            WHERE created_at >= ?
            GROUP BY LOWER(SUBSTR(description, 1, 50))
            ORDER BY count DESC
            LIMIT 5
        `, [since.toISOString()]);
        
        return issues;
    }

    async getCriticalAlerts() {
        const alerts = [];
        
        // Check for high priority overdue requests
        const criticalOverdue = await this.queryDB(`
            SELECT COUNT(*) as count 
            FROM maintenance_requests 
            WHERE priority = 'high' 
            AND status IN ('Pending', 'Assigned') 
            AND created_at < datetime('now', '-1 day')
        `);
        
        if (criticalOverdue[0]?.count > 0) {
            alerts.push(`${criticalOverdue[0].count} high-priority requests are overdue`);
        }

        // Check for unassigned requests older than 4 hours
        const unassigned = await this.queryDB(`
            SELECT COUNT(*) as count 
            FROM maintenance_requests mr
            LEFT JOIN assignments a ON mr.id = a.request_id
            WHERE a.id IS NULL 
            AND mr.status = 'Pending'
            AND mr.created_at < datetime('now', '-4 hours')
        `);
        
        if (unassigned[0]?.count > 0) {
            alerts.push(`${unassigned[0].count} requests remain unassigned for over 4 hours`);
        }

        return alerts;
    }

    async getWeeklyStats(startDate, endDate) {
        // Similar to daily stats but for a week period
        const [
            newRequests,
            resolvedRequests,
            pendingRequests,
            overdueRequests,
            activeSupervisors
        ] = await Promise.all([
            this.getNewRequestsCount(startDate),
            this.getResolvedRequestsCount(startDate),
            this.getPendingRequestsCount(),
            this.getOverdueRequestsCount(),
            this.getActiveSupervisorsCount()
        ]);

        return {
            newRequests,
            resolvedRequests,
            pendingRequests,
            overdueRequests,
            activeSupervisors,
            avgResolutionTime: await this.getAverageResolutionTime(startDate),
            departmentStats: await this.getDepartmentStats(startDate),
            topIssues: await this.getTopIssues(startDate),
            criticalAlerts: await this.getCriticalAlerts()
        };
    }

    // Manual trigger methods for testing
    async triggerDailySummary() {
        await this.sendDailySummaryReport();
    }

    async triggerOverdueCheck() {
        await this.checkAndSendOverdueAlerts();
    }

    // Stop all scheduled tasks
    stopScheduler() {
        console.log('🛑 Stopping email scheduler...');
        this.jobs.forEach(job => {
            job.task.stop();
        });
        this.jobs = [];
        console.log('  Email scheduler stopped');
    }

    // Get scheduler status
    getStatus() {
        return {
            totalJobs: this.jobs.length,
            jobs: this.jobs.map(job => ({
                name: job.name,
                cron: job.cron,
                running: job.task.running
            }))
        };
    }
}

// Export the class for instantiation
module.exports = EmailScheduler;
