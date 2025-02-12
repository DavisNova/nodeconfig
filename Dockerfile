FROM node:18-alpine

WORKDIR /app

# 安装必要的依赖
RUN apk add --no-cache \
    curl \
    mysql-client \
    qrencode \
    tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && apk del tzdata

# 创建必要的目录
RUN mkdir -p /app/src /app/logs

# 先复制 package.json
COPY src/package.json ./
RUN npm install \
    express \
    mysql2 \
    qrcode \
    moment \
    js-yaml \
    uuid \
    express-session \
    connect-mysql \
    winston \
    bcryptjs \
    && npm cache clean --force

# 复制源代码
COPY src/ ./

# 设置权限
RUN chmod -R 755 /app \
    && chown -R node:node /app

# 切换到非 root 用户
USER node

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/health || exit 1

# 等待 MySQL 就绪后启动应用
COPY docker-entrypoint.sh /
USER root
RUN chmod +x /docker-entrypoint.sh
USER node

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
