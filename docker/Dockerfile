### Stage 0: Build common types library
FROM node:20 as build-common-types

USER node

WORKDIR /app/meet-common-types

COPY --chown=node:node types/ ./

RUN npm install && \
	npm run build:prod && \
	npm pack && \
	rm -rf node_modules dist


### Stage 1: Build the frontend
FROM node:20 as build-frontend

USER node

WORKDIR /app/frontend

ARG BASE_HREF=/

COPY --chown=node:node frontend/ ./
COPY --from=build-common-types /app/meet-common-types/openvidu-meet-common-types-**.tgz ./

RUN npm install && \
	npm run lib:build && \
	npm run lib:pack && \
	mv dist/shared-meet-components/shared-meet-components-**.tgz . && \
	npm install shared-meet-components-**.tgz && \
    npm run build:prod ${BASE_HREF}

### Stage 2: Build the backend
FROM node:20 as build-backend

USER node

WORKDIR /app/backend

COPY --chown=node:node backend/package*.json ./
COPY --from=build-common-types /app/meet-common-types/openvidu-meet-common-types-**.tgz ./

RUN npm install

COPY --chown=node:node backend/ ./

RUN mkdir -p /app/backend/dist/src && chown -R node:node /app/backend/dist

# Copy static files from the frontend build
COPY --from=build-frontend /app/frontend/dist/openvidu-meet /app/backend/dist/public

RUN npm run build:prod


### Stage 3: Final production image
FROM node:20-alpine as production

WORKDIR /opt/openvidu-meet

COPY --from=build-common-types /app/meet-common-types/openvidu-meet-common-types-**.tgz ./
COPY --from=build-backend /app/backend/dist ./dist
COPY --from=build-backend /app/backend/package*.json ./

RUN npm install --production && npm cache clean --force

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh && \
	chown -R node:node /opt/openvidu-meet

EXPOSE $SERVER_PORT

CMD ["/usr/local/bin/entrypoint.sh"]
