#!/bin/bash

set -e

# Colors for messages
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initially, don't build anything
BUILD_TYPINGS=false
BUILD_FRONTEND=false
BUILD_BACKEND=false
BUILD_WEBCOMPONENT=false
BUILD_TESTAPP=false

# Function to display help
show_help() {
  echo -e "${BLUE}Usage:${NC} ./prepare.sh [options]"
  echo
  echo "Options:"
  echo "  --typings       Build types library"
  echo "  --frontend      Build frontend"
  echo "  --backend       Build backend"
  echo "  --webcomponent  Build webcomponent"
  echo "  --testapp       Build testapp"
  echo "  --all           Build all artifacts (default)"
  echo "  --help          Show this help"
  echo
  echo "If no arguments are provided, all artifacts will be built."
  echo
  echo -e "${YELLOW}Example:${NC} ./prepare.sh --frontend --backend"
}

# If no arguments, build everything
if [ $# -eq 0 ]; then
  BUILD_TYPINGS=true
  BUILD_FRONTEND=true
  BUILD_BACKEND=true
  BUILD_WEBCOMPONENT=true
  BUILD_TESTAPP=true
else
  # Process arguments
  for arg in "$@"
  do
    case $arg in
      --typings)
        BUILD_TYPINGS=true
        ;;
      --frontend)
        BUILD_FRONTEND=true
        ;;
      --backend)
        BUILD_BACKEND=true
        ;;
      --webcomponent)
        BUILD_WEBCOMPONENT=true
        ;;
      --testapp)
        BUILD_TESTAPP=true
        ;;
      --all)
        BUILD_TYPINGS=true
        BUILD_FRONTEND=true
        BUILD_BACKEND=true
        BUILD_WEBCOMPONENT=true
        BUILD_TESTAPP=true
        ;;
      --help)
        show_help
        exit 0
        ;;
      *)
        echo -e "${YELLOW}Unknown option: $arg${NC}"
        show_help
        exit 1
        ;;
    esac
  done
fi

# Build typings if selected
if [ "$BUILD_TYPINGS" = true ]; then
  echo -e "${GREEN}Building types library...${NC}"
  cd typings
  npm install
  npm run sync-ce
  cd ..
fi

# Build frontend if selected
if [ "$BUILD_FRONTEND" = true ]; then
  echo -e "${GREEN}Building frontend...${NC}"
  cd frontend
  npm install
  npm run build:prod
  cd ..
fi

# Build backend if selected
if [ "$BUILD_BACKEND" = true ]; then
  echo -e "${GREEN}Building backend...${NC}"
  cd backend
  npm install
  npm run build:prod
  cd ..
fi

# Build webcomponent if selected
if [ "$BUILD_WEBCOMPONENT" = true ]; then
  echo -e "${GREEN}Building webcomponent...${NC}"
  cd frontend/webcomponent
  npm install
  npm run build
  cd ../..
fi

# Build testapp if selected
if [ "$BUILD_TESTAPP" = true ]; then
  echo -e "${GREEN}Building testapp...${NC}"
  cd testapp
  npm install
  npm run build
  cd ..
fi

echo -e "${BLUE}Preparation completed!${NC}"