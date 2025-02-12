-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS nodeconfig_db;
USE nodeconfig_db;

-- 创建订阅配置表
CREATE TABLE IF NOT EXISTS subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL COMMENT '用户名',
    description TEXT COMMENT '描述说明',
    node_config TEXT NOT NULL COMMENT '节点配置内容',
    subscription_url VARCHAR(255) COMMENT '订阅链接',
    qrcode_url VARCHAR(255) COMMENT '二维码链接',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点订阅配置表';

-- 创建节点表
CREATE TABLE IF NOT EXISTS nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subscription_id INT NOT NULL COMMENT '关联的订阅ID',
    node_type ENUM('vless', 'socks5') NOT NULL COMMENT '节点类型',
    node_url TEXT NOT NULL COMMENT '节点链接',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点详情表';

-- 创建管理员表
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '管理员用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码哈希',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员表';

-- 插入默认管理员账号
INSERT INTO admins (username, password) VALUES ('admin', SHA2('admin123', 256));
