#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
COMPOSE_FILE="$ROOT_DIR/docker-compose.linphone.yml"
SERVICE=${1:-all}

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "docker-compose.linphone.yml not found in $ROOT_DIR" >&2
  exit 1
fi

case "$SERVICE" in
  agent|transcriber)
    docker compose -f "$COMPOSE_FILE" stop "linphone-$SERVICE"
    ;;
  all)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  *)
    echo "Usage: $0 [agent|transcriber|all]" >&2
    exit 1
    ;;
 esac
