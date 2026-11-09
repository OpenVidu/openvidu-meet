FROM node:24.22.1-alpine

# Install tzdata package for timezone data, and the Alpine fixes published after the base image was built
RUN apk upgrade --no-cache && apk add --no-cache tzdata

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./

# Install safe-chain, run npm ci through its shims, then remove safe-chain,
# its build-only deps and npm, npx, corepack and yarn, which the server
# (started with node) does not need, to keep the final image clean.
# Only check for ongoing malicious packages to avoid issues in CI.
RUN apk add --no-cache --virtual .safe-chain-deps curl bash && \
    curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci && \
    export PATH=/root/.safe-chain/shims:/root/.safe-chain/bin:$PATH && \
    export SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS=0 && \
    npm safe-chain-verify && \
    npm ci --omit=dev && \
    curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/uninstall-safe-chain.sh | sh && \
    apk del .safe-chain-deps && \
    rm -rf /root/.aikido /root/.npm /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
        /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

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
