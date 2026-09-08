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

# ปฏิทินรวมของทีม (Outlook/M365 via Microsoft Graph) — ไม่บังคับ, ดูขั้นตอนตั้งค่าที่ §4.5
CALENDAR_SYNC_ENABLED=false
CALENDAR_POLL_MINUTES=10
MS_TENANT_ID=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
PUBLIC_BASE_URL=https://jobcard.company.local
CALENDAR_ENCRYPTION_KEY=      # 32 ไบต์ base64 — node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
CALENDAR_STATE_SECRET=        # secret แยกต่างหาก สร้างวิธีเดียวกับด้านบน
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

## 4.5 ปฏิทินรวมของทีม (Outlook/M365) — ตั้งค่า Azure AD

ไม่บังคับ (`CALENDAR_SYNC_ENABLED=false` โดยดีฟอลต์) — ต้องมีคนตั้งค่าฝั่ง
Azure Portal ก่อนเปิดใช้งาน (ทำนอกโค้ด, ต้องมีสิทธิ์แอดมิน tenant):

1. Azure Portal → Azure Active Directory → App registrations → New registration
2. ตั้งชื่อ เช่น "JobCard Pro Calendar Sync"
3. Supported account types: **Single tenant** (องค์กรเดียว — ไม่ต้องมี admin consent แบบ multi-tenant)
4. Redirect URI: platform **Web**, URI = `https://<DOMAIN>/api/calendar/callback` (โดเมน internal เดิม ใช้ได้เพราะเป็น browser-mediated redirect ไม่ใช่ webhook — ไม่ต้อง public internet)
5. Certificates & secrets → New client secret → คัดลอกค่า **value** ทันที (แสดงครั้งเดียว) → `MS_CLIENT_SECRET`
6. API permissions → Add a permission → Microsoft Graph → Delegated → เพิ่ม `Calendars.Read`, `offline_access`, `User.Read` → "Grant admin consent for {tenant}"
7. คัดลอก **Application (client) ID** → `MS_CLIENT_ID` และ **Directory (tenant) ID** → `MS_TENANT_ID` จากหน้า Overview
8. ตรวจว่า `PUBLIC_BASE_URL`/`DOMAIN` เข้าถึงผ่าน HTTPS ได้จริง (Microsoft บังคับ redirect URI เป็น `https` — Caddy เสิร์ฟ TLS ให้อยู่แล้ว)
9. ตั้งค่า `CALENDAR_ENCRYPTION_KEY`/`CALENDAR_STATE_SECRET` ตามคำสั่งใน `.env.example` ด้านบน แล้วตั้ง `CALENDAR_SYNC_ENABLED=true`

> Caddy's `basic_auth` ครอบทั้งโดเมนอยู่แล้ว รวมถึง `/api/calendar/callback` —
> เบราว์เซอร์ผู้ใช้มี credential แคชไว้แล้วตอนเปิดเว็บ ตอน redirect กลับจาก
> Microsoft จึงผ่านได้เลย ไม่ต้องแก้ Caddyfile เพิ่ม

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