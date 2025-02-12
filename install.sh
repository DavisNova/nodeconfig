#!/bin/bash

# 定义颜色
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
plain='\033[0m'

# 仓库信息
REPO_URL="https://raw.githubusercontent.com/DavisNova/nodeconfig/main"

# 清屏
clear

# 打印 Logo
echo -e "\033[36m"
cat << "EOF"
 _   _           _        ____             __ _       
| \ | | ___   __| | ___  / ___|___  _ __  / _(_) __ _ 
|  \| |/ _ \ / _' |/ _ \| |   / _ \| '_ \| |_| |/ _' |
| |\  | (_) | (_| |  __/| |__| (_) | | | |  _| | (_| |
|_| \_|\___/ \__,_|\___| \____\___/|_| |_|_| |_|\__, |
                                                |___/ 
EOF
echo -e "${plain}"

# 打印版本信息
echo "节点配置生成工具箱 v1.0.0"
echo "------------------------"

check_sys() {
    # 检查是否是 root 用户
    [[ $EUID -ne 0 ]] && echo -e "${red}错误：${plain} 必须使用root用户运行此脚本！\n" && exit 1

    # 检查系统类型
    if [[ ! -f /etc/debian_version ]]; then
        echo -e "${red}错误：${plain} 此脚本仅支持 Debian/Ubuntu 系统！\n" && exit 1
    fi
}

# 主菜单
show_menu() {
    echo -e "
  ${green}节点配置生成工具箱${plain}
  ${green}1.${plain}  安装依赖
  ${green}2.${plain}  部署服务
  ${green}3.${plain}  启动服务
  ${green}4.${plain}  停止服务
  ${green}5.${plain}  重启服务
  ${green}6.${plain}  查看状态
  ${green}7.${plain}  查看日志
  ${green}8.${plain}  卸载服务
  ${green}0.${plain}  退出脚本
  "
    echo && read -p "请输入选择 [0-8]: " num

    case "${num}" in
        1) install_dependencies ;;
        2) deploy_service ;;
        3) start_service ;;
        4) stop_service ;;
        5) restart_service ;;
        6) show_status ;;
        7) show_logs ;;
        8) uninstall_service ;;
        0) exit 0 ;;
        *) echo -e "${red}请输入正确的数字 [0-8]${plain}" ;;
    esac
}

install_dependencies() {
    echo -e "${yellow}开始安装依赖...${plain}"
    apt update && apt upgrade -y
    apt install -y curl git nginx certbot python3-certbot-nginx
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    npm install -g pm2
    echo -e "${green}依赖安装完成${plain}"
}

deploy_service() {
    echo -e "${yellow}开始部署服务...${plain}"
    # 创建目录
    mkdir -p /var/www/node-config/src
    cd /var/www/node-config

    # 下载配置文件
    echo "下载配置文件..."
    curl -o package.json ${REPO_URL}/src/package.json
    curl -o src/index.html ${REPO_URL}/src/index.html
    curl -o src/template.yml ${REPO_URL}/src/template.yml
    curl -o src/server.js ${REPO_URL}/src/server.js

    # 安装依赖
    echo "安装项目依赖..."
    npm install

    # 配置 Nginx
    echo "配置 Nginx..."
    cat > /etc/nginx/sites-available/node-config << 'EOF'
server {
    listen 80;
    server_name $HOSTNAME;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

    ln -sf /etc/nginx/sites-available/node-config /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    echo -e "${green}部署完成${plain}"
}

start_service() {
    echo -e "${yellow}启动服务...${plain}"
    cd /var/www/node-config
    pm2 start src/server.js --name node-config
    pm2 save
    systemctl restart nginx
    echo -e "${green}服务已启动${plain}"
}

stop_service() {
    echo -e "${yellow}停止服务...${plain}"
    pm2 stop node-config
    echo -e "${green}服务已停止${plain}"
}

restart_service() {
    echo -e "${yellow}重启服务...${plain}"
    pm2 restart node-config
    systemctl restart nginx
    echo -e "${green}服务已重启${plain}"
}

show_status() {
    echo -e "${yellow}服务状态：${plain}"
    pm2 status node-config
}

show_logs() {
    echo -e "${yellow}查看日志：${plain}"
    pm2 logs node-config
}

uninstall_service() {
    echo -e "${red}卸载服务...${plain}"
    pm2 delete node-config
    rm -rf /var/www/node-config
    rm -f /etc/nginx/sites-enabled/node-config
    rm -f /etc/nginx/sites-available/node-config
    systemctl restart nginx
    echo -e "${green}服务已卸载${plain}"
}

# 检查系统环境
check_sys

# 显示主菜单
show_menu
