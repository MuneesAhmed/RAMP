// AI Assistant Routes
const express = require('express');
const router = express.Router();

module.exports = (db, aiAssistant) => {
    
    // Chat with AI Assistant
    router.post('/chat', async (req, res) => {
        try {
            const { question, context } = req.body;
            const userRole = req.session.user ? req.session.user.role : 'user';
            
            if (!question || question.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Question is required'
                });
            }

            // Get system statistics for context
            const stats = await aiAssistant.getSystemStats(db);
            const systemContext = context + aiAssistant.formatContextWithStats(stats);

            // Get response from AI
            const response = await aiAssistant.askAssistant(question, userRole, systemContext);
            
            // Log the interaction
            if (req.session.user) {
                console.log(`🤖 AI Chat - User: ${req.session.user.username}, Role: ${userRole}, Question: ${question.substring(0, 50)}...`);
            }

            res.json(response);

        } catch (error) {
            console.error('AI Chat error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    });

    // Get AI Assistant status
    router.get('/status', async (req, res) => {
        try {
            const isAvailable = aiAssistant.isInitialized;
            
            res.json({
                success: true,
                available: isAvailable,
                model: aiAssistant.model,
                status: isAvailable ? 'ready' : 'initializing'
            });

        } catch (error) {
            console.error('AI Status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get AI status'
            });
        }
    });

    // Get suggested questions based on user role
    router.get('/suggestions', (req, res) => {
        try {
            const userRole = req.session.user ? req.session.user.role : 'user';
            const suggestions = getSuggestedQuestions(userRole);
            
            res.json({
                success: true,
                suggestions,
                role: userRole
            });

        } catch (error) {
            console.error('AI Suggestions error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get suggestions'
            });
        }
    });

    return router;
};

function getSuggestedQuestions(userRole) {
    const suggestions = {
        'admin': [
            "How do I assign multiple requests to a supervisor?",
            "What's the best way to manage overdue requests?",
            "How can I generate monthly maintenance reports?",
            "How do I create new supervisor accounts?",
            "What are the different user permission levels?",
            "How do I configure email notifications?",
            "How can I export request data to CSV?",
            "What should I do about unassigned requests?"
        ],
        'admin_l2': [
            "How do I manage requests in my division?",
            "How can I assign requests to supervisors in my area?",
            "How do I generate division-specific reports?",
            "What requests need immediate attention?",
            "How do I handle requests forwarded from other departments?",
            "How can I track supervisor performance in my division?"
        ],
        'admin_l3': [
            "How do I manage requests in my city?",
            "How can I prioritize urgent maintenance requests?",
            "How do I assign city-specific requests to supervisors?",
            "What's the status of requests in my area?",
            "How do I handle emergency maintenance requests?"
        ],
        'supervisor': [
            "How do I update the status of a maintenance request?",
            "How can I upload photos or documents to a request?",
            "What does each request status mean?",
            "How do I forward a request to another department?",
            "How can I communicate with the person who submitted the request?",
            "What should I do if I can't resolve a request?",
            "How do I mark a request as resolved?",
            "How can I see all my assigned requests?"
        ],
        'user': [
            "How does the RAMP system work?",
            "What are the different types of maintenance requests?",
            "How long does it typically take to resolve requests?",
            "Who can access my maintenance requests?"
        ]
    };

    return suggestions[userRole] || suggestions['user'];
}
