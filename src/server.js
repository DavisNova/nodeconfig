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

app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
        const morenGroup = template['proxy-groups'].find(g => g.name === 'moren');
        if (morenGroup) {
            morenGroup.proxies = proxies.map(p => p.name);
        }

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
        const morenGroup = template['proxy-groups'].find(g => g.name === 'moren');
        if (morenGroup) {
            morenGroup.proxies = proxies.map(p => p.name);
        }

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
        const morenGroup = template['proxy-groups'].find(g => g.name === 'moren');
        if (morenGroup) {
            morenGroup.proxies = template.proxies.map(p => p.name);
        }

        const yamlStr = yaml.dump(template, {
            lineWidth: -1,
            noRefs: true
        });

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

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});
