#!/bin/bash
FLAG_PATH="./meet-ce/typings/dist/typings-ready.flag"

# Remove the flag file if it exists
rm -f $FLAG_PATH

echo "Starting typings watch mode..."
echo "Waiting for initial compilation..."

# Run tsc in watch mode
pnpm --filter @openvidu-meet/typings run dev | while read line; do
  echo "$line"

  # Check for compilation start (remove flag to signal "not ready")
  if echo "$line" | grep -q "File change detected. Starting incremental compilation"; then
    rm -f $FLAG_PATH
    echo "Typings recompiling..."
  fi

  # Check for successful compilation (create flag to signal "ready")
  if echo "$line" | grep -q "Found 0 errors"; then
    # Add small delay to ensure all files are written to disk
    sleep 0.2
    touch $FLAG_PATH
    echo "✅ Typings ready!"
  fi

  # Check for compilation errors
  if echo "$line" | grep -q "error TS"; then
    rm -f $FLAG_PATH
    echo "❌ Typings compilation failed!"
  fi
done
