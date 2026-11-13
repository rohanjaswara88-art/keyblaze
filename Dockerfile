# Keyblaze: the game and its API server in one image.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/keyblaze.db

WORKDIR /app

# Install server dependencies first, so this layer is cached until package files change.
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev && npm cache clean --force

# Only what the server runs or serves.
COPY index.html og-image.png ./
COPY css ./css
COPY js ./js
COPY server/src ./server/src

# Run as the unprivileged "node" user, with a writable folder for the SQLite file.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/src/index.js"]
