#!/bin/bash

# 定义颜色
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
plain='\033[0m'

# 检查root权限
[[ $EUID -ne 0 ]] && echo -e "${red}错误：必须使用root用户运行此脚本！${plain}" && exit 1

# 创建命令链接
create_command() {
    echo -e "${yellow}开始安装命令...${plain}"
    
    # 创建命令文件
    cat > /usr/local/bin/node-config << 'CMD'
#!/bin/bash
bash <(curl -sL https://raw.githubusercontent.com/DavisNova/nodeconfig/main/install.sh)
CMD

    # 添加执行权限
    chmod +x /usr/local/bin/node-config
    
    # 创建软链接
    ln -sf /usr/local/bin/node-config /usr/local/bin/node
    
    if [ $? -eq 0 ]; then
        echo -e "${green}安装成功！${plain}"
        echo -e "${green}现在你可以使用以下命令来启动工具箱：${plain}"
        echo -e "  1. ${yellow}node${plain}"
        echo -e "  2. ${yellow}node-config${plain}"
    else
        echo -e "${red}安装失败！${plain}"
    fi
}

# 检查是否已安装
check_installed() {
    if [ -f "/usr/local/bin/node-config" ]; then
        echo -e "${yellow}检测到已安装，正在更新...${plain}"
        rm -f /usr/local/bin/node-config
        rm -f /usr/local/bin/node
    fi
}

# 主流程
check_installed
create_command
