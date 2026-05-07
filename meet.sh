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
BASE_HREF=${BASE_HREF:-/}

# Function to check if pnpm is installed
check_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    printf "${RED}Error: pnpm is not installed.${NC}\n"
    printf "${YELLOW}pnpm is required to run this script.${NC}\n\n"
    printf "Would you like to install pnpm globally? (y/n): "
    read REPLY
    case "$REPLY" in
      [Yy]*)
        printf "${BLUE}Installing pnpm globally (requires sudo)...${NC}\n"
        if sudo npm install -g pnpm; then
          printf "${GREEN}pnpm installed successfully!${NC}\n"
        else
          printf "${RED}Failed to install pnpm. Please install it manually.${NC}\n"
          exit 1
        fi
        ;;
      *)
        printf "${YELLOW}pnpm installation cancelled. Please install it manually and try again.${NC}\n"
        exit 1
        ;;
    esac
  fi
}


# Parse global flags from arguments
parse_global_flags() {
  SKIP_INSTALL=false
  SKIP_BUILD=false
  SKIP_TYPINGS=false
  BASE_HREF="/"

  while [ $# -gt 0 ]; do
    case "$1" in
      --skip-install)
        SKIP_INSTALL=true
        ;;
      --skip-build)
        SKIP_BUILD=true
        ;;
      --skip-typings)
        SKIP_TYPINGS=true
        ;;
      --base-href)
        shift
        BASE_HREF="$1"
        ;;
      --base-href=*)
        BASE_HREF="${1#*=}"
        ;;
      *)
        # Unknown argument, ignore
        ;;
    esac
    shift
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
  echo -e "  ${YELLOW}--base-href <path>${NC} Set base href for frontend build (default: /)"
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
  echo -e "    ${YELLOW}Options:${NC} --force-install-browsers    Force reinstall of Playwright browsers"
  echo -e "             ${NC} --skip-install-browsers     Skip Playwright browsers installation"
  echo
  echo -e "  ${BLUE}test-e2e-frontend${NC}"
  echo "    Run migrated OpenVidu Components end-to-end tests in frontend project"
  echo -e "    ${YELLOW}Options:${NC} --force-install-browsers    Force reinstall of Playwright browsers"
  echo -e "             ${NC} --skip-install-browsers     Skip Playwright browsers installation"
  echo
  echo -e "  ${BLUE}dev${NC}"
  echo "    Start development mode with watchers"
  echo -e "    ${YELLOW}Options:${NC} --testapp        Include testapp watcher"
  echo -e "             ${NC} --webcomponent   Include webcomponent watcher"
  echo
  echo -e "  ${BLUE}start${NC}"
  echo "    Start OpenVidu Meet in production or CI mode"
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
  echo -e "  ${BLUE}build-docker${NC} <image-name> [--demos]"
  echo "    Build Docker image (use --demos for demo deployment)"
  echo
  echo -e "  ${BLUE}help${NC}"
  echo "    Show this help message"
  echo
  echo -e "  ${BLUE}clone-pro${NC}"
  echo "    Clone the private 'meet-pro' repository into ./meet-pro if you have access"
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
  pnpm install --frozen-lockfile
}

# Build typings
build_typings() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building Typings${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo
  install_dependencies
  pnpm run build:typings
  echo -e "${GREEN}✓ Typings built successfully!${NC}"
}

# Build entire project
build_project() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building OpenVidu Meet${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  install_dependencies
  echo

  echo -e "${GREEN}Building all components...${NC}"
  export BASE_HREF
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

# Check if meet-pro directory exists and is a valid git repository
check_meet_pro_exists() {
  local pro_dir="meet-pro"

  # Check if directory exists
  if [ ! -d "$pro_dir" ]; then
    return 1
  fi

  # Check if it's a git repository
  if [ ! -d "$pro_dir/.git" ]; then
    return 1
  fi

  # Check if the git remote matches the expected repository
  local remote_url
  remote_url=$(git -C "$pro_dir" config --get remote.origin.url 2>/dev/null || echo "")

  if echo "$remote_url" | grep -q "OpenVidu/openvidu-meet-pro"; then
    return 0
  else
    return 1
  fi
}

# Ensure Playwright Chromium browser is installed in a shared cache
ensure_playwright_chromium() {
  local force_install="$1"
  local skip_install_browsers="$2"

  if [ "$skip_install_browsers" = true ]; then
    echo -e "${YELLOW}Skipping Playwright browsers installation (--skip-install-browsers flag).${NC}"
    return 0
  fi

  echo -e "${GREEN}Preparing Playwright browsers (chromium)...${NC}"
  PW_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/tmp/ms-playwright}
  mkdir -p "$PW_BROWSERS_PATH"

  MARKER_FILE="$PW_BROWSERS_PATH/.playwright_chromium_installed"

  local force_arg=""
  if [ "$force_install" = true ]; then
    echo -e "${YELLOW}Force install requested. Reinstalling Playwright browsers (chromium).${NC}"
    force_arg="--force"
  fi

  echo -e "${GREEN}Installing Playwright browsers (chromium)...${NC}"
  # Use a single deterministic CLI path to avoid version-resolution discrepancies.
  PLAYWRIGHT_BROWSERS_PATH="$PW_BROWSERS_PATH" node ./node_modules/@playwright/test/cli.js install --with-deps chromium $force_arg
  PLAYWRIGHT_VER=$(PLAYWRIGHT_BROWSERS_PATH="$PW_BROWSERS_PATH" node ./node_modules/@playwright/test/cli.js --version 2>/dev/null || true)

  echo "installed_at=$(date --iso-8601=seconds)" > "$MARKER_FILE" || true
  echo "playwright_version=$PLAYWRIGHT_VER" >> "$MARKER_FILE" || true
}

# Run e2e tests for webcomponent
test_e2e_webcomponent() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Running Webcomponent E2E Tests${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  # Parse optional flags
  FORCE_INSTALL=false
  SKIP_INSTALL_BROWSERS=false
  for arg in "$@"; do
    case "$arg" in
      --force-install-browsers|--force-install|-f)
        FORCE_INSTALL=true
        ;;
      --skip-install-browsers)
        SKIP_INSTALL_BROWSERS=true
        ;;
    esac
  done

  install_dependencies

  ensure_playwright_chromium "$FORCE_INSTALL" "$SKIP_INSTALL_BROWSERS"

  echo -e "${GREEN}Running webcomponent E2E tests...${NC}"
  pnpm run test:e2e-webcomponent
}

# Run migrated e2e tests for frontend
test_e2e_frontend() {
  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Running Frontend E2E Components Tests${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  # Parse optional flags
  FORCE_INSTALL=false
  SKIP_INSTALL_BROWSERS=false
  for arg in "$@"; do
    case "$arg" in
      --force-install-browsers|--force-install|-f)
        FORCE_INSTALL=true
        ;;
      --skip-install-browsers)
        SKIP_INSTALL_BROWSERS=true
        ;;
    esac
  done

  install_dependencies

  ensure_playwright_chromium "$FORCE_INSTALL" "$SKIP_INSTALL_BROWSERS"

  echo -e "${GREEN}Running frontend migrated E2E tests...${NC}"
  pnpm run test:e2e-frontend-components
}

# Helper: Prompt user to select edition (CE or PRO)
select_edition() {
  # This function performs interactive selection and stores the
  # result in the global variable SELECTED_EDITION. It intentionally
  # does not write the selection to stdout so callers can invoke it
  # directly (not via command substitution) and see prompts in the terminal.
  if ! check_meet_pro_exists; then
    SELECTED_EDITION="ce"
    return
  fi

  echo -e "${YELLOW}Meet PRO repository detected!${NC}"
  echo -e "${GREEN}Which edition do you want to run?${NC}"
  echo -e "  ${BLUE}1)${NC} Community Edition (CE)"
  echo -e "  ${BLUE}2)${NC} Professional Edition (PRO)"
  echo
  printf "Enter your choice (1 or 2): "
  read CHOICE
  echo

  case "$CHOICE" in
    1)
      echo -e "${GREEN}Starting Community Edition (CE)...${NC}"
      SELECTED_EDITION="ce"
      ;;
    2)
      echo -e "${GREEN}Starting Professional Edition (PRO)...${NC}"
      SELECTED_EDITION="pro"
      ;;
    *)
      echo -e "${YELLOW}Invalid choice. Defaulting to Community Edition (CE)...${NC}"
      SELECTED_EDITION="ce"
      ;;
  esac
}

# Helper: Add common commands (typings, docs)
add_common_dev_commands() {
  # Typings watcher. It generates the typings-ready.flag file when done for other watchers to wait on.
  CMD_NAMES+=("typings-ce")
  CMD_COLORS+=("bgGreen.black")
  CMD_COMMANDS+=("./scripts/dev/watch-typings.sh ce")

  # shared-meet-components watcher
  CMD_NAMES+=("shared-meet-components")
  CMD_COLORS+=("bgYellow.dark")
  CMD_COMMANDS+=("pnpm --filter @openvidu-meet/frontend run lib:serve")

}

add_optional_commands() {
  local include_testapp="$1"
  local include_webcomponent="$2"

  # Testapp
  if [ "$include_testapp" = true ]; then
    CMD_NAMES+=("testapp")
    CMD_COLORS+=("blue")
    CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:testapp'")
  fi

  # Webcomponent bundle watcher
  if [ "$include_webcomponent" = true ]; then
    CMD_NAMES+=("webcomponent")
    CMD_COLORS+=("bgMagenta.black")
    CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:webcomponent'")
  fi
}

# Helper: Add CE-specific commands (backend, frontend)
add_ce_commands() {
  local shared_meet_components_path="$1"

  # REST API docs watcher
  CMD_NAMES+=("rest-api-docs")
  CMD_COLORS+=("bgGray")
  CMD_COMMANDS+=("pnpm run dev:rest-api-docs")

  # Run backend
  CMD_NAMES+=("backend")
  CMD_COLORS+=("cyan")
  CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:backend'")

  # Run frontend after shared-meet-components is ready
  CMD_NAMES+=("frontend")
  CMD_COLORS+=("magenta")
  CMD_COMMANDS+=("wait-on ${shared_meet_components_path} && sleep 1 && node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:frontend'")
}

# Helper: Add PRO-specific commands (backend-pro, backend-ce-watch, frontend-pro)
add_pro_commands() {
  local shared_meet_components_path="$1"

  # Run backend-pro
  CMD_NAMES+=("backend-pro")
  CMD_COLORS+=("cyan")
  CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:pro-backend'")

  # Watch backend-ce
  CMD_NAMES+=("backend-ce-watch")
  CMD_COLORS+=("bgCyan.white")
  CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run --filter @openvidu-meet/backend build:watch'")

  # Run frontend-pro after shared-meet-components are ready
  CMD_NAMES+=("frontend-pro")
  CMD_COLORS+=("magenta")
  CMD_COMMANDS+=("wait-on ${shared_meet_components_path} && sleep 1 && node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:pro-frontend'")

  # Typings watcher for PRO edition. It generates the typings-ready.flag file when done for other watchers to wait on.
  CMD_NAMES+=("typings-pro")
  CMD_COLORS+=("bgGreen.black")
  CMD_COMMANDS+=("./scripts/dev/watch-typings.sh pro")
}

# Helper: Add REST API docs and browser-sync commands
add_browsersync_commands() {
  local browsersync_path="$1"

  # Browser-sync for live reload
  CMD_NAMES+=("browser-sync")
  CMD_COLORS+=("bgWhite.black")
  CMD_COMMANDS+=("node --input-type=module -e \"
    import browserSync from 'browser-sync';
    import chalk from 'chalk';

    const bs = browserSync.create();
    const port = 6081;

    bs.init({
      proxy: 'http://localhost:6080',
      files: ['${browsersync_path}'],
      open: false,
      reloadDelay: 200,
      port
    });

    bs.emitter.on('browser:reload', () => {
      const now = Date.now();
      const time = new Date().toLocaleTimeString();
      console.log(chalk.yellowBright('🔁 Browser reloaded at ' + time));

      const urls = bs.getOption('urls');
      const local = urls?.get('local') ?? 'undefined';
      const external = urls?.get('external') ?? 'undefined';
      console.log(chalk.cyanBright('   OpenVidu Meet:    http://localhost:6080'));
      console.log(chalk.cyanBright('   OpenVidu Meet Testapp:    http://localhost:5080'));
      console.log(chalk.cyanBright('   Live reload Local:    ' + local));
      console.log(chalk.cyanBright('   Live reload LAN: ' + external));

      console.log(chalk.gray('---------------------------------------------'));
    });
    \"")
}

# Helper: Launch all development watchers using concurrently
launch_dev_watchers() {
  local edition="$1"
  local shared_meet_components_path="$2"

  echo -e "${YELLOW}⏳ Launching all development watchers...${NC}"
  echo -e "${BLUE}Edition: ${edition}${NC}"
  echo -e "${BLUE}Processes: ${#CMD_NAMES[@]}${NC}"
  echo

  # Clean up shared-meet-components package.json to ensure wait-on works
  rm -rf "${shared_meet_components_path}"

  # Build concurrently arguments from arrays
  local names_arg=$(IFS=,; echo "${CMD_NAMES[*]}")
  local colors_arg=$(IFS=,; echo "${CMD_COLORS[*]}")

  # Execute all commands concurrently
  pnpm exec concurrently -k \
    --names "$names_arg" \
    --prefix-colors "$colors_arg" \
    "${CMD_COMMANDS[@]}"
}

# Start development mode with watchers
dev() {
  local include_testapp=false
  local include_webcomponent=false

  for arg in "$@"; do
    case "$arg" in
      --testapp)
        include_testapp=true
        ;;
      --webcomponent)
        include_webcomponent=true
        ;;
    esac
  done

  echo -e "${BLUE}=============================================${NC}"
  echo -e "${BLUE}  🚀 Starting OpenVidu Meet in dev mode...${NC}"
  echo -e "${BLUE}=============================================${NC}"
  echo

  install_dependencies

  # Determine which edition to run (CE or PRO)
  select_edition
  local edition=${SELECTED_EDITION:-ce}
  echo

  # Define paths
  local shared_meet_components_path="meet-ce/frontend/projects/shared-meet-components/dist/package.json"
  local browsersync_path

  # Initialize command arrays
  CMD_NAMES=()
  CMD_COLORS=()
  CMD_COMMANDS=()

  # Add common commands (typings, shared-meet-components)
  add_common_dev_commands

  # Add optional commands (testapp, webcomponent)
  add_optional_commands "$include_testapp" "$include_webcomponent"

  # Add edition-specific commands and set paths
  if [ "$edition" = "pro" ]; then
    browsersync_path="meet-pro/backend/public/**/*"
    add_pro_commands "$shared_meet_components_path"
  else
    browsersync_path="meet-ce/backend/public/**/*"
    add_ce_commands "$shared_meet_components_path"
  fi

  # Add browser-sync commands
  add_browsersync_commands "$browsersync_path"

  # Launch all watchers
  launch_dev_watchers "$edition" "$shared_meet_components_path"
}

# Start OpenVidu Meet services in prod or ci mode
start() {
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
      NODE_ENV=production pnpm --filter @openvidu-meet/backend run start
      ;;
    ci)
      echo -e "${BLUE}Building and starting in CI mode...${NC}"
      NODE_ENV=ci pnpm --filter @openvidu-meet/backend run start
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

    if [ -f "docs/webcomponent-events.md" ] && \
       [ -f "docs/webcomponent-commands.md" ] && \
       [ -f "docs/webcomponent-attributes.md" ]; then
      echo -e "${GREEN}Copying documentation to: $output_dir${NC}"
      cp docs/webcomponent-{events,commands,attributes}.md "$output_dir"/
      echo -e "${GREEN}✓ Documentation copied successfully!${NC}"
      rm -f docs/webcomponent-{events,commands,attributes}.md
    else
      echo -e "${RED}Error: Documentation files not found in docs/ directory${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}No output directory specified. Documentation remains in docs/ directory.${NC}"
    output_dir="docs"
  fi

  local abs_path
  if command -v realpath >/dev/null 2>&1; then
    abs_path=$(realpath "$output_dir")
  elif command -v readlink >/dev/null 2>&1; then
    abs_path=$(readlink -f "$output_dir" 2>/dev/null || (cd "$output_dir" && pwd))
  else
    abs_path=$(cd "$output_dir" && pwd)
  fi

  echo
  echo -e "${GREEN}✓ Webcomponent documentation generated successfully!${NC}"
  echo -e "${YELLOW}Output directory: ${abs_path}${NC}"
}


# Build REST API documentation
build_rest_api_doc() {
  local output_target="$1"
  CE_REST_API_DOC_PATH="meet-ce/backend/public/openapi/"

  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building REST API Docs${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  check_pnpm

  # Solo instalar si no existen dependencias locales del backend
  if [ ! -d "node_modules" ] || [ ! -d "meet-ce/backend/node_modules" ]; then
    echo -e "${YELLOW}Backend dependencies not found. Installing minimal backend deps...${NC}"
    pnpm --filter @openvidu-meet/backend install
  else
    echo -e "${GREEN}Backend dependencies already present. Skipping install.${NC}"
  fi

  echo -e "${GREEN}Generating REST API documentation...${NC}"
  pnpm run build:rest-api-docs

  # Determinar si el parámetro es archivo o directorio
  local output_dir output_file
  if [[ "$output_target" =~ \.html$ ]]; then
    output_dir=$(dirname "$output_target")
    output_file="$output_target"
  else
    output_dir="${output_target%/}"
    output_file="$output_dir/public.html"
  fi

  # Crear carpeta contenedora si no existe
  if [ ! -d "$output_dir" ]; then
    echo -e "${YELLOW}Creating output directory: $output_dir${NC}"
    mkdir -p "$output_dir"
  fi

  # Preguntar si el archivo ya existe
  if [ -f "$output_file" ]; then
    echo -e "${YELLOW}Warning: '$output_file' already exists.${NC}"
    read -rp "Do you want to overwrite it? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo -e "${RED}Operation cancelled by user.${NC}"
      exit 1
    fi
  fi

  # Copiar documentación
  if [ -f "$CE_REST_API_DOC_PATH/public.html" ]; then
    echo -e "${GREEN}Copying REST API documentation to: $output_file${NC}"
    cp "$CE_REST_API_DOC_PATH/public.html" "$output_file"
    echo -e "${GREEN}✓ Documentation copied successfully!${NC}"
  else
    echo -e "${RED}Error: REST API documentation files not found${NC}"
    exit 1
  fi

  echo
  echo -e "${GREEN}✓ REST API documentation generated successfully!${NC}"
  echo -e "${YELLOW}Output file: $(cd "$(dirname "$output_file")" && pwd)/$(basename "$output_file")${NC}"
}

# Clone private meet-pro repository into repository root
clone_meet_pro() {
  # Allow override of repo URL via environment variable
  REPO_URL=${MEET_PRO_REPO_URL:-git@github.com:OpenVidu/openvidu-meet-pro.git}
  TARGET_DIR="meet-pro"

  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Cloning meet-pro (private)${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  if [ -d "$TARGET_DIR" ]; then
    echo -e "${YELLOW}Directory '$TARGET_DIR' already exists. Skipping clone.${NC}"
    return 0
  fi

  echo -e "${GREEN}Attempting to clone '$REPO_URL' into ./$TARGET_DIR...${NC}"
  # Use shallow clone to be quicker by default
  if git clone "$REPO_URL" "$TARGET_DIR"; then
    echo
    echo -e "${GREEN}✓ Repository cloned into ./$TARGET_DIR${NC}"
    return 0
  else
    echo
    echo -e "${RED}✗ Failed to clone repository '$REPO_URL'.${NC}"
    echo -e "${YELLOW}This repository is private and requires appropriate access (SSH key or HTTPS credentials).${NC}"
    echo
    echo -e "${BLUE}Suggestions:${NC}"
    echo -e "  - Ensure your SSH key is added to your GitHub account and ssh-agent is running (for SSH URL)."
    echo -e "    Example: ssh-add ~/.ssh/id_rsa"
    echo -e "  - Or set MEET_PRO_REPO_URL to an HTTPS URL that contains credentials (not recommended for security)."
    echo -e "    Example: export MEET_PRO_REPO_URL=\"https://<token>@github.com/OpenVidu/openvidu-meet-pro.git\""
    echo -e "  - If you still can't clone, verify you have access to 'OpenVidu/openvidu-meet-pro' on GitHub.${NC}"
    echo
    return 1
  fi
}

# Build Docker image
build_docker() {
  local image_name="$1"
  shift || true  # Remove first argument (image name)

  # Validate arguments
  if [ -z "$image_name" ]; then
    echo -e "${RED}Error: You need to specify an image name${NC}"
    echo -e "${YELLOW}Usage: ./meet.sh build-docker <image-name> [--demos]${NC}"
    exit 1
  fi

  # Parse flags
  local is_demos=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --demos)
        is_demos=true
        shift
        ;;
      *)
        # ignore unknown flags for forward compatibility
        shift
        ;;
    esac
  done

  # Prepare metadata
  local final_image_name="$image_name"
  local base_href="/"
  if [ "$is_demos" = true ]; then
    final_image_name="${image_name}-demos"
    base_href="/openvidu-meet/"
    echo -e "${GREEN}Building demos image: $final_image_name${NC}"
  else
    echo -e "${GREEN}Building production image: $final_image_name${NC}"
  fi

  echo -e "${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Building Docker Image${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo

  echo -e "${GREEN}Using BASE_HREF: $base_href${NC}"

  export BUILDKIT_PROGRESS=plain
  if docker build --pull --no-cache --rm=true -f meet-ce/docker/Dockerfile -t "$final_image_name" --build-arg BASE_HREF="$base_href" .; then
    echo
    echo -e "${GREEN}✓ Docker image '$final_image_name' built successfully!${NC}"
  else
    echo
    echo -e "${RED}✗ Failed to build Docker image '$final_image_name'${NC}"
    exit 1
  fi


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
    test-e2e-frontend)
      test_e2e_frontend "$@"
      ;;
    dev)
      dev
      ;;
    start)
      start "$@"
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
    build-docker)
      build_docker "$@"
      ;;
    clone-pro)
      clone_meet_pro
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
