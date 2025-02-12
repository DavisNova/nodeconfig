FROM node:18-alpine

WORKDIR /app

# 安装必要的依赖
RUN apk add --no-cache curl

# 创建 src 目录
RUN mkdir -p /app/src

# 先复制 package.json
COPY src/package.json ./
RUN npm install

# 再复制其他文件
COPY src/ ./

# 设置权限
RUN chmod -R 755 /app

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
