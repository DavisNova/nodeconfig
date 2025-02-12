const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const QRCode = require('qrcode');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const MySQLStore = require('connect-mysql')(session);

const app = express();

// 数据库配置
const dbConfig = {
    host: process.env.DB_HOST || 'mysql',
    user: process.env.DB_USER || 'nodeconfig',
    password: process.env.DB_PASSWORD || 'nodeconfig123',
    database: process.env.DB_NAME || 'nodeconfig_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 会话配置
app.use(session({
    store: new MySQLStore({
        config: dbConfig
    }),
    secret: 'nodeconfig-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24小时
}));

// 中间件配置
app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
// Admin 路由和静态文件服务
app.get('/admin', (req, res) => {
    console.log('访问 admin 页面');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.use(express.static(path.join(__dirname)));

// 工具函数：更新代理组配置
function updateProxyGroups(template, proxies) {
    try {
        if (!Array.isArray(proxies)) {
            console.error('Invalid proxies input');
            proxies = [];
        }

        // 获取所有代理名称并过滤无效值
        const proxyNames = proxies
            .filter(proxy => proxy && proxy.name)
            .map(proxy => proxy.name);
        
        // 确保至少有一个代理
        if (proxyNames.length === 0) {
            proxyNames.push('DIRECT');
        }

        // 更新代理组配置
        template.proxy_groups = [
            {
                name: '🚀 节点选择',
                type: 'select',
                proxies: ['♻️ 自动选择', '🔰 故障转移', 'DIRECT', ...proxyNames]
            },
            {
                name: '♻️ 自动选择',
                type: 'url-test',
                proxies: [...proxyNames],
                url: 'http://www.gstatic.com/generate_204',
                interval: 300,
                tolerance: 50
            },
            {
                name: '🔰 故障转移',
                type: 'fallback',
                proxies: [...proxyNames],
                url: 'http://www.gstatic.com/generate_204',
                interval: 300
            },
            {
                name: '🌍 国外媒体',
                type: 'select',
                proxies: ['🚀 节点选择', '♻️ 自动选择', '🎯 全球直连']
            },
            {
                name: '📲 电报信息',
                type: 'select',
                proxies: ['🚀 节点选择', '🎯 全球直连']
            },
            {
                name: 'Ⓜ️ 微软服务',
                type: 'select',
                proxies: ['🎯 全球直连', '🚀 节点选择']
            },
            {
                name: '🍎 苹果服务',
                type: 'select',
                proxies: ['🎯 全球直连', '🚀 节点选择']
            },
            {
                name: '🎯 全球直连',
                type: 'select',
                proxies: ['DIRECT', '🚀 节点选择']
            },
            {
                name: '🛑 全球拦截',
                type: 'select',
                proxies: ['REJECT', 'DIRECT']
            }
        ];
    } catch (error) {
        console.error('Error updating proxy groups:', error);
        // 设置默认配置
        template.proxy_groups = [];
    }
}

// 解析 vless 链接
function parseVlessLink(link) {
    try {
        const regex = /vless:\/\/([^@]+)@([^:]+):(\d+)\?(.*)/;
        const match = link.match(regex);
        if (!match) {
            console.log('Invalid VLESS link format');
            return null;
        }

        const [_, uuid, server, port, params] = match;
        const paramsObj = Object.fromEntries(
            params.split('&').map(p => {
                const [key, value] = p.split('=');
                return [key, decodeURIComponent(value || '')];
            })
        );

        return {
            name: `vless-${server}-${port}`,
            type: 'vless',
            server,
            port: parseInt(port),
            uuid,
            network: paramsObj.type || 'tcp',
            udp: true,
            tls: true,
            flow: 'xtls-rprx-vision',
            servername: paramsObj.sni || 'yahoo.com',
            'reality-opts': {
                'public-key': paramsObj.pbk || '',
                'short-id': paramsObj.sid || ''
            },
            'client-fingerprint': paramsObj.fp || 'chrome'
        };
    } catch (error) {
        console.error('Error parsing VLESS link:', error);
        return null;
    }
}
// 解析 socks5 链接
function parseSocks5Link(link) {
    try {
        const parts = link.split(':');
        if (parts.length !== 4) {
            console.log('Invalid SOCKS5 link format');
            return null;
        }

        const [server, port, username, password] = parts;
        
        // 验证端口号
        const portNum = parseInt(port);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            console.log('Invalid port number');
            return null;
        }

        return {
            name: `socks5-${server}-${port}`,
            type: 'socks5',
            server,
            port: portNum,
            username,
            password,
            'skip-cert-verify': true,
            udp: true
        };
    } catch (error) {
        console.error('Error parsing SOCKS5 link:', error);
        return null;
    }
}

// 检查配置格式
app.post('/api/check', async (req, res) => {
    try {
        const { nodes } = req.body;
        const proxies = [];
        const errors = [];
        const template = yaml.load(fs.readFileSync(path.join(__dirname, 'template.yml'), 'utf8'));

        if (!nodes || nodes.length === 0) {
            return res.status(400).json({ 
                error: true, 
                message: '请提供至少一个节点链接' 
            });
        }

        for (const [index, node] of nodes.entries()) {
            const trimmedNode = node.trim();
            if (!trimmedNode) continue;

            let proxy = null;
            if (trimmedNode.startsWith('vless://')) {
                proxy = parseVlessLink(trimmedNode);
                if (!proxy) {
                    errors.push(`第 ${index + 1} 个 VLESS 节点格式错误`);
                }
            } else if (trimmedNode.includes(':')) {
                proxy = parseSocks5Link(trimmedNode);
                if (!proxy) {
                    errors.push(`第 ${index + 1} 个 SOCKS5 节点格式错误`);
                }
            } else {
                errors.push(`第 ${index + 1} 个节点格式无法识别`);
            }

            if (proxy) {
                proxies.push(proxy);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: true,
                message: errors.join('\n')
            });
        }

        // 更新配置
        template.proxies = proxies;
        
        // 更新代理组
        updateProxyGroups(template, proxies);

        // 生成 YAML 字符串
        const yamlStr = yaml.dump(template, {
            lineWidth: -1,
            noRefs: true
        });

        res.json({
            error: false,
            message: '配置格式正确',
            yaml: yamlStr
        });

    } catch (error) {
        console.error('Error checking config:', error);
        res.status(500).json({ 
            error: true, 
            message: '检查配置时发生错误',
            details: error.message
        });
    }
});
// 生成配置文件
app.post('/api/generate', async (req, res) => {
    try {
        const { nodes } = req.body;
        
        if (!nodes || nodes.length === 0) {
            return res.status(400).json({ 
                error: true, 
                message: '请提供至少一个节点链接' 
            });
        }

        const proxies = [];
        const errors = [];
        const template = yaml.load(fs.readFileSync(path.join(__dirname, 'template.yml'), 'utf8'));

        for (const [index, node] of nodes.entries()) {
            const trimmedNode = node.trim();
            if (!trimmedNode) continue;

            let proxy = null;
            if (trimmedNode.startsWith('vless://')) {
                proxy = parseVlessLink(trimmedNode);
                if (!proxy) {
                    errors.push(`第 ${index + 1} 个 VLESS 节点格式错误`);
                }
            } else if (trimmedNode.includes(':')) {
                proxy = parseSocks5Link(trimmedNode);
                if (!proxy) {
                    errors.push(`第 ${index + 1} 个 SOCKS5 节点格式错误`);
                }
            } else {
                errors.push(`第 ${index + 1} 个节点格式无法识别`);
            }

            if (proxy) {
                proxies.push(proxy);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: true,
                message: errors.join('\n')
            });
        }

        // 更新配置
        template.proxies = proxies;
        
        // 更新代理组
        updateProxyGroups(template, proxies);

        // 生成 YAML 字符串
        const yamlStr = yaml.dump(template, {
            lineWidth: -1,
            noRefs: true
        });

        // 发送响应
        res.setHeader('Content-Type', 'application/yaml');
        res.setHeader('Content-Disposition', 'attachment; filename=config.yaml');
        res.send(yamlStr);

    } catch (error) {
        console.error('Error generating config:', error);
        res.status(500).json({ 
            error: true, 
            message: '生成配置文件时发生错误',
            details: error.message
        });
    }
});

// 保存配置
app.post('/api/save', async (req, res) => {
    try {
        const { username, description, nodes } = req.body;
        
        if (!username || !nodes || nodes.length === 0) {
            return res.status(400).json({
                error: true,
                message: '请提供用户名和节点配置'
            });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // 生成订阅ID
            const subscriptionId = uuidv4();
            const subscriptionUrl = `${req.protocol}://${req.get('host')}/subscribe/${subscriptionId}`;
            
            // 生成二维码
            const qrcodeDataUrl = await QRCode.toDataURL(subscriptionUrl);

            // 保存订阅信息
            const [result] = await conn.execute(
                'INSERT INTO subscriptions (id, username, description, node_config, subscription_url, qrcode_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [subscriptionId, username, description, JSON.stringify(nodes), subscriptionUrl, qrcodeDataUrl, 'active']
            );

            // 保存节点信息
            for (const node of nodes) {
                await conn.execute(
                    'INSERT INTO nodes (subscription_id, node_type, node_url) VALUES (?, ?, ?)',
                    [subscriptionId, node.startsWith('vless://') ? 'vless' : 'socks5', node]
                );
            }

            await conn.commit();

            // 记录操作日志
            await conn.execute(
                'INSERT INTO operation_logs (action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?)',
                ['create_subscription', 'subscription', subscriptionId, '创建新订阅', req.ip]
            );

            res.json({
                success: true,
                subscriptionUrl,
                qrcodeUrl: qrcodeDataUrl
            });
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({
            error: true,
            message: '保存配置时发生错误',
            details: error.message
        });
    }
});
// 获取订阅配置
app.get('/subscribe/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM subscriptions WHERE id = ? AND status = "active"',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: true,
                message: '订阅不存在或已失效'
            });
        }

        const nodes = JSON.parse(rows[0].node_config);
        const template = yaml.load(fs.readFileSync(path.join(__dirname, 'template.yml'), 'utf8'));
        
        // 更新配置
        const proxies = [];
        for (const node of nodes) {
            const proxy = node.startsWith('vless://') ? 
                parseVlessLink(node) : 
                parseSocks5Link(node);
            if (proxy) {
                proxies.push(proxy);
            }
        }

        if (proxies.length === 0) {
            return res.status(400).json({
                error: true,
                message: '订阅中没有有效的节点'
            });
        }

        template.proxies = proxies;
        
        // 更新代理组
        updateProxyGroups(template, proxies);

        const yamlStr = yaml.dump(template, {
            lineWidth: -1,
            noRefs: true
        });

        // 记录访问统计
        const conn = await pool.getConnection();
        try {
            await conn.execute(
                'INSERT INTO access_stats (subscription_id, ip_address, user_agent) VALUES (?, ?, ?)',
                [rows[0].id, req.ip, req.headers['user-agent']]
            );

            // 更新最后访问时间
            await conn.execute(
                'UPDATE subscriptions SET last_access = CURRENT_TIMESTAMP WHERE id = ?',
                [rows[0].id]
            );
        } finally {
            conn.release();
        }

        res.setHeader('Content-Type', 'application/yaml');
        res.setHeader('Content-Disposition', 'attachment; filename=config.yaml');
        res.send(yamlStr);

    } catch (error) {
        console.error('Error serving subscription:', error);
        res.status(500).json({
            error: true,
            message: '获取订阅配置时发生错误',
            details: error.message
        });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: true,
        message: '服务器内部错误',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        error: true,
        message: '页面不存在'
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', async () => {
    console.log('收到 SIGTERM 信号，准备关闭服务器...');
    try {
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('关闭数据库连接池时发生错误:', error);
        process.exit(1);
    }
});

