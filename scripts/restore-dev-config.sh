#!/bin/bash

# ============================================================================
# restore-dev-config.sh
# ============================================================================
# This script restores the development workspace configuration after
# preparing for CI/Docker builds.
#
# Usage:
#   ./scripts/restore-dev-config.sh
#
# This will:
# 1. Restore pnpm-workspace.yaml from git
# 2. Restore .npmrc from git
# 3. Reinstall dependencies with workspace linking enabled
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}  Restoring Development Configuration${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Step 1: Restore workspace configuration and package.json files
echo -e "${YELLOW}[1/4] Restoring workspace configuration and package.json files...${NC}"

# List of files to restore
FILES_TO_RESTORE=(
  "pnpm-workspace.yaml"
  ".npmrc"
  "meet-ce/frontend/package.json"
  "meet-ce/frontend/projects/shared-meet-components/package.json"
)

# Check if any files were modified
ANY_MODIFIED=false
for file in "${FILES_TO_RESTORE[@]}"; do
  if [ -f "$file" ] && ! git diff --quiet "$file" 2>/dev/null; then
    ANY_MODIFIED=true
    break
  fi
done

if [ "$ANY_MODIFIED" = false ]; then
  echo -e "${GREEN}✓ All files are already in development mode${NC}"
else
  # Restore all files from git
  git checkout "${FILES_TO_RESTORE[@]}" 2>/dev/null || {
    echo -e "${RED}Error: Could not restore configuration files from git${NC}"
    echo -e "${YELLOW}Make sure you're in a git repository${NC}"
    exit 1
  }
  echo -e "${GREEN}✓ Configuration and package.json files restored${NC}"
fi
echo ""

# Step 2: Clean up any tarball artifacts
# echo -e "${YELLOW}[2/4] Cleaning up tarball artifacts...${NC}"
# if ls meet-ce/frontend/*.tgz >/dev/null 2>&1; then
#   rm -f meet-ce/frontend/*.tgz
#   echo -e "${GREEN}✓ Tarball artifacts removed${NC}"
# else
#   echo -e "${GREEN}✓ No tarball artifacts to clean${NC}"
# fi
echo ""

# Step 3: Reinstall dependencies
echo -e "${YELLOW}[3/4] Reinstalling dependencies with workspace linking...${NC}"
echo -e "${BLUE}This will link openvidu-components-angular from ../openvidu/...${NC}"
echo ""

# Check if external package exists
if [ ! -d "../openvidu/openvidu-components-angular" ]; then
  echo -e "${RED}Warning: External package not found: ../openvidu/openvidu-components-angular${NC}"
  echo -e "${YELLOW}You may need to clone the openvidu repository:${NC}"
  echo -e "  ${YELLOW}git clone https://github.com/OpenVidu/openvidu.git ../openvidu${NC}"
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Aborted${NC}"
    exit 1
  fi
fi

pnpm install
echo -e "${GREEN}✓ Dependencies installed with workspace linking${NC}"
echo ""

# Step 4: Verify workspace linking is active
echo -e "${YELLOW}[4/4] Verifying workspace linking...${NC}"

# Check if openvidu-components-angular is using workspace protocol
if grep -q '"openvidu-components-angular": "workspace:\*"' meet-ce/frontend/package.json; then
  echo -e "${GREEN}✓ Frontend: openvidu-components-angular using workspace:*${NC}"
else
  echo -e "${RED}✗ Frontend: openvidu-components-angular NOT using workspace:*${NC}"
  echo -e "${YELLOW}  Current value in package.json:${NC}"
  grep "openvidu-components-angular" meet-ce/frontend/package.json || echo "  Not found"
fi

if grep -q '"openvidu-components-angular": "\^' meet-ce/frontend/projects/shared-meet-components/package.json; then
  echo -e "${GREEN}✓ Shared-components: openvidu-components-angular using ^version (peerDependency)${NC}"
else
  echo -e "${YELLOW}⚠ Shared-components: Verify peerDependency manually${NC}"
fi

# Check if pnpm list shows workspace link
if pnpm list openvidu-components-angular 2>/dev/null | grep -q "link:"; then
  echo -e "${GREEN}✓ Workspace linking is active (linked from ../openvidu/...)${NC}"
else
  echo -e "${RED}✗ WARNING: Workspace linking might not be active${NC}"
  echo -e "${YELLOW}  This is normal if openvidu-components-angular is not in ../openvidu/${NC}"
fi
echo ""

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}  ✓ Development configuration restored successfully!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${BLUE}You can now continue local development:${NC}"
echo -e "  ${YELLOW}./meet.sh dev${NC}"
echo ""
