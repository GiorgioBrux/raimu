export class WebSocketService {
  constructor(url) {
    this.connect(url);
  }

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

  send(data) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
} 