# ====================================================
# Stage 1: builder
# ====================================================
FROM node:22.14.0-alpine3.21 AS builder

WORKDIR /app

RUN mkdir -p types frontend backend && chown -R node:node /app

USER node

COPY --chown=node:node frontend/package*.json ./frontend/
COPY --chown=node:node backend/package*.json ./backend/
COPY --chown=node:node types/package*.json ./types/
COPY --chown=node:node . .

WORKDIR /app/frontend

ARG BASE_HREF=/

RUN npm install
# Sync types from the types package
RUN npm run types:sync
# Build the fronted for production
RUN npm run build:prod ${BASE_HREF}

WORKDIR /app/backend

RUN npm install
# Sync types from the types package
RUN npm run types:sync
# Build the backend for production
RUN npm run build:prod

# ====================================================
# Stage 2: production
# ====================================================
FROM node:22.14.0-alpine3.21 AS production

WORKDIR /opt/openvidu-meet

COPY backend/package*.json ./
RUN npm ci --production

# Copy the frontend and backend from the builder
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/public ./dist/public

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh && \
	chown -R node:node /opt/openvidu-meet

ENV NODE_ENV=production

EXPOSE $SERVER_PORT

CMD ["/usr/local/bin/entrypoint.sh"]
