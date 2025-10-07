#!/bin/bash
FLAG_PATH="./typings/dist/typings-ready.flag"

# wait until the flag file exists
while [ ! -f $FLAG_PATH ]; do sleep 0.1; done

# then execute the real command passed as a parameter
exec "$@"
