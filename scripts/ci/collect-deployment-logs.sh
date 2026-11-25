#!/bin/bash
# Collects the state and the logs of the OpenVidu local deployment of a CI job into a directory, and prints
# the tail of each container log (collapsed) so a failure can be read without downloading the artifact.
# Usage: collect-deployment-logs.sh <output-dir>

set -u

out="$1"
compose_dir="openvidu-local-deployment/community"

mkdir -p "$out"

if [ ! -d "$compose_dir" ]; then
	echo "No OpenVidu local deployment checkout in this job: nothing to collect"
	exit 0
fi

cd "$compose_dir" || exit 0

{
	docker compose ps -a
	echo
	docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | while IFS=$'\t' read -r name image status; do
		digest=$(docker image inspect "$image" --format '{{index .RepoDigests 0}}' 2>/dev/null | cut -d'@' -f2)
		printf '%-20s %-60s %-32s %s\n' "$name" "$image" "$status" "${digest:-N/A}"
	done
} >"$out/containers.txt" 2>&1
cat "$out/containers.txt"

for service in $(docker compose ps -a --services 2>/dev/null); do
	docker compose logs --no-color --timestamps "$service" >"$out/$service.log" 2>&1
	docker inspect "$service" --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} error={{.State.Error}}' \
		>"$out/$service.state" 2>&1
	echo "::group::$service ($(cat "$out/$service.state"))"
	tail -n 60 "$out/$service.log"
	echo "::endgroup::"
done
