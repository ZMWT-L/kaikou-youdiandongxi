#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY_ARCHIVE="https://github.com/ZMWT-L/kaikou-youdiandongxi/archive/refs/heads/main.tar.gz"
SITE_ROOT="/var/www/kaikou-youdiandongxi"
NGINX_SITE="/etc/nginx/sites-available/kaikou-youdiandongxi"

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx curl ca-certificates tar

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

curl --fail --location --retry 3 --connect-timeout 15 +  "${REPOSITORY_ARCHIVE}" +  --output "${TEMP_DIR}/site.tar.gz"
tar -xzf "${TEMP_DIR}/site.tar.gz" -C "${TEMP_DIR}"

SOURCE_DIR="$(find "${TEMP_DIR}" -mindepth 1 -maxdepth 1 -type d -name 'kaikou-youdiandongxi-*' | head -n 1)"
if [[ -z "${SOURCE_DIR}" ]]; then
  echo "无法找到下载的网站源码。" >&2
  exit 1
fi

install -d -m 755 "${SITE_ROOT}"
install -m 644 "${SOURCE_DIR}/index.html" "${SITE_ROOT}/index.html"
install -m 644 "${SOURCE_DIR}/styles.css" "${SITE_ROOT}/styles.css"
install -m 644 "${SOURCE_DIR}/app.js" "${SITE_ROOT}/app.js"
install -m 644 "${SOURCE_DIR}/topics.js" "${SITE_ROOT}/topics.js"

cat > "${NGINX_SITE}" <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name zmwt.online www.zmwt.online _;

    root /var/www/kaikou-youdiandongxi;
    index index.html;

    charset utf-8;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        try_files $uri $uri/ =404;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location ~* \.(?:css|js)$ {
        expires 10m;
        add_header Cache-Control "public, max-age=600";
    }
}
NGINX

ln -sfn "${NGINX_SITE}" /etc/nginx/sites-enabled/kaikou-youdiandongxi
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  ufw allow 'Nginx Full'
fi

echo
echo "网站已部署完成。请先使用服务器公网 IP 访问测试，再修改域名 DNS。"
echo "网站目录：${SITE_ROOT}"

