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

# Install Node.js and bun
RUN apt-get update && apt-get install -y curl unzip git nodejs ffmpeg \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Copy Python requirements and install dependencies
COPY src/server/python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy built files, source and node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json


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