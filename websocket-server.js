import { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';

const app = express();
const server = http.createServer(app);

// Add CORS headers back
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');  // Allow Vite dev server
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Only handle API routes on this server
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Don't serve static files or handle client routes on this server
const wss = new WebSocketServer({ 
  server,
  path: '/ws'
});

// Track rooms and their participants
const rooms = new Map();
const activeConnections = new Set();

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  activeConnections.add(ws);
  let userId = null;  // Track the user's ID
  let roomId = null;  // Track the user's room

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Server received:', data);
      
      // Store user and room IDs when they join/create
      if (data.type === 'createRoom' || data.type === 'joinRoom') {
        userId = data.userId;
        roomId = data.roomId;
      }

      if(data.type !== 'createRoom' && !rooms.has(roomId)) {
        console.log('Room not found:', roomId);
        ws.send(JSON.stringify({
          type: 'roomNotFound',
          roomId
        }));
        return;
      }

      switch (data.type) {
        case 'createRoom':
          console.log('Creating room:', data.roomId);
          if (!rooms.has(data.roomId)) {
            rooms.set(data.roomId, new Map([[data.userId, { ws, userName: data.userName }]]));
          }
          break;

        case 'joinRoom':
          console.log('Joining room:', data.roomId);
          if (rooms.has(data.roomId)) {
            rooms.get(data.roomId).set(data.userId, { ws, userName: data.userName });
            broadcastToRoom(data.roomId, {
              type: 'userJoined',
              userId: data.userId,
              userName: data.userName,
              roomId: data.roomId
            }, ws);
          }
          break;

        case 'getParticipants':
          console.log('Getting participants for room:', data.roomId);
          if (rooms.has(data.roomId)) {
            // Only return participants that are still connected
            const participants = Array.from(rooms.get(data.roomId).entries())
              .filter(([_, participant]) => participant.ws.readyState === ws.OPEN)
              .map(([id, _]) => id);
            
            console.log('Sending participants:', participants);
            ws.send(JSON.stringify({
              type: 'participants',
              roomId: data.roomId,
              participants
            }));
          }
          break;

        case 'trackStateChange':
          console.log('Broadcasting track state change:', data);
          if (data.targetUserId) {
            // Send to specific user
            const room = rooms.get(data.roomId);
            if (room) {
              const targetParticipant = room.get(data.targetUserId);
              if (targetParticipant) {
                targetParticipant.ws.send(JSON.stringify({
                  type: 'trackStateChange',
                  userId: data.userId,
                  roomId: data.roomId,
                  trackKind: data.trackKind,
                  enabled: data.enabled
                }));
              }
            }
          } else {
            // Broadcast to room as before
            broadcastToRoom(data.roomId, {
              type: 'trackStateChange',
              userId: data.userId,
              roomId: data.roomId,
              trackKind: data.trackKind,
              enabled: data.enabled
            }, ws);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    activeConnections.delete(ws);
    if (roomId && userId) {
      console.log(`User ${userId} disconnected from room ${roomId}`);
      const room = rooms.get(roomId);
      if (room) {
        room.delete(userId);
        // Only broadcast if there are still participants
        if (room.size > 0) {
          broadcastToRoom(roomId, {
            type: 'userLeft',
            userId,
            roomId
          });
        }
        
        // Clean up empty rooms
        if (room.size === 0) {
          console.log(`Room ${roomId} is empty, removing it`);
          rooms.delete(roomId);
        }
      }
    }
  });

  // Add ping/pong to detect stale connections
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

function broadcastToRoom(roomId, message, exclude = null) {
  const room = rooms.get(roomId);
  if (room) {
    for (const participant of room.values()) {
      if (participant.ws !== exclude) {
        participant.ws.send(JSON.stringify(message));
      }
    }
  }
}

// Add connection cleanup interval
const interval = setInterval(() => {
  activeConnections.forEach(ws => {
    if (ws.isAlive === false) {
      console.log('Terminating inactive connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// Add error handler for the WebSocket server
wss.on('error', (error) => {
  console.error('WebSocket Server Error:', error);
});

server.on('error', (error) => {
  console.error('HTTP Server Error:', error);
});

server.listen(8080, '0.0.0.0', () => {  // Changed from 3000 to 8080
  console.log('WebSocket server running on port 8080');
  console.log('WebSocket endpoint: ws://localhost:8080/ws');
  console.log('Health check endpoint: http://localhost:8080/health');
}); 