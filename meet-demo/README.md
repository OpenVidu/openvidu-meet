# OpenVidu Meet Demo

## Prerequisites

- [Node](https://nodejs.org/en/download) (for local development)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose (for containerized deployment)

## Run Locally

> [!NOTE]
> Before running the application, you must also run [OpenVidu Local Deployment](https://github.com/OpenVidu/openvidu-local-deployment).

1. Download repository

```bash
git clone https://github.com/OpenVidu/openvidu-meet-tutorials.git
cd openvidu-meet-tutorials/meet-demo
```

2. Install dependencies

```bash
npm install
```

3. Run the application

```bash
npm start
```

4. Access the application at `http://localhost:6080`

## Deploy with Docker

For production deployment with Docker and HTTPS support via Caddy, see the [deployment directory](./deployment/README.md).

## Configuration

The application can be configured using environment variables:

| Variable             | Description                              | Default                 |
| -------------------- | ---------------------------------------- | ----------------------- |
| `SERVER_PORT`        | Port where the server will listen        | `6080`                  |
| `OV_MEET_SERVER_URL` | URL of the OpenVidu Meet server          | `http://localhost:9080` |
| `OV_MEET_API_KEY`    | API key for OpenVidu Meet authentication | `meet-api-key`          |
