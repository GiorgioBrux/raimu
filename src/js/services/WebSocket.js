import { wsLogger as log } from '../utils/logger.js';

/**
 * Manages WebSocket connection for room signaling.
 */
export class WebSocketService {
  /**
   * Creates a new WebSocketService instance and connects to the server.
   * @param {string} url - WebSocket server URL
   */
  constructor(url) {
    /** @type {string} WebSocket server URL */
    this.url = url;

    /** @type {number} Number of reconnection attempts made */
    this.reconnectAttempts = 0;

    /** @type {number} Maximum number of reconnection attempts allowed */
    this.maxReconnectAttempts = 5;

    /** @type {'disconnected'|'connecting'|'connected'|'error'|'closed'} Current connection state */
    this.connectionState = 'disconnected';

    /** @type {Array<Object>} Queue of messages to send when connection is established */
    this.messageQueue = [];
    
    log.info({ url }, 'Initializing WebSocket service');
    
    this.checkServerHealth().then(healthy => {
      if (healthy) {
        this.connect();
      } else {
        log.error('Server health check failed');
      }
    });
  }

  async checkServerHealth() {
    try {
      const healthUrl = this.url.replace('ws:', 'http:').replace('wss:', 'https:').replace('/ws', '/ws/health');
      log.debug({ url: healthUrl }, 'Checking server health');
      const response = await fetch(healthUrl);
      const data = await response.json();
      log.debug({ response: data }, 'Health check response');
      return data.status === 'ok';
    } catch (error) {
      log.error({ error }, 'Health check failed');
      return false;
    }
  }

  /**
   * Establishes WebSocket connection and sets up event handlers.
   * @param {string} url - WebSocket server URL
   */
  connect() {
    try {
      this.connectionState = 'connecting';
      log.info({ attempt: this.reconnectAttempts + 1 }, 'Attempting connection');
      
      if (this.ws) {
        log.debug('Closing existing connection');
        this.ws.close();
      }

      this.ws = new WebSocket(this.url);
      
      const connectionTimeout = setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          log.error('Connection timeout');
          this.ws.close();
        }
      }, 5000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.connectionState = 'connected';
        log.info('Connection established');
        this.reconnectAttempts = 0;
        this.flushMessageQueue();
      };
      
      this.ws.onmessage = (event) => {
        try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            log.debug({ 
                messageType: data.type,
                hasMessageHandler: !!this.onMessage
            }, 'WebSocket message received');
            
            if (this.onMessage) {
                this.onMessage(event.data);
            } else {
                log.warn('No message handler registered for WebSocket');
            }
        } catch (error) {
            log.error({ error, rawData: event.data }, 'Error processing WebSocket message');
        }
      };
      
      this.ws.onerror = (error) => {
        this.connectionState = 'error';
        log.error({ error }, 'Connection error');
      };
      
      this.ws.onclose = (event) => {
        this.connectionState = 'closed';
        log.info({ code: event.code }, 'Connection closed');
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
          log.info({ delay, attempt: this.reconnectAttempts }, 'Scheduling reconnection');
          setTimeout(() => this.connect(), delay);
        } else {
          log.error('Max reconnection attempts reached');
        }
      };
    } catch (error) {
      log.error({ error }, 'Connection setup failed');
    }
  }

  /**
   * Sends data through the WebSocket connection.
   * @param {Object} data - Data to send (will be JSON stringified)
   */
  send(data) {
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        log.debug({ data }, 'Sending message');
        this.ws.send(JSON.stringify(data));
      } else {
        log.debug({ 
          data, 
          state: this.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.ws.readyState] : 'NO_CONNECTION' 
        }, 'Queuing message');
        
        this.messageQueue.push(data);
        
        if (this.ws?.readyState === WebSocket.CLOSED) {
          log.info('Connection closed, attempting reconnect');
          this.connect();
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to send message');
    }
  }

  flushMessageQueue() {
    log.info({ count: this.messageQueue.length }, 'Flushing message queue');
    while (this.messageQueue.length > 0) {
      const data = this.messageQueue.shift();
      this.send(data);
    }
  }

  disconnect() {
    log.info('Manual disconnect initiated');
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection attempt
      this.ws.close();
      this.ws = null;
      this.connectionState = 'disconnected';
      log.info('Disconnected successfully');
    }
  }

  /**
   * Gets current connection state
   * @returns {string} Current connection state
   */
  get state() {
    return this.connectionState;
  }

  /**
   * Checks if connection is active
   * @returns {boolean} True if connected
   */
  get isConnected() {
    return this.connectionState === 'connected';
  }
} 