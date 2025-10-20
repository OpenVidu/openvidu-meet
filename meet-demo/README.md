# OpenVidu Meet Demo

## Prerequisites

-   [Node](https://nodejs.org/en/download) (for local development)
-   [Docker](https://docs.docker.com/get-docker/) (for containerized deployment)

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

## Run with Docker

### Using Docker CLI

1. Build the Docker image

```bash
docker build -t openvidu/openvidu-meet-demo .
```

2. Run the container

```bash
docker run -d \
  --name meet-demo \
  -p 6080:6080 \
  -e OV_MEET_SERVER_URL=https://meet.openvidu.io \
  -e OV_MEET_API_KEY=meet-api-key \
  openvidu/openvidu-meet-demo
```

3. Access the application at `http://localhost:6080`

## Configuration

The application can be configured using environment variables:

| Variable             | Description                              | Default                 |
| -------------------- | ---------------------------------------- | ----------------------- |
| `SERVER_PORT`        | Port where the server will listen        | `6080`                  |
| `OV_MEET_SERVER_URL` | URL of the OpenVidu Meet server          | `http://localhost:9080` |
| `OV_MEET_API_KEY`    | API key for OpenVidu Meet authentication | `meet-api-key`          |
