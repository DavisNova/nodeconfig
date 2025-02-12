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
    
    # 安装必要的包
    apt install -y curl wget git apt-transport-https ca-certificates gnupg lsb-release

    # 安装 Docker
    echo -e "${yellow}安装 Docker...${plain}"
    curl -fsSL https://get.docker.com | sh

    # 启动 Docker
    systemctl start docker
    systemctl enable docker

    # 安装 Docker Compose
    echo -e "${yellow}安装 Docker Compose...${plain}"
    curl -L "https://github.com/docker/compose/releases/download/v2.24.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

    # 验证安装
    echo -e "${yellow}验证安装...${plain}"
    if ! command -v docker &> /dev/null; then
        echo -e "${red}Docker 安装失败${plain}"
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${red}Docker Compose 安装失败${plain}"
        exit 1
    fi

    docker --version
    docker-compose --version

    echo -e "${green}依赖安装完成！${plain}"
    sleep 2
}

# 部署服务
deploy_service() {
    echo -e "${yellow}开始部署服务...${plain}"
    
    # 停止并清理现有服务
    if [ -d "/opt/nodeconfig" ]; then
        echo -e "${yellow}停止现有服务...${plain}"
        cd /opt/nodeconfig && docker-compose down 2>/dev/null
        cd /
        echo -e "${yellow}清理旧文件...${plain}"
        rm -rf /opt/nodeconfig
    fi

    # 创建工作目录
    mkdir -p /opt/nodeconfig
    cd /opt/nodeconfig || exit

    # 克隆项目
    echo -e "${yellow}下载项目文件...${plain}"
    git clone -b control https://github.com/DavisNova/nodeconfig.git .

    # 启动服务
    echo -e "${yellow}启动服务...${plain}"
    docker-compose up -d --build

    # 检查服务状态
    if [ $? -eq 0 ]; then
        echo -e "${green}服务部署完成！${plain}"
        echo -e "${yellow}服务状态：${plain}"
        docker-compose ps
    else
        echo -e "${red}服务部署失败！${plain}"
        echo -e "${yellow}错误日志：${plain}"
        docker-compose logs
    fi

    # 等待服务启动
    echo -e "${yellow}等待服务启动...${plain}"
    sleep 5

    # 检查服务可用性
    if curl -s http://localhost:3000 > /dev/null; then
        echo -e "${green}服务已成功启动！${plain}"
        echo -e "${green}现在可以通过以下地址访问：${plain}"
        echo -e "${yellow}http://localhost:3000${plain}"
        echo -e "${yellow}http://服务器IP:3000${plain}"
    else
        echo -e "${red}服务启动可能存在问题，请检查日志${plain}"
    fi

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
                cd /opt/nodeconfig && docker-compose up -d
                echo -e "${green}服务已启动！${plain}"
                sleep 2
                continue
                ;;
            4)
                cd /opt/nodeconfig && docker-compose down
                echo -e "${green}服务已停止！${plain}"
                sleep 2
                continue
                ;;
            5)
                cd /opt/nodeconfig && docker-compose restart
                echo -e "${green}服务已重启！${plain}"
                sleep 2
                continue
                ;;
            6)
                cd /opt/nodeconfig && docker-compose ps
                echo && read -p "按回车继续..." 
                ;;
            7)
                cd /opt/nodeconfig && docker-compose logs
                echo && read -p "按回车继续..." 
                ;;
            8)
                cd /opt/nodeconfig && docker-compose down
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
