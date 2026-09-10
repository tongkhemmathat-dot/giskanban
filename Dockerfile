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
# Plain `node`, not `npm run migrate`/`npm run dev` — those scripts pass
# --env-file=.env (added for local-dev convenience, so a bare `node
# server/index.js` outside Docker still picks up .env), but this container
# never has a real .env file on disk: docker-compose.yml's `env_file: .env`
# injects those values as real process env vars at `docker compose up` time,
# not by copying the file in. --env-file here would either crash on a
# missing file, or (worse) only "work" because .env got baked into an image
# layer — neither is what we want.
CMD ["sh","-c","node server/db/migrate.js && node server/index.js"]
