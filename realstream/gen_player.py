#!/usr/bin/env python3
"""
从 ../mvp/index.html 生成 player.html —— 真实流播放页。

原理：复用 MVP 的全部 UI 与业务逻辑（礼物/弹幕/榜单/连麦/PK/充值…），
只做三件事：
  1) 引入本地 flv.js
  2) 把直播间的占位画面替换为 <video>，接入 http://127.0.0.1:PORT/live.flv
  3) 顶部叠加"真实流状态徽标"（推流中/码率/推流时长）

MVP 改动后重跑本脚本即可同步：python3 gen_player.py
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'mvp', 'index.html')
DST = os.path.join(HERE, 'player.html')

INJECT_HEAD = '''  <script src="/vendor/flv.min.js"></script>
  <style>
    #streamBadge{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:7;
      background:rgba(0,0,0,.55);backdrop-filter:blur(8px);border-radius:14px;padding:5px 14px;
      font-size:11px;color:#fff;display:flex;align-items:center;gap:6px}
    #streamBadge i{width:7px;height:7px;border-radius:50%;background:#ff4d6d;animation:blink 1.2s infinite}
    #streamBadge i.off{background:#888;animation:none}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
    #realVideo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
  </style>
'''

INJECT_BODY = '''  <script>
  /* ===================== 真实流接管 ===================== */
  var REAL_PORT = (location.port || '8081');
  var REAL_URL  = '/live.flv';
  var __flvPlayer = null;

  function ensureBadge(){
    var host = document.querySelector('#room .video') || document.querySelector('#hostRoom .video');
    if(!host) return null;
    var b = document.getElementById('streamBadge');
    if(!b){
      b = document.createElement('div');
      b.id = 'streamBadge';
      b.innerHTML = '<i class="off"></i><span>连接中…</span>';
      host.appendChild(b);
      setInterval(pollStatus, 2000); pollStatus();
    }
    return b;
  }
  function pollStatus(){
    var b = document.getElementById('streamBadge'); if(!b) return;
    fetch('/api/status').then(function(r){return r.json();}).then(function(s){
      var dot = b.querySelector('i'), txt = b.querySelector('span');
      if(s.ingesting){
        dot.className = '';
        var mm = String(Math.floor(s.uptime/60)).padStart(2,'0'), ss = String(s.uptime%60).padStart(2,'0');
        txt.textContent = '● 真实流 ' + mm + ':' + ss + ' · ' + s.kbps + ' kbps · ' + s.viewers + ' 人在看';
      } else {
        dot.className = 'off';
        txt.textContent = '○ 等待推流…（先运行 ./start.sh test）';
      }
    }).catch(function(){});
  }
  function mountRealVideo(){
    var host = document.querySelector('#room .video') || document.querySelector('#hostRoom .video');
    if(!host) return;
    var cam = host.querySelector('.cam'); if(cam) cam.style.display = 'none';
    var v = document.getElementById('realVideo');
    if(!v){
      v = document.createElement('video');
      v.id = 'realVideo'; v.autoplay = true; v.muted = true; v.playsInline = true;
      host.insertBefore(v, host.firstChild);
    }
    ensureBadge();
    if(typeof flvjs === 'undefined' || !flvjs.isSupported()){ console.warn('flv.js 未加载'); return; }
    if(__flvPlayer) return;
    __flvPlayer = flvjs.createPlayer({ type:'flv', url: REAL_URL, isLive: true },
      { enableStashBuffer:false, stashInitialSize:128, autoCleanupSourceBuffer:true });
    __flvPlayer.attachMediaElement(v);
    __flvPlayer.load();
    __flvPlayer.play().catch(function(){});
  }
  function unmountRealVideo(){
    if(__flvPlayer){ try{ __flvPlayer.destroy(); }catch(e){} __flvPlayer = null; }
    var v = document.getElementById('realVideo'); if(v) v.remove();
    var cam = document.querySelector('#room .cam'); if(cam) cam.style.display = '';
  }
  document.addEventListener('DOMContentLoaded', function(){
    var _open = window.openRoom;
    window.openRoom = function(i){ _open(i); setTimeout(mountRealVideo, 60); };
    var _close = window.closeRoom;
    window.closeRoom = function(){ _close(); unmountRealVideo(); };
    var _start = window.doStartLive;
    window.doStartLive = function(){ _start(); setTimeout(function(){
      var host = document.querySelector('#hostRoom .video');
      if(host){ var cam=host.querySelector('.cam'); if(cam) cam.style.display='none'; }
      ensureBadge();
    }, 100); };
    // 首页：给"真实流演示"入口
    setTimeout(function(){ mountRealVideo(); }, 120);
  });
  </script>
'''

html = open(SRC, encoding='utf-8').read()
html = html.replace('</head>', INJECT_HEAD + '</head>', 1)
html = html.replace('</body>', INJECT_BODY + '</body>', 1)
open(DST, 'w', encoding='utf-8').write(html)
print('generated:', DST, len(html), 'bytes')
