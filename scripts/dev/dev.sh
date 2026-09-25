# Sourced by meet.sh for the dev command only, so no CI workflow watches this file.

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

# Helper: Add common commands (typings)
add_common_dev_commands() {
  # Typings watcher. It generates the typings-ready.flag file when done for other watchers to wait on.
  CMD_NAMES+=("typings-ce")
  CMD_COLORS+=("bgGreen.black")
  CMD_COMMANDS+=("./scripts/dev/watch-typings.sh ce")
}

add_optional_commands() {
  local include_testapp="$1"
  local include_webcomponent="$2"

  # Webcomponent testapp (Angular UI + webhook bridge on :5080/:5081)
  if [ "$include_testapp" = true ]; then
    CMD_NAMES+=("testapp")
    CMD_COLORS+=("bgMagenta.white")
    CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:testapp'")
  fi

  # Webcomponent bundle watcher
  if [ "$include_webcomponent" = true ]; then
    CMD_NAMES+=("webcomponent")
    CMD_COLORS+=("bgBlue.white")
    CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:webcomponent'")
  fi
}

# Helper: Add CE-specific commands (backend, frontend)
add_ce_commands() {
  # REST API docs watcher
  CMD_NAMES+=("rest-api-docs")
  CMD_COLORS+=("bgGray")
  CMD_COMMANDS+=("pnpm run dev:rest-api-docs")

  # Run backend
  CMD_NAMES+=("backend")
  CMD_COLORS+=("cyan")
  CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:backend'")

  # Run frontend
  CMD_NAMES+=("frontend")
  CMD_COLORS+=("magenta")
  CMD_COMMANDS+=("node ./scripts/dev/watch-with-typings-guard.mjs 'pnpm run dev:frontend'")
}

# Helper: Add PRO-specific commands (shared-meet-components, backend-pro, backend-ce-watch, frontend-pro)
add_pro_commands() {
  local shared_meet_components_path="meet-ce/frontend/projects/shared-meet-components/dist/package.json"

  # frontend-pro resolves the library from its compiled dist, whereas the CE frontend compiles it from source.
  # Removing the previous build's package.json makes frontend-pro wait for a fresh one.
  rm -f "${shared_meet_components_path}"
  CMD_NAMES+=("shared-meet-components")
  CMD_COLORS+=("bgYellow.dark")
  CMD_COMMANDS+=("pnpm --filter @openvidu-meet/frontend run lib:serve")

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

# Helper: Launch all development watchers using concurrently
launch_dev_watchers() {
  local edition="$1"

  echo -e "${YELLOW}⏳ Launching all development watchers...${NC}"
  echo -e "${BLUE}Edition: ${edition}${NC}"
  echo -e "${BLUE}Processes: ${#CMD_NAMES[@]}${NC}"
  echo

  # Build concurrently arguments from arrays
  local names_arg=$(IFS=,; echo "${CMD_NAMES[*]}")
  local colors_arg=$(IFS=,; echo "${CMD_COLORS[*]}")

  # Not through `pnpm exec`: on Ctrl+C it returns before the watchers stop, so their output lands after the prompt
  ./node_modules/.bin/concurrently -k \
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

  # Initialize command arrays
  CMD_NAMES=()
  CMD_COLORS=()
  CMD_COMMANDS=()

  # Add common commands (typings)
  add_common_dev_commands

  # Add optional commands (testapp, webcomponent)
  add_optional_commands "$include_testapp" "$include_webcomponent"

  # Add edition-specific commands
  if [ "$edition" = "pro" ]; then
    add_pro_commands
  else
    add_ce_commands
  fi

  # Launch all watchers
  launch_dev_watchers "$edition"
}
