const { Ollama } = require('ollama');
const fs = require('fs');
const path = require('path');

class AIAssistantService {
    constructor() {
        this.ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' });
        this.model = process.env.OLLAMA_MODEL || 'gemma3:1b'; // Default to Gemma 3 1B model
        this.isInitialized = false;
        this.context = this.loadSystemContext();
    }

    async initialize() {
        try {
            // Check if Ollama is running and model is available
            const models = await this.ollama.list();
            const modelExists = models.models.some(m => m.name === this.model || m.name.includes(this.model.split(':')[0]));
            
            if (!modelExists) {
                console.log(`📦 Model ${this.model} not found. Available models:`);
                models.models.forEach(m => console.log(`   - ${m.name}`));
                console.log(`💡 Please ensure ${this.model} is installed: ollama pull ${this.model}`);
                return false;
            }
            
            this.isInitialized = true;
            console.log(`🤖 AI Assistant initialized with model: ${this.model}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize AI Assistant:', error.message);
            console.log('💡 Make sure Ollama is installed and running:');
            console.log('   - Install: https://ollama.ai/download');
            console.log('   - Run: ollama serve');
            return false;
        }
    }

    loadSystemContext() {
        return `You are an AI assistant for the Railway Maintenance Portal (RAMP) system. You help administrators and supervisors with their questions.

RESPONSE FORMATTING GUIDELINES:
- Use **bold text** for important terms and headers
- Use bullet points (-) for lists
- Use numbered lists (1., 2., 3.) for step-by-step instructions  
- Keep responses well-structured and easy to read
- Use short paragraphs for better readability
- Include practical examples when helpful

SYSTEM OVERVIEW:
RAMP is a **railway maintenance request management system** with these key components:

**Request Management:**
- Users submit maintenance requests for railway facilities
- Requests are tracked from submission to completion
- File uploads supported for documentation

**User Roles & Access:**
- **Admin L1**: Global access to all requests and supervisors
- **Admin L2**: Division-level access (specific railway divisions)  
- **Admin L3**: City-level access (specific cities within divisions)
- **Supervisor**: Handles assigned maintenance requests

**Request Statuses:**
- **Pending**: New requests awaiting assignment
- **Not Operable**: Issues that cannot be resolved
- **Resolved**: Successfully completed requests
- **Forwarded to Other Department**: Transferred requests

**Key Features:**
- Request submission and tracking
- Email notifications and confirmations
- Hierarchical access control based on geographic divisions
- Dashboard analytics and reporting
- File upload support for request documentation

**Common Tasks:**
- Creating and managing maintenance requests
- Assigning requests to supervisors
- Updating request statuses
- Generating reports and analytics
- Managing user accounts and permissions
- Handling email notifications

Always provide helpful, accurate information about the RAMP system. Be concise but thorough in your responses. Use formatting to make information easy to scan and understand.`;
    }

    async askAssistant(question, userRole = 'user', context = '') {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.isInitialized) {
            return {
                success: false,
                message: 'AI Assistant is not available. Please ensure Ollama is installed and running.',
                suggestion: 'Install Ollama from https://ollama.ai/download and run "ollama serve"'
            };
        }

        try {
            const roleContext = this.getRoleSpecificContext(userRole);
            
            // Enhanced prompting for DeepSeek models to get direct answers
            const isDeepSeekModel = this.model.includes('deepseek');
            let systemPrompt = `${this.context}\n\n${roleContext}\n\nUser Context: ${context}`;
            
            if (isDeepSeekModel) {
                systemPrompt += `\n\nIMPORTANT: Provide a direct, professional response without showing your reasoning process. Focus on actionable insights and clear analysis. Do not include phrases like "let me try to figure out" or "step by step" - just give the final analysis.`;
            }

            const response = await this.ollama.chat({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: question
                    }
                ],
                options: {
                    temperature: 0.3, // Lower temperature for more focused responses
                    num_predict: 600,
                    top_p: 0.9
                }
            });

            let responseText = response.message.content.trim();
            
            // Post-process DeepSeek responses to remove reasoning artifacts
            if (isDeepSeekModel) {
                responseText = this.cleanDeepSeekResponse(responseText);
            }

            return {
                success: true,
                response: responseText,
                model: this.model,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ AI Assistant error:', error);
            return {
                success: false,
                message: 'Failed to get response from AI Assistant',
                error: error.message
            };
        }
    }

    getRoleSpecificContext(userRole) {
        const contexts = {
            'admin': `You are assisting an Administrator who has access to:
- All maintenance requests across the system
- Supervisor management and assignments
- System analytics and reports
- User account management
- Email system configuration`,
            
            'admin_l2': `You are assisting a Division-level Administrator who has access to:
- Maintenance requests within their assigned division
- Supervisors within their division
- Division-specific analytics and reports`,
            
            'admin_l3': `You are assisting a City-level Administrator who has access to:
- Maintenance requests within their assigned city
- City-specific supervisors and assignments
- City-level analytics and reports`,
            
            'supervisor': `You are assisting a Supervisor who can:
- View and update assigned maintenance requests
- Change request statuses (Pending, Not Operable, Resolved, Forwarded)
- Upload documentation and photos
- Communicate with requesters via email`,
            
            'user': 'You are assisting a general user of the RAMP system.'
        };

        return contexts[userRole] || contexts['user'];
    }

    async getSystemStats(db) {
        try {
            return new Promise((resolve, reject) => {
                const stats = {};
                
                // Get request counts by status
                db.all(`
                    SELECT status, COUNT(*) as count 
                    FROM maintenance_requests 
                    GROUP BY status
                `, (err, statusCounts) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    stats.requestsByStatus = statusCounts;
                    
                    // Get total counts
                    db.get(`SELECT COUNT(*) as total FROM maintenance_requests`, (err, totalRequests) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        stats.totalRequests = totalRequests.total;
                        
                        // Get supervisor count
                        db.get(`SELECT COUNT(*) as total FROM users WHERE role LIKE '%supervisor%'`, (err, totalSupervisors) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            stats.totalSupervisors = totalSupervisors.total;
                            resolve(stats);
                        });
                    });
                });
            });
        } catch (error) {
            console.error('Error getting system stats:', error);
            return null;
        }
    }

    formatContextWithStats(stats) {
        if (!stats) return '';
        
        let context = '\nCurrent System Statistics:\n';
        context += `- Total Requests: ${stats.totalRequests}\n`;
        context += `- Total Supervisors: ${stats.totalSupervisors}\n`;
        context += '- Requests by Status:\n';
        
        stats.requestsByStatus.forEach(item => {
            context += `  * ${item.status}: ${item.count}\n`;
        });
        
        return context;
    }

    cleanDeepSeekResponse(response) {
        // Remove Chain of Thought reasoning from DeepSeek responses
        let cleaned = response;
        
        // Remove common reasoning phrases
        const reasoningPatterns = [
            /^Alright, let me try to figure out.*?\n\n/s,
            /^Let me approach this.*?\n\n/s,
            /^First, I need to understand.*?\n\n/s,
            /^Now, breaking down.*?\n\n/s,
            /^I should also consider.*?\n\n/s,
            /^Additionally,.*?\n\n/s,
            /^Overall, my goal.*?\n\n/s,
            /^Since.*?\n\n/s,
            /^Given that.*?\n\n/s,
        ];
        
        reasoningPatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });
        
        // Remove step-by-step reasoning paragraphs
        cleaned = cleaned.replace(/^(First|Second|Third|Additionally|Also|Furthermore|Moreover|Since|Given|Now|Overall|Making sure).*?\n\n/gm, '');
        
        // Clean up multiple newlines
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        
        // If the response starts with reasoning, find the first actionable content
        const lines = cleaned.split('\n');
        let startIndex = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Look for lines that start with actual analysis (headers, bullet points, etc.)
            if (line.match(/^(#|\*\*|##|###|\d+\.|•|-|Which|The|Based on|Analysis:|Executive Summary:|Detailed Analysis:|Insights)/)) {
                startIndex = i;
                break;
            }
        }
        
        if (startIndex > 0) {
            cleaned = lines.slice(startIndex).join('\n');
        }
        
        return cleaned.trim();
    }
}

module.exports = AIAssistantService;
