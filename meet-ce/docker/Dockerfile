# ====================================================
# Stage 1: builder
# ====================================================
FROM node:24.15.0 AS builder

# Define pnpm version as build argument with default value
ARG PNPM_VERSION=11.8.0

# Install pnpm
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Create necessary directories
RUN mkdir -p meet-ce/typings meet-ce/frontend/webcomponent meet-ce/backend && \
    chown -R node:node .

USER node

# --- Install safe-chain for security checks during build
RUN curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci

ENV PATH=/home/node/.safe-chain/shims:/home/node/.safe-chain/bin:$PATH
# Only check for ongoing malicious packages to avoid issues in CI
ENV SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS=0

RUN pnpm safe-chain-verify
# ---------------------

# =============================================================================
# Workspace Configuration for Docker/CI
# =============================================================================

# Copy workspace configuration files
COPY --chown=node:node pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --chown=node:node package.json pnpm-lock.yaml ./

# Copy package.json files for all workspace packages
COPY --chown=node:node meet-ce/typings/package.json ./meet-ce/typings/
COPY --chown=node:node meet-ce/frontend/package.json ./meet-ce/frontend/
COPY --chown=node:node meet-ce/frontend/webcomponent/package.json ./meet-ce/frontend/webcomponent/
COPY --chown=node:node meet-ce/frontend/projects/shared-meet-components/package.json ./meet-ce/frontend/projects/shared-meet-components/
COPY --chown=node:node meet-ce/backend/package.json ./meet-ce/backend/
# Copy the source code for all packages
COPY --chown=node:node meet-ce/typings/ ./meet-ce/typings/
COPY --chown=node:node meet-ce/frontend/ ./meet-ce/frontend/
COPY --chown=node:node meet-ce/backend/ ./meet-ce/backend/

# Copy additional necessary files
COPY --chown=node:node meet.sh .

ARG BASE_HREF=/

# Build OpenVidu Meet project
RUN pnpm install --frozen-lockfile && \
    ./meet.sh build --skip-install --base-href=${BASE_HREF}

# ====================================================
# Stage 2: production dependencies
# ====================================================
FROM node:24.15.0-alpine AS prod-deps

# Define pnpm version as build argument with default value
ARG PNPM_VERSION=11.8.0

# Install pnpm
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY meet-ce/typings/package.json ./meet-ce/typings/
COPY meet-ce/backend/package.json ./meet-ce/backend/

# Installs the backend's production dependencies exactly as locked. With the hoisted linker, a plain
# install may re-resolve them, and a filtered or frozen one adds those of every project in the lockfile.
RUN pnpm --config.inject-workspace-packages=true --filter @openvidu-meet/backend deploy --prod /deploy

# ====================================================
# Stage 3: production
# ====================================================
FROM node:24.15.0-alpine AS production

RUN apk add --no-cache tzdata

WORKDIR /opt/openvidu-meet

# Copy the production dependencies, completing the typings package with its build output
COPY --from=prod-deps --chown=node:node /deploy/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/meet-ce/typings/dist ./node_modules/@openvidu-meet/typings/dist

# Copy the compiled backend
COPY --from=builder --chown=node:node /app/meet-ce/backend/dist ./meet-ce/backend/dist
COPY --from=builder --chown=node:node /app/meet-ce/backend/public ./meet-ce/backend/public
COPY --from=builder --chown=node:node /app/meet-ce/backend/package.json ./meet-ce/backend/package.json
COPY --from=builder --chown=node:node /app/meet-ce/backend/info.json ./meet-ce/backend/info.json

# Copy entrypoint script
COPY --chmod=755 meet-ce/docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# Switch to non-root user
USER node

# Environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 6080

# Start the application
CMD ["/usr/local/bin/entrypoint.sh"]
