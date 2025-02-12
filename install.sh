#!/bin/bash

# 定义颜色
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
cyan='\033[0;36m'
plain='\033[0m'

# 清屏函数
clear_screen() {
    clear
    echo -e "${cyan}"
    cat << "EOF"
 _   _           _        ____             __ _       
| \ | | ___   __| | ___  / ___|___  _ __  / _(_) __ _ 
|  \| |/ _ \ / _' |/ _ \| |   / _ \| '_ \| |_| |/ _' |
| |\  | (_) | (_| |  __/| |__| (_) | | | |  _| | (_| |
|_| \_|\___/ \__,_|\___| \____\___/|_| |_|_| |_|\__, |
                                                |___/ 
EOF
    echo -e "${plain}"
    echo "节点配置生成工具箱 v1.0.0"
    echo "------------------------"
}

# 检查系统
check_sys() {
    if [[ ! -f /etc/debian_version ]]; then
        echo -e "${red}错误：本脚本仅支持 Debian/Ubuntu 系统！${plain}"
        exit 1
    fi
}

# 安装基础组件
install_base() {
    echo -e "${yellow}开始安装依赖...${plain}"
    
    # 更新系统包
    apt update
    
    # 安装基础工具
    apt install -y curl wget git

    # 安装 Docker
    echo -e "${yellow}开始安装 Docker...${plain}"
    curl -fsSL https://get.docker.com | sh
    
    # 启动 Docker 服务
    systemctl start docker
    systemctl enable docker
    
    # 安装 Docker Compose V2
    echo -e "${yellow}开始安装 Docker Compose...${plain}"
    mkdir -p ~/.docker/cli-plugins/
    curl -SL https://github.com/docker/compose/releases/download/v2.24.1/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
    chmod +x ~/.docker/cli-plugins/docker-compose
    
    # 创建软链接以确保全局可用
    ln -sf ~/.docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
    
    # 验证安装
    echo -e "${yellow}验证安装...${plain}"
    docker --version || echo -e "${red}Docker 安装失败${plain}"
    docker compose version || echo -e "${red}Docker Compose 安装失败${plain}"
    
    echo -e "${green}依赖安装完成！${plain}"
    sleep 2
}

# 部署服务
deploy_service() {
    echo -e "${yellow}开始部署服务...${plain}"
    
    # 创建工作目录
    mkdir -p /opt/nodeconfig
    cd /opt/nodeconfig

    # 克隆项目
    git clone https://github.com/DavisNova/nodeconfig.git .

    # 启动服务
    docker compose up -d

    echo -e "${green}服务部署完成！${plain}"
    sleep 2
}

# 显示菜单
show_menu() {
    while true; do
        clear_screen
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
            1)
                install_base
                continue
                ;;
            2)
                deploy_service
                continue
                ;;
            3)
                cd /opt/nodeconfig && docker compose up -d
                echo -e "${green}服务已启动！${plain}"
                sleep 2
                continue
                ;;
            4)
                cd /opt/nodeconfig && docker compose down
                echo -e "${green}服务已停止！${plain}"
                sleep 2
                continue
                ;;
            5)
                cd /opt/nodeconfig && docker compose restart
                echo -e "${green}服务已重启！${plain}"
                sleep 2
                continue
                ;;
            6)
                cd /opt/nodeconfig && docker compose ps
                echo && read -p "按回车继续..." 
                ;;
            7)
                cd /opt/nodeconfig && docker compose logs
                echo && read -p "按回车继续..." 
                ;;
            8)
                cd /opt/nodeconfig && docker compose down
                rm -rf /opt/nodeconfig
                echo -e "${green}服务已卸载！${plain}"
                sleep 2
                continue
                ;;
            0)
                exit 0
                ;;
            *)
                echo -e "${red}请输入正确的数字 [0-8]${plain}"
                sleep 2
                ;;
        esac
    done
}

# 检查是否为root用户
[[ $EUID -ne 0 ]] && echo -e "${red}错误：必须使用root用户运行此脚本！${plain}" && exit 1

# 检查系统环境
check_sys

# 显示主菜单
show_menu
