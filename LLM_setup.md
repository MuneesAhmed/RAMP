# AI Assistant Setup Guide

## Overview
The RAMP system now includes an AI Assistant powered by Ollama, a local LLM (Large Language Model) that runs on your hardware without requiring API keys or internet connectivity for inference.

## Features
- **🤖 Local AI Assistant**: Runs entirely on your hardware
- **📱 Interactive Chat Widget**: Available on admin and supervisor dashboards
- **🔐 Role-Based Responses**: Tailored answers based on user permissions
- **📊 Context-Aware**: Understands current system data and statistics
- **💡 Smart Suggestions**: Provides relevant questions based on user role
- **🚀 No API Keys Required**: Completely self-hosted solution

## Installation Steps

### 1. Install Ollama

#### For macOS:
```bash
# Using Homebrew
brew install ollama

# Or download from https://ollama.ai/download
```

#### For Linux:
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

#### For Windows:
Download the installer from https://ollama.ai/download

### 2. Start Ollama Service
```bash
ollama serve
```

### 3. Pull the AI Model
```bash
# Default model (recommended for most systems)
ollama pull llama3.2:3b

# For more powerful systems, you can use larger models:
# ollama pull llama3.2:7b
# ollama pull llama3.2:11b
```

### 4. Configure RAMP Environment
The AI Assistant is already configured in your `.env` file:

```env
# AI Assistant Configuration
AI_ASSISTANT_ENABLED=true
OLLAMA_MODEL=llama3.2:3b
OLLAMA_HOST=http://127.0.0.1:11434
```

### 5. Restart RAMP Server
```bash
npm start
```

## Usage

### Access the AI Assistant
1. **Login** to your admin or supervisor dashboard
2. **Look for the 🤖 button** in the bottom-right corner
3. **Click the button** to open the AI chat widget
4. **Ask questions** about the RAMP system

### Sample Questions by Role

#### For Administrators:
- "How do I assign multiple requests to a supervisor?"
- "What's the best way to manage overdue requests?"
- "How can I generate monthly maintenance reports?"
- "How do I create new supervisor accounts?"
- "What are the different user permission levels?"

#### For Supervisors:
- "How do I update the status of a maintenance request?"
- "How can I upload photos or documents to a request?"
- "What does each request status mean?"
- "How do I forward a request to another department?"
- "How can I communicate with the person who submitted the request?"

### AI Assistant Features

#### 🎯 **Context-Aware Responses**
The AI understands:
- Your current role and permissions
- Current system statistics
- The page you're viewing
- Historical context from your chat

#### 💡 **Smart Suggestions**
- Click on suggested questions for quick help
- Suggestions are tailored to your user role
- Get started quickly with common tasks

#### 📊 **System Integration**
The AI has access to:
- Current request counts by status
- Total number of supervisors
- System statistics and trends
- Role-based data visibility

## Troubleshooting

### AI Assistant Not Available
If you see "AI Assistant Unavailable":

1. **Check if Ollama is running:**
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. **Start Ollama service:**
   ```bash
   ollama serve
   ```

3. **Verify the model is installed:**
   ```bash
   ollama list
   ```

4. **Pull the model if missing:**
   ```bash
   ollama pull llama3.2:3b
   ```

### Performance Optimization

#### For Better Performance:
- Use a smaller model like `llama3.2:1b` for faster responses
- Ensure sufficient RAM (8GB+ recommended for 3B model)
- Use SSD storage for better model loading times

#### Model Size Recommendations:
- **1B parameters**: 2GB RAM, fastest responses
- **3B parameters**: 4GB RAM, balanced performance
- **7B parameters**: 8GB RAM, higher quality responses
- **11B parameters**: 16GB RAM, best quality responses

### Configuration Options

#### Change AI Model:
Update your `.env` file:
```env
OLLAMA_MODEL=llama3.2:1b  # For faster, lighter model
OLLAMA_MODEL=llama3.2:7b  # For better quality responses
```

#### Disable AI Assistant:
```env
AI_ASSISTANT_ENABLED=false
```

#### Custom Ollama Host:
```env
OLLAMA_HOST=http://your-ollama-server:11434
```

## Security Notes

-   **Fully Local**: No data sent to external APIs
-   **Privacy Focused**: All conversations stay on your server
-   **Role-Based Access**: AI responses respect user permissions
-   **No API Keys**: No external dependencies or costs

## System Requirements

### Minimum Requirements:
- **RAM**: 4GB available
- **Storage**: 2GB for model files
- **CPU**: x64 processor
- **OS**: macOS, Linux, or Windows

### Recommended Requirements:
- **RAM**: 8GB+ available
- **Storage**: 10GB+ for multiple models
- **CPU**: Modern multi-core processor
- **OS**: Linux or macOS for best performance

## Support

The AI Assistant is designed to help with:
-   RAMP system usage and navigation
-   Understanding request statuses and workflows
-   User management and role permissions
-   Reporting and analytics guidance
-   Troubleshooting common issues

For technical issues with Ollama itself, visit: https://ollama.ai/

---

**🎉 Your RAMP AI Assistant is now ready to help make your railway maintenance management more efficient!**
