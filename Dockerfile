FROM node:18-alpine

WORKDIR /app

# 安装必要的依赖
RUN apk add --no-cache \
    curl \
    mysql-client \
    qrencode

# 创建 src 目录
RUN mkdir -p /app/src

# 先复制 package.json
COPY src/package.json ./
RUN npm install \
    express \
    mysql2 \
    qrcode \
    moment \
    js-yaml \
    uuid

# 再复制其他文件
COPY src/ ./

# 设置权限
RUN chmod -R 755 /app

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/ || exit 1

# 等待 MySQL 就绪后启动应用
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]

CMD ["node", "server.js"]
