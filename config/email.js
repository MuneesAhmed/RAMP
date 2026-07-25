// Email Configuration
const nodemailer = require('nodemailer');
require('dotenv').config();

// Email configuration
const emailConfig = {
    // SMTP Configuration - Update these with your email provider settings
    smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER || 'your-email@gmail.com',
            pass: process.env.SMTP_PASS || 'your-app-password'
        }
    },
    
    // Default sender information
    from: {
        name: process.env.FROM_NAME || 'RAMP - Railway Maintenance Portal',
        email: process.env.FROM_EMAIL || 'noreply@ramp-railway.com'
    },
    
    // Email settings
    settings: {
        retryAttempts: 3,
        retryDelay: 5000, // 5 seconds
        maxConcurrent: 5,
        rateLimit: 10 // emails per minute
    }
};

// Create transporter
let transporter = null;

function createTransporter() {
    try {
        const transporter = nodemailer.createTransport({
            host: emailConfig.smtp.host,
            port: emailConfig.smtp.port,
            secure: emailConfig.smtp.secure,
            auth: {
                user: emailConfig.smtp.auth.user,
                pass: emailConfig.smtp.auth.pass
            }
        });
        
        // Verify connection configuration
        transporter.verify(function(error, success) {
            if (error) {
                console.log('❌ Email transporter verification failed:', error.message);
                console.log('💡 Please check your SMTP configuration in .env file');
            } else {
                console.log('  Email server is ready to send messages');
            }
        });
        
        return transporter;
    } catch (error) {
        console.error('❌ Error creating email transporter:', error);
        return null;
    }
}

// Get transporter instance
function getTransporter() {
    if (!transporter) {
        transporter = createTransporter();
    }
    return transporter;
}

module.exports = {
    emailConfig,
    getTransporter,
    createTransporter
};
