FROM node:18-alpine

WORKDIR /app/src

# 修改 apk 源为国内源并安装依赖
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && apk update \
    && apk add --no-cache \
    curl \
    mysql-client \
    tzdata \
    git

# 设置时区
RUN cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && apk del tzdata

# 复制 package.json 和 package-lock.json（如果存在）
COPY src/package*.json ./

# 使用淘宝镜像源安装依赖
RUN npm config set registry https://registry.npmmirror.com \
    && npm install \
    && npm cache clean --force

# 复制其他源代码
COPY src/ .

# 创建日志目录
RUN mkdir -p /app/logs

# 设置权限
RUN chown -R node:node /app \
    && chmod -R 755 /app

# 切换到非 root 用户
USER node

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["npm", "start"]
