// Email Service Module
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs-extra');
const path = require('path');
const { emailConfig, getTransporter } = require('../config/email');

class EmailService {
    constructor() {
        this.transporter = null;
        this.templatesPath = path.join(__dirname, '../email-templates');
        this.emailQueue = [];
        this.isProcessing = false;
        this.rateLimiter = {
            count: 0,
            resetTime: Date.now() + 60000 // Reset every minute
        };
        
        this.initializeService();
    }

    async initializeService() {
        try {
            // Check if email is enabled
            if (process.env.EMAIL_ENABLED === 'false') {
                console.log('📧 Email service is disabled');
                return;
            }

            this.transporter = getTransporter();
            
            // Register Handlebars helpers
            this.registerHandlebarsHelpers();
            
            console.log('📧 Email service initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing email service:', error);
        }
    }

    registerHandlebarsHelpers() {
        // Helper for conditional checks
        handlebars.registerHelper('if', function(conditional, options) {
            if (conditional) {
                return options.fn(this);
            } else {
                return options.inverse(this);
            }
        });

        // Helper for formatting dates
        handlebars.registerHelper('formatDate', function(date) {
            if (!date) return 'N/A';
            return new Date(date).toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        });

        // Helper for formatting priority
        handlebars.registerHelper('formatPriority', function(priority) {
            const priorities = {
                'high': 'High Priority',
                'medium': 'Medium Priority',
                'low': 'Low Priority'
            };
            return priorities[priority] || 'Normal';
        });
    }

    async loadTemplate(templateName) {
        try {
            const templatePath = path.join(this.templatesPath, `${templateName}.html`);
            const baseTemplatePath = path.join(this.templatesPath, 'base.html');
            
            const [templateContent, baseTemplate] = await Promise.all([
                fs.readFile(templatePath, 'utf8'),
                fs.readFile(baseTemplatePath, 'utf8')
            ]);
            
            return { templateContent, baseTemplate };
        } catch (error) {
            console.error(`❌ Error loading template ${templateName}:`, error);
            throw error;
        }
    }

    async renderTemplate(templateName, data) {
        try {
            const { templateContent, baseTemplate } = await this.loadTemplate(templateName);
            
            // Compile the content template
            const contentTemplate = handlebars.compile(templateContent);
            const renderedContent = contentTemplate(data);
            
            // Compile the base template with rendered content
            const fullTemplate = handlebars.compile(baseTemplate);
            const renderedEmail = fullTemplate({
                ...data,
                content: renderedContent,
                timestamp: new Date().toLocaleString()
            });
            
            return renderedEmail;
        } catch (error) {
            console.error(`❌ Error rendering template ${templateName}:`, error);
            throw error;
        }
    }

    checkRateLimit() {
        const now = Date.now();
        
        // Reset counter if minute has passed
        if (now > this.rateLimiter.resetTime) {
            this.rateLimiter.count = 0;
            this.rateLimiter.resetTime = now + 60000;
        }
        
        // Check if we've exceeded the rate limit
        if (this.rateLimiter.count >= emailConfig.settings.rateLimit) {
            return false;
        }
        
        this.rateLimiter.count++;
        return true;
    }

    async sendEmail(options) {
        try {
            // Check if email service is available
            if (!this.transporter) {
                console.log('📧 Email service not available, skipping email');
                return false;
            }

            // Validate required fields
            if (!options.to || !options.subject) {
                throw new Error('Missing required email fields (to, subject)');
            }

            const mailOptions = {
                from: `${emailConfig.from.name} <${emailConfig.from.email}>`,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text || this.htmlToText(options.html),
                cc: options.cc,
                bcc: options.bcc,
                attachments: options.attachments,
                encoding: 'utf8',
                textEncoding: 'base64',
                headers: {
                    'X-Mailer': 'RAMP Railway Maintenance Portal',
                    'X-Priority': '3',
                    'Importance': 'Normal'
                }
            };

            console.log(`📧 Sending email to: ${options.to}`);
            console.log(`📧 Subject: ${options.subject}`);

            const result = await this.transporter.sendMail(mailOptions);
            console.log('  Email sent successfully:', result.messageId);
            
            return result;
        } catch (error) {
            console.error('❌ Error sending email:', error);
            throw error;
        }
    }

    async sendTemplateEmail(templateName, data, recipients) {
        try {
            // Render the email template
            const html = await this.renderTemplate(templateName, data);
            
            // Send email to each recipient
            const results = [];
            const recipientList = Array.isArray(recipients) ? recipients : [recipients];
            
            for (const recipient of recipientList) {
                try {
                    const result = await this.sendEmail({
                        to: recipient,
                        subject: data.subject,
                        html: html
                    });
                    results.push({ recipient, success: true, result });
                } catch (error) {
                    console.error(`❌ Failed to send email to ${recipient}:`, error);
                    results.push({ recipient, success: false, error: error.message });
                }
            }
            
            return results;
        } catch (error) {
            console.error(`❌ Error sending template email ${templateName}:`, error);
            throw error;
        }
    }

    // Queue email for rate-limited sending
    queueEmail(emailData) {
        this.emailQueue.push(emailData);
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing || this.emailQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.emailQueue.length > 0) {
            if (!this.checkRateLimit()) {
                // Wait for rate limit reset
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            const emailData = this.emailQueue.shift();
            try {
                await this.sendTemplateEmail(
                    emailData.template,
                    emailData.data,
                    emailData.recipients
                );
            } catch (error) {
                console.error('❌ Error processing queued email:', error);
            }
        }

        this.isProcessing = false;
    }

    // Smart hierarchical email notification for unassigned requests only
    async findAppropriateAdminEmails(requestData, db) {
        return new Promise((resolve, reject) => {
            const { division_id, city_id, department_id } = requestData;
            
            // Level 3 admin (most specific - city + department)
            let query = `
                SELECT u.username, u.role, u.division_id, u.city_id, u.department_id
                FROM users u 
                WHERE u.role = 'admin_l3' 
                AND u.active = 1 
                AND u.division_id = ? 
                AND u.city_id = ?
            `;
            
            db.all(query, [division_id, city_id], (err, level3Admins) => {
                if (err) return reject(err);
                
                if (level3Admins.length > 0) {
                    console.log('📧 Found Level 3 admin for unassigned request');
                    return resolve({ level: 3, admins: level3Admins });
                }
                
                // Level 2 admin (city level)
                query = `
                    SELECT u.username, u.role, u.division_id, u.city_id, u.department_id
                    FROM users u 
                    WHERE u.role = 'admin_l2' 
                    AND u.active = 1 
                    AND u.division_id = ? 
                    AND u.city_id = ?
                `;
                
                db.all(query, [division_id, city_id], (err, level2Admins) => {
                    if (err) return reject(err);
                    
                    if (level2Admins.length > 0) {
                        console.log('📧 Found Level 2 admin for unassigned request');
                        return resolve({ level: 2, admins: level2Admins });
                    }
                    
                    // Level 1 admin (highest level)
                    query = `
                        SELECT u.username, u.role, u.division_id, u.city_id, u.department_id
                        FROM users u 
                        WHERE u.role = 'admin_l1' 
                        AND u.active = 1
                    `;
                    
                    db.all(query, [], (err, level1Admins) => {
                        if (err) return reject(err);
                        
                        if (level1Admins.length > 0) {
                            console.log('📧 Found Level 1 admin for unassigned request');
                            return resolve({ level: 1, admins: level1Admins });
                        }
                        
                        console.log('⚠️ No admins found for unassigned request');
                        resolve({ level: 0, admins: [] });
                    });
                });
            });
        });
    }

    async sendUnassignedRequestAlert(requestData, db) {
        try {
            // Check if request has a supervisor assigned
            const checkAssignment = `
                SELECT supervisor_id FROM assignments 
                WHERE request_id = ? AND status = 'active'
            `;
            
            return new Promise((resolve, reject) => {
                db.get(checkAssignment, [requestData.id], async (err, assignment) => {
                    if (err) return reject(err);
                    
                    // If already assigned, don't send admin alert
                    if (assignment && assignment.supervisor_id) {
                        console.log(`📧 Request ${requestData.id} already assigned, skipping admin alert`);
                        return resolve();
                    }
                    
                    // Find appropriate admin
                    try {
                        const adminResult = await this.findAppropriateAdminEmails(requestData, db);
                        
                        if (adminResult.admins.length === 0) {
                            console.log('⚠️ No admins found for unassigned request alert');
                            return resolve();
                        }
                        
                        // Use text template for admin alert
                        const template = fs.readFileSync(
                            path.join(__dirname, '..', 'email-templates', 'unassigned-request-alert.txt'),
                            'utf8'
                        );
                        
                        const emailText = template
                            .replace(/{{requestId}}/g, requestData.id)
                            .replace(/{{location}}/g, requestData.location)
                            .replace(/{{description}}/g, requestData.description)
                            .replace(/{{name}}/g, requestData.name)
                            .replace(/{{designation}}/g, requestData.designation)
                            .replace(/{{email}}/g, requestData.email)
                            .replace(/{{mobile}}/g, requestData.mobile)
                            .replace(/{{employeeId}}/g, requestData.employee_id)
                            .replace(/{{priority}}/g, requestData.priority || 'Medium')
                            .replace(/{{submittedDate}}/g, requestData.submittedDate)
                            .replace(/{{estimatedCompletion}}/g, requestData.estimatedCompletion)
                            .replace(/{{divisionName}}/g, requestData.divisionName || 'N/A')
                            .replace(/{{cityName}}/g, requestData.cityName || 'N/A')
                            .replace(/{{departmentName}}/g, requestData.departmentName || 'N/A')
                            .replace(/{{adminDashboardUrl}}/g, `${process.env.BASE_URL || 'http://localhost:3000'}/admin`);

                        // Send to admin emails from .env as fallback
                        const adminEmails = this.getAdminEmails();
                        
                        const mailOptions = {
                            from: process.env.EMAIL_FROM,
                            to: adminEmails.join(','),
                            subject: `🚨 Unassigned Request Alert - Level ${adminResult.level} Admin Required`,
                            text: emailText
                        };

                        await this.transporter.sendMail(mailOptions);
                        console.log(`📧 Unassigned request alert sent to Level ${adminResult.level} admins`);
                        resolve();
                        
                    } catch (error) {
                        console.error('❌ Error sending unassigned request alert:', error);
                        reject(error);
                    }
                });
            });
        } catch (error) {
            console.error('❌ Error in sendUnassignedRequestAlert:', error);
            throw error;
        }
    }

    // This method is now deprecated - use sendUnassignedRequestAlert instead
    async sendNewRequestNotification(requestData, adminEmails) {
        console.log('⚠️ sendNewRequestNotification is deprecated, use sendUnassignedRequestAlert for smart notifications');
        return; // Do nothing - we use smart notifications now
    }

    async sendRequestConfirmation(requestData) {
        try {
            const template = fs.readFileSync(
                path.join(__dirname, '..', 'email-templates', 'simple-text-confirmation.txt'), 
                'utf8'
            );
            
            const emailText = template
                .replace(/{{requestId}}/g, requestData.id)
                .replace(/{{name}}/g, requestData.name)
                .replace(/{{location}}/g, requestData.location)
                .replace(/{{description}}/g, requestData.description)
                .replace(/{{submittedDate}}/g, requestData.submittedDate)
                .replace(/{{estimatedCompletion}}/g, requestData.estimatedCompletion)
                .replace(/{{divisionName}}/g, requestData.divisionName || 'N/A')
                .replace(/{{cityName}}/g, requestData.cityName || 'N/A')
                .replace(/{{departmentName}}/g, requestData.departmentName || 'N/A')
                .replace(/{{trackingUrl}}/g, `${process.env.BASE_URL || 'http://localhost:3000'}/track?id=${requestData.id}`);

            const mailOptions = {
                from: process.env.EMAIL_FROM,
                to: requestData.email || requestData.contact_email,
                subject: `  Request Confirmed - ID: ${requestData.id}`,
                text: emailText
            };

            await this.transporter.sendMail(mailOptions);
            console.log('📧 Confirmation email sent successfully (text format)');
        } catch (error) {
            console.error('❌ Error sending confirmation email:', error);
            throw error;
        }
    }

    async sendAssignmentNotification(requestData, supervisorEmail, assignedBy) {
        const data = {
            subject: `👤 New Assignment: Request #${requestData.id}`,
            requestId: requestData.id,
            description: requestData.description,
            location: requestData.location,
            requesterName: requestData.name,
            employeeId: requestData.employee_id,
            mobile: requestData.mobile,
            departmentName: requestData.department_name,
            assignedBy: assignedBy,
            assignmentDate: new Date().toLocaleString(),
            priority: requestData.priority || 'medium',
            priorityText: this.formatPriority(requestData.priority),
            supervisorDashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/supervisor`,
            additionalNotes: requestData.assignment_notes
        };

        return this.sendTemplateEmail('assignment-notification', data, supervisorEmail);
    }

    async sendStatusUpdateNotification(requestData, recipients, updatedBy) {
        const alertType = this.getAlertTypeForStatus(requestData.newStatus);
        
        const data = {
            subject: `📢 Status Update: Request #${requestData.id} - ${requestData.newStatus}`,
            alertType: alertType,
            requestId: requestData.id,
            description: requestData.description,
            location: requestData.location,
            oldStatus: requestData.oldStatus,
            newStatus: requestData.newStatus,
            newStatusClass: requestData.newStatus.toLowerCase().replace(' ', '-'),
            updatedBy: updatedBy,
            updateDate: new Date().toLocaleString(),
            supervisor: requestData.supervisor_name,
            completionTime: requestData.completion_time,
            statusComments: requestData.status_comments,
            nextSteps: requestData.next_steps,
            dashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/admin`
        };

        return this.sendTemplateEmail('status-update', data, recipients);
    }

    async sendOverdueAlert(requestData, recipients) {
        const daysOverdue = Math.floor((Date.now() - new Date(requestData.created_at)) / (1000 * 60 * 60 * 24));
        
        const data = {
            subject: `⚠️ OVERDUE ALERT: Request #${requestData.id} (${daysOverdue} days)`,
            requestId: requestData.id,
            description: requestData.description,
            location: requestData.location,
            submittedDate: new Date(requestData.created_at).toLocaleString(),
            daysOverdue: daysOverdue,
            priority: requestData.priority || 'high',
            priorityText: this.formatPriority(requestData.priority),
            currentStatus: requestData.status,
            supervisor: requestData.supervisor_name,
            requesterName: requestData.name,
            mobile: requestData.mobile,
            dashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/admin`
        };

        return this.sendTemplateEmail('overdue-alert', data, recipients);
    }

    async sendDailySummary(summaryData, recipients) {
        const data = {
            subject: `📊 Daily Summary Report - ${summaryData.reportDate}`,
            reportDate: summaryData.reportDate,
            newRequests: summaryData.newRequests,
            resolvedRequests: summaryData.resolvedRequests,
            pendingRequests: summaryData.pendingRequests,
            overdueRequests: summaryData.overdueRequests,
            activeSupervisors: summaryData.activeSupervisors,
            avgResolutionTime: summaryData.avgResolutionTime,
            departmentStats: summaryData.departmentStats,
            topIssues: summaryData.topIssues,
            criticalAlerts: summaryData.criticalAlerts,
            nextReportDate: summaryData.nextReportDate,
            dashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/admin`
        };

        return this.sendTemplateEmail('daily-summary', data, recipients);
    }

    // Helper methods
    formatPriority(priority) {
        const priorities = {
            'high': 'High Priority',
            'medium': 'Medium Priority',
            'low': 'Low Priority'
        };
        return priorities[priority] || 'Normal Priority';
    }

    getAlertTypeForStatus(status) {
        const statusMap = {
            'Resolved': 'success',
            'Pending': 'warning',
            'Not Operable': 'danger',
            'Forwarded to Other Department': 'info'
        };
        return statusMap[status] || 'info';
    }

    // Get estimated completion time based on department
    getEstimatedCompletion(departmentName) {
        const estimationMap = {
            'Electrical': '2-3 business days',
            'Civil': '3-5 business days',
            'Mechanical': '1-2 business days',
            'Plumbing': '1-2 business days',
            'Carpentry': '2-4 business days',
            'Painting': '3-5 business days',
            'Security': '1 business day',
            'Housekeeping': '1 business day',
            'IT': '1-2 business days',
            'Other': '2-3 business days'
        };
        return estimationMap[departmentName] || '2-3 business days';
    }

    // Convert HTML to plain text for email clients that don't support HTML
    htmlToText(html) {
        if (!html) return '';
        
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/h[1-6]>/gi, '\n\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
    }

    // Get admin emails from environment or database
    getAdminEmails() {
        const envEmails = process.env.ADMIN_EMAILS;
        if (envEmails) {
            return envEmails.split(',').map(email => email.trim());
        }
        return ['admin@railway.com']; // Default fallback
    }
}

// Export the class for instantiation
module.exports = EmailService;
