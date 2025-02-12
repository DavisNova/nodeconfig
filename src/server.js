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

// Admin 路由 - 必须在静态文件服务之前
app.get('/admin', (req, res) => {
    console.log('访问 admin 页面');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 管理后台 API

// 获取统计数据
app.get('/api/admin/stats', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        try {
            const [subscriptions] = await conn.execute('SELECT COUNT(*) as total FROM subscriptions');
            const [activeUsers] = await conn.execute('SELECT COUNT(DISTINCT username) as total FROM subscriptions WHERE status = "active"');
            const [nodes] = await conn.execute('SELECT COUNT(*) as total FROM nodes');
            const [todayVisits] = await conn.execute(
                'SELECT COUNT(*) as total FROM access_stats WHERE DATE(access_time) = CURDATE()'
            );

            res.json({
                totalSubscriptions: subscriptions[0].total,
                activeUsers: activeUsers[0].total,
                totalNodes: nodes[0].total,
                todayVisits: todayVisits[0].total
            });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: true, message: '获取统计数据失败' });
    }
});

// 获取订阅列表
app.get('/api/admin/subscriptions', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const search = req.query.search || '';
        const status = req.query.status || '';
        
        const offset = (page - 1) * size;
        
        const conn = await pool.getConnection();
        try {
            let query = 'SELECT * FROM subscriptions WHERE 1=1';
            let countQuery = 'SELECT COUNT(*) as total FROM subscriptions WHERE 1=1';
            let params = [];
            
            if (search) {
                query += ` AND (username LIKE '%${search}%' OR description LIKE '%${search}%')`;
                countQuery += ` AND (username LIKE '%${search}%' OR description LIKE '%${search}%')`;
            }
            
            if (status) {
                query += ` AND status = '${status}'`;
                countQuery += ` AND status = '${status}'`;
            }
            
            // 执行计数查询
            const [totalRows] = await conn.query(countQuery);
            
            // 添加分页并执行主查询
            query += ` ORDER BY created_at DESC LIMIT ${size} OFFSET ${offset}`;
            const [subscriptions] = await conn.query(query);
            
            // 格式化日期
            const formattedSubscriptions = subscriptions.map(sub => ({
                ...sub,
                created_at: sub.created_at ? moment(sub.created_at).format('YYYY-MM-DD HH:mm:ss') : null,
                updated_at: sub.updated_at ? moment(sub.updated_at).format('YYYY-MM-DD HH:mm:ss') : null
            }));
            
            res.json({
                subscriptions: formattedSubscriptions,
                total: totalRows[0].total,
                page,
                size
            });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Error getting subscriptions:', error);
        res.status(500).json({ 
            error: true, 
            message: '获取订阅列表失败',
            details: error.message 
        });
    }
});

// 获取订阅详情
app.get('/api/admin/subscriptions/:id', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        try {
            const [subscription] = await conn.execute(
                'SELECT s.*, GROUP_CONCAT(n.node_url) as nodes FROM subscriptions s LEFT JOIN nodes n ON s.id = n.subscription_id WHERE s.id = ? GROUP BY s.id',
                [req.params.id]
            );

            if (subscription.length === 0) {
                return res.status(404).json({ error: true, message: '订阅不存在' });
            }

            // 生成 YAML 配置
            const nodes = subscription[0].nodes ? subscription[0].nodes.split(',') : [];
            const template = yaml.load(fs.readFileSync(path.join(__dirname, 'template.yml'), 'utf8'));
            template.proxies = nodes.map(node => {
                return node.startsWith('vless://') ? parseVlessLink(node) : parseSocks5Link(node);
            }).filter(Boolean);

            subscription[0].yaml_config = yaml.dump(template);

            res.json(subscription[0]);
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Error getting subscription details:', error);
        res.status(500).json({ error: true, message: '获取订阅详情失败' });
    }
});

// 编辑订阅
app.put('/api/admin/subscriptions/:id', async (req, res) => {
    try {
        const { username, description, status, nodes } = req.body;
        
        if (!username) {
            return res.status(400).json({
                error: true,
                message: '用户名不能为空'
            });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // 更新订阅基本信息
            await conn.execute(
                'UPDATE subscriptions SET username = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [username, description, status, req.params.id]
            );

            // 如果提供了新的节点配置，更新节点
            if (nodes && nodes.length > 0) {
                // 删除旧节点
                await conn.execute('DELETE FROM nodes WHERE subscription_id = ?', [req.params.id]);
                
                // 添加新节点
                for (const node of nodes) {
                    await conn.execute(
                        'INSERT INTO nodes (subscription_id, node_type, node_url) VALUES (?, ?, ?)',
                        [req.params.id, node.startsWith('vless://') ? 'vless' : 'socks5', node]
                    );
                }
            }

            await conn.commit();
            
            res.json({
                success: true,
                message: '订阅更新成功'
            });
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Error updating subscription:', error);
        res.status(500).json({
            error: true,
            message: '更新订阅失败'
        });
    }
});

// 删除订阅
app.delete('/api/admin/subscriptions/:id', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // 先删除关联的节点
            await conn.execute('DELETE FROM nodes WHERE subscription_id = ?', [req.params.id]);
            
            // 再删除订阅
            const [result] = await conn.execute('DELETE FROM subscriptions WHERE id = ?', [req.params.id]);
            
            await conn.commit();

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: true,
                    message: '订阅不存在'
                });
            }

            res.json({
                success: true,
                message: '订阅删除成功'
            });
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Error deleting subscription:', error);
        res.status(500).json({
            error: true,
            message: '删除订阅失败'
        });
    }
});

// 记录访问统计
app.post('/api/admin/access-stats', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        try {
            await conn.execute(
                'INSERT INTO access_stats (ip_address, user_agent) VALUES (?, ?)',
                [req.ip, req.headers['user-agent']]
            );
            res.json({ success: true });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Error recording access stats:', error);
        res.status(500).json({ error: true });
    }
});

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
app.post('/api/check', (req, res) => {
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

        nodes.forEach((node, index) => {
            const trimmedNode = node.trim();
            if (!trimmedNode) return;

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
        });

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
            message: '检查配置时发生错误' 
        });
    }
});

// 生成配置文件
app.post('/api/generate', (req, res) => {
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

        nodes.forEach((node, index) => {
            const trimmedNode = node.trim();
            if (!trimmedNode) return;

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
        });

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
            message: '生成配置文件时发生错误' 
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
                'INSERT INTO subscriptions (username, description, node_config, subscription_url, qrcode_url) VALUES (?, ?, ?, ?, ?)',
                [username, description, JSON.stringify(nodes), subscriptionUrl, qrcodeDataUrl]
            );

            // 保存节点信息
            for (const node of nodes) {
                await conn.execute(
                    'INSERT INTO nodes (subscription_id, node_type, node_url) VALUES (?, ?, ?)',
                    [result.insertId, node.startsWith('vless://') ? 'vless' : 'socks5', node]
                );
            }

            await conn.commit();

            // 记录操作日志
            await conn.execute(
                    'INSERT INTO operation_logs (action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?)',
                    ['create_subscription', 'subscription', result.insertId, '创建新订阅', req.ip]
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
            message: '保存配置时发生错误'
        });
    }
});

// 获取订阅配置
app.get('/subscribe/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT node_config FROM subscriptions WHERE subscription_url LIKE ?',
            [`%${req.params.id}%`]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: true,
                message: '订阅不存在'
            });
        }

        const nodes = JSON.parse(rows[0].node_config);
        const template = yaml.load(fs.readFileSync(path.join(__dirname, 'template.yml'), 'utf8'));
        
        // 更新配置
        template.proxies = nodes.map(node => {
            return node.startsWith('vless://') ? 
                parseVlessLink(node) : 
                parseSocks5Link(node);
        }).filter(Boolean);

        // 更新代理组
        updateProxyGroups(template, template.proxies);

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
            message: '获取订阅配置时发生错误'
        });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: true,
        message: '服务器内部错误'
    });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        error: true,
        message: '页面不存在'
    });
});

// 更新代理组配置
function updateProxyGroups(template, proxies) {
    if (!template.proxy_groups) {
        template.proxy_groups = [];
    }

    // 获取所有代理名称
    const proxyNames = proxies.map(proxy => proxy.name);

    // 更新或创建代理组
    template.proxy_groups = [
        {
            name: '🚀 节点选择',
            type: 'select',
            proxies: ['♻️ 自动选择', '🎯 全球直连', ...proxyNames],
            use: []  // 添加 use 字段
        },
        {
            name: '♻️ 自动选择',
            type: 'url-test',
            url: 'http://www.gstatic.com/generate_204',
            interval: 300,
            tolerance: 50,
            proxies: proxyNames,
            use: []  // 添加 use 字段
        },
        {
            name: '🎯 全球直连',
            type: 'select',
            proxies: ['DIRECT'],
            use: []  // 添加 use 字段
        },
        {
            name: '🔰 故障转移',
            type: 'fallback',
            proxies: proxyNames,
            url: 'http://www.gstatic.com/generate_204',
            interval: 300,
            use: []  // 添加 use 字段
        }
    ];
}

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});

