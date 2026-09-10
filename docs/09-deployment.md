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

# ปฏิทินรวมของทีม (สมาชิกวางลิงก์ .ics ของตัวเอง) — ไม่บังคับ, ดูขั้นตอนที่ §4.5
CALENDAR_SYNC_ENABLED=false
CALENDAR_POLL_MINUTES=10
CALENDAR_ENCRYPTION_KEY=      # 32 ไบต์ base64 — node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
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
CMD ["sh","-c","node server/db/migrate.js && node server/index.js"]
```

> ใช้ `node` ตรงๆ ไม่ใช่ `npm run migrate`/`npm run dev` — สคริปต์พวกนั้นมี
> `--env-file=.env` (ใส่ไว้ให้สะดวกตอนรัน `node`/`npm` ตรงๆ บนเครื่อง dev โดย
> ไม่ผ่าน Docker) แต่ container นี้ไม่มีไฟล์ `.env` จริงอยู่บนดิสก์เลย —
> `docker-compose.yml`'s `env_file: .env` ฉีดค่าพวกนั้นเป็น env var จริงตอน
> `docker compose up` ไม่ได้ copy ไฟล์เข้าไป ถ้าใช้ `--env-file` ในนี้จะ
> พังตอน container หาไฟล์ไม่เจอ หรือแย่กว่านั้นคือ "ใช้ได้" แค่เพราะ `.env`
> หลุดเข้าไปอยู่ใน image layer จริงๆ (ไม่ควรเกิดขึ้นเด็ดขาด — ดู `.dockerignore`
> ที่กัน `.env*` ไว้แล้ว)

## 3. `docker-compose.yml`

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
      - ./backups:/backup
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

## 4.5 ปฏิทินรวมของทีม — วิธี publish ปฏิทิน Outlook เป็นลิงก์ .ics

ไม่บังคับ (`CALENDAR_SYNC_ENABLED=false` โดยดีฟอลต์) — ไม่ต้องตั้งค่า Azure AD
หรือขอสิทธิ์ IT ใดๆ แต่ละสมาชิกทำเองได้ในเบราว์เซอร์:

1. เปิด Outlook บนเว็บ (outlook.office.com หรือ outlook.live.com) → ⚙️ Settings → Calendar → **Shared calendars**
2. เลือก **Publish a calendar** → เลือกปฏิทินที่ต้องการ (ปกติคือ Calendar หลัก) → ระดับสิทธิ์เลือก **Can view all details** (ถ้าเลือก "Can view only free/busy" ระบบจะไม่มีหัวข้อ/สถานที่ให้แสดง)
3. กด **Publish** → คัดลอกลิงก์ **ICS** (ไม่ใช่ลิงก์ HTML) ที่ขึ้นต้นด้วย `https://outlook.office365.com/owa/calendar/...` หรือ `https://outlook.live.com/owa/calendar/...`
4. เอาลิงก์นี้ไปวางที่หน้า **สมาชิก** ในระบบ (ปุ่ม "เชื่อมต่อปฏิทิน (iCal)" ต่อแถวของตัวเอง)
5. เปิด `CALENDAR_SYNC_ENABLED=true` และตั้งค่า `CALENDAR_ENCRYPTION_KEY` (คำสั่งสร้างอยู่ใน `.env.example`) ก่อน deploy — ค่านี้ใช้เข้ารหัสลิงก์ .ics ที่เก็บใน DB (เป็นลิงก์แบบ bearer token — ใครมีลิงก์ก็เห็นปฏิทินได้ จึงต้องเข้ารหัสไว้)

> ลิงก์ที่ publish แบบนี้เป็น URL สาธารณะบนอินเทอร์เน็ต (ไม่ผูกกับบัญชี —
> ใครมีลิงก์ก็เปิดดูได้ ไม่มีระบบ revoke สิทธิ์แยกจากการ unpublish/สร้างลิงก์
> ใหม่ทั้งหมด) — แจ้งสมาชิกให้ระวังไม่แชร์ลิงก์นี้ต่อ และนัดประชุมที่เกิดซ้ำ
> (recurring) จะแสดงผลถูกต้องเฉพาะรูปแบบทั่วไป (รายวัน/รายสัปดาห์/รายเดือน
> แบบง่าย) ดู `server/utils/ics.js`'s module comment สำหรับขอบเขตที่รองรับ

## 5. ขั้นตอน Deploy ครั้งแรก

```bash
git clone <repo> && cd jobcard-pro
cp .env.example .env && nano .env      # ใส่ DOMAIN + TEAM_PASSWORD_HASH
mkdir -p backups && chown 1001:1001 backups   # container รันเป็น uid 1001 (app) ไม่ใช่ root — ต้อง own ไดเรกทอรีนี้เองก่อนถึงจะ backup ได้
docker compose up -d --build
docker compose exec app node server/db/seed.js   # ครั้งแรกเท่านั้น
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

**กู้คืน** (รันบนโฮสต์ — `./backups` ไม่ใช่ `/backup`; `/backup` คือ path
*ข้างใน container* เท่านั้น ดู docker-compose.yml's bind mount ด้านบน)

```bash
docker compose stop app
cp ./backups/jobcard_20260901_0200.db ./data/jobcard.db
tar xzf ./backups/uploads_20260901_0200.tar.gz -C ./data
docker compose start app
```

## 8. Checklist ก่อนขึ้น Production

- [ ] `.env` ตั้งค่าครบ และ **ไม่ได้** commit ขึ้น git
- [ ] `docker compose up -d --build` ผ่านโดยไม่มี error (build บนเครื่อง dev ไม่เคยทดสอบจริง — `better-sqlite3` ต้อง compile บน Alpine/musl ตอน `npm ci`, ถ้า build พังตรงนี้มักเป็นเพราะขาด build tools ใน stage `deps`)
- [ ] Basic Auth หรือ IP allowlist เปิดใช้แล้ว
- [ ] ไม่ map port 3000 ออกสู่อินเทอร์เน็ตโดยตรง
- [ ] `data/` มี backup อัตโนมัติและทดสอบกู้คืนแล้ว 1 ครั้ง
- [ ] healthcheck ตอบ 200
- [ ] แจ้งทีมว่า **ไม่มีระบบล็อกอิน** — ใครมี URL ก็เข้าได้
- [ ] ทดสอบ smoke test 12 ข้อใน `docs/08-testing.md` ผ่านหมด