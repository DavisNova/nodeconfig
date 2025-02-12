-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS nodeconfig_db
CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

USE nodeconfig_db;

-- 创建订阅配置表
CREATE TABLE IF NOT EXISTS subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL COMMENT '用户名',
    description TEXT COMMENT '描述说明',
    node_config TEXT NOT NULL COMMENT '节点配置内容',
    subscription_url VARCHAR(255) COMMENT '订阅链接',
    qrcode_url TEXT COMMENT '二维码链接',
    status ENUM('active', 'disabled') DEFAULT 'active' COMMENT '状态',
    expire_time DATETIME COMMENT '过期时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_username (username),
    INDEX idx_status (status),
    INDEX idx_expire_time (expire_time),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='节点订阅配置表';

-- 创建节点表
CREATE TABLE IF NOT EXISTS nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subscription_id INT NOT NULL COMMENT '关联的订阅ID',
    node_type ENUM('vless', 'socks5') NOT NULL COMMENT '节点类型',
    node_url TEXT NOT NULL COMMENT '节点链接',
    node_name VARCHAR(100) COMMENT '节点名称',
    node_status ENUM('online', 'offline') DEFAULT 'online' COMMENT '节点状态',
    last_check_time DATETIME COMMENT '最后检查时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    INDEX idx_subscription_id (subscription_id),
    INDEX idx_node_type (node_type),
    INDEX idx_node_status (node_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='节点详情表';

-- 创建管理员表
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '管理员用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码哈希',
    email VARCHAR(100) COMMENT '邮箱',
    role ENUM('admin', 'super_admin') DEFAULT 'admin' COMMENT '角色',
    last_login TIMESTAMP NULL COMMENT '最后登录时间',
    login_ip VARCHAR(45) COMMENT '最后登录IP',
    status ENUM('active', 'disabled') DEFAULT 'active' COMMENT '状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_username (username),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员表';

-- 创建操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT COMMENT '管理员ID',
    action VARCHAR(50) NOT NULL COMMENT '操作类型',
    target_type VARCHAR(50) COMMENT '操作对象类型',
    target_id INT COMMENT '操作对象ID',
    details TEXT COMMENT '操作详情',
    ip_address VARCHAR(45) COMMENT '操作IP',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_admin_id (admin_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- 插入默认管理员账号（密码：admin123）
INSERT INTO admins (username, password, role, email) 
VALUES ('admin', SHA2('admin123', 256), 'super_admin', 'admin@example.com')
ON DUPLICATE KEY UPDATE 
    password = VALUES(password),
    role = VALUES(role);

-- 创建访问统计表
CREATE TABLE IF NOT EXISTS access_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subscription_id INT NOT NULL COMMENT '订阅ID',
    access_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '访问时间',
    ip_address VARCHAR(45) COMMENT '访问IP',
    user_agent TEXT COMMENT '用户代理',
    INDEX idx_subscription_id (subscription_id),
    INDEX idx_access_time (access_time),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='访问统计表';

-- 创建会话表
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) NOT NULL PRIMARY KEY,
    expires INT(11) unsigned NOT NULL,
    data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会话表';
