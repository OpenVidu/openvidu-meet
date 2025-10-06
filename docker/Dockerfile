# ====================================================
# Stage 1: builder
# ====================================================
FROM node:22.19.0 AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

RUN mkdir -p typings frontend backend && chown -R node:node /app

USER node

# Copy workspace configuration files
COPY --chown=node:node pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node package.json pnpm-lock.yaml ./

# Copy package.json files for better layer caching
COPY --chown=node:node typings/package.json ./typings/
COPY --chown=node:node frontend/package.json ./frontend/
COPY --chown=node:node backend/package.json ./backend/
COPY --chown=node:node frontend/webcomponent/package.json ./frontend/webcomponent/

# Install all dependencies using workspace
RUN pnpm install --frozen-lockfile

# Copy the rest of the project
COPY --chown=node:node . .

ARG BASE_HREF=/

# Prepare project
RUN chmod +x prepare.sh && \
	sh ./prepare.sh --typings --frontend --webcomponent --backend

# Clean up
RUN rm -rf frontend/node_modules backend/node_modules frontend/webcomponent/node_modules && \
	rm -rf typings

# ====================================================
# Stage 2: production
# ====================================================
FROM node:22.19.0-alpine3.21 AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /opt/openvidu-meet

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy the frontend and backend from the builder
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/public ./dist/public

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh && \
	chown -R node:node /opt/openvidu-meet

ENV NODE_ENV=production

EXPOSE $SERVER_PORT

CMD ["/usr/local/bin/entrypoint.sh"]
