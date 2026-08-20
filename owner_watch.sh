#!/bin/bash
# Wrapper cron cho owner_watch.py — deploy ở /opt/icd-quote-generator/ trên VPS,
# dùng chung venv của /opt/icd-chatbot (đã có sẵn httpx).
cd "$(dirname "$0")"
/opt/icd-chatbot/venv/bin/python3 owner_watch.py >> owner-watch-cron.log 2>&1
