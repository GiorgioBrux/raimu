import stun from 'node-stun';

const server = stun.createServer({
    primary: {
        host: '0.0.0.0',
        port: 19302
    },
    secondary: {},
    software: 'node-stun-server'
});

server.on('error', (error) => {
    console.error('STUN Server Error:', error);
});

server.on('listening', () => {
    const address = server.address();
    console.log(`STUN Server running on ${address.address}:${address.port}`);
});

server.on('bindingRequest', (request, rinfo) => {
    console.log(`Binding Request from ${rinfo.address}:${rinfo.port}`);
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log('Shutting down STUN server...');
    server.close(() => {
        console.log('STUN server closed');
        process.exit(0);
    });
}); 