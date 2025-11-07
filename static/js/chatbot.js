class ChatBot {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.departmentSelect = document.getElementById('department');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.voiceBtn = document.getElementById('voiceBtn');
        this.recordingIndicator = document.getElementById('recordingIndicator');
        
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        
        // API Configuration
        this.apiToken = localStorage.getItem('hf_api_token') || '';
        this.apiModel = 'microsoft/DialoGPT-medium';
        this.apiUrl = `https://api-inference.huggingface.co/models/${this.apiModel}`;
        
        // Chat context for better conversations
        this.conversationHistory = [];
        
        this.initializeEventListeners();
        this.autoResizeTextarea();
        
        // Show API configuration modal if no token is set
        if (!this.apiToken) {
            this.showApiModal();
        }
    }

    initializeEventListeners() {
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.chatInput.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.updateSendButton();
        });

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // Initialize send button state
        this.updateSendButton();
    }

    showApiModal() {
        const modal = document.getElementById('apiModal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    hideApiModal() {
        const modal = document.getElementById('apiModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    autoResizeTextarea() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 120) + 'px';
    }

    updateSendButton() {
        const hasText = this.chatInput.value.trim().length > 0;
        this.sendBtn.disabled = !hasText;
        this.sendBtn.style.opacity = hasText ? '1' : '0.5';
    }

    async sendMessage() {
        const text = this.chatInput.value.trim();
        if (!text) return;

        // Add user message
        this.addMessage('user', text);
        this.chatInput.value = '';
        this.autoResizeTextarea();
        this.updateSendButton();

        // Show typing indicator
        this.showTypingIndicator();

        try {
            // Get AI response
            const response = await this.getAIResponse(text);
            this.hideTypingIndicator();
            this.addMessage('bot', response);
        } catch (error) {
            this.hideTypingIndicator();
            console.error('Error getting AI response:', error);
            this.addMessage('bot', this.getErrorResponse(error));
        }
    }

    async getAIResponse(userMessage) {
        // If no API token, use fallback responses
        if (!this.apiToken) {
            return this.getFallbackResponse(userMessage);
        }

        try {
            // Prepare the conversation context
            const context = this.buildConversationContext(userMessage);
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: {
                        past_user_inputs: context.past_user_inputs,
                        generated_responses: context.generated_responses,
                        text: userMessage
                    },
                    parameters: {
                        max_length: 200,
                        temperature: 0.7,
                        do_sample: true,
                        pad_token_id: 50256
                    },
                    options: {
                        wait_for_model: true
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            let aiResponse = data.generated_text || data.response || 'I apologize, but I couldn\'t generate a response.';
            
            // Update conversation history
            this.updateConversationHistory(userMessage, aiResponse);
            
            // Add banking context to response
            return this.addBankingContext(aiResponse, userMessage);
            
        } catch (error) {
            console.error('AI API Error:', error);
            return this.getFallbackResponse(userMessage);
        }
    }

    buildConversationContext(currentMessage) {
        const maxHistory = 5; // Keep last 5 exchanges
        const recentHistory = this.conversationHistory.slice(-maxHistory);
        
        return {
            past_user_inputs: recentHistory.map(exchange => exchange.user),
            generated_responses: recentHistory.map(exchange => exchange.bot),
            text: currentMessage
        };
    }

    updateConversationHistory(userMessage, botResponse) {
        this.conversationHistory.push({
            user: userMessage,
            bot: botResponse
        });
        
        // Keep only the last 10 exchanges
        if (this.conversationHistory.length > 10) {
            this.conversationHistory = this.conversationHistory.slice(-10);
        }
    }

    addBankingContext(response, userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        const department = this.detectDepartment(userMessage);
        
        // Add banking-specific context
        let contextualResponse = response;
        
        if (lowerMessage.includes('balance')) {
            contextualResponse += '\n\nFor real-time balance information, please check your VyomNext mobile app or visit our nearest branch.';
        } else if (lowerMessage.includes('transfer') || lowerMessage.includes('payment')) {
            contextualResponse += '\n\nYou can make secure transfers through your VyomNext account dashboard or mobile app.';
        } else if (lowerMessage.includes('loan')) {
            contextualResponse += '\n\nFor detailed loan information and applications, please visit our loans section or contact our loan specialists.';
        }
        
        // Add department forwarding if needed
        if (department !== 'General Support') {
            contextualResponse += `\n\nI've also forwarded your query to our ${department} team for specialized assistance.`;
        }
        
        return contextualResponse;
    }

    getFallbackResponse(userMessage) {
        const department = this.detectDepartment(userMessage);
        const responses = this.getBankingResponseTemplates();
        
        const lowerMessage = userMessage.toLowerCase();
        
        if (lowerMessage.includes('balance') || lowerMessage.includes('account')) {
            return responses.balance;
        } else if (lowerMessage.includes('transfer') || lowerMessage.includes('send money')) {
            return responses.transfer;
        } else if (lowerMessage.includes('loan') || lowerMessage.includes('credit')) {
            return responses.loan;
        } else if (lowerMessage.includes('help') || lowerMessage.includes('support')) {
            return responses.help;
        } else if (lowerMessage.includes('transaction') || lowerMessage.includes('history')) {
            return responses.transactions;
        } else if (lowerMessage.includes('card') || lowerMessage.includes('debit') || lowerMessage.includes('credit card')) {
            return responses.card;
        } else {
            return responses.default + `\n\nYour query has been forwarded to our ${department} team for specialized assistance.`;
        }
    }

    getBankingResponseTemplates() {
        return {
            default: "Thank you for contacting VyomNext! I'm here to help you with all your banking needs. How can I assist you today?",
            balance: "I can help you with balance inquiries. Your current total balance across all linked accounts is ₹2,40,500.00. For detailed account-wise balances, please check your VyomNext mobile app or visit our online banking portal.",
            transfer: "I can assist you with money transfers. VyomNext offers multiple transfer options including IMPS, NEFT, RTGS, and UPI. You can transfer funds between your accounts or to other bank accounts through our secure platform.",
            loan: "VyomNext offers various loan products including Personal Loans (starting at 8.5% p.a.), Home Loans (starting at 7.2% p.a.), Car Loans, and Business Loans. Would you like information about eligibility criteria or application process?",
            help: "I'm here to help! I can assist you with:\n• Account information and balance inquiries\n• Transaction history and statements\n• Fund transfers and payments\n• Loan and credit card information\n• Technical support\n• General banking queries\n\nWhat would you like help with?",
            transactions: "I can help you view your transaction history. Your recent transactions include various payments and transfers. For detailed transaction history, please log into your VyomNext account or check your mobile app.",
            card: "VyomNext offers premium Debit and Credit Cards with exciting benefits:\n• Zero annual fee for first year\n• Cashback on all purchases\n• Worldwide acceptance\n• 24/7 customer support\n\nWould you like to apply for a new card or need help with an existing one?"
        };
    }

    getErrorResponse(error) {
        const errorMessages = [
            "I apologize for the technical difficulty. Let me help you with your banking query using our standard support options.",
            "I'm experiencing some connectivity issues, but I'm still here to help with your VyomNext banking needs.",
            "There seems to be a temporary service interruption. However, I can still assist you with general banking information.",
        ];
        
        return errorMessages[Math.floor(Math.random() * errorMessages.length)] + 
               "\n\nFor immediate assistance, please call our 24/7 helpline: 1800-XXX-XXXX";
    }

    detectDepartment(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('loan') || lowerMessage.includes('credit') || lowerMessage.includes('mortgage') || lowerMessage.includes('emi')) {
            return 'Loans & Credit';
        } else if (lowerMessage.includes('transaction') || lowerMessage.includes('transfer') || lowerMessage.includes('payment') || lowerMessage.includes('upi') || lowerMessage.includes('neft')) {
            return 'Transactions';
        } else if (lowerMessage.includes('account') || lowerMessage.includes('balance') || lowerMessage.includes('statement') || lowerMessage.includes('passbook')) {
            return 'Account Services';
        } else if (lowerMessage.includes('app') || lowerMessage.includes('website') || lowerMessage.includes('login') || lowerMessage.includes('password') || lowerMessage.includes('otp')) {
            return 'Technical Support';
        } else if (lowerMessage.includes('complaint') || lowerMessage.includes('issue') || lowerMessage.includes('problem') || lowerMessage.includes('dispute')) {
            return 'Complaints';
        } else if (lowerMessage.includes('card') || lowerMessage.includes('debit') || lowerMessage.includes('credit card') || lowerMessage.includes('atm')) {
            return 'Card Services';
        } else {
            return 'General Support';
        }
    }

    addMessage(sender, text, attachment = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'user' ? 'U' : 'AI';

        const content = document.createElement('div');
        content.className = 'message-content';

        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        
        // Handle multi-line messages
        messageText.innerHTML = text.replace(/\n/g, '<br>');

        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = this.formatTimestamp(new Date());

        content.appendChild(messageText);

        if (attachment) {
            const attachmentDiv = document.createElement('div');
            attachmentDiv.className = 'message-attachment';
            
            const iconDiv = document.createElement('div');
            iconDiv.className = `attachment-icon ${attachment.type}`;
            iconDiv.textContent = attachment.icon;
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = attachment.name;
            
            attachmentDiv.appendChild(iconDiv);
            attachmentDiv.appendChild(nameSpan);
            content.appendChild(attachmentDiv);
        }

        content.appendChild(timestamp);

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        this.typingIndicator.style.display = 'block';
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.typingIndicator.style.display = 'none';
    }

    formatTimestamp(date) {
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        
        return date.toLocaleDateString();
    }

    scrollToBottom() {
        setTimeout(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 100);
    }

    toggleVoiceRecording() {
        if (!this.isRecording) {
            this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    startRecording() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then((stream) => {
                    this.mediaRecorder = new MediaRecorder(stream);
                    this.recordedChunks = [];

                    this.mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            this.recordedChunks.push(event.data);
                        }
                    };

                    this.mediaRecorder.onstop = () => {
                        const blob = new Blob(this.recordedChunks, { type: 'audio/wav' });
                        this.handleVoiceRecording(blob);
                    };

                    this.mediaRecorder.start();
                    this.isRecording = true;
                    this.voiceBtn.style.background = '#e74c3c';
                    this.voiceBtn.style.color = 'white';
                    this.recordingIndicator.style.display = 'block';
                })
                .catch((error) => {
                    console.error('Error accessing microphone:', error);
                    alert('Could not access microphone. Please check permissions.');
                });
        } else {
            alert('Voice recording is not supported in your browser.');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            this.voiceBtn.style.background = '#f8f9fa';
            this.voiceBtn.style.color = '#666';
            this.recordingIndicator.style.display = 'none';
        }
    }

    handleVoiceRecording(blob) {
        const attachment = {
            type: 'file-audio',
            icon: '🎵',
            name: `Voice message (${Math.round(blob.size / 1024)}KB)`
        };

        this.addMessage('user', 'Voice message sent', attachment);
        
        // Simulate voice processing
        setTimeout(() => {
            this.showTypingIndicator();
            setTimeout(() => {
                this.hideTypingIndicator();
                this.addMessage('bot', "I've received your voice message. For better accuracy in processing your banking queries, I recommend typing your message. However, I can still help you - could you please describe what you need assistance with?");
            }, 1500);
        }, 500);
    }
}

// API Configuration Functions
function saveApiToken() {
    const token = document.getElementById('apiToken').value.trim();
    if (token) {
        localStorage.setItem('hf_api_token', token);
        window.chatBot.apiToken = token;
        window.chatBot.hideApiModal();
        
        // Add confirmation message
        window.chatBot.addMessage('bot', 'API token saved successfully! I can now provide enhanced AI responses using Hugging Face models.');
    } else {
        alert('Please enter a valid API token');
    }
}

function closeApiModal() {
    window.chatBot.hideApiModal();
    window.chatBot.addMessage('bot', 'Running in demo mode with predefined banking responses. For enhanced AI capabilities, you can configure your Hugging Face API token anytime by refreshing the page.');
}

// File upload functions
function triggerFileUpload() {
    document.getElementById('fileInput').click();
}

function triggerVideoUpload() {
    document.getElementById('videoInput').click();
}

function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    files.forEach(file => {
        const attachment = getFileAttachment(file);
        window.chatBot.addMessage('user', `Uploaded: ${file.name}`, attachment);
        
        // Simulate file processing with banking context
        setTimeout(() => {
            window.chatBot.showTypingIndicator();
            setTimeout(() => {
                window.chatBot.hideTypingIndicator();
                
                let response = `I've received your file "${file.name}".`;
                
                // Add context based on file type
                const extension = file.name.split('.').pop().toLowerCase();
                if (['pdf', 'doc', 'docx'].includes(extension)) {
                    response += " If this is a bank statement, loan document, or any banking-related document, I can help you understand the information or guide you through the next steps.";
                } else if (['jpg', 'jpeg', 'png'].includes(extension)) {
                    response += " If this is an image of a cheque, bank document, or transaction receipt, I can help you with related banking procedures.";
                }
                
                response += " How can I assist you with this document?";
                window.chatBot.addMessage('bot', response);
            }, 2000);
        }, 500);
    });
    // Clear the input
    event.target.value = '';
}

function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const attachment = {
            type: 'file-video',
            icon: '🎬',
            name: file.name
        };
        
        window.chatBot.addMessage('user', `Uploaded video: ${file.name}`, attachment);
        
        // Simulate video processing
        setTimeout(() => {
            window.chatBot.showTypingIndicator();
            setTimeout(() => {
                window.chatBot.hideTypingIndicator();
                window.chatBot.addMessage('bot', `I've received your video "${file.name}". While I can't directly process video content, if this relates to a banking procedure or issue, I can guide you through the process or connect you with the appropriate department for assistance.`);
            }, 3000);
        }, 500);
    }
    // Clear the input
    event.target.value = '';
}

function getFileAttachment(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (['pdf'].includes(extension)) {
        return { type: 'file-pdf', icon: 'PDF', name: file.name };
    } else if (['doc', 'docx'].includes(extension)) {
        return { type: 'file-doc', icon: 'DOC', name: file.name };
    } else if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
        return { type: 'file-image', icon: '🖼️', name: file.name };
    } else {
        return { type: 'file-pdf', icon: '📄', name: file.name };
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Clear stored API token if user wants to logout
        if (confirm('Do you want to clear your saved API configuration as well?')) {
            localStorage.removeItem('hf_api_token');
        }
        alert('Logging out...');
        window.location.href = 'login.html';
    }
}

// Initialize chatbot when page loads
let chatBot;
document.addEventListener('DOMContentLoaded', function() {
    chatBot = new ChatBot();
    // Make chatBot globally accessible
    window.chatBot = chatBot;
});

// Additional utility functions
function toggleVoiceRecording() {
    if (window.chatBot) {
        window.chatBot.toggleVoiceRecording();
    }
}

function sendMessage() {
    if (window.chatBot) {
        window.chatBot.sendMessage();
    }
}

// Handle API modal close on outside click
window.onclick = function(event) {
    const modal = document.getElementById('apiModal');
    if (event.target === modal) {
        closeApiModal();
    }
}