FROM node:18-alpine

WORKDIR /app

# 修改 apk 源为国内源，加快安装速度
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装必要的依赖
RUN apk add --no-cache \
    curl \
    mysql-client \
    qrencode \
    tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

# 创建必要的目录
RUN mkdir -p /app/src /app/logs

# 先复制 package.json
COPY src/package.json ./
RUN npm install

# 复制源代码
COPY src/ ./

# 设置权限
RUN chmod -R 755 /app

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
