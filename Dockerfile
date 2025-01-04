# Build stage for JS
FROM oven/bun:1 as builder

WORKDIR /app

# Copy package files
COPY package.json ./
RUN bun install
COPY . .
RUN bun run build

# Python dependencies stage
FROM nvidia/cuda:12.6.3-devel-ubuntu24.04 as python-deps

WORKDIR /app

# Install Python and minimal dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12-minimal \
    python3.12-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3.12 -m venv /opt/venv

# Make sure we use the virtualenv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY src/server/python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && find /opt/venv -type d -name "__pycache__" -exec rm -r {} + \
    && find /opt/venv -type d -name "tests" -exec rm -r {} + \
    && find /opt/venv -type f -name "*.pyc" -delete \
    && rm -rf /root/.cache/pip

# Final stage
FROM nvidia/cuda:12.6.3-devel-ubuntu24.04

WORKDIR /app

# Set CUDA related environment variables
ENV CUDA_HOME=/usr/local/cuda \
    PATH=/usr/local/cuda/bin:$PATH \
    LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH \
    DEBIAN_FRONTEND=noninteractive

# Clean up unnecessary files
RUN rm -rf /usr/share/dotnet \
    /usr/local/share/boost \
    /usr/local/lib/android \
    /usr/share/gradle* \
    /usr/share/maven* \
    /usr/share/swift* \
    /usr/share/dotnet* \
    /usr/share/rust* \
    /opt/* \
    /var/lib/apt/lists/*

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12-minimal \
    ffmpeg \
    nodejs \
    curl \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun \
    && curl -o /usr/local/bin/caddy -L "https://caddyserver.com/api/download?os=linux&arch=amd64" \
    && chmod +x /usr/local/bin/caddy \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /root/.cache/* \
    && rm -rf /tmp/*

# Copy Python virtual environment from python-deps stage
COPY --from=python-deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY Caddyfile ./Caddyfile

# Create startup script
RUN echo '#!/bin/bash\n\
caddy run --config /app/Caddyfile & \n\
bun run preview & \n\
node src/peerServer/index.js & \n\
node src/server/index.js & \n\
PYTHONHASHSEED=1 /opt/venv/bin/python src/server/python/tts_server.py & \n\
PYTHONHASHSEED=1 /opt/venv/bin/python src/server/python/whisper_server.py & \n\
PYTHONHASHSEED=1 /opt/venv/bin/python src/server/python/translation_server.py & \n\
node src/js/stunServer/index.js & \n\
wait' > /app/start.sh && chmod +x /app/start.sh

# Set up HuggingFace cache environment
ENV HF_HOME=/root/.cache/huggingface \
    HUGGINGFACE_HUB_CACHE=/root/.cache/huggingface

# Expose required ports
EXPOSE 4000 19302

CMD ["/app/start.sh"]