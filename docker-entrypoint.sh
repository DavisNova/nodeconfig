#!/bin/sh

# 设置错误时退出
set -e

# 等待 MySQL 就绪
echo "Waiting for MySQL to be ready..."
while ! mysqladmin ping -h"$DB_HOST" --user="$DB_USER" --password="$DB_PASSWORD" --silent; do
    echo "MySQL is unavailable - sleeping"
    sleep 1
done

echo "MySQL is ready! Starting application..."

# 检查数据库表是否存在，不存在则创建
mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    CREATE TABLE IF NOT EXISTS subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL COMMENT '用户名',
        description TEXT COMMENT '描述说明',
        node_config TEXT NOT NULL COMMENT '节点配置内容',
        subscription_url VARCHAR(255) COMMENT '订阅链接',
        qrcode_url TEXT COMMENT '二维码链接',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        INDEX idx_username (username),
        INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点订阅配置表';

    CREATE TABLE IF NOT EXISTS nodes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subscription_id INT NOT NULL COMMENT '关联的订阅ID',
        node_type ENUM('vless', 'socks5') NOT NULL COMMENT '节点类型',
        node_url TEXT NOT NULL COMMENT '节点链接',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
        INDEX idx_subscription_id (subscription_id),
        INDEX idx_node_type (node_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点详情表';
"

# 检查日志目录权限
if [ ! -d "/app/logs" ]; then
    mkdir -p /app/logs
fi
chown -R node:node /app/logs

# 启动应用
echo "Starting Node.js application..."
exec "$@"
