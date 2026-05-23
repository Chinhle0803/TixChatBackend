#!/usr/bin/env bash

set -euo pipefail

REPO="${GITHUB_REPO:-}"
ENV_FILE="${1:-.env.deploy.source}"

VARIABLE_KEYS=(
  DEPLOY_PATH
  NODE_ENV
  PORT
  CLIENT_URL
  FRONTEND_URL
  FRONTEND_URLS
  AWS_REGION
  DYNAMODB_USERS_TABLE
  DYNAMODB_CONVERSATIONS_TABLE
  DYNAMODB_MESSAGES_TABLE
  DYNAMODB_PARTICIPANTS_TABLE
  DYNAMODB_CALL_SESSIONS_TABLE
  DYNAMODB_NOTIFICATION_TOKENS_TABLE
  DYNAMODB_POSTS_TABLE
  DYNAMODB_COMMENTS_TABLE
  DYNAMODB_URBAN_STATS_TABLE
  JWT_EXPIRE
  JWT_REFRESH_EXPIRE
  AWS_SES_REGION
  AWS_S3_REGION
  S3_BUCKET_NAME
  S3_AVATAR_FOLDER
  S3_MESSAGE_FOLDER
  S3_POST_IMAGES_BUCKET
  S3_POST_IMAGES_FOLDER
  AWS_LOCATION_REGION
  AWS_LOCATION_STYLE
  AWS_LOCATION_COLOR_SCHEME
  AWS_LOCATION_VARIANT
  AWS_LOCATION_ALLOWED_IPS
  AWS_CHIME_REGION
  CHIME_MEETING_REGION
  CALL_RING_TIMEOUT_SECONDS
  AI_PROVIDER
  GEMINI_MODEL
  AWS_BEDROCK_REGION
  AWS_BEDROCK_MODEL_ID
  AWS_GEO_PLACES_REGION
  AWS_GEO_ROUTES_REGION
  AWS_GEO_ROUTE_MODE
  AI_MAX_CONTEXT_POSTS
  AI_DEFAULT_RADIUS_KM
  AI_TIMEOUT_MS
  ASSISTANT_ROUTE_SAMPLE_METERS
  ASSISTANT_ROUTE_INCIDENT_RADIUS_METERS
  ASSISTANT_MEMORY_TTL_SECONDS
  ASSISTANT_MAX_TOOL_STEPS
  EMBEDDING_PROVIDER
  EMBEDDING_MODEL
  OPENSEARCH_VECTOR_ENDPOINT
  REDIS_ENABLED
  REDIS_URL
  REDIS_URL_DOCKER
  REDIS_KEY_PREFIX
  REDIS_CONNECT_TIMEOUT_MS
  REDIS_DEFAULT_TTL_SECONDS
  REDIS_POST_TTL_SECONDS
  REDIS_USER_TTL_SECONDS
)

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed." >&2
  echo "Install it first: https://cli.github.com/" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ -z "$REPO" ]]; then
  echo "GITHUB_REPO is empty." >&2
  echo "Run with: GITHUB_REPO=owner/repo ./scripts/push-github-env.sh .env.deploy.source" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated." >&2
  echo "Run: gh auth login" >&2
  exit 1
fi

is_variable_key() {
  local key="$1"
  local item
  for item in "${VARIABLE_KEYS[@]}"; do
    if [[ "$item" == "$key" ]]; then
      return 0
    fi
  done
  return 1
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

strip_wrapping_quotes() {
  local value="$1"
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

echo "Using repo: $REPO"
echo "Reading env file: $ENV_FILE"

secret_count=0
variable_count=0

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="$(trim "$raw_line")"

  if [[ -z "$line" || "$line" == \#* ]]; then
    continue
  fi

  if [[ "$line" == export\ * ]]; then
    line="${line#export }"
  fi

  if [[ "$line" != *=* ]]; then
    continue
  fi

  key="$(trim "${line%%=*}")"
  value="$(trim "${line#*=}")"
  value="$(strip_wrapping_quotes "$value")"

  if [[ -z "$key" || -z "$value" ]]; then
    continue
  fi

  if is_variable_key "$key"; then
    gh variable set "$key" --repo "$REPO" --body "$value"
    echo "variable: $key"
    variable_count=$((variable_count + 1))
  else
    gh secret set "$key" --repo "$REPO" --body "$value"
    echo "secret: $key"
    secret_count=$((secret_count + 1))
  fi
done < "$ENV_FILE"

echo
echo "Done. Uploaded $secret_count secrets and $variable_count variables to $REPO."
