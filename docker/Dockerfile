# ====================================================
# Stage 1: builder
# ====================================================
FROM node:22.19.0 AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

WORKDIR /app

# Create necessary directories
RUN mkdir -p typings frontend/webcomponent backend && chown -R node:node /app

USER node

# Copy workspace configuration files
COPY --chown=node:node pnpm-workspace.yaml .npmrc package.json pnpm-lock.yaml ./

# Copy package.json files for all workspace packages
COPY --chown=node:node typings/package.json ./typings/
COPY --chown=node:node frontend/package.json ./frontend/
COPY --chown=node:node frontend/webcomponent/package.json ./frontend/webcomponent/
COPY --chown=node:node backend/package.json ./backend/

# Install all dependencies using workspace
RUN pnpm install --frozen-lockfile

# Copy the source code for all packages
COPY --chown=node:node typings/ ./typings/
COPY --chown=node:node frontend/ ./frontend/
COPY --chown=node:node backend/ ./backend/

# Copy additional necessary files
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node meet.sh .

ARG BASE_HREF=/

# Build OpenVidu Meet project
RUN sh ./meet.sh build --skip-install --base-href=${BASE_HREF}

# Clean up development dependencies and unnecessary files
# Keep backend node_modules for production stage
RUN rm -rf frontend/node_modules \
    frontend/webcomponent/node_modules \
    typings/node_modules \
    frontend/src \
    frontend/projects \
    frontend/tests \
    frontend/webcomponent/src \
    frontend/webcomponent/tests \
    backend/src \
    backend/test-results \
    typings/src

# ====================================================
# Stage 2: production
# ====================================================
FROM node:22.19.0-alpine3.21 AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

WORKDIR /opt/openvidu-meet

#Copy main package.json and pnpm-workspace.yaml
COPY --from=builder --chown=node:node /app/meet.sh ./
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/pnpm-lock.yaml ./
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=node:node /app/.npmrc ./

# Copy the compiled backend with all node_modules from builder
COPY --from=builder --chown=node:node /app/backend/dist ./backend/dist
COPY --from=builder --chown=node:node /app/backend/public ./backend/public
COPY --from=builder --chown=node:node /app/backend/package.json ./backend/package.json

# Copy typings
COPY --from=builder --chown=node:node /app/typings/dist ./typings/dist
COPY --from=builder --chown=node:node /app/typings/package.json ./typings/package.json

# Copy entrypoint script
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN pnpm install --prod --frozen-lockfile

# Set permissions
RUN chmod +x /usr/local/bin/entrypoint.sh && \
	chmod +x meet.sh

# Switch to non-root user
USER node

# Environment variables
ENV NODE_ENV=production

# Expose port (default 6080, can be overridden)
EXPOSE $SERVER_PORT

# Start the application
CMD ["/usr/local/bin/entrypoint.sh"]
