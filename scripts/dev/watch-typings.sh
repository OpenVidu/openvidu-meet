#!/bin/bash
FLAG_PATH="./typings/dist/typings-ready.flag"

# Remove the flag file if it exists
rm -f $FLAG_PATH

# Run tsc in watch mode
pnpm --filter @openvidu-meet/typings run dev | while read line; do
  echo "$line"
  # Check for the "Found 0 errors" message
  if echo "$line" | grep -q "Found 0 errors"; then
    touch $FLAG_PATH
  fi
done
