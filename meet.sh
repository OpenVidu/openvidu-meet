#!/bin/bash

set -e

# Colors for messages
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

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

# Function to display help
show_help() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   OpenVidu Meet - Build Script${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo
  echo -e "${GREEN}Usage:${NC} ./meet.sh [command] [options]"
  echo
  echo -e "${GREEN}Commands:${NC}"
  echo
  echo -e "  ${BLUE}build${NC}"
  echo "    Build all project components (typings, frontend, backend, webcomponent, testapp)"
  echo
  echo -e "  ${BLUE}build-webcomponent${NC}"
  echo "    Build only the webcomponent package"
  echo
  echo -e "  ${BLUE}test-unit-webcomponent${NC}"
  echo "    Run unit tests for the webcomponent project"
  echo
  echo -e "  ${BLUE}test-e2e-webcomponent${NC}"
  echo "    Run end-to-end tests for the webcomponent project (install Playwright chromium)"
  echo -e "    ${YELLOW}Options:${NC} --force-install|-f    Force reinstall of Playwright browsers"
  echo
  echo -e "  ${BLUE}start${NC}"
  echo "    Start development mode with hot-reload for all components"
  echo
  echo -e "  ${BLUE}build-webcomponent-doc${NC} [output_dir]"
  echo "    Generate webcomponent documentation"
  echo -e "    ${YELLOW}output_dir${NC}: Optional. Directory where documentation will be copied"
  echo -e "    ${YELLOW}Example:${NC} ./meet.sh build-webcomponent-doc /path/to/docs"
  echo
  echo -e "  ${BLUE}build-rest-api-doc${NC} [output_dir]"
  echo "    Generate REST API documentation"
  echo -e "    ${YELLOW}output_dir${NC}: Optional. Directory where documentation will be copied"
  echo -e "    ${YELLOW}Example:${NC} ./meet.sh build-rest-api-doc /path/to/docs"
  echo
  echo -e "  ${BLUE}help${NC}"
  echo "    Show this help message"
  echo
  echo -e "${GREEN}Examples:${NC}"
  echo -e "  ${YELLOW}./meet.sh build${NC}                           # Build entire project"
  echo -e "  ${YELLOW}./meet.sh start${NC}                           # Start development mode"
  echo
}

# Function to build the entire project
build_project() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building OpenVidu Meet Project${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  check_pnpm

  echo -e "${BLUE}Installing dependencies...${NC}"
  pnpm install
  echo

  echo -e "${GREEN}Building all components...${NC}"
  pnpm run build

  echo
  echo -e "${GREEN}✓ Build completed successfully!${NC}"
}

# Function to start development mode
start_dev() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Starting Development Mode${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  check_pnpm

  echo -e "${BLUE}Installing dependencies...${NC}"
  pnpm install
  echo

  echo -e "${GREEN}Starting development servers...${NC}"
  pnpm run dev
}

# Function to build only webcomponent
build_webcomponent() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building Webcomponent${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  check_pnpm

  echo -e "${GREEN}Installing dependencies...${NC}"
  pnpm install
  echo

  echo -e "${GREEN}Building webcomponent...${NC}"
  pnpm run build:webcomponent

  echo
  echo -e "${GREEN}✓ Webcomponent build completed successfully!${NC}"
}

# Function to run unit tests for webcomponent
test_unit_webcomponent() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Running Webcomponent Unit Tests${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  check_pnpm

  echo -e "${GREEN}Running webcomponent unit tests...${NC}"
  pnpm run test:unit-webcomponent
}

# Function to run e2e tests for webcomponent (install browser deps first)
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

  check_pnpm


  echo -e "${GREEN}Preparing Playwright browsers (chromium)...${NC}"
  # Respect existing PLAYWRIGHT_BROWSERS_PATH or use default
  PW_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/tmp/ms-playwright}
  mkdir -p "$PW_BROWSERS_PATH"

  MARKER_FILE="$PW_BROWSERS_PATH/.playwright_chromium_installed"

  chromium_present=false
  # Heuristic: check for any entry with 'chromium' in the browsers path
  if ls "$PW_BROWSERS_PATH" 2>/dev/null | grep -qi chromium; then
    chromium_present=true
  fi

  if [ "$FORCE_INSTALL" = true ]; then
    echo -e "${YELLOW}Force install requested. Will reinstall Playwright browsers.${NC}"
    chromium_present=false
  fi

  if [ "$chromium_present" = true ] && [ -f "$MARKER_FILE" ]; then
    echo -e "${GREEN}Chromium appears already installed and marker found in $PW_BROWSERS_PATH, skipping install.${NC}"
  else
    echo -e "${GREEN}Chromium not found or marker missing. Installing Playwright browsers...${NC}"
    PLAYWRIGHT_BROWSERS_PATH="$PW_BROWSERS_PATH" pnpm exec playwright install --with-deps chromium
    # Write marker with timestamp and optional playwright version
    PLAYWRIGHT_VER=$(PLAYWRIGHT_BROWSERS_PATH="$PW_BROWSERS_PATH" pnpm exec playwright --version 2>/dev/null || true)
    echo "installed_at=$(date --iso-8601=seconds)" > "$MARKER_FILE" || true
    echo "playwright_version=$PLAYWRIGHT_VER" >> "$MARKER_FILE" || true
  fi

  echo -e "${GREEN}Running webcomponent E2E tests...${NC}"
  pnpm run test:e2e-webcomponent

}

# Function to build webcomponent documentation
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
    # Remove trailing slash if present
    output_dir="${output_dir%/}"

    # Create output directory if it doesn't exist
    if [ ! -d "$output_dir" ]; then
      echo -e "${YELLOW}Creating output directory: $output_dir${NC}"
      mkdir -p "$output_dir"
    fi

    # Check if documentation files were generated
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

# Function to build REST API documentation
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
    # Remove trailing slash if present
    output_dir="${output_dir%/}"

    # Create output directory if it doesn't exist
    if [ ! -d "$output_dir" ]; then
      echo -e "${YELLOW}Creating output directory: $output_dir${NC}"
      mkdir -p "$output_dir"
    fi

    # Check if documentation files were generated
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
  shift  # Remove first argument (command)

  case "$command" in
    build)
      build_project
      ;;
    build-webcomponent)
      build_webcomponent
      ;;
    start)
      start_dev
      ;;
    build-webcomponent-doc)
      build_webcomponent_doc "$1"
      ;;
    test-e2e-webcomponent)
      test_e2e_webcomponent
      ;;
    test-unit-webcomponent)
      test_unit_webcomponent
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