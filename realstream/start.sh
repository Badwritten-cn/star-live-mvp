#!/bin/bash
# 星遇 Live · 本地推流脚本
# 用法：
#   ./start.sh test              合成测试画面（无需摄像头权限，最稳）
#   ./start.sh cam               电脑摄像头 + 麦克风
#   ./start.sh screen            屏幕录制（含鼠标）
#   ./start.sh file <视频路径>    循环推本地视频文件
#
# 依赖：ffmpeg（brew install ffmpeg）、已启动 ./server.js
set -u
MODE="${1:-test}"
PORT="${PORT:-8081}"
URL="http://127.0.0.1:${PORT}/ingest"

# 通用编码参数：低延时、固定 GOP 便于秒开
ENC="-c:v libx264 -preset veryfast -tune zerolatency -b:v 900k -maxrate 1200k -bufsize 1800k -pix_fmt yuv420p -g 25 -c:a aac -b:a 64k -ar 44100 -ac 1"
OUT="-f flv -flvflags no_duration_filesize -method POST ${URL}"

# 画面叠加实时时钟，证明"这是真的实时流"；若 ffmpeg 未编译 drawtext（缺 freetype）则自动降级
if ffmpeg -hide_banner -filters 2>/dev/null | grep -q ' drawtext '; then
  OVERLAY="drawtext=text='LIVE %{localtime\:%H\:%M\:%S}':fontcolor=white:fontsize=26:box=1:boxcolor=black@0.45:boxborderw=6:x=16:y=16"
else
  OVERLAY="null"   # 无文字滤镜：testsrc 自带时间码，同样可证明是实时流
fi

echo "推流模式: ${MODE}  →  ${URL}"

case "${MODE}" in
  test)
    # 合成画面：彩条 + 移动图案 + 时钟（不依赖任何硬件权限）
    exec ffmpeg -re -f lavfi -i "testsrc=size=640x360:rate=25" \
                -f lavfi -i "sine=frequency=440:sample_rate=44100" \
                -vf "${OVERLAY}" ${ENC} ${OUT}
    ;;
  cam)
    # 摄像头 + 麦克风（首次运行 macOS 会弹权限，需在系统设置允许终端/ffmpeg 访问相机）
    exec ffmpeg -f avfoundation -framerate 25 -video_size 640x360 -i "0:0" \
                -vf "${OVERLAY}" ${ENC} ${OUT}
    ;;
  screen)
    # 屏幕采集（设备 1 = Capture screen 0）
    exec ffmpeg -f avfoundation -capture_cursor 1 -framerate 20 -i "1:0" \
                -vf "scale=640:-2,${OVERLAY}" ${ENC} ${OUT}
    ;;
  file)
    SRC="${2:-}"
    if [ -z "${SRC}" ]; then echo "用法: ./start.sh file <视频路径>"; exit 1; fi
    exec ffmpeg -re -stream_loop -1 -i "${SRC}" \
                -vf "scale=640:-2,${OVERLAY}" ${ENC} ${OUT}
    ;;
  *)
    echo "未知模式: ${MODE}（可选 test | cam | screen | file）"; exit 1;;
esac
