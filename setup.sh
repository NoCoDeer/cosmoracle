#!/bin/bash

# CosmoOracle - Скрипт установки для Ubuntu 22.04 + CyberPanel
# Этот скрипт настраивает окружение для запуска CosmoOracle

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Проверка прав суперпользователя
if [ "$EUID" -ne 0 ]; then
    error "Этот скрипт должен быть запущен с правами суперпользователя (sudo)."
fi

# Проверка наличия Ubuntu 22.04
if [ ! -f /etc/lsb-release ] || ! grep -q "Ubuntu 22.04" /etc/lsb-release; then
    warn "Этот скрипт оптимизирован для Ubuntu 22.04. Ваша система может быть несовместима."
    read -p "Продолжить? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Установка временной зоны
log "Настройка временной зоны..."
timedatectl set-timezone UTC

# Обновление системы
log "Обновление системных пакетов..."
apt-get update && apt-get upgrade -y

# Установка необходимых пакетов
log "Установка необходимых пакетов..."
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    nano \
    ufw \
    fail2ban \
    python3-pip \
    python3-dev \
    build-essential \
    libssl-dev \
    libffi-dev

# Установка Docker и Docker Compose
log "Установка Docker и Docker Compose..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    usermod -aG docker $SUDO_USER
    rm get-docker.sh
else
    log "Docker уже установлен."
fi

if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/download/v2.15.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
else
    log "Docker Compose уже установлен."
fi

# Настройка брандмауэра
log "Настройка брандмауэра..."
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 3000
ufw allow 3001
ufw allow 3002
ufw allow 3003
ufw --force enable

# Настройка Fail2Ban
log "Настройка Fail2Ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Создание директорий проекта
log "Создание директорий проекта..."
PROJECT_DIR="/var/www/cosmooracle"
mkdir -p $PROJECT_DIR
chown -R $SUDO_USER:$SUDO_USER $PROJECT_DIR

# Копирование файлов проекта
log "Копирование файлов проекта..."
cp -r ./* $PROJECT_DIR/
chown -R $SUDO_USER:$SUDO_USER $PROJECT_DIR

# Создание .env файла
log "Создание .env файла..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp $PROJECT_DIR/.env.example $PROJECT_DIR/.env
    # Генерация случайных ключей
    JWT_SECRET=$(openssl rand -hex 32)
    SESSION_SECRET=$(openssl rand -hex 32)
    
    # Замена значений в .env файле
    sed -i "s/your_jwt_secret_key/$JWT_SECRET/g" $PROJECT_DIR/.env
    sed -i "s/your_session_secret_key/$SESSION_SECRET/g" $PROJECT_DIR/.env
    sed -i "s/postgres_password/$(openssl rand -hex 8)/g" $PROJECT_DIR/.env
    
    log "Файл .env создан. Пожалуйста, отредактируйте его, чтобы настроить API ключи и другие параметры."
else
    warn "Файл .env уже существует. Пропускаем создание."
fi

# Создание директории для логов
log "Создание директории для логов..."
mkdir -p $PROJECT_DIR/logs
chown -R $SUDO_USER:$SUDO_USER $PROJECT_DIR/logs

# Создание директории для инициализации базы данных
log "Создание директории для инициализации базы данных..."
mkdir -p $PROJECT_DIR/init-scripts
chown -R $SUDO_USER:$SUDO_USER $PROJECT_DIR/init-scripts

# Запуск Docker Compose
log "Запуск Docker Compose..."
cd $PROJECT_DIR
docker-compose up -d

# Проверка статуса контейнеров
log "Проверка статуса контейнеров..."
docker-compose ps

# Настройка Nginx для CyberPanel (если установлен)
if command -v cyberpanel &> /dev/null; then
    log "Обнаружен CyberPanel. Настройка Nginx..."
    
    # Создание конфигурации для Nginx
    NGINX_CONF="/etc/nginx/conf.d/cosmooracle.conf"
    
    cat > $NGINX_CONF << EOF
server {
    listen 80;
    server_name cosmooracle.com www.cosmooracle.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
    
    location /admin {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
    
    # Перезапуск Nginx
    systemctl restart nginx
    
    log "Nginx настроен. Пожалуйста, настройте SSL через CyberPanel."
else
    warn "CyberPanel не обнаружен. Пропускаем настройку Nginx."
fi

# Настройка автоматического обновления контейнеров
log "Настройка автоматического обновления контейнеров..."
cat > /etc/cron.weekly/docker-cleanup << EOF
#!/bin/bash
docker system prune -af --volumes
cd $PROJECT_DIR && docker-compose pull && docker-compose up -d
EOF

chmod +x /etc/cron.weekly/docker-cleanup

# Настройка автоматического резервного копирования
log "Настройка автоматического резервного копирования..."
BACKUP_DIR="/var/backups/cosmooracle"
mkdir -p $BACKUP_DIR

cat > /etc/cron.daily/cosmooracle-backup << EOF
#!/bin/bash
DATE=\$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/cosmooracle-\$DATE.tar.gz"

# Остановка контейнеров
cd $PROJECT_DIR && docker-compose stop

# Создание резервной копии
tar -czf \$BACKUP_FILE -C $PROJECT_DIR .

# Запуск контейнеров
cd $PROJECT_DIR && docker-compose start

# Удаление старых резервных копий (старше 7 дней)
find $BACKUP_DIR -name "cosmooracle-*.tar.gz" -type f -mtime +7 -delete
EOF

chmod +x /etc/cron.daily/cosmooracle-backup

# Завершение установки
log "Установка CosmoOracle завершена!"
log "Веб-интерфейс доступен по адресу: http://localhost:3000"
log "API доступен по адресу: http://localhost:3001"
log "Админ-панель доступна по адресу: http://localhost:3002"
log "Для доступа через домен, настройте DNS и SSL через CyberPanel."
log "Для настройки параметров приложения отредактируйте файл: $PROJECT_DIR/.env"

# Вывод информации о следующих шагах
cat << EOF

${GREEN}=== Следующие шаги ===${NC}

1. Отредактируйте файл .env для настройки API ключей и других параметров:
   ${YELLOW}nano $PROJECT_DIR/.env${NC}

2. Перезапустите контейнеры после изменения .env:
   ${YELLOW}cd $PROJECT_DIR && docker-compose down && docker-compose up -d${NC}

3. Настройте домен и SSL через CyberPanel.

4. Проверьте логи контейнеров, если возникнут проблемы:
   ${YELLOW}cd $PROJECT_DIR && docker-compose logs -f${NC}

${GREEN}=== Полезные команды ===${NC}

- Просмотр статуса контейнеров:
  ${YELLOW}cd $PROJECT_DIR && docker-compose ps${NC}

- Перезапуск всех контейнеров:
  ${YELLOW}cd $PROJECT_DIR && docker-compose restart${NC}

- Просмотр логов конкретного сервиса:
  ${YELLOW}cd $PROJECT_DIR && docker-compose logs -f [service_name]${NC}
  Например: ${YELLOW}docker-compose logs -f backend${NC}

- Создание резервной копии вручную:
  ${YELLOW}/etc/cron.daily/cosmooracle-backup${NC}

EOF
