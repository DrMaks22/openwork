#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERFILE="$ROOT_DIR/ee/apps/den-worker-runtime/Dockerfile.daytona-snapshot"
DAYTONA_ENV_FILE="${DAYTONA_ENV_FILE:-$ROOT_DIR/.env.daytona}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if ! command -v daytona >/dev/null 2>&1; then
  echo "daytona CLI is required" >&2
  exit 1
fi

if [ -f "$DAYTONA_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$DAYTONA_ENV_FILE"
  set +a
fi

SNAPSHOT_NAME="${1:-${DAYTONA_SNAPSHOT_NAME:-openwork-runtime}}"
SNAPSHOT_REGION="${DAYTONA_SNAPSHOT_REGION:-${DAYTONA_TARGET:-}}"
SNAPSHOT_CPU="${DAYTONA_SNAPSHOT_CPU:-1}"
SNAPSHOT_MEMORY="${DAYTONA_SNAPSHOT_MEMORY:-2}"
SNAPSHOT_DISK="${DAYTONA_SNAPSHOT_DISK:-8}"
LOCAL_IMAGE_TAG="${DAYTONA_LOCAL_IMAGE_TAG:-openwork-daytona-snapshot:${SNAPSHOT_NAME//[^a-zA-Z0-9_.-]/-}}"

OPENWORK_ORCHESTRATOR_VERSION="${OPENWORK_ORCHESTRATOR_VERSION:-$(node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(pkg.version));' "$ROOT_DIR/apps/orchestrator/package.json")}"
OPENCODE_VERSION="${OPENCODE_VERSION:-$(node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(pkg.opencodeVersion));' "$ROOT_DIR/apps/orchestrator/package.json")}"

echo "Building local image $LOCAL_IMAGE_TAG" >&2
echo "- openwork-orchestrator@$OPENWORK_ORCHESTRATOR_VERSION" >&2
echo "- opencode@$OPENCODE_VERSION" >&2

docker buildx build \
  --platform linux/amd64 \
  -t "$LOCAL_IMAGE_TAG" \
  -f "$DOCKERFILE" \
  --build-arg "OPENWORK_ORCHESTRATOR_VERSION=$OPENWORK_ORCHESTRATOR_VERSION" \
  --build-arg "OPENCODE_VERSION=$OPENCODE_VERSION" \
  --load \
  "$ROOT_DIR"

args=(snapshot push "$LOCAL_IMAGE_TAG" --name "$SNAPSHOT_NAME" --cpu "$SNAPSHOT_CPU" --memory "$SNAPSHOT_MEMORY" --disk "$SNAPSHOT_DISK")
if [ -n "$SNAPSHOT_REGION" ]; then
  args+=(--region "$SNAPSHOT_REGION")
fi

SNAPSHOT_PAGE_LIMIT=100
SNAPSHOT_PAGE=1
EXISTING_SNAPSHOT_ID=""

while :; do
  snapshot_page_json="$(daytona snapshot list --format json --page "$SNAPSHOT_PAGE" --limit "$SNAPSHOT_PAGE_LIMIT")"
  page_result="$(printf '%s' "$snapshot_page_json" | node -e '
const fs = require("fs");

const target = process.argv[1];
const raw = fs.readFileSync(0, "utf8").trim();
const items = raw ? JSON.parse(raw) : [];

if (!Array.isArray(items)) {
  throw new Error("Expected Daytona snapshot list JSON array");
}

const match = items.find((item) => item && item.name === target);
process.stdout.write(`${match && typeof match.id === "string" ? match.id : ""}|${items.length}`);
' "$SNAPSHOT_NAME")"
  EXISTING_SNAPSHOT_ID="${page_result%%|*}"
  SNAPSHOT_PAGE_COUNT="${page_result#*|}"

  if [ -n "$EXISTING_SNAPSHOT_ID" ]; then
    break
  fi

  if [ "${SNAPSHOT_PAGE_COUNT:-0}" -lt "$SNAPSHOT_PAGE_LIMIT" ]; then
    break
  fi

  SNAPSHOT_PAGE=$((SNAPSHOT_PAGE + 1))
done

if [ -n "$EXISTING_SNAPSHOT_ID" ]; then
  echo "Deleting existing Daytona snapshot $SNAPSHOT_NAME" >&2
  daytona snapshot delete "$EXISTING_SNAPSHOT_ID"
fi

echo "Pushing Daytona snapshot $SNAPSHOT_NAME" >&2
daytona "${args[@]}"

echo >&2
echo "Snapshot ready: $SNAPSHOT_NAME" >&2
echo "Set DAYTONA_SNAPSHOT=$SNAPSHOT_NAME in .env.daytona before starting Den." >&2
