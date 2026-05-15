# Hướng dẫn deploy backend-only lên GitHub mới, GitHub Actions và EC2 mới

Tài liệu này hướng dẫn theo đúng thứ tự an toàn:

1. tạo repo GitHub mới chỉ cho `TixChat-Backend`
2. chuẩn bị EC2 Ubuntu mới
3. chuẩn bị GitHub Actions cho repo mới
4. tạo file env nguồn sạch
5. chỉ ở bước cuối mới đẩy env lên GitHub bằng script
6. push một commit để test deploy end-to-end

Lưu ý quan trọng:

- Không dùng trực tiếp `.env` local hiện tại để upload.
- Không commit `.env.production` hoặc bất kỳ secret thật nào lên repo.
- Sau khi migrate xong, hãy rotate lại AWS key và JWT secrets nếu chúng từng bị lộ.

---

## 1. Chuẩn bị local backend-only repo mới

Mục tiêu: repo mới chỉ chứa thư mục `TixChat-Backend`.

Ví dụ với Windows `cmd`:

```cmd
cd /d D:\Code\CNM\TixChatVer6.0
mkdir TixChat-Backend-Deploy
xcopy TixChat-Backend TixChat-Backend-Deploy /E /I /H /Y
cd TixChat-Backend-Deploy
rmdir /S /Q .git
git init
git branch -M main
git add .
git commit -m "Initial backend-only deploy repo"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_NEW_BACKEND_REPO.git
git push -u origin main
```

Kiểm tra:

```cmd
git remote -v
git status
```

Kỳ vọng:

- remote `origin` trỏ tới repo backend-only mới
- working tree sạch

---

## 2. Chuẩn bị repo GitHub mới

### 2.1. Bật GitHub Actions

- Vào repo mới trên GitHub
- mở tab `Actions`
- bật workflow nếu GitHub hỏi xác nhận

### 2.2. Tạo deploy key / SSH key cho EC2 mới

Nếu chưa có key riêng cho deploy, tạo một cặp mới trên máy local:

Windows `cmd`:

```cmd
ssh-keygen -t ed25519 -C "tixchat-backend-deploy" -f %USERPROFILE%\.ssh\tixchat_backend_deploy
```

Bạn sẽ có:

- private key: `%USERPROFILE%\.ssh\tixchat_backend_deploy`
- public key: `%USERPROFILE%\.ssh\tixchat_backend_deploy.pub`

### 2.3. Tạo GitHub repo secrets

Vào:

- `Repo -> Settings -> Secrets and variables -> Actions`

Tạo các **Secrets** sau:

- `EC2_HOST`
- `EC2_USERNAME`
- `EC2_SSH_PORT`
- `EC2_SSH_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `AWS_SES_SENDER_EMAIL`
- `GEMINI_API_KEY`
- `AWS_BEARER_TOKEN_BEDROCK`

Gợi ý:

- `EC2_SSH_KEY` là nội dung đầy đủ của private key
- `EC2_SSH_PORT` thường là `22`

### 2.4. Tạo GitHub repo variables

Tạo các **Variables** sau:

- `DEPLOY_PATH`
- `NODE_ENV`
- `PORT`
- `CLIENT_URL`
- `FRONTEND_URL`
- `FRONTEND_URLS`
- `AWS_REGION`
- `DYNAMODB_USERS_TABLE`
- `DYNAMODB_CONVERSATIONS_TABLE`
- `DYNAMODB_MESSAGES_TABLE`
- `DYNAMODB_PARTICIPANTS_TABLE`
- `DYNAMODB_CALL_SESSIONS_TABLE`
- `DYNAMODB_NOTIFICATION_TOKENS_TABLE`
- `DYNAMODB_POSTS_TABLE`
- `DYNAMODB_COMMENTS_TABLE`
- `DYNAMODB_URBAN_STATS_TABLE`
- `JWT_EXPIRE`
- `JWT_REFRESH_EXPIRE`
- `AWS_SES_REGION`
- `AWS_S3_REGION`
- `S3_BUCKET_NAME`
- `S3_AVATAR_FOLDER`
- `S3_MESSAGE_FOLDER`
- `S3_POST_IMAGES_BUCKET`
- `S3_POST_IMAGES_FOLDER`
- `AWS_LOCATION_REGION`
- `AWS_LOCATION_STYLE`
- `AWS_LOCATION_COLOR_SCHEME`
- `AWS_LOCATION_VARIANT`
- `AWS_LOCATION_ALLOWED_IPS`
- `AWS_CHIME_REGION`
- `CHIME_MEETING_REGION`
- `CALL_RING_TIMEOUT_SECONDS`
- `AI_PROVIDER`
- `GEMINI_MODEL`
- `AWS_BEDROCK_REGION`
- `AWS_BEDROCK_MODEL_ID`
- `AWS_GEO_PLACES_REGION`
- `AWS_GEO_ROUTES_REGION`
- `AWS_GEO_ROUTE_MODE`
- `AI_MAX_CONTEXT_POSTS`
- `AI_DEFAULT_RADIUS_KM`
- `AI_TIMEOUT_MS`
- `ASSISTANT_ROUTE_SAMPLE_METERS`
- `ASSISTANT_ROUTE_INCIDENT_RADIUS_METERS`
- `ASSISTANT_MEMORY_TTL_SECONDS`
- `ASSISTANT_MAX_TOOL_STEPS`
- `EMBEDDING_PROVIDER`
- `EMBEDDING_MODEL`
- `OPENSEARCH_VECTOR_ENDPOINT`
- `REDIS_ENABLED`
- `REDIS_URL`
- `REDIS_URL_DOCKER`
- `REDIS_KEY_PREFIX`
- `REDIS_CONNECT_TIMEOUT_MS`
- `REDIS_DEFAULT_TTL_SECONDS`
- `REDIS_POST_TTL_SECONDS`
- `REDIS_USER_TTL_SECONDS`

Giá trị khuyến nghị ban đầu:

- `DEPLOY_PATH=/home/ubuntu/tixchat-backend`
- `NODE_ENV=production`
- `PORT=5000`
- `REDIS_URL_DOCKER=redis://redis:6379`

---

## 3. Chuẩn bị EC2 Ubuntu mới

### 3.1. Tạo instance

Khuyến nghị:

- Ubuntu LTS
- security group:
  - mở `22/tcp` cho IP của bạn
  - mở `5000/tcp` nếu backend cần public trực tiếp
  - không mở `6379/tcp` public trừ khi bạn thật sự cần

### 3.2. SSH vào EC2

Windows `cmd`:

```cmd
ssh -i C:\path\to\your-ec2-key.pem ubuntu@YOUR_EC2_IP
```

### 3.3. Cài package cơ bản

Trên EC2:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates gnupg
```

### 3.4. Cài Docker và Docker Compose plugin

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 3.5. Bật Docker và cấp quyền cho user

```bash
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker "$USER"
newgrp docker
```

### 3.6. Kiểm tra Docker

```bash
docker --version
docker compose version
docker ps
```

---

## 4. Chuẩn bị SSH trust và thư mục deploy trên EC2

### 4.1. Thêm public key deploy vào `authorized_keys`

Trên EC2:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```

Dán nội dung file `tixchat_backend_deploy.pub`, rồi:

```bash
chmod 600 ~/.ssh/authorized_keys
```

### 4.2. Tạo thư mục deploy

```bash
mkdir -p /home/ubuntu/tixchat-backend
```

### 4.3. Clone repo backend-only mới

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_NEW_BACKEND_REPO.git /home/ubuntu/tixchat-backend
cd /home/ubuntu/tixchat-backend
ls -la
```

Kiểm tra các file phải có:

- `docker-compose.yml`
- `Dockerfile`
- `.env.example`

Không tạo `.env.production` thủ công ở bước này.

---

## 5. Workflow GitHub Actions mới sẽ làm gì

Workflow đã được chuẩn bị sẵn tại:

- `.github/workflows/deploy.yml`

Khi push lên `main`, workflow sẽ:

1. checkout code
2. SSH vào EC2 mới
3. clone repo nếu chưa có
4. `git fetch` + `git reset --hard origin/main`
5. generate `.env.production` từ GitHub secrets/vars
6. chạy:

```bash
docker compose --env-file .env.production down --remove-orphans
docker compose --env-file .env.production build --no-cache
docker compose --env-file .env.production up -d
```

7. check health:

```bash
curl --fail --silent http://127.0.0.1:5000/health
```

Workflow này không dùng repo URL cũ, mà lấy repo hiện tại bằng:

- `${{ github.repository }}`

---

## 6. Tạo file env nguồn sạch trước khi upload

Không dùng trực tiếp:

- `.env`
- `.env.production`

Hãy tạo một file sạch riêng, ví dụ:

- `.env.deploy.source`

Nguồn để tạo file này:

- runtime env thật đã backup từ EC2 cũ
- sau đó rà lại và bỏ những biến không còn dùng

Ví dụ tạo file:

Windows `cmd`:

```cmd
copy NUL .env.deploy.source
notepad .env.deploy.source
```

Trong file này:

- giữ tất cả biến backend production thật sự cần
- không để comment lẫn quá nhiều biến rác
- không commit file này lên GitHub

Thêm vào `.gitignore` của repo backend-only mới:

```gitignore
.env.deploy.source
.env.production
```

---

## 7. Chạy script upload env lên GitHub ở bước cuối

Chỉ chạy bước này sau khi:

- repo mới đã tạo xong
- EC2 mới đã sẵn sàng
- workflow đã có trong repo
- file `.env.deploy.source` đã được rà sạch

### 7.1. Windows PowerShell

```cmd
cd /d D:\Code\...\TixChat-Backend-Deploy
gh auth login
powershell -ExecutionPolicy Bypass -File .\scripts\push-github-env.ps1 -EnvFile ".env.deploy.source" -Repo "YOUR_USERNAME/YOUR_NEW_BACKEND_REPO"
```

### 7.2. Linux / WSL / Git Bash

```bash
cd /path/to/TixChat-Backend-Deploy
gh auth login
GITHUB_REPO="YOUR_USERNAME/YOUR_NEW_BACKEND_REPO" ./scripts/push-github-env.sh .env.deploy.source
```

Script sẽ:

- đọc file env nguồn
- tự phân loại:
  - `vars`
  - `secrets`
- upload lên repo mới bằng `gh`

---

## 8. Test deploy end-to-end

### 8.1. Push một commit nhỏ

Windows `cmd`:

```cmd
git add .
git commit -m "Setup backend deploy workflow"
git push origin main
```

### 8.2. Theo dõi GitHub Actions

- Vào tab `Actions`
- mở workflow `Deploy Backend to EC2`

### 8.3. Kiểm tra trên EC2

```bash
cd /home/ubuntu/tixchat-backend
docker ps
docker logs tixchat-backend --tail 100
curl http://127.0.0.1:5000/health
```

Kỳ vọng:

- có `tixchat-backend`
- có `tixchat-redis`
- health trả `{"status":"OK"}`

---

## 9. Nếu deploy lỗi, kiểm tra theo thứ tự

1. GitHub repo secrets/vars đã đủ chưa
2. `DEPLOY_PATH` có đúng không
3. EC2 có clone được repo mới không
4. `docker compose version` có chạy được không
5. `docker logs tixchat-backend`
6. `.env.production` sinh ra trên EC2 có đủ biến không

Xem nhanh file env được generate:

```bash
cd /home/ubuntu/tixchat-backend
sed -n '1,260p' .env.production
```

---

## 10. Sau khi migrate xong

Nên làm tiếp:

1. rotate `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
2. rotate `JWT_SECRET` / `JWT_REFRESH_SECRET`
3. xóa hoặc archive EC2 cũ sau khi xác nhận EC2 mới ổn định
4. không dùng lại `.env` lộn xộn cũ làm source of truth nữa

