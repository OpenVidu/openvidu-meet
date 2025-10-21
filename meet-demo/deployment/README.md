# OpenVidu Meet Demo - Deployment Guide

This directory contains all the files needed to deploy the OpenVidu Meet Demo application using Docker and Caddy as a reverse proxy with automatic HTTPS.

## Structure

```
deployment/
├── docker-compose.yml # Docker Compose configuration
├── Dockerfile         # Application Docker image
├── Caddyfile          # Caddy reverse proxy configuration
├── .env               # Environment variables
└── README.md          # This file
```

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Domain name pointing to your server (for HTTPS with Caddy)
- Ports 80 and 443 available on your server

### Steps

1. **Configure environment variables**: Edit the `.env` file to set your domain and OpenVidu Meet server details.

| Variable             | Description                              | Default                         |
| -------------------- | ---------------------------------------- | ------------------------------- |
| `DOMAIN`             | Domain name for HTTPS (Caddy)            | `meet-demo-app.openvidu.io`     |
| `OV_MEET_SERVER_URL` | URL of the OpenVidu Meet server          | `https://meet-demo.openvidu.io` |
| `OV_MEET_API_KEY`    | API key for OpenVidu Meet authentication | `meet-api-key`                  |

2. **Build the Docker image**: Build and push the Docker image to your registry if needed.

```bash
docker build -t openvidu/openvidu-meet-demo:{version} ..
docker push openvidu/openvidu-meet-demo:{version}
```

3. **Start the services**

```bash
docker-compose up -d
```

4. **Access the application**: Open your web browser and navigate to `https://meet-demo-app.openvidu.io` (or your configured domain).
