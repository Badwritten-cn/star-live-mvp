# 星遇 Live · 本地真实直播套件（FFmpeg + FLV）

不依赖任何云服务，在本机跑通 **真实推流 → 实时转播 → 浏览器观看** 的完整链路，
并把 MVP 直播间的全部 UI（弹幕/礼物/榜单/PK/连麦位）叠加在真实视频画面上。

## 快速开始

```bash
# 1. 启动服务 + 推流（一键）
./run.sh test          # 合成测试画面，无需摄像头权限，最稳

# 2. 打开浏览器
open http://127.0.0.1:8081/player.html   # 真实视频 + 直播间 UI
open http://127.0.0.1:8081/index.html    # 原版 MVP（假数据 demo）
```

## 推流模式

| 命令 | 内容 | 说明 |
|---|---|---|
| `./run.sh test` | 彩条测试画面 + 正弦音 | 无需任何权限，自带时间码可证明实时性 |
| `./run.sh cam` | 摄像头 + 麦克风 | 首次运行 macOS 会弹权限，需在系统设置允许 |
| `./run.sh screen` | 屏幕录制 | 可做"游戏直播/屏幕共享"演示 |
| `./run.sh file <路径>` | 循环推本地视频 | 最接近真实秀场效果 |

停止：`pkill -f 'realstream/server.js'; pkill -f 'flvflags no_duration_filesize'`

## 架构

```
ffmpeg ──(HTTP POST /ingest, FLV)──►  server.js ──(GET /live.flv)──► 浏览器 flv.js
 推流端                              转发服务                播放端（MVP UI 叠加）
                                     ├─ 新观众先收缓存的 FLV 头+首关键帧 → 秒开
                                     ├─ /api/status 推流状态（码率/时长/观看数）
                                     └─ 同源托管 ../mvp，避免混合内容拦截
```

| 项 | 数值 |
|---|---|
| 编码 | H.264 (libx264, veryfast/zerolatency) + AAC |
| 帧率/GOP | 25fps，GOP=25（1 秒一个关键帧） |
| 码率 | ~800-900 kbps（状态徽标实时显示） |
| 延时 | 约 1-3 秒（HTTP-FLV + 关闭 stash buffer） |
| 并发 | 单机演示级（连接直接广播，未做扇出优化） |

## 文件说明

| 文件 | 作用 |
|---|---|
| `server.js` | Node 转发服务：/ingest 收流、/live.flv 播放、/api/status、静态托管 |
| `start.sh` | ffmpeg 推流脚本（test/cam/screen/file 四种模式） |
| `run.sh` | 一键启动（服务 + 推流） |
| `gen_player.py` | 从 `../mvp/index.html` 生成 `player.html`（真实视频接管 + 状态徽标）；MVP 更新后重跑即可 |
| `player.html` | 生成产物：真实流播放页 |
| `vendor/flv.min.js` | 本地化 flv.js（离线可用） |

## 常见问题

- **`No such filter: 'drawtext'`**：homebrew 的 ffmpeg 默认不带 freetype，脚本已自动降级（不加时钟水印）。
- **摄像头打不开**：系统设置 → 隐私与安全性 → 相机，允许终端/iTerm。
- **画面卡住**：确认 ffmpeg 进程存活；重新 `./run.sh test` 即可（服务会重置秒开缓存）。

## 与生产环境的差距（对照《技术方案蓝图》）

本套件验证的是"推流-分发-播放"管道本身。生产化时替换对应环节即可：

| 本地套件 | 生产方案 |
|---|---|
| ffmpeg 推流 | 主播端 SDK（TRTC / MLVB）采集推流 |
| server.js 转发 | 腾讯云直播（边缘接收 + CDN 分发，万级并发） |
| flv.js 拉流 | 快直播/RTC SDK（秒开 + 弱网优化） |
| 无录制/转码 | 云端转码、录制、截图审核、混流 |
