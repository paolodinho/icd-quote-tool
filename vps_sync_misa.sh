#!/bin/bash
# vps_sync_misa.sh — cron trên VPS: kéo khách hàng mới nhất từ MISA CRM -> mã hoá lại
# data-enc.json (dùng chung products-full.json đã có sẵn, do listener giá NCC Zalo
# /opt/icd-price-sync/parser/price_parser.py tự cập nhật liên tục) -> push GitHub Pages.
#
# Deploy: /opt/icd-price-sync/tool/vps_sync_misa.sh (cùng thư mục git clone repo
# paolodinho/icd-quote-tool đã dùng cho listener giá). Cron gợi ý (4 lần/ngày, giờ hành
# chính - đủ nhanh để phản ánh khách mới mà không gọi MISA API quá dày):
#   0 8,11,14,17 * * * /opt/icd-price-sync/tool/vps_sync_misa.sh >> /opt/icd-price-sync/tool/vps-sync-misa.log 2>&1
set -e
cd "$(dirname "$0")"
LOG_PREFIX="[$(date '+%F %T')]"

echo "$LOG_PREFIX [1/4] git pull (đồng bộ code mới nhất, không đụng data-private/ đã gitignore)..."
git pull --ff-only origin main

echo "$LOG_PREFIX [2/4] Kéo khách hàng từ Misa CRM..."
python3 pull_misa_customers.py

echo "$LOG_PREFIX [3/4] Mã hoá lại data-enc.json (SP + khách)..."
node build-enc.mjs

echo "$LOG_PREFIX [4/4] Đẩy lên GitHub Pages..."
git add -f data-enc.json
if git diff --cached --quiet; then
  echo "$LOG_PREFIX Không có thay đổi - bỏ qua push."
else
  git commit -q -m "auto: cap nhat khach hang tu Misa CRM ($(date +%F' '%H:%M))"
  git push -q origin main
  echo "$LOG_PREFIX Đã push. Link cập nhật sau ~1 phút."
fi
