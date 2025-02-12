#!/bin/sh

# 等待 MySQL 就绪
echo "Waiting for MySQL to be ready..."
while ! mysqladmin ping -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" --silent; do
    echo "MySQL is unavailable - sleeping"
    sleep 1
done

echo "MySQL is ready! Starting application..."
exec "$@"
