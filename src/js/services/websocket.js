/**
 * Manages WebSocket connection for room signaling.
 */
export class WebSocketService {
  /**
   * Creates a new WebSocketService instance and connects to the server.
   * @param {string} url - WebSocket server URL
   */
  constructor(url) {
    this.connect(url);
  }

  /**
   * Establishes WebSocket connection and sets up event handlers.
   * @param {string} url - WebSocket server URL
   */
  connect(url) {
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      console.log('Connected to signaling server');
    };
    
    this.ws.onmessage = (event) => {
      this.onMessage?.(event.data);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('Disconnected from signaling server');
      // Attempt to reconnect
      setTimeout(() => this.connect(url), 5000);
    };
  }

  /**
   * Sends data through the WebSocket connection.
   * @param {Object} data - Data to send (will be JSON stringified)
   */
  send(data) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
} 