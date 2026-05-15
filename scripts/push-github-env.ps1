param(
    [string]$EnvFile = ".env.deploy.source",
    [string]$Repo = ""
)

$ErrorActionPreference = "Stop"

$variableKeys = @(
    "DEPLOY_PATH",
    "NODE_ENV",
    "PORT",
    "CLIENT_URL",
    "FRONTEND_URL",
    "FRONTEND_URLS",
    "AWS_REGION",
    "DYNAMODB_USERS_TABLE",
    "DYNAMODB_CONVERSATIONS_TABLE",
    "DYNAMODB_MESSAGES_TABLE",
    "DYNAMODB_PARTICIPANTS_TABLE",
    "DYNAMODB_CALL_SESSIONS_TABLE",
    "DYNAMODB_NOTIFICATION_TOKENS_TABLE",
    "DYNAMODB_POSTS_TABLE",
    "DYNAMODB_COMMENTS_TABLE",
    "DYNAMODB_URBAN_STATS_TABLE",
    "JWT_EXPIRE",
    "JWT_REFRESH_EXPIRE",
    "AWS_SES_REGION",
    "AWS_S3_REGION",
    "S3_BUCKET_NAME",
    "S3_AVATAR_FOLDER",
    "S3_MESSAGE_FOLDER",
    "S3_POST_IMAGES_BUCKET",
    "S3_POST_IMAGES_FOLDER",
    "AWS_LOCATION_REGION",
    "AWS_LOCATION_STYLE",
    "AWS_LOCATION_COLOR_SCHEME",
    "AWS_LOCATION_VARIANT",
    "AWS_LOCATION_ALLOWED_IPS",
    "AWS_CHIME_REGION",
    "CHIME_MEETING_REGION",
    "CALL_RING_TIMEOUT_SECONDS",
    "AI_PROVIDER",
    "GEMINI_MODEL",
    "AWS_BEDROCK_REGION",
    "AWS_BEDROCK_MODEL_ID",
    "AWS_GEO_PLACES_REGION",
    "AWS_GEO_ROUTES_REGION",
    "AWS_GEO_ROUTE_MODE",
    "AI_MAX_CONTEXT_POSTS",
    "AI_DEFAULT_RADIUS_KM",
    "AI_TIMEOUT_MS",
    "ASSISTANT_ROUTE_SAMPLE_METERS",
    "ASSISTANT_ROUTE_INCIDENT_RADIUS_METERS",
    "ASSISTANT_MEMORY_TTL_SECONDS",
    "ASSISTANT_MAX_TOOL_STEPS",
    "EMBEDDING_PROVIDER",
    "EMBEDDING_MODEL",
    "OPENSEARCH_VECTOR_ENDPOINT",
    "REDIS_ENABLED",
    "REDIS_URL",
    "REDIS_URL_DOCKER",
    "REDIS_KEY_PREFIX",
    "REDIS_CONNECT_TIMEOUT_MS",
    "REDIS_DEFAULT_TTL_SECONDS",
    "REDIS_POST_TTL_SECONDS",
    "REDIS_USER_TTL_SECONDS"
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) chưa được cài. Cài tại https://cli.github.com/"
}

if (-not (Test-Path $EnvFile)) {
    throw "Không tìm thấy file env: $EnvFile"
}

gh auth status | Out-Null

if ([string]::IsNullOrWhiteSpace($Repo)) {
    throw "Bạn phải truyền -Repo theo dạng owner/repo, ví dụ: thongle/tixchat-backend-deploy"
}

$secretCount = 0
$variableCount = 0

Write-Host "Using repo: $Repo"
Write-Host "Reading env file: $EnvFile"

$lines = Get-Content -Path $EnvFile
foreach ($rawLine in $lines) {
    $line = $rawLine.Trim()

    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
        continue
    }

    if ($line.StartsWith("export ")) {
        $line = $line.Substring(7).Trim()
    }

    $pair = $line -split "=", 2
    if ($pair.Count -ne 2) {
        continue
    }

    $key = $pair[0].Trim()
    $value = $pair[1].Trim()

    if ([string]::IsNullOrWhiteSpace($key) -or [string]::IsNullOrWhiteSpace($value)) {
        continue
    }

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    if ($variableKeys -contains $key) {
        gh variable set $key --repo $Repo --body $value | Out-Null
        Write-Host "variable: $key"
        $variableCount++
    }
    else {
        gh secret set $key --repo $Repo --body $value | Out-Null
        Write-Host "secret: $key"
        $secretCount++
    }
}

Write-Host ""
Write-Host "Done. Uploaded $secretCount secrets and $variableCount variables to $Repo."
