# ====================================================
# Stage 1: builder
# ====================================================
FROM node:22.29.0 AS builder

WORKDIR /app

RUN mkdir -p typings frontend backend && chown -R node:node /app

USER node

COPY --chown=node:node frontend/package*.json ./frontend/
COPY --chown=node:node backend/package*.json ./backend/
COPY --chown=node:node typings/package*.json ./typings/
COPY --chown=node:node . .

ARG BASE_HREF=/

# Prepare project
RUN chmod +x prepare.sh && \
	sh ./prepare.sh --typings --frontend --webcomponent --backend

# Clean up
RUN rm -rf frontend/node_modules backend/node_modules && \
	rm -rf typings

# ====================================================
# Stage 2: production
# ====================================================
FROM node:22.29.0-alpine3.21 AS production

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
