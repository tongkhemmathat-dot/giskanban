# 09 — การติดตั้งใช้งานจริง

## 1. `.env.example`

```bash
NODE_ENV=production
PORT=3000
DB_PATH=./data/jobcard.db
UPLOAD_DIR=./data/uploads
MAX_UPLOAD_MB=10
BOARD_NAME=NOC Operations
TZ=Asia/Bangkok

# สำหรับ Caddy
DOMAIN=jobcard.company.local
TEAM_PASSWORD_HASH=      # สร้างด้วย: docker run --rm caddy caddy hash-password

# แจ้งเตือนงานใกล้ชน SLA ทางอีเมล (แทน LINE Notify ที่ถูกยกเลิก) — ไม่บังคับ
NOTIFY_ENABLED=false
NOTIFY_HOUR=8             # ส่งสรุป 1 ครั้ง/วัน เวลานี้ (24 ชม., ตาม TZ ด้านบน)
NOTIFY_EMAIL_TO=noc-team@company.local
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=jobcard-pro@company.local
```

> ❗ ไม่มี `JWT_SECRET` / `ADMIN_*` โดยเจตนา — ระบบนี้ไม่มี auth ในแอป
> อีเมลสรุป SLA (`NOTIFY_*`/`SMTP_*`) ทำงานเฉพาะภายใต้ process ที่รันค้างไว้
> (เช่น Docker Compose ด้านล่างนี้) — ใช้ไม่ได้บน demo แบบ serverless (Vercel)

## 2. `Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache sqlite tini && \
    addgroup -g 1001 app && adduser -u 1001 -G app -s /bin/sh -D app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app . .
RUN mkdir -p data/uploads && chown -R app:app data
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["sh","-c","npm run migrate && node server/index.js"]
```

## 3. `docker-compose.yml`

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD","wget","-qO-","http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      # /api/health คืน 503 (ไม่ใช่ 200) เมื่อต่อ DB ไม่ได้ (docs/04-api.md §10) —
      # wget ถือว่า non-2xx = fetch ล้มเหลว จึงทำให้ Docker เห็นว่า container
      # ไม่ healthy จริง ๆ ไม่ใช่แค่ตอบ 200 เฉย ๆ ไม่ว่า DB จะพังหรือไม่

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80","443:443"]
    env_file: .env
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [app]

volumes:
  caddy_data:
  caddy_config:
```

## 4. `Caddyfile` — ชั้นความปลอดภัยหลัก

```caddyfile
{$DOMAIN} {
    encode gzip

    # เลือกอย่างน้อย 1 แบบ

    # แบบ A — รหัสผ่านเดียวทั้งทีม
    basic_auth {
        team {$TEAM_PASSWORD_HASH}
    }

    # แบบ B — จำกัดเฉพาะ IP สำนักงาน (uncomment เพื่อใช้)
    # @notoffice not remote_ip 10.0.0.0/8 192.168.0.0/16
    # respond @notoffice "Forbidden" 403

    reverse_proxy app:3000

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

สร้าง hash รหัสผ่าน:

```bash
docker run --rm caddy caddy hash-password --plaintext 'รหัสของทีม'
```

## 5. ขั้นตอน Deploy ครั้งแรก

```bash
git clone <repo> && cd jobcard-pro
cp .env.example .env && nano .env      # ใส่ DOMAIN + TEAM_PASSWORD_HASH
docker compose up -d --build
docker compose exec app npm run seed   # ครั้งแรกเท่านั้น
docker compose logs -f app
```

## 6. อัปเดตเวอร์ชัน

```bash
git pull
docker compose up -d --build           # migrate รันอัตโนมัติตอน start
```

## 7. สำรองข้อมูล

`scripts/backup.sh`

```bash
#!/bin/sh
set -e
STAMP=$(date +%Y%m%d_%H%M)
DEST=/backup
mkdir -p "$DEST"
sqlite3 /app/data/jobcard.db ".backup '$DEST/jobcard_$STAMP.db'"
tar czf "$DEST/uploads_$STAMP.tar.gz" -C /app/data uploads
find "$DEST" -name '*.db'     -mtime +14 -delete
find "$DEST" -name '*.tar.gz' -mtime +14 -delete
echo "backup ok: $STAMP"
```

ตั้ง cron บนโฮสต์:

```cron
0 2 * * * docker compose -f /opt/jobcard-pro/docker-compose.yml exec -T app sh /app/scripts/backup.sh
```

**กู้คืน**

```bash
docker compose stop app
cp /backup/jobcard_20260901_0200.db ./data/jobcard.db
tar xzf /backup/uploads_20260901_0200.tar.gz -C ./data
docker compose start app
```

## 8. Checklist ก่อนขึ้น Production

- [ ] `.env` ตั้งค่าครบ และ **ไม่ได้** commit ขึ้น git
- [ ] Basic Auth หรือ IP allowlist เปิดใช้แล้ว
- [ ] ไม่ map port 3000 ออกสู่อินเทอร์เน็ตโดยตรง
- [ ] `data/` มี backup อัตโนมัติและทดสอบกู้คืนแล้ว 1 ครั้ง
- [ ] healthcheck ตอบ 200
- [ ] แจ้งทีมว่า **ไม่มีระบบล็อกอิน** — ใครมี URL ก็เข้าได้
- [ ] ทดสอบ smoke test 12 ข้อใน `docs/08-testing.md` ผ่านหมด