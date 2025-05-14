#!/bin/bash

set -e

# Build typings library
cd typings
npm install
npm run sync-ce
cd ..

# Build backend
cd backend
npm install
npm run build:prod
cd ..

# Build frontend
cd frontend
npm install
npm run build:prod
cd ..

# Build webcomponent
cd frontend/webcomponent
npm install
npm run build
cd ../..