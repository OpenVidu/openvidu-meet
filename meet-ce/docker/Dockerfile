# ====================================================
# Stage 1: builder
# ====================================================
FROM node:22.19.0 AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

WORKDIR /app

# Create necessary directories
RUN mkdir -p meet-ce/typings meet-ce/frontend/webcomponent meet-ce/backend && \
    chown -R node:node .

USER node

# Copy workspace configuration files
COPY --chown=node:node pnpm-workspace.yaml .npmrc package.json pnpm-lock.yaml ./

# Copy package.json files for all workspace packages
COPY --chown=node:node meet-ce/typings/package.json ./meet-ce/typings/
COPY --chown=node:node meet-ce/frontend/package.json ./meet-ce/frontend/
COPY --chown=node:node meet-ce/frontend/webcomponent/package.json ./meet-ce/frontend/webcomponent/
COPY --chown=node:node meet-ce/backend/package.json ./meet-ce/backend/

# Install all dependencies using workspace
# RUN pnpm install --frozen-lockfile

# Copy the source code for all packages
COPY --chown=node:node meet-ce/typings/ ./meet-ce/typings/
COPY --chown=node:node meet-ce/frontend/ ./meet-ce/frontend/
COPY --chown=node:node meet-ce/backend/ ./meet-ce/backend/

# Copy additional necessary files
# COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node meet.sh .

ARG BASE_HREF=/

# Build OpenVidu Meet project
RUN pnpm install --frozen-lockfile && \
    ./meet.sh build --skip-install --base-href=${BASE_HREF}

# Clean up development dependencies and unnecessary files
# Keep backend node_modules for production stage
RUN rm -rf node_modules \
    meet-ce/frontend \
    meet-ce/backend/src \
    meet-ce/backend/openapi \
    meet-ce/backend/index.ts \
    meet-ce/typings/src \
    testapp

# ====================================================
# Stage 2: production
# ====================================================
FROM node:22.19.0-alpine3.21 AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate && ls -al .

WORKDIR /opt/openvidu-meet

#Copy main package.json and pnpm-workspace.yaml
COPY --from=builder --chown=node:node /app/meet.sh ./
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=node:node /app/.npmrc ./

# Copy the compiled backend with all node_modules from builder
COPY --from=builder --chown=node:node /app/meet-ce/backend/dist ./meet-ce/backend/dist
COPY --from=builder --chown=node:node /app/meet-ce/backend/public ./meet-ce/backend/public
COPY --from=builder --chown=node:node /app/meet-ce/backend/package.json ./meet-ce/backend/package.json

# Copy typings
COPY --from=builder --chown=node:node /app/meet-ce/typings/dist ./meet-ce/typings/dist
COPY --from=builder --chown=node:node /app/meet-ce/typings/package.json ./meet-ce/typings/package.json

# Copy entrypoint script
COPY meet-ce/docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN pnpm install --prod --filter openvidu-meet-backend --filter @openvidu-meet/typings

# Set permissions
RUN chmod +x /usr/local/bin/entrypoint.sh && \
	chmod +x meet.sh

# Switch to non-root user
USER node

# Environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE $SERVER_PORT

# Start the application
CMD ["/usr/local/bin/entrypoint.sh"]
