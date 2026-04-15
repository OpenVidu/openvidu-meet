FROM node:22-alpine

# Install tzdata package for timezone data
RUN apk add --no-cache tzdata

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./

# Install safe-chain, run npm ci through its shims, then remove safe-chain
# and its build-only deps to keep the final image clean.
# Only check for ongoing malicious packages to avoid issues in CI.
RUN apk add --no-cache --virtual .safe-chain-deps curl bash && \
    curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci && \
    export PATH=/root/.safe-chain/shims:/root/.safe-chain/bin:$PATH && \
    export SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS=0 && \
    npm safe-chain-verify && \
    npm ci --only=production && \
    curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/uninstall-safe-chain.sh | sh && \
    apk del .safe-chain-deps && \
    rm -rf /root/.aikido

# Copy application files
COPY src ./src
COPY static ./static

# Use non-root user
USER node

# Expose port
EXPOSE 6080

# Set environment variables
ENV NODE_ENV=production \
    SERVER_PORT=6080

# Start the application
CMD ["node", "src/index.js"]
