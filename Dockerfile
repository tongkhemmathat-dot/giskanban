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
