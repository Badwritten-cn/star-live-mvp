#!/usr/bin/env node
/**
 * 星遇 Live · 本地真实流转发服务
 *
 * 职责：
 *   1) POST /ingest     接收 ffmpeg 推送的 FLV 流（chunked）
 *   2) GET  /live.flv   向播放器（flv.js）广播实时流
 *   3) GET  /api/status 返回推流状态（是否在推、码率、观看数、字节数）
 *   4) 静态文件服务：本目录 + ../mvp（保证播放页与 MVP 同源，避免混合内容拦截）
 *
 * 新观众加入时会先收到缓存的 FLV 头部 + 首个关键帧，保证秒开。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8081);
const HERE = __dirname;
const ROOTS = [HERE, path.join(HERE, '..', 'mvp')];

const clients = new Set();       // 播放端响应对象
let ingesting = false;
let bytesTotal = 0;
let bytesWindow = 0;
let lastKbps = 0;
let preroll = Buffer.alloc(0);   // 缓存的头部数据（含首个关键帧）
const PREROLL_MAX = 512 * 1024;  // 最多缓存 512KB
let ingestStart = null;
let ingestReq = null;

setInterval(() => {
  lastKbps = Math.round((bytesWindow * 8) / 1024 / 2); // 2 秒窗口 → kbps
  bytesWindow = 0;
}, 2000);

function broadcast(chunk) {
  for (const res of clients) {
    try { res.write(chunk); } catch (e) { clients.delete(res); }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl',
};

function serveStatic(req, res, pathname) {
  for (const root of ROOTS) {
    const target = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!target.startsWith(root)) continue;              // 防目录穿越
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
      fs.createReadStream(target).pipe(res);
      return true;
    }
  }
  return false;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = u.pathname;

  // ---------- 状态查询 ----------
  if (p === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ingesting,
      kbps: lastKbps,
      viewers: clients.size,
      bytes: bytesTotal,
      uptime: ingestStart ? Math.floor((Date.now() - ingestStart) / 1000) : 0,
    }));
    return;
  }

  // ---------- ffmpeg 推流入口 ----------
  if (p === '/ingest' && req.method === 'POST') {
    console.log('[ingest] ffmpeg 已接入');
    ingesting = true;
    ingestStart = Date.now();
    ingestReq = req;
    req.on('data', (chunk) => {
      bytesTotal += chunk.length;
      bytesWindow += chunk.length;
      if (preroll.length < PREROLL_MAX) {
        preroll = Buffer.concat([preroll, chunk]);
      }
      broadcast(chunk);
    });
    req.on('end', () => {
      console.log('[ingest] ffmpeg 已断开');
      ingesting = false;
      ingestStart = null;
      ingestReq = null;
      preroll = Buffer.alloc(0);      // 换一路流时重置头部
    });
    req.on('error', () => { ingesting = false; });
    res.writeHead(200); res.end('ok');
    return;
  }

  // ---------- 播放端拉流 ----------
  if (p === '/live.flv') {
    res.writeHead(200, {
      'Content-Type': 'video/x-flv',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    if (preroll.length) { try { res.write(preroll); } catch (e) {} }   // 秒开：先给头部+首关键帧
    clients.add(res);
    console.log('[play] 新观众接入，当前 ' + clients.size + ' 人');
    req.on('close', () => {
      clients.delete(res);
      console.log('[play] 观众离开，当前 ' + clients.size + ' 人');
    });
    return;
  }

  // ---------- 静态资源 ----------
  let pathname = p === '/' ? '/player.html' : p;
  if (!serveStatic(req, res, pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + pathname);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('====================================================');
  console.log(' 星遇 Live 本地真实流服务已启动');
  console.log(' 播放页 : http://127.0.0.1:' + PORT + '/player.html');
  console.log(' MVP    : http://127.0.0.1:' + PORT + '/index.html');
  console.log(' 推流   : ./start.sh test | cam | screen | file <path>');
  console.log('====================================================');
});
