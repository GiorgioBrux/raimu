import { PeerServer } from 'peer';

const peerServer = PeerServer({
  port: 9000,
  path: '/peerjs',
  allow_discovery: true,
});

peerServer.on('connection', (client) => {
  console.log('Client connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
  console.log('Client disconnected:', client.getId());
});

console.log('PeerJS server running on port 9000'); 