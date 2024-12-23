import { WebSocket } from 'ws';
import { handleMessage } from './messageHandlers.js';

export function handleConnection(ws, services) {
  console.log('WebSocket client connected');
  
  // Initialize connection info on the WebSocket object itself
  ws.connectionInfo = {
    userId: null,
    roomId: null,
    observingPin: null
  };

  // Add connection to active connections
  services.activeConnections.add(ws);

  ws.on('message', (message) => handleMessage(ws, message, services));

  ws.on('close', () => {
    console.log('Connection closed. Info:', ws.connectionInfo);
    services.activeConnections.delete(ws);
    
    // Remove from observers if they were observing a room
    if (ws.connectionInfo.observingPin) {
      services.roomService.removeObserver(ws.connectionInfo.observingPin, ws);
    }

    // Handle participant disconnect
    if (ws.connectionInfo.roomId && ws.connectionInfo.userId) {
      console.log(`User ${ws.connectionInfo.userId} disconnected from room ${ws.connectionInfo.roomId}`);

      const wasRoomRemoved = services.roomService.removeParticipant(
        ws.connectionInfo.roomId, 
        ws.connectionInfo.userId
      );
      
      if (!wasRoomRemoved) {
        // Only broadcast if room still exists
        services.roomService.broadcastToRoom(ws.connectionInfo.roomId, {
          type: 'userLeft',
          userId: ws.connectionInfo.userId,
          roomId: ws.connectionInfo.roomId
        });
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Add ping/pong to detect stale connections
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
}

// Helper function to handle disconnection cleanup
export function handleDisconnection(ws, connectionInfo, services) {
  services.activeConnections.delete(ws);
  
  if (connectionInfo.observingPin) {
    services.roomService.removeObserver(connectionInfo.observingPin, ws);
  }

  if (connectionInfo.roomId && connectionInfo.userId) {
    services.roomService.removeParticipant(connectionInfo.roomId, connectionInfo.userId);
  }
} 