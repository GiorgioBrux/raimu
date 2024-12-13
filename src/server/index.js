import { WebSocketServer, WebSocket } from 'ws';
import { createServer, SERVER_CONFIG } from './config.js';
import { RoomService } from './services/RoomService.js';
import { handleConnection } from './handlers/connectionHandler.js';
import WhisperService from './services/WhisperService.js';
import TranslationService from './services/TranslationService.js';

// Initialize ML services
async function initializeServices() {
    console.log('Initializing ML services...');
    try {
        if (!process.env.OPENAI_API_KEY) {
            await WhisperService.initializeLocalModel();
        }
        await TranslationService.init();
        console.log('ML services initialized successfully');
    } catch (error) {
        console.error('Failed to initialize ML services:', error);
        throw error;
    }
}

// Create server and services
const server = createServer();
const wss = new WebSocketServer({ 
    server, 
    path: SERVER_CONFIG.wsPath 
});

// Initialize services
const services = {
    roomService: new RoomService(),
    activeConnections: new Set()
};

// Initialize ML services before starting the server
initializeServices().then(() => {
    // Handle new WebSocket connections
    wss.on('connection', (ws) => handleConnection(ws, services));

    // Connection cleanup interval
    const cleanup = setInterval(() => {
        services.activeConnections.forEach(ws => {
            if (ws.isAlive === false) {
                console.log('Terminating inactive connection');
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    // Clean up on server close
    wss.on('close', () => {
        clearInterval(cleanup);
    });

    // Error handlers
    wss.on('error', (error) => {
        console.error('WebSocket Server Error:', error);
    });

    server.on('error', (error) => {
        console.error('HTTP Server Error:', error);
    });

    // Start server
    server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
        console.log(`WebSocket server running on port ${SERVER_CONFIG.port}`);
        console.log(`WebSocket endpoint: ws://localhost:${SERVER_CONFIG.port}${SERVER_CONFIG.wsPath}`);
        console.log(`Health check endpoint: http://localhost:${SERVER_CONFIG.port}/health`);
    });

    // Handle process termination
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Closing server...');
        wss.close(() => {
            server.close(() => {
                process.exit(0);
            });
        });
    });
}).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});