/**
 * Manages the chat functionality for a room
 * @class
 */
export class ChatManager {
    /**
     * Creates a new ChatManager instance
     * @param {Object} elements - UI elements for chat functionality
     * @param {WebSocket} websocket - WebSocket connection for sending messages
     * @param {string} roomId - ID of the current room
     */
    constructor(elements, websocket, roomId) {
        this.elements = elements;
        this.websocket = websocket;
        this.messageContainer = elements.chatMessages;
        this.input = elements.chatInput;
        this.sendButton = elements.sendMessage;
        this.roomId = roomId;
        this.hasMessages = false;

        this.setupEventListeners();
    }

    /**
     * Sets up event listeners for sending messages
     * @private
     */
    setupEventListeners() {
        // Handle send button click
        this.sendButton.addEventListener('click', () => this.sendMessage());

        // Handle enter key press
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    /**
     * Sends a chat message through the WebSocket connection
     * @private
     */
    sendMessage() {
        const message = this.input.value.trim();
        if (!message) return;

        // Send message through websocket
        this.websocket.send({
            type: "chat",
            message,
            timestamp: new Date().toISOString(),
            roomId: this.roomId,
        });

        // Clear input
        this.input.value = '';
    }

    /**
     * Adds a new message to the chat display
     * @param {string} sender - Name of the message sender or 'system' for system messages
     * @param {string} message - Content of the message
     * @param {string} timestamp - ISO timestamp of when message was sent
     */
    addMessage(sender, message, timestamp) {
        // Remove placeholder if this is the first message
        if (!this.hasMessages) {
            const placeholder = this.messageContainer.querySelector('.text-slate-500.italic');
            if (placeholder) {
                placeholder.remove();
            }
            this.hasMessages = true;
        }

        const messageElement = document.createElement('div');
        if (sender === 'system') {
            messageElement.className = 'p-2 text-center';
            const messageText = document.createElement('p');
            messageText.className = 'text-sm text-lime-500/60 italic';
            messageText.textContent = message;
            messageElement.appendChild(messageText);
        } else {
            messageElement.className = 'p-3 rounded-xl max-w-[85%] ' + 
                (sender === sessionStorage.getItem('userName') ? 
                'bg-blue-500/20 ml-auto' : 'bg-slate-700/50');
            
            const header = document.createElement('div');
            header.className = 'flex items-center gap-2 mb-1';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-sm font-medium text-slate-300';
            nameSpan.textContent = sender;
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'text-xs text-slate-500';
            const messageTime = new Date(timestamp);
            timeSpan.textContent = messageTime.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            const messageText = document.createElement('p');
            messageText.className = 'text-sm text-slate-200';
            messageText.textContent = message;
            
            header.appendChild(nameSpan);
            header.appendChild(timeSpan);
            messageElement.appendChild(header);
            messageElement.appendChild(messageText);
        }

        this.messageContainer.appendChild(messageElement);
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }
} 