#!/bin/zsh
cd "${0:A:h}"
echo 'Desktop Rider: http://127.0.0.1:4173'
echo '保持此窗口打开即可持续预览；按 Control+C 停止。'
python3 tools/serve.py
