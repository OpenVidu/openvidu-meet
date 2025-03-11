# OpenVidu Meet

# Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development](#development)
   - [1. Clone the Repository](#1-clone-the-openvidu-meet-repository)
   - [2. Prepare the Project](#2-prepare-the-project)
   - [3. Start the Backend](#3-start-the-backend)
   - [4. Start the Frontend](#4-start-the-frontend)
3. [Build (with Docker)](#build-with-docker)
   - [Build the Backend Image](#build-the-backend-image)
   - [Run the Backend Container](#run-the-backend-container)




## Architecture Overview

The OpenVidu Meet application is composed of two main parts (frontend and backend) that interact with each other to provide the video conferencing service. The following diagram illustrates the architecture of the application:

[![OpenVidu Meet CE Architecture Overview](docs/openvidu-meet-ce-architecture.png)](/docs/openvidu-meet-ce-architecture.png)

- **Frontend**: The frontend is a web application built with Angular that provides the user interface for the video conferencing service. This project contains the **shared-meet-components** subproject, which is a library of shared components that share administration and preference components.

  Also, the frontend project installs external dependencies on the following libraries:

  - [**openvidu-components-angular**](https://github.com/OpenVidu/openvidu/tree/master/openvidu-components-angular): A library of Angular components that provide the core functionality of the video conferencing service.
  - [**typing**](./types/): Common types used by the frontend and backend.

- **Backend**: The backend is a Node.js application.
  - [**typings**](./types/): Common types used by the frontend and backend.

## Development

For development purposes, you can run the application locally by following the instructions below.

**1. Clone the OpenVidu Meet repository:**

```bash
git clone https://github.com/OpenVidu/openvidu-meet.git
```

**2. Prepare the project**

For building types and install dependencies, run the following command:

```bash
cd openvidu-meet
./prepare.sh
```

> [!NOTE]
> **The script prepare and build all necessary dependencies and typings for running the frontend and backend.**
>
>
> - For building the **typings**, you can run the following command in the frontend and backend directories:
>
>   ```bash
>   cd frontend
>   npm run types:sync
>   ```
>
>   ```bash
>   cd backend
>   npm run types:sync
>   ```

**3. Start the Backend**


```bash
cd backend && \
npm run start:dev
```

**4. Start the Frontend**

Opening a new tab, under root directory:

```bash
cd frontend && \
npm run build:dev
```
This command will build the frontend application and move the files to the backend project. It will also listen for changes in the frontend application and rebuild the application when changes are detected.

After running these commands, you can access the frontend application at [http://localhost:6080](http://localhost:6080).


## Build (with docker)

### Build the backend image

```bash
cd docker
./create_image.sh openvidu-meet-ce
```

### Run the backend container

Once the image is created, you can run the container with the following command:

```bash
docker run \
  -e LIVEKIT_URL=<your-livekit-url> \
  -e LIVEKIT_API_KEY=<your-livekit-api-key> \
  -e LIVEKIT_API_SECRET=<your-livekit-api-secret> \
  -p 6080:6080 \
  openvidu-meet-ce
```
You can check all the available environment variables in the [environment file](backend/src/environment.ts).