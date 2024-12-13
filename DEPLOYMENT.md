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

Terminal 1: Run the peer server

    node src/peerServer/index.js

Terminal 2: Run the signaling server

    node src/server/index.js

Terminal 3: Run the Python TTS server

    cd src/server/python
    python tts_server.py

Terminal 4: Serve the built files

    bun run preview

The application will be available at:
- Web UI: http://localhost:5173 (dev) or http://localhost:4173 (preview)
- Signaling Server: http://localhost:8080
- Peer Server: http://localhost:9000 (default PeerJS port)
- TTS Server: http://localhost:8001 (internal service)

### Troubleshooting

#### Common Issues
1. Port conflicts: Ensure ports 5173/4173, 8080, and 9000 are available
2. Python venv activation: Make sure to activate the virtual environment before running the TTS server

---

## Docker Deployment
[Coming soon]