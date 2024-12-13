# Deployment Guide

This guide covers how to deploy Raimu either locally or using Docker (recommended).

## System Requirements

- At least 1GB of free disk space (for AI models)
- Minimum 8GB RAM recommended
- Models run locally on CPU - no GPU required

## Local Deployment

### Prerequisites
- Node.js 18+ 
- Python 3.10+
- bun or your preferred package manager
- Caddy
- Git

### Python Dependencies
First, set up the Python environment for the TTS/Whisper server. Navigate to src/server/python and run:

    python -m venv venv
    source venv/bin/activate  # On Windows: .\venv\Scripts\activate
    pip install -r requirements.txt

### Node.js Setup
Install Node.js dependencies and build the application:

    bun install
    bun run dev

### Environment Setup
Create a .env file in the root directory with:

    # Optional: OpenAI API (used for transcription/TTS)
    OPENAI_API_KEY=your_api_key_here

    # Optional: Set log level
    LOG_LEVEL=info

### Running the Application

For development (runs all services concurrently):

    bun run dev

For production, run each service in separate terminals:

Terminal 1: Run Caddy as reverse proxy

    caddy run

Terminal 2: Run the signaling server

    node src/server/index.js

Terminal 3: Run the Python TTS server

    cd src/server/python
    python tts_server.py

Terminal 4: Run the PeerJS server

    node src/peerServer/index.js

Terminal 5: Run the STUN server

    node src/js/stunServer/index.js

Terminal 6: Serve the built files

    bun run preview

The application will be available at:
- Web UI, WebSocket, and PeerJS: http://localhost:4173 (all through Caddy)
- STUN Server: http://localhost:19302 (UDP)

Only ports 4173 and 19302 need to be exposed to the outside world.

### Troubleshooting

#### Common Issues
1. Port conflicts: Ensure ports 5173/4173, 8080, and 9000 are available
2. Python venv activation: Make sure to activate the virtual environment before running the TTS server

---

## Docker Deployment

The Docker image is available at `ghcr.io/giorgiobrux/raimu:latest`.

### Using Traefik (recommended)

If you have Traefik set up, you can use the provided docker-compose.yml:

    services:
      raimu:
        image: ghcr.io/giorgiobrux/raimu:latest
        environment:
          - OPENAI_API_KEY=your_key_here  # Optional
          - LOG_LEVEL=info                # Optional
        labels:
          # ... see docker-compose.yml for full Traefik configuration

### Custom Setup

The container exposes these ports:
- 4173: Web UI
- 19302: STUN server

You can use your preferred reverse proxy or Docker setup. Example with plain Docker:

    docker run -d \
      -p 4173:4173 \
      -p 19302:19302 \
      -e OPENAI_API_KEY=your_key_here \
      ghcr.io/giorgiobrux/raimu:latest

Remember to:
- Configure your reverse proxy to handle WebSocket connections
- Set up HTTPS (required for WebRTC)
- Point the PeerJS domain to your server