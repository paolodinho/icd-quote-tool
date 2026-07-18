#!/bin/bash
# Đồng bộ tool báo giá lên link: kéo khách Misa CRM -> mã hóa lại data-enc.json -> push GitHub.
# Chạy SAU khi đã cập nhật giá SP từ Zalo (products-full.json). SSD phải mount.
set -e
DIR="/Volumes/Extreme SSD/CÔNG VIỆC CỦA TÔI/Projects/ICD/08-tools/quote-generator"
cd "$DIR"
[ -d "/Volumes/Extreme SSD" ] || { echo "SSD chưa mount - dừng."; exit 0; }

echo "[1/3] Kéo khách hàng từ Misa CRM..."
python3 pull_misa_customers.py

echo "[2/3] Mã hóa lại data-enc.json (SP + khách)..."
node build-enc.mjs

echo "[3/3] Đẩy lên GitHub Pages..."
git add -f data-enc.json
if git diff --cached --quiet; then
  echo "Không có thay đổi - bỏ qua push."
else
  git commit -q -m "auto-sync: cap nhat khach (Misa CRM) + gia SP ($(date +%F))"
  git push -q origin main
  echo "Đã push. Link cập nhật sau ~1 phút."
fi
