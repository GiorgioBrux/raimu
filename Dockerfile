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
# Change to CUDA development image for compilation tools
FROM nvidia/cuda:12.6.3-devel-ubuntu24.04

WORKDIR /app

# Install Python 3.12 and other dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    python3-pip \
    curl \
    ffmpeg \
    nodejs \
    unzip \
    git \
    build-essential \
    ninja-build \
    libaio-dev \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun \
    && curl -o /usr/local/bin/caddy -L "https://caddyserver.com/api/download?os=linux&arch=amd64" \
    && chmod +x /usr/local/bin/caddy \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /root/.cache/* \
    && rm -rf /tmp/*

# Create and activate virtual environment with Python 3.12
RUN python3.12 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install pip for Python 3.12 and upgrade it
RUN /opt/venv/bin/python -m pip install --upgrade pip

# Copy Python requirements and install dependencies
COPY src/server/python/requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt \
    && pip3 install flash-attn --no-build-isolation \
    && CMAKE_ARGS="-DGGML_CUDA=on" pip3 install llama-cpp-python \
    && rm -rf /root/.cache/pip

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
PYTHONHASHSEED=1 /opt/venv/bin/python src/server/python/tts_server.py & \n\
PYTHONHASHSEED=1 /opt/venv/bin/python src/server/python/whisper_server.py & \n\
PYTHONHASHSEED=1 /opt/venv/bin/python src/server/python/translation_server.py & \n\
node src/js/stunServer/index.js & \n\
wait' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"] 

# Add these before any model loading operations
ENV HF_HOME=/root/.cache/huggingface \
    HUGGINGFACE_HUB_CACHE=/root/.cache/huggingface