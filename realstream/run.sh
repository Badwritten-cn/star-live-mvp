#!/bin/bash
# 一键启动：真实流服务 + ffmpeg 推流（两条命令合一，避免进程被回收）
# 用法：./run.sh [test|cam|screen|file <path>]
cd "$(dirname "$0")" || exit 1
NODE="${NODE_BIN:-$(command -v node || echo node)}"
MODE="${1:-test}"

# 先停掉可能残留的旧进程
pkill -f 'realstream/server.js' 2>/dev/null
pkill -f 'flvflags no_duration_filesize' 2>/dev/null
sleep 0.5

"$NODE" server.js > /tmp/rs_server.log 2>&1 &
sleep 1.5
./start.sh "$@" > /tmp/rs_ffmpeg.log 2>&1 &

echo "已启动："
echo "  播放页 http://127.0.0.1:8081/player.html"
echo "  MVP    http://127.0.0.1:8081/index.html"
echo "  状态   http://127.0.0.1:8081/api/status"
echo "推流模式: $MODE（日志 /tmp/rs_ffmpeg.log）"
echo "停止：pkill -f 'realstream/server.js'; pkill -f 'flvflags no_duration_filesize'"
wait
