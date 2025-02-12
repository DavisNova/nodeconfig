const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 解析 vless 链接
function parseVlessLink(link) {
    const regex = /vless:\/\/([^@]+)@([^:]+):(\d+)\?(.*)/;
    const match = link.match(regex);
    if (!match) return null;

    const [_, uuid, server, port, params] = match;
    const paramsObj = Object.fromEntries(
        params.split('&').map(p => p.split('='))
    );

    return {
        name: `vless-${server}-${port}`,
        type: 'vless',
        server,
        port: parseInt(port),
        uuid,
        network: 'tcp',
        udp: true,
        tls: true,
        flow: 'xtls-rprx-vision',
        servername: paramsObj.sni || 'yahoo.com',
        'reality-opts': {
            'public-key': paramsObj.pbk,
            'short-id': paramsObj.sid
        },
        'client-fingerprint': 'chrome'
    };
}

// 解析 socks5 链接
function parseSocks5Link(link) {
    const [server, port, username, password] = link.split(':');
    return {
        name: `socks5-${server}-${port}`,
        type: 'socks5',
        server,
        port: parseInt(port),
        username,
        password,
        'skip-cert-verify': true,
        udp: true
    };
}

// 生成配置的 API 端点
app.post('/api/generate', (req, res) => {
    try {
        const { nodes } = req.body;
        const proxies = [];
        const template = yaml.load(fs.readFileSync(path.join(__dirname, 'template.yml'), 'utf8'));

        // 解析每个节点链接
        nodes.forEach(node => {
            if (node.startsWith('vless://')) {
                const proxy = parseVlessLink(node);
                if (proxy) proxies.push(proxy);
            } else if (node.includes(':')) {
                const proxy = parseSocks5Link(node);
                if (proxy) proxies.push(proxy);
            }
        });

        if (proxies.length === 0) {
            return res.status(400).json({ error: '没有有效的节点配置' });
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
        console.error('Error:', error);
        res.status(500).json({ error: '生成配置文件时发生错误' });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});
