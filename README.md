# OpenVidu Meet

OpenVidu Meet is a fully featured video conferencing application built with Angular, Node.js, and LiveKit. This repository provides both a Community Edition (CE) and a Professional Edition (PRO) with advanced features.

# Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Getting Started](#getting-started)
4. [Development](#development)
   - [Development Mode](#development-mode)
   - [Manual Development Setup](#manual-development-setup)
5. [Building](#building)
6. [Testing](#testing)
7. [Documentation](#documentation)
8. [Production Deployment](#production-deployment)
9. [Project Structure](#project-structure)
10. [Using the meet.sh Script](#using-the-meetsh-script)

## Architecture Overview

The OpenVidu Meet application is a monorepo managed with **pnpm workspaces** and consists of multiple interconnected packages:

[![OpenVidu Meet CE Architecture Overview](docs/openvidu-meet-ce-architecture.png)](/docs/openvidu-meet-ce-architecture.png)

### Core Components

- **Frontend** (`frontend/`): Angular 20 application providing the user interface
  - **shared-meet-components**: Reusable Angular library with shared components for administration and preferences
  - Integrates [openvidu-components-angular](https://github.com/OpenVidu/openvidu/tree/master/openvidu-components-angular) for core video conferencing functionality

- **Backend** (`backend/`): Node.js/TypeScript REST API server
  - Manages rooms, participants, recordings, and authentication
  - Serves the compiled frontend in production

- **Typings** (`typings/`): Shared TypeScript type definitions used across frontend and backend

- **Webcomponent** (`frontend/webcomponent/`): Standalone web component version of OpenVidu Meet

- **TestApp** (`testapp/`): Testing application for development and validation

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js**: Version 22 or higher
- **pnpm**: Package manager (will be installed automatically by meet.sh if missing)
- **LiveKit**: For local testing (optional)
  ```bash
  curl -sSL https://get.livekit.io/cli | bash
  ```


## Getting Started

Set up your local development environment by cloning the necessary repositories into a shared folder. This ensures the `openvidu-components-angular` library is available for development and linking.

```
your-dev-folder/
├── openvidu/
│   └── openvidu-components-angular/  # Core Angular components library
└── openvidu-meet/                     # This repository
```

> **Note:** Clone the `openvidu` repository alongside `openvidu-meet` to enable proper linking.
> If you haven't done so yet:
>
> ```bash
> git clone https://github.com/OpenVidu/openvidu.git
> ```

### Clone and Setup

```bash
# Clone the repository
git clone https://github.com/OpenVidu/openvidu-meet.git
cd openvidu-meet

# Start development mode with hot-reload
./meet.sh dev
```

Then, the application will be available at [http://localhost:6080](http://localhost:6080).

> **Note:** Livereload is also available at [http://localhost:5080](http://localhost:5080).

## Development

### Development Mode

The recommended way to develop is using the integrated development mode that watches all components:

```bash
./meet.sh dev
```

This command starts concurrent watchers for:
- **openvidu-components-angular**: Core Angular components library
- **Typings**: Shared type definitions with automatic sync
- **Backend**: Node.js server with nodemon auto-restart
- **Frontend**: Angular application with live reload
- **REST API Docs**: OpenAPI documentation generation

> [!NOTE]
> The backend uses `backend/.env.development` for environment variables during development. Configure your LiveKit credentials there:
> ```env
> LIVEKIT_URL=ws://localhost:7880
> LIVEKIT_API_KEY=your-api-key
> LIVEKIT_API_SECRET=your-api-secret
> ```

### Manual Development Setup

If you prefer more granular control:

```bash
# Install dependencies
./meet.sh install

# Build shared typings (required first)
./meet.sh build-typings

# In separate terminals:
# Terminal 1 - Backend
cd backend
pnpm run start:dev

# Terminal 2 - Frontend
cd frontend
pnpm run dev

# Terminal 3 - Typings watcher (optional)
cd typings
pnpm run dev
```

> [!IMPORTANT]
> **Shared Typings**: The `typings/` package contains types shared between frontend and backend. When you modify these types in development mode, they are automatically synced to both projects. Always build typings before building other components.

## Building

Build all components in the correct order:

```bash
# Build everything (typings → frontend → backend → webcomponent)
./meet.sh build

# Or build individual components:
./meet.sh build-typings          # Build shared types
./meet.sh build-webcomponent     # Build web component only
./meet.sh build-testapp          # Build test application
```

### CI/CD Optimized Builds

The `meet.sh` script supports flags to optimize CI/CD pipelines:

```bash
# Install dependencies once
./meet.sh install

# Build typings once
./meet.sh build-typings

# Build webcomponent (skip already completed steps)
./meet.sh build-webcomponent --skip-install --skip-typings

# Run tests without reinstalling
./meet.sh test-unit-webcomponent --skip-install
```

**Available flags:**
- `--skip-install`: Skip dependency installation
- `--skip-build`: Skip build steps
- `--skip-typings`: Skip typings build (use when already built)

## Testing

OpenVidu Meet includes comprehensive testing capabilities:

### Unit Tests

```bash
# Backend unit tests
./meet.sh test-unit-backend

# Webcomponent unit tests
./meet.sh test-unit-webcomponent
```

### End-to-End Tests

```bash
# Run E2E tests for webcomponent (installs Playwright automatically)
./meet.sh test-e2e-webcomponent

# Force reinstall Playwright browsers
./meet.sh test-e2e-webcomponent --force-install
```

### TestApp

The repository includes a dedicated testing application for manual testing:

```bash
# Build and start the test application
./meet.sh start-testapp
```

The test app will be available at [http://localhost:5080](http://localhost:5080)

> [!NOTE]
> The TestApp requires LiveKit CLI to be installed and configured for full functionality.

## Documentation

### Generate Documentation

```bash
# Generate webcomponent documentation
./meet.sh build-webcomponent-doc [output_dir]

# Generate REST API documentation
./meet.sh build-rest-api-doc [output_dir]
```

Documentation files will be generated in:
- **Webcomponent**: `docs/webcomponent-*.md` (events, commands, attributes)
- **REST API**: `backend/public/openapi/public.html`

If you specify an output directory, the documentation will be copied there.

## Production Deployment

### Using Docker

Build and run the production container:

```bash
# Build the Docker image (using meet.sh)
./meet.sh build-docker openvidu-meet-ce

# Build Docker image for demos (different BASE_HREF)
./meet.sh build-docker openvidu-meet-ce --demos

# Run the container
docker run \
  -e LIVEKIT_URL=<your-livekit-url> \
  -e LIVEKIT_API_KEY=<your-livekit-api-key> \
  -e LIVEKIT_API_SECRET=<your-livekit-api-secret> \
  -p 6080:6080 \
  openvidu-meet-ce
```

### Manual Production Start

```bash
# Build all components
./meet.sh build

# Start in production mode
./meet.sh start --prod

# Or start in CI mode
./meet.sh start --ci
```

### Environment Variables

Configure your production environment using these key variables:

- `LIVEKIT_URL`: WebSocket URL for LiveKit server
- `LIVEKIT_API_KEY`: LiveKit API key
- `LIVEKIT_API_SECRET`: LiveKit API secret
- `SERVER_PORT`: Backend server port (default: 6080)
- `NODE_ENV`: Environment mode (`development`, `production`, `ci`)

For a complete list of environment variables, see [backend/src/environment.ts](backend/src/environment.ts).

## Project Structure

```
openvidu-meet/
├── meet.sh                          # Main build and development script
├── pnpm-workspace.yaml              # pnpm workspace configuration
├── package.json                     # Root package with scripts
│
├── typings/                         # Shared TypeScript definitions
│   ├── src/
│   │   ├── api-key.ts
│   │   ├── auth-config.ts
│   │   ├── participant.ts
│   │   ├── event.model.ts
│   │   └── ...
│   └── package.json
│
├── frontend/                        # Angular frontend application
│   ├── src/                        # Main application source
│   ├── projects/
│   │   └── shared-meet-components/ # Reusable Angular library
│   └── webcomponent/               # Web component build
│
├── backend/                         # Node.js/Express backend
│   ├── src/
│   │   ├── controllers/            # REST API controllers
│   │   ├── services/               # Business logic
│   │   ├── middleware/             # Express middleware
│   │   └── environment.ts          # Environment configuration
│   ├── openapi/                    # OpenAPI specifications
│   └── public/                     # Static files (includes built frontend)
│
├── testapp/                         # Testing application
│   ├── src/
│   └── public/
│
├── docker/                          # Docker build files
│   └── create_image.sh
│
├── docs/                            # Generated documentation
├── scripts/                         # Build and utility scripts
└── openvidu-meet-pro/              # Professional Edition (separate license)
```

## Using the meet.sh Script

The `meet.sh` script is the main entry point for all development and build tasks:

### Command Reference

```bash
# Help
./meet.sh help

# Installation
./meet.sh install                    # Install all dependencies

# Building
./meet.sh build                      # Build all components
./meet.sh build-typings              # Build shared types only
./meet.sh build-webcomponent         # Build webcomponent only
./meet.sh build-testapp              # Build test application

# Development
./meet.sh dev                        # Start development mode with watchers

# Testing
./meet.sh test-unit-backend          # Run backend unit tests
./meet.sh test-unit-webcomponent     # Run webcomponent unit tests
./meet.sh test-e2e-webcomponent      # Run webcomponent E2E tests

# Running
./meet.sh start --prod               # Start in production mode
./meet.sh start --ci                 # Start in CI mode
./meet.sh start-testapp              # Start test application

# Documentation
./meet.sh build-webcomponent-doc [dir]  # Generate webcomponent docs
./meet.sh build-rest-api-doc [dir]      # Generate REST API docs

# Docker
./meet.sh build-docker <image-name> [--demos]  # Build Docker image
```

### Examples

```bash
# Full development workflow
./meet.sh install
./meet.sh dev

# CI/CD optimized workflow
./meet.sh install
./meet.sh build-typings
./meet.sh build-webcomponent --skip-install --skip-typings
./meet.sh test-unit-webcomponent --skip-install

# Production build and deploy
./meet.sh build
./meet.sh start --prod

# Build Docker image
./meet.sh build-docker openvidu-meet-ce

# Build Docker image for demos
./meet.sh build-docker openvidu-meet-ce --demos
```

## Technologies

- **Frontend**: Angular 20, Material Design, TypeScript
- **Backend**: Node.js, Express, TypeScript
- **WebRTC Infrastructure**: LiveKit
- **Package Manager**: pnpm (workspaces)
- **Build Tools**: Angular CLI, TypeScript Compiler, Rollup (webcomponent)
- **Testing**: Jest (unit), Playwright (E2E), Mocha
- **Documentation**: OpenAPI/Swagger, Custom generators

## Contributing

Contributions are welcome! Please ensure that:

1. All tests pass: `./meet.sh test-unit-backend && ./meet.sh test-unit-webcomponent`
2. Code is properly formatted
3. TypeScript types are correctly defined in `typings/`
4. Documentation is updated as needed

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

## Links

- [OpenVidu Website](https://openvidu.io/)
- [OpenVidu Meet](https://openvidu.io/latest/meet/)
---

For questions and support, visit our [community forum](https://openvidu.discourse.group/).
