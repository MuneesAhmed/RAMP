// AI Assistant Widget
class AIAssistant {
    constructor() {
        this.isVisible = false;
        this.isTyping = false;
        this.chatHistory = [];
        this.init();
    }

    init() {
        this.createWidget();
        this.checkAIStatus();
        this.loadSuggestions();
    }

    createWidget() {
        // Create AI Assistant button
        const aiButton = document.createElement('button');
        aiButton.id = 'ai-assistant-button';
        aiButton.className = 'ai-assistant-btn';
        aiButton.innerHTML = '🤖';
        aiButton.title = 'AI Assistant';
        aiButton.onclick = () => this.toggleWidget();

        // Create AI Assistant widget
        const aiWidget = document.createElement('div');
        aiWidget.id = 'ai-assistant-widget';
        aiWidget.className = 'ai-assistant-widget hidden';
        aiWidget.innerHTML = `
            <div class="ai-header">
                <h4>🤖 RAMP AI Assistant</h4>
                <button class="ai-close" onclick="aiAssistant.toggleWidget()">×</button>
            </div>
            <div class="ai-status" id="ai-status">
                <span class="status-indicator">●</span>
                <span class="status-text">Checking AI status...</span>
            </div>
            <div class="ai-chat" id="ai-chat">
                <div class="ai-messages" id="ai-messages">
                    <div class="ai-message ai-system">
                        <div class="message-content">
                            <h6 class="ai-header">🤖 RAMP AI Assistant</h6>
                            <p>Hello! I'm your **Railway Maintenance Portal** assistant. I can help you with:</p>
                            <ul class="ai-list">
                                <li class="ai-list-item">Understanding the RAMP system</li>
                                <li class="ai-list-item">Managing maintenance requests</li>
                                <li class="ai-list-item">User roles and permissions</li>
                                <li class="ai-list-item">System navigation and features</li>
                            </ul>
                            <p>Click on the suggestions below or ask me anything!</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="ai-suggestions" id="ai-suggestions"></div>
            <div class="ai-input-container">
                <textarea id="ai-input" placeholder="Ask me anything about RAMP..." rows="2"></textarea>
                <button id="ai-send" onclick="aiAssistant.sendMessage()">Send</button>
            </div>
        `;

        // Add CSS styles
        const styles = document.createElement('style');
        styles.textContent = `
            .ai-assistant-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: #007bff;
                color: white;
                border: none;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,123,255,0.4);
                z-index: 1000;
                transition: all 0.3s ease;
            }

            .ai-assistant-btn:hover {
                background: #0056b3;
                transform: scale(1.1);
            }

            .ai-assistant-widget {
                position: fixed;
                bottom: 90px;
                right: 20px;
                width: 400px;
                height: 500px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                z-index: 1001;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                transition: all 0.3s ease;
            }

            .ai-assistant-widget.hidden {
                display: none;
            }

            .ai-header {
                background: #007bff;
                color: white;
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .ai-header h4 {
                margin: 0;
                font-size: 16px;
            }

            .ai-close {
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                width: 25px;
                height: 25px;
            }

            .ai-status {
                padding: 10px 15px;
                border-bottom: 1px solid #eee;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .status-indicator {
                font-size: 8px;
            }

            .status-indicator.online { color: #28a745; }
            .status-indicator.offline { color: #dc3545; }

            .ai-chat {
                flex: 1;
                overflow-y: auto;
                padding: 15px;
            }

            .ai-message {
                margin-bottom: 15px;
            }

            .ai-message.ai-user {
                text-align: right;
            }

            .ai-message.ai-system .message-content {
                background: #f8f9fa;
                border-left: 4px solid #007bff;
            }

            .ai-message.ai-user .message-content {
                background: #007bff;
                color: white;
                margin-left: 50px;
            }

            .ai-message.ai-assistant .message-content {
                background: #e9ecef;
                margin-right: 50px;
            }

            .message-content {
                padding: 10px 15px;
                border-radius: 10px;
                display: inline-block;
                max-width: 100%;
                word-wrap: break-word;
                font-size: 14px;
                line-height: 1.4;
            }

            /* AI Response Formatting Styles */
            .ai-message .ai-header {
                margin: 8px 0 4px 0;
                font-weight: bold;
                color: #333;
            }

            .ai-message .ai-list {
                margin: 8px 0;
                padding-left: 20px;
            }

            .ai-message .ai-numbered-list {
                margin: 8px 0;
                padding-left: 20px;
            }

            .ai-message .ai-list-item,
            .ai-message .ai-numbered-item {
                margin: 4px 0;
                list-style-position: outside;
            }

            .ai-message .ai-code-block {
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 4px;
                padding: 12px;
                margin: 8px 0;
                overflow-x: auto;
                font-family: 'Courier New', monospace;
                font-size: 12px;
            }

            .ai-message .ai-inline-code {
                background: #f1f3f4;
                padding: 2px 4px;
                border-radius: 3px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
            }

            .ai-message p {
                margin: 8px 0;
            }

            .ai-message p:first-child {
                margin-top: 0;
            }

            .ai-message p:last-child {
                margin-bottom: 0;
            }

            .ai-message strong {
                font-weight: 600;
                color: #2c3e50;
            }

            .ai-message em {
                font-style: italic;
                color: #7f8c8d;
            }

            /* Typing indicator animation */
            .ai-typing-indicator {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-bottom: 4px;
            }

            .typing-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background-color: #007bff;
                animation: typing-bounce 1.4s infinite ease-in-out;
            }

            .typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .typing-dot:nth-child(2) { animation-delay: -0.16s; }
            .typing-dot:nth-child(3) { animation-delay: 0s; }

            @keyframes typing-bounce {
                0%, 80%, 100% {
                    transform: scale(0.8);
                    opacity: 0.5;
                }
                40% {
                    transform: scale(1);
                    opacity: 1;
                }
            }

            .ai-typing {
                font-style: italic;
                color: #6c757d;
                padding: 10px 15px;
            }

            .ai-suggestions {
                padding: 0 15px;
                max-height: 100px;
                overflow-y: auto;
            }

            .suggestion-chip {
                display: inline-block;
                background: #e9ecef;
                padding: 5px 10px;
                margin: 2px;
                border-radius: 15px;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.2s;
            }

            .suggestion-chip:hover {
                background: #dee2e6;
            }

            .ai-input-container {
                padding: 15px;
                border-top: 1px solid #eee;
                display: flex;
                gap: 10px;
            }

            #ai-input {
                flex: 1;
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 8px 12px;
                resize: none;
                font-family: inherit;
            }

            #ai-send {
                background: #007bff;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 8px 16px;
                cursor: pointer;
                transition: background 0.2s;
            }

            #ai-send:hover {
                background: #0056b3;
            }

            #ai-send:disabled {
                background: #6c757d;
                cursor: not-allowed;
            }

            @media (max-width: 768px) {
                .ai-assistant-widget {
                    width: calc(100vw - 40px);
                    height: calc(100vh - 140px);
                    right: 20px;
                    left: 20px;
                }
            }
        `;

        document.head.appendChild(styles);
        document.body.appendChild(aiButton);
        document.body.appendChild(aiWidget);

        // Handle Enter key in input
        document.getElementById('ai-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    toggleWidget() {
        const widget = document.getElementById('ai-assistant-widget');
        this.isVisible = !this.isVisible;
        
        if (this.isVisible) {
            widget.classList.remove('hidden');
            document.getElementById('ai-input').focus();
        } else {
            widget.classList.add('hidden');
        }
    }

    async checkAIStatus() {
        try {
            const response = await fetch('/api/ai/status');
            const data = await response.json();
            
            const statusElement = document.getElementById('ai-status');
            const indicator = statusElement.querySelector('.status-indicator');
            const text = statusElement.querySelector('.status-text');
            
            if (data.available) {
                indicator.className = 'status-indicator online';
                text.textContent = `AI Assistant Ready (${data.model})`;
            } else {
                indicator.className = 'status-indicator offline';
                text.textContent = 'AI Assistant Unavailable';
            }
        } catch (error) {
            console.error('Failed to check AI status:', error);
            const statusElement = document.getElementById('ai-status');
            const indicator = statusElement.querySelector('.status-indicator');
            const text = statusElement.querySelector('.status-text');
            indicator.className = 'status-indicator offline';
            text.textContent = 'AI Assistant Unavailable';
        }
    }

    async loadSuggestions() {
        try {
            const response = await fetch('/api/ai/suggestions');
            const data = await response.json();
            
            if (data.success && data.suggestions.length > 0) {
                const suggestionsContainer = document.getElementById('ai-suggestions');
                suggestionsContainer.innerHTML = data.suggestions
                    .slice(0, 6) // Show first 6 suggestions
                    .map(suggestion => 
                        `<span class="suggestion-chip" onclick="aiAssistant.askSuggestion('${suggestion.replace(/'/g, "\\'")}')">${suggestion}</span>`
                    ).join('');
            }
        } catch (error) {
            console.error('Failed to load suggestions:', error);
        }
    }

    askSuggestion(question) {
        document.getElementById('ai-input').value = question;
        this.sendMessage();
    }

    async sendMessage() {
        const input = document.getElementById('ai-input');
        const question = input.value.trim();
        
        if (!question || this.isTyping) return;
        
        // Add user message to chat
        this.addMessage(question, 'user');
        input.value = '';
        
        // Show typing indicator
        this.showTyping();
        
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    question: question,
                    context: this.getPageContext()
                })
            });
            
            const data = await response.json();
            
            this.hideTyping();
            
            if (data.success) {
                this.addMessage(data.response, 'assistant');
            } else {
                this.addMessage(data.message || 'Sorry, I couldn\'t process your request right now.', 'assistant');
            }
            
        } catch (error) {
            console.error('AI Chat error:', error);
            this.hideTyping();
            this.addMessage('Sorry, there was an error connecting to the AI assistant.', 'assistant');
        }
    }

    addMessage(content, sender) {
        const messagesContainer = document.getElementById('ai-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ai-${sender}`;
        
        // Format the content based on sender
        let formattedContent = content;
        if (sender === 'assistant') {
            formattedContent = this.formatAIResponse(content);
        }
        
        messageDiv.innerHTML = `<div class="message-content">${formattedContent}</div>`;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        this.chatHistory.push({ content, sender, timestamp: new Date() });
    }

    formatAIResponse(content) {
        // Convert markdown-like formatting to HTML
        let formatted = content
            // Bold text (**text** or __text__)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>')
            
            // Italic text (*text* or _text_)
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            
            // Code blocks (```code```)
            .replace(/```([\s\S]*?)```/g, '<pre class="ai-code-block"><code>$1</code></pre>')
            
            // Inline code (`code`)
            .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>')
            
            // Headers (## Header)
            .replace(/^### (.*$)/gm, '<h6 class="ai-header">$1</h6>')
            .replace(/^## (.*$)/gm, '<h5 class="ai-header">$1</h5>')
            .replace(/^# (.*$)/gm, '<h4 class="ai-header">$1</h4>')
            
            // Lists (- item or * item)
            .replace(/^\s*[-*]\s+(.*$)/gm, '<li class="ai-list-item">$1</li>')
            
            // Numbers lists (1. item)
            .replace(/^\s*\d+\.\s+(.*$)/gm, '<li class="ai-numbered-item">$1</li>')
            
            // Line breaks
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        // Wrap list items in proper ul tags
        formatted = formatted.replace(/(<li class="ai-list-item">.*?<\/li>)/g, function(match) {
            return match;
        });

        // Group consecutive list items
        formatted = formatted.replace(/(<li class="ai-list-item">.*?<\/li>)(\s*<li class="ai-list-item">.*?<\/li>)*/g, function(match) {
            return '<ul class="ai-list">' + match + '</ul>';
        });

        // Group consecutive numbered items
        formatted = formatted.replace(/(<li class="ai-numbered-item">.*?<\/li>)(\s*<li class="ai-numbered-item">.*?<\/li>)*/g, function(match) {
            return '<ol class="ai-numbered-list">' + match + '</ol>';
        });

        // Wrap in paragraphs if not already wrapped
        if (!formatted.includes('<p>') && !formatted.includes('<ul>') && !formatted.includes('<ol>') && !formatted.includes('<h')) {
            formatted = '<p>' + formatted + '</p>';
        }

        return formatted;
    }

    showTyping() {
        this.isTyping = true;
        const messagesContainer = document.getElementById('ai-messages');
        const typingDiv = document.createElement('div');
        typingDiv.id = 'ai-typing';
        typingDiv.className = 'ai-message ai-assistant';
        typingDiv.innerHTML = `
            <div class="message-content">
                <div class="ai-typing-indicator">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
                <em style="font-size: 12px; color: #6c757d;">AI is thinking...</em>
            </div>
        `;
        
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        document.getElementById('ai-send').disabled = true;
    }

    hideTyping() {
        this.isTyping = false;
        const typingDiv = document.getElementById('ai-typing');
        if (typingDiv) {
            typingDiv.remove();
        }
        document.getElementById('ai-send').disabled = false;
    }

    getPageContext() {
        // Get context from current page
        const path = window.location.pathname;
        let context = `Current page: ${path}`;
        
        // Add page-specific context
        if (path.includes('admin')) {
            context += '\nUser is on admin dashboard';
        } else if (path.includes('supervisor')) {
            context += '\nUser is on supervisor dashboard';
        }
        
        // Add any visible data from the page
        const title = document.title;
        if (title) {
            context += `\nPage title: ${title}`;
        }
        
        return context;
    }
}

// Initialize AI Assistant when DOM is loaded
let aiAssistant;
document.addEventListener('DOMContentLoaded', () => {
    aiAssistant = new AIAssistant();
});

// Make it globally available
window.aiAssistant = aiAssistant;
