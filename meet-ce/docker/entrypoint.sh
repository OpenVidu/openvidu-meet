#!/bin/sh
set -e

# Function to handle termination signals
terminate_process() {
    echo "Terminating Node.js process..."
    pkill -TERM node
}

# Trap termination signals
trap terminate_process TERM INT

# If a custom config directory is not provided,
# check minimal required environment variables
if [ -z "${MEET_CONFIG_DIR}" ]; then
    if [ -z "${LIVEKIT_URL}" ]; then
        echo "LIVEKIT_URL is required"
        echo "example: docker run -e LIVEKIT_URL=https://livekit-server:7880 -e LIVEKIT_API_KEY=api_key -e LIVEKIT_API_SECRET=api_secret -p 6080:6080 openvidu-meet"
        exit 1
    fi
    if [ -z "${LIVEKIT_API_KEY}" ]; then
        echo "LIVEKIT_API_KEY is required"
        echo "example: docker run -e LIVEKIT_URL=https://livekit-server:7880 -e LIVEKIT_API_KEY=api_key -e LIVEKIT_API_SECRET=api_secret -p 6080:6080 openvidu-meet"
        exit 1
    fi
    if [ -z "${LIVEKIT_API_SECRET}" ]; then
        echo "LIVEKIT_API_SECRET is required"
        echo "example: docker run -e LIVEKIT_URL=https://livekit-server:7880 -e LIVEKIT_API_KEY=api_key -e LIVEKIT_API_SECRET=api_secret -p 6080:6080 openvidu-meet"
        exit 1
    fi
fi

if [ -n "${MODULES_FILE}" ]; then
    # shellcheck disable=SC1090
    . "${MODULES_FILE}"
fi

# V8 sizes its heap from the memory it can see. In a container without a memory limit that is the
# whole host, so unless the deployment already chose a ceiling, one is set here.
case " ${NODE_OPTIONS:-} " in
    *--max-old-space-size*) ;;
    *)
        if [ "$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo max)" = "max" ]; then
            export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=${MEET_MAX_HEAP_MB:-1024}"
        fi
        ;;
esac

cd /opt/openvidu-meet || { echo "Can't cd into /opt/openvidu-meet"; exit 1; }
./meet.sh start --prod --skip-install --skip-build &

# Save the PID of the Node.js process
node_pid=$!

# Wait for the Node.js process to finish
wait $node_pid
