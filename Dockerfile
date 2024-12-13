# Build stage
FROM oven/bun:1 as builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN bun install

# Copy source files
COPY . .

# Debug: List files to verify case sensitivity
RUN ls -la src/js/services/

# Build the application
RUN bun run build

# Runtime stage
FROM python:3.10-slim

WORKDIR /app

# Install Node.js and bun
RUN apt-get update && apt-get install -y curl unzip \
    && curl -fsSL https://bun.sh/install | bash

# Copy Python requirements and install dependencies
COPY src/server/python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy built files and source
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Copy package files and install production dependencies
COPY package.json ./
RUN bun install --production --frozen-lockfile

# Expose required ports
EXPOSE 5173 8080 9000

# Create startup script
RUN echo '#!/bin/bash\n\
bun run preview & \n\
node src/peerServer/index.js & \n\
node src/server/index.js & \n\
cd src/server/python && python tts_server.py & \n\
wait' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"] 