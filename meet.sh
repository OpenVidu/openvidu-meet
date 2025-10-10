#!/bin/bash

set -e

# Colors for messages
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Global flags (can be set via environment or arguments)
SKIP_INSTALL=${SKIP_INSTALL:-false}
SKIP_BUILD=${SKIP_BUILD:-false}
SKIP_TYPINGS=${SKIP_TYPINGS:-false}

# Function to check if pnpm is installed
check_pnpm() {
  if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}Error: pnpm is not installed.${NC}"
    echo -e "${YELLOW}pnpm is required to run this script.${NC}"
    echo
    read -p "Would you like to install pnpm globally? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${BLUE}Installing pnpm globally (requires sudo)...${NC}"
      if sudo npm install -g pnpm; then
        echo -e "${GREEN}pnpm installed successfully!${NC}"
      else
        echo -e "${RED}Failed to install pnpm. Please install it manually.${NC}"
        echo -e "${YELLOW}You can install it with: npm install -g pnpm${NC}"
        exit 1
      fi
    else
      echo -e "${YELLOW}pnpm installation cancelled. Please install pnpm manually and try again.${NC}"
      echo -e "${YELLOW}You can install it with: sudo npm install -g pnpm${NC}"
      exit 1
    fi
  fi
}

# Parse global flags from arguments
parse_global_flags() {
  for arg in "$@"; do
    case "$arg" in
      --skip-install)
        SKIP_INSTALL=true
        ;;
      --skip-build)
        SKIP_BUILD=true
        ;;
      --skip-typings)
        SKIP_TYPINGS=true
        ;;
    esac
  done
}

# Function to display help
show_help() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   OpenVidu Meet - Build Script${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo
  echo -e "${GREEN}Usage:${NC} ./meet.sh [command] [options]"
  echo
  echo -e "${GREEN}Global Options (can be used with any command):${NC}"
  echo -e "  ${YELLOW}--skip-install${NC}    Skip dependency installation (useful in CI)"
  echo -e "  ${YELLOW}--skip-build${NC}      Skip build steps (for testing only)"
  echo -e "  ${YELLOW}--skip-typings${NC}    Skip typings build (when already built)"
  echo
  echo -e "${GREEN}Commands:${NC}"
  echo
  echo -e "  ${BLUE}install${NC}"
  echo "    Install all dependencies (pnpm install)"
  echo
  echo -e "  ${BLUE}build${NC}"
  echo "    Build all project components (typings, frontend, backend, webcomponent)"
  echo
  echo -e "  ${BLUE}build-typings${NC}"
  echo "    Build only the shared typings"
  echo
  echo -e "  ${BLUE}build-webcomponent${NC}"
  echo "    Build only the webcomponent package"
  echo
  echo -e "  ${BLUE}build-testapp${NC}"
  echo "    Build the testapp"
  echo
  echo -e "  ${BLUE}test-unit-webcomponent${NC}"
  echo "    Run unit tests for the webcomponent project"
  echo
  echo -e "  ${BLUE}test-unit-backend${NC}"
  echo "    Run unit tests for the backend project"
  echo
  echo -e "  ${BLUE}test-e2e-webcomponent${NC}"
  echo "    Run end-to-end tests for the webcomponent project"
  echo -e "    ${YELLOW}Options:${NC} --force-install    Force reinstall of Playwright browsers"
  echo
  echo -e "  ${BLUE}dev${NC}"
  echo "    Start development mode with watchers"
  echo
  echo -e "  ${BLUE}start${NC}"
  echo "    Start services in production or CI mode"
  echo -e "    ${YELLOW}Options:${NC} --prod    Start in production mode"
  echo -e "            ${NC} --ci      Start in CI mode"
  echo
  echo -e "  ${BLUE}start-testapp${NC}"
  echo "    Start the testapp"
  echo
  echo -e "  ${BLUE}build-webcomponent-doc${NC} [output_dir]"
  echo "    Generate webcomponent documentation"
  echo
  echo -e "  ${BLUE}build-rest-api-doc${NC} [output_dir]"
  echo "    Generate REST API documentation"
  echo
  echo -e "  ${BLUE}help${NC}"
  echo "    Show this help message"
  echo
  echo -e "${GREEN}CI/CD Optimized Examples:${NC}"
  echo -e "  ${YELLOW}# Install once${NC}"
  echo -e "  ./meet.sh install"
  echo
  echo -e "  ${YELLOW}# Build typings once${NC}"
  echo -e "  ./meet.sh build-typings"
  echo
  echo -e "  ${YELLOW}# Start development mode${NC}"
  echo -e "  ./meet.sh dev"
  echo
  echo -e "  ${YELLOW}# Build webcomponent (skip install & typings)${NC}"
  echo -e "  ./meet.sh build-webcomponent --skip-install --skip-typings"
  echo
  echo -e "  ${YELLOW}# Run tests (skip install)${NC}"
  echo -e "  ./meet.sh test-unit-webcomponent --skip-install"
  echo
}

# Install dependencies
install_dependencies() {
  if [ "$SKIP_INSTALL" = true ]; then
    echo -e "${YELLOW}Skipping dependency installation (--skip-install flag)${NC}"
    return 0
  fi

  check_pnpm
  echo -e "${BLUE}Installing dependencies...${NC}"
  pnpm install
}

# Build typings
build_typings() {
  if [ "$SKIP_TYPINGS" = true ]; then
    echo -e "${YELLOW}Skipping typings build (--skip-typings flag)${NC}"
    return 0
  fi

  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building Typings${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo
  check_pnpm
  pnpm run build:typings
  echo -e "${GREEN}✓ Typings built successfully!${NC}"
}

# Build entire project
build_project() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building OpenVidu Meet Project${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  install_dependencies
  echo

  echo -e "${GREEN}Building all components...${NC}"
  pnpm run build

  echo
  echo -e "${GREEN}✓ Build completed successfully!${NC}"
}

# Build only webcomponent
build_webcomponent() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building Webcomponent${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  install_dependencies
  build_typings
  echo

  echo -e "${GREEN}Building webcomponent...${NC}"
  pnpm run build:webcomponent

  echo
  echo -e "${GREEN}✓ Webcomponent build completed successfully!${NC}"
}

# Build testapp
build_testapp() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building TestApp${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  install_dependencies
  build_typings
  echo

  echo -e "${GREEN}Building testapp...${NC}"
  pnpm run build:testapp
  echo -e "${GREEN}✓ Testapp build completed successfully!${NC}"
}

# Run unit tests for webcomponent
test_unit_webcomponent() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Running Webcomponent Unit Tests${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  install_dependencies

  echo -e "${GREEN}Running webcomponent unit tests...${NC}"
  pnpm run test:unit-webcomponent
}

# Run unit tests for backend
test_unit_backend() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Running Backend Unit Tests${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  install_dependencies

  echo -e "${GREEN}Running backend unit tests...${NC}"
  pnpm run test:unit-backend
}

# Run e2e tests for webcomponent
test_e2e_webcomponent() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Running Webcomponent E2E Tests${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  # Parse optional flags
  FORCE_INSTALL=false
  for arg in "$@"; do
    case "$arg" in
      --force-install|-f)
        FORCE_INSTALL=true
        ;;
    esac
  done

  install_dependencies

  echo -e "${GREEN}Preparing Playwright browsers (chromium)...${NC}"
  PW_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/tmp/ms-playwright}
  mkdir -p "$PW_BROWSERS_PATH"

  MARKER_FILE="$PW_BROWSERS_PATH/.playwright_chromium_installed"

  chromium_present=false
  if ls "$PW_BROWSERS_PATH" 2>/dev/null | grep -qi chromium; then
    chromium_present=true
  fi

  if [ "$FORCE_INSTALL" = true ]; then
    echo -e "${YELLOW}Force install requested. Will reinstall Playwright browsers.${NC}"
    chromium_present=false
  fi

  if [ "$chromium_present" = true ] && [ -f "$MARKER_FILE" ]; then
    echo -e "${GREEN}Chromium already installed in $PW_BROWSERS_PATH, skipping install.${NC}"
  else
    echo -e "${GREEN}Installing Playwright browsers...${NC}"
    PLAYWRIGHT_BROWSERS_PATH="$PW_BROWSERS_PATH" pnpm exec playwright install --with-deps chromium
    PLAYWRIGHT_VER=$(PLAYWRIGHT_BROWSERS_PATH="$PW_BROWSERS_PATH" pnpm exec playwright --version 2>/dev/null || true)
    echo "installed_at=$(date --iso-8601=seconds)" > "$MARKER_FILE" || true
    echo "playwright_version=$PLAYWRIGHT_VER" >> "$MARKER_FILE" || true
  fi

  echo -e "${GREEN}Running webcomponent E2E tests...${NC}"
  pnpm run test:e2e-webcomponent
}


dev(){
  echo -e "${BLUE}Starting development mode (watchers)...${NC}"
  install_dependencies
  # Define commands for concurrent execution
  COMPONENTS_CMD="npm --prefix ../openvidu/openvidu-components-angular run lib:serve"
  TYPINGS_CMD="./scripts/dev/watch-typings.sh"
  BACKEND_CMD="node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:backend'"
  FRONTEND_CMD="sleep 1 && wait-on ../openvidu/openvidu-components-angular/dist/openvidu-components-angular/package.json && node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:frontend'"
  REST_API_DOCS_CMD="pnpm run dev:rest-api-docs"

  # Run commands concurrently
  pnpm exec concurrently -k \
    -n components-angular,typings,backend,frontend,rest-api-docs \
    -c red,green,cyan,magenta,yellow \
    "$COMPONENTS_CMD" \
    "$TYPINGS_CMD" \
    "$BACKEND_CMD" \
    "$FRONTEND_CMD" \
    "$REST_API_DOCS_CMD"
}


# Start services
start_services() {
  MODE=""
  for arg in "$@"; do
    case "$arg" in
      --prod)
        MODE="prod" ;;
      --ci)
        MODE="ci" ;;
    esac
  done

  if [ -z "$MODE" ]; then
    echo -e "${RED}Error: start command requires --prod or --ci option${NC}"
    echo -e "${YELLOW}Usage: ./meet.sh start --prod  or  ./meet.sh start --ci${NC}"
    exit 1
  fi

  case "$MODE" in
    prod)
      echo -e "${BLUE}Building and starting in production mode...${NC}"
      NODE_ENV=production pnpm --filter openvidu-meet-backend run start:prod
      ;;
    ci)
      echo -e "${BLUE}Building and starting in CI mode...${NC}"
      NODE_ENV=ci pnpm --filter openvidu-meet-backend run start:ci
      ;;
  esac
}

# Start testapp
start_testapp() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Starting TestApp${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  install_dependencies
  echo -e "${GREEN}Starting testapp...${NC}"
  pnpm run start:testapp
}

# Build webcomponent documentation
build_webcomponent_doc() {
  local output_dir="$1"

  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building Webcomponent Docs${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  check_pnpm

  echo -e "${GREEN}Generating webcomponent documentation...${NC}"
  pnpm run build:webcomponent-doc

  if [ -n "$output_dir" ]; then
    output_dir="${output_dir%/}"

    if [ ! -d "$output_dir" ]; then
      echo -e "${YELLOW}Creating output directory: $output_dir${NC}"
      mkdir -p "$output_dir"
    fi

    if [ -f "docs/webcomponent-events.md" ] && [ -f "docs/webcomponent-commands.md" ] && [ -f "docs/webcomponent-attributes.md" ]; then
      echo -e "${GREEN}Copying documentation to: $output_dir${NC}"
      cp docs/webcomponent-events.md "$output_dir/webcomponent-events.md"
      cp docs/webcomponent-commands.md "$output_dir/webcomponent-commands.md"
      cp docs/webcomponent-attributes.md "$output_dir/webcomponent-attributes.md"
      echo -e "${GREEN}✓ Documentation copied successfully!${NC}"
    else
      echo -e "${RED}Error: Documentation files not found in docs/ directory${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}No output directory specified. Documentation remains in docs/ directory.${NC}"
  fi

  echo
  echo -e "${GREEN}✓ Webcomponent documentation generated successfully!${NC}"
}

# Build REST API documentation
build_rest_api_doc() {
  local output_dir="$1"

  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building REST API Docs${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  check_pnpm

  echo -e "${GREEN}Generating REST API documentation...${NC}"
  pnpm run build:rest-api-docs

  if [ -n "$output_dir" ]; then
    output_dir="${output_dir%/}"

    if [ ! -d "$output_dir" ]; then
      echo -e "${YELLOW}Creating output directory: $output_dir${NC}"
      mkdir -p "$output_dir"
    fi

    if [ -f "backend/public/openapi/public.html" ]; then
      echo -e "${GREEN}Copying REST API documentation to: $output_dir${NC}"
      cp backend/public/openapi/public.html "$output_dir/public.html"
      echo -e "${GREEN}✓ Documentation copied successfully!${NC}"
    else
      echo -e "${RED}Error: REST API documentation files not found${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}No output directory specified. Documentation remains in backend/ directory.${NC}"
  fi

  echo
  echo -e "${GREEN}✓ REST API documentation generated successfully!${NC}"
}

# Main script logic
main() {
  if [ $# -eq 0 ]; then
    echo -e "${YELLOW}No command specified.${NC}"
    echo
    show_help
    exit 1
  fi

  command="$1"
  shift

  # Parse global flags
  parse_global_flags "$@"

  case "$command" in
    install)
      SKIP_INSTALL=false  # Force install even if flag was set
      install_dependencies
      ;;
    build)
      build_project
      ;;
    build-typings)
      SKIP_TYPINGS=false  # Force build typings
      build_typings
      ;;
    build-webcomponent)
      build_webcomponent
      ;;
    build-testapp)
      build_testapp
      ;;
    test-unit-webcomponent)
      test_unit_webcomponent
      ;;
    test-unit-backend)
      test_unit_backend
      ;;
    test-e2e-webcomponent)
      test_e2e_webcomponent "$@"
      ;;
    dev)
      dev
      ;;
    start)
      start_services "$@"
      ;;
    start-testapp)
      start_testapp
      ;;
    build-webcomponent-doc)
      build_webcomponent_doc "$1"
      ;;
    build-rest-api-doc)
      build_rest_api_doc "$1"
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      echo -e "${RED}Error: Unknown command '$command'${NC}"
      echo
      show_help
      exit 1
      ;;
  esac
}

# Run main function with all arguments
main "$@"
