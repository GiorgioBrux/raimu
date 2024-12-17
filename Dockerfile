# Build stage
FROM oven/bun:1 as builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies and build
RUN bun install
COPY . .
RUN bun run build

# Runtime stage
FROM python:3.10-slim

WORKDIR /app

# Install dependencies in a single RUN to reduce layers
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    nodejs \
    unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun \
    && curl -o /usr/local/bin/caddy -L "https://caddyserver.com/api/download?os=linux&arch=amd64" \
    && chmod +x /usr/local/bin/caddy \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements and install dependencies
COPY src/server/python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Caddyfile and built files from builder
COPY Caddyfile ./Caddyfile
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy pages and components inside dist
COPY --from=builder /app/src/pages ./dist/src/pages
COPY --from=builder /app/src/components ./dist/src/components

# Expose required ports
EXPOSE 4000 19302

# Create startup script
RUN echo '#!/bin/bash\n\
caddy run --config /app/Caddyfile & \n\
bun run preview & \n\
node src/peerServer/index.js & \n\
node src/server/index.js & \n\
PYTHONHASHSEED=1 python src/server/python/tts_server.py & \n\
node src/js/stunServer/index.js & \n\
wait' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"] 