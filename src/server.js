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
    database: process.env.DB_NAME || 'nodeconfig_db'
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

// 原有的解析函数保持不变...

// 新增：保存配置到数据库
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

            // 生成订阅链接和二维码
            const subscriptionId = uuidv4();
            const subscriptionUrl = `${req.protocol}://${req.get('host')}/subscribe/${subscriptionId}`;
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

// 订阅链接访问
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

// 管理接口
app.get('/api/subscriptions', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, username, description, subscription_url, created_at, updated_at FROM subscriptions ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({
            error: true,
            message: '获取订阅列表失败'
        });
    }
});

// 删除订阅
app.delete('/api/subscriptions/:id', async (req, res) => {
    try {
        await pool.execute('DELETE FROM subscriptions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting subscription:', error);
        res.status(500).json({
            error: true,
            message: '删除订阅失败'
        });
    }
});

// 原有的其他接口保持不变...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});
