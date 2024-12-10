import express from 'express';
import http from 'http';

export function createServer() {
  const app = express();

  // Add CORS headers for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return http.createServer(app);
}

export const SERVER_CONFIG = {
  port: process.env.PORT || 8080,
  host: process.env.HOST || '0.0.0.0',
  wsPath: '/ws'
}; 