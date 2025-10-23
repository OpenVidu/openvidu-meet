#!/bin/bash

# ============================================================================
# prepare-ci-build.sh
# ============================================================================
# This script prepares the workspace for CI/Docker builds by:
# 1. Switching to Docker-specific workspace configuration
# 2. Installing openvidu-components-angular from npm or tarball
# 3. Installing all dependencies
#
# Usage:
#   ./scripts/prepare-ci-build.sh [options]
#
# Options:
#   --components-angular-version <version>   Install from npm registry (e.g., 3.4.0)
#   --components-angular-tarball <path>          Install from tarball (e.g., ./components.tgz)
#   --help                    Show this help message
#
# Examples:
#   # Install from npm registry
#   ./scripts/prepare-ci-build.sh --components-angular-version 3.4.0
#
#   # Install from tarball
#   ./scripts/prepare-ci-build.sh --components-angular-tarball ./openvidu-components-angular.tgz
#
# See docs/ci-docker-dependencies-strategy.md for more information.
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables
NPM_VERSION=""
TARBALL_PATH=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to update package.json files
update_package_json() {
  local package_path="$1"
  local version="$2"

  if [ -f "$package_path" ]; then
    # Replace workspace:* with specific version
    sed -i 's#"openvidu-components-angular": "workspace:\*"#"openvidu-components-angular": "'"$version"'"#g' "$package_path"
    echo "✓ Updated $package_path: workspace:* → $version"
  fi
}

show_help() {
  echo -e "${BLUE}============================================================================${NC}"
  echo -e "${BLUE}  OpenVidu Meet - Prepare CI Build${NC}"
  echo -e "${BLUE}============================================================================${NC}"
  echo ""
  echo -e "${GREEN}Usage:${NC}"
  echo -e "  ./scripts/prepare-ci-build.sh [options]"
  echo ""
  echo -e "${GREEN}Options:${NC}"
  echo -e "  ${YELLOW}--components-angular-version <version>${NC}   Install openvidu-components-angular from npm registry"
  echo -e "  ${YELLOW}--components-angular-tarball <path>${NC}          Install openvidu-components-angular from tarball"
  echo -e "  ${YELLOW}--help${NC}                    Show this help message"
  echo ""
  echo -e "${GREEN}Examples:${NC}"
  echo -e "  # Install from npm registry"
  echo -e "  ./scripts/prepare-ci-build.sh --components-angular-version 3.4.0"
  echo ""
  echo -e "  # Install from tarball"
  echo -e "  ./scripts/prepare-ci-build.sh --components-angular-tarball ./openvidu-components-angular.tgz"
  echo ""
  echo -e "${BLUE}For more information, see:${NC} docs/ci-docker-dependencies-strategy.md"
  echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --components-angular-version)
      NPM_VERSION="$2"
      shift 2
      ;;
    --components-angular-tarball)
      TARBALL_PATH="$2"
      shift 2
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      echo -e "${RED}Error: Unknown option '$1'${NC}"
      show_help
      exit 1
      ;;
  esac
done

# Validate arguments
if [ -z "$NPM_VERSION" ] && [ -z "$TARBALL_PATH" ]; then
  echo -e "${RED}Error: You must specify either --components-angular-version or --components-angular-tarball${NC}"
  show_help
  exit 1
fi

if [ -n "$NPM_VERSION" ] && [ -n "$TARBALL_PATH" ]; then
  echo -e "${RED}Error: You cannot specify both --components-angular-version and --components-angular-tarball${NC}"
  show_help
  exit 1
fi

# Validate tarball exists
if [ -n "$TARBALL_PATH" ]; then
  if [ ! -f "$TARBALL_PATH" ]; then
    echo -e "${RED}Error: Tarball not found: $TARBALL_PATH${NC}"
    exit 1
  fi
  # Convert to absolute path
  TARBALL_PATH="$(cd "$(dirname "$TARBALL_PATH")" && pwd)/$(basename "$TARBALL_PATH")"
fi

cd "$PROJECT_ROOT"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}  Preparing CI Build${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Step 1: Switch to Docker workspace configuration
echo -e "${YELLOW}[1/4] Switching to Docker workspace configuration...${NC}"
if [ ! -f "pnpm-workspace.docker.yaml" ]; then
  echo -e "${RED}Error: pnpm-workspace.docker.yaml not found${NC}"
  exit 1
fi
if [ ! -f ".npmrc.docker" ]; then
  echo -e "${RED}Error: .npmrc.docker not found${NC}"
  exit 1
fi

cp pnpm-workspace.docker.yaml pnpm-workspace.yaml
cp .npmrc.docker .npmrc
echo -e "${GREEN}✓ Workspace configuration updated${NC}"
echo ""

# Step 2: Copy tarball if needed
if [ -n "$TARBALL_PATH" ]; then
  echo -e "${YELLOW}[2/4] Copying tarball to meet-ce/frontend/...${NC}"
  mkdir -p meet-ce/frontend
  TARBALL_NAME="$(basename "$TARBALL_PATH")"
  if [ -f "meet-ce/frontend/$TARBALL_NAME" ]; then
    echo -e "${GREEN}✓ Tarball already exists: $TARBALL_NAME${NC}"
  else
    cp "$TARBALL_PATH" meet-ce/frontend/
    echo -e "${GREEN}✓ Tarball copied: $TARBALL_NAME${NC}"
  fi
  echo ""
fi

# Step 3: Install openvidu-components-angular
echo -e "${YELLOW}[3/4] Installing openvidu-components-angular...${NC}"

if [ -n "$NPM_VERSION" ]; then
  echo -e "  ${BLUE}Installing from npm registry: $NPM_VERSION${NC}"

  # Update package.json files before installation
  update_package_json "meet-ce/frontend/package.json" "$NPM_VERSION"
  update_package_json "meet-ce/frontend/projects/shared-meet-components/package.json" "$NPM_VERSION"

  # Install in both packages
  # echo "Installing in meet-ce/frontend..."
  # pnpm add --filter @openvidu-meet/frontend  openvidu-components-angular@$NPM_VERSION

  # echo "Installing in shared-meet-components..."
  # pnpm add --filter @openvidu-meet/shared-components  openvidu-components-angular@$NPM_VERSION

  # echo -e "${GREEN}✓ Installed from npm: openvidu-components-angular@$NPM_VERSION${NC}"
elif [ -n "$TARBALL_PATH" ]; then
  TARBALL_NAME="$(basename "$TARBALL_PATH")"
  echo -e "  ${BLUE}Installing from tarball: $TARBALL_NAME${NC}"


  # Update package.json files before installation
  update_package_json "meet-ce/frontend/package.json" "file:./$TARBALL_NAME"
  update_package_json "meet-ce/frontend/projects/shared-meet-components/package.json" "file:../../$TARBALL_NAME"

  # Install in both packages
  # echo "Installing in meet-ce/frontend..."
  # pnpm add --filter @openvidu-meet/frontend "openvidu-components-angular@$TARBALL_REF"

  # echo "Installing in shared-meet-components..."
  # pnpm add --filter @openvidu-meet/shared-components "openvidu-components-angular@file:../$TARBALL_NAME"
  # pnpm install --recursive
  # echo -e "${GREEN}✓ Installed from tarball: $TARBALL_NAME${NC}"
fi
echo ""

# Step 4: Install all dependencies
echo -e "${YELLOW}[4/4] Installing all dependencies...${NC}"
pnpm install --recursive
echo -e "${GREEN}✓ All dependencies installed${NC}"
echo ""

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}  ✓ CI Build preparation completed successfully!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  - Build the project: ${YELLOW}./meet.sh build${NC}"
echo -e "  - Build Docker image: ${YELLOW}docker build -f meet-ce/docker/Dockerfile .${NC}"
echo ""
echo -e "${BLUE}Note:${NC} To restore development configuration, run:"
echo -e "  ${YELLOW}git checkout pnpm-workspace.yaml .npmrc${NC}"
echo -e "  ${YELLOW}pnpm install${NC}"
echo ""
