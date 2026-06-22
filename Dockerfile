# Sử dụng Node.js slim làm image gốc
FROM node:18-slim

# Cài đặt các thư viện hệ thống cần thiết để khởi chạy Chrome Headless (Puppeteer/zca-js)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbus-1-0 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Thiết lập thư mục làm việc trong container
WORKDIR /usr/src/app

# Sao chép package.json từ thư mục server và cài đặt thư viện
COPY server/package.json ./server/
RUN cd server && npm install

# Sao chép toàn bộ dự án vào container (bao gồm giao diện tĩnh và source server)
COPY . .

# Expose cổng 3000 chạy ứng dụng (cả UI tĩnh và API backend)
EXPOSE 3000

# Khởi chạy server Node.js
CMD ["node", "server/server.js"]
