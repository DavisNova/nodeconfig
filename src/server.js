const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const app = express();

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

        // 生成节点名称
        const name = `vless-${server}-${port}`;

        return {
            name,
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

// 生成配置的 API 端点
app.post('/api/generate', (req, res) => {
    try {
        const { nodes } = req.body;
        
        if (!Array.isArray(nodes) || nodes.length === 0) {
            return res.status(400).json({ 
                error: true, 
                message: '请提供至少一个有效的节点链接' 
            });
        }

        const proxies = [];
        const template = yaml.load(fs.readFileSync(path.join(__dirname, 'template.yml'), 'utf8'));
        const errors = [];

        // 解析每个节点
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

        // 如果没有有效节点
        if (proxies.length === 0) {
            return res.status(400).json({
                error: true,
                message: '没有找到有效的节点配置\n' + errors.join('\n')
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
            lineWidth: -1,  // 不限制行宽
            noRefs: true    // 不使用引用
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

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: true, 
        message: '服务器内部错误' 
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});
