FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
FROM dependencies AS test
COPY src ./src
COPY test ./test
RUN npm test
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=test --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node tools/backup.js ./tools/backup.js
USER node
CMD ["node", "src/app.js"]
