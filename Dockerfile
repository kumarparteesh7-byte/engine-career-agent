# Byte Engine — dashboard + CV tailoring server
FROM node:20-slim

# Chromium + the libraries puppeteer needs for headless PDF rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Use the system Chromium; don't download puppeteer's own copy
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Render/Railway provide PORT at runtime; default for local docker runs
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/dashboard/server.js"]
