FROM node:22-alpine AS deps
WORKDIR /app
# better-sqlite3@13 requires Node >=22 (hence node:22 — node:20 yields a binary that
# segfaults). If no prebuilt binary is fetchable for Alpine/musl, npm falls back
# to node-gyp — which needs a toolchain. Kept in this stage only; the final
# image copies node_modules across and never sees these packages.
RUN apk add --no-cache python3 make g++
COPY package*.json ./
# node:22-alpine already ships the Node headers under /usr/local/include/node;
# pointing node-gyp at them avoids a download from unofficial-builds.nodejs.org
# (which times out on networks that can't reach it).
RUN npm_config_nodedir=/usr/local npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache sqlite tini && \
    addgroup -g 1001 app && adduser -u 1001 -G app -s /bin/sh -D app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app . .
RUN mkdir -p data/uploads && chown -R app:app data
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini","--"]
# Plain `node`, not `npm run migrate`/`npm run dev` — those scripts pass
# --env-file=.env (added for local-dev convenience, so a bare `node
# server/index.js` outside Docker still picks up .env), but this container
# never has a real .env file on disk: docker-compose.yml's `env_file: .env`
# injects those values as real process env vars at `docker compose up` time,
# not by copying the file in. --env-file here would either crash on a
# missing file, or (worse) only "work" because .env got baked into an image
# layer — neither is what we want.
CMD ["sh","-c","node server/db/migrate.js && node server/index.js"]
