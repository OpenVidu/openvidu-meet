FROM node:22-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

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
