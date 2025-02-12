FROM node:18-alpine

WORKDIR /app

# 先复制 package.json
COPY src/package.json ./
RUN npm install

# 再复制其他文件
COPY src/ ./

EXPOSE 3000

CMD ["node", "server.js"]
