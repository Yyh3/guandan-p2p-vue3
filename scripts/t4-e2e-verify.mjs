/**
 * v2.4-p3 T4 — Playwright 模拟 joiner 端访问 host IP:8848
 *
 * 场景:host 起 WebSocketTransport (port=0 → ephemeral),joiner 浏览器访问
 *   http://127.0.0.1:PORT/  → 验证拿到 PWA HTML 不是 404 / 426
 *
 * 约束:不依赖 Vite / Vue build,只测 PWA HTML 内容。
 *      Playwright 通过 mcp playwright (browser_navigate) 调用。
 *
 * 退出码:0 = pass,1 = fail
 */

import http from 'http'
import fs from 'fs'
import path from 'path'

// 起 host
const { WebSocketTransport } = await import('../src/common/network-transport-ws.js?t=t4-e2e-' + Date.now())
const t = new WebSocketTransport({ port: 0, host: '127.0.0.1' })
await t.open('self')
const port = t.getBoundPort()
const url = `http://127.0.0.1:${port}/`
console.log(`[t4-e2e] host listening on ${url}`)

// 拿 HTML 内容
const res = await new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/' }, resolve)
  req.on('error', reject)
  req.end()
})
let body = ''
res.on('data', (c) => { body += c.toString() })
await new Promise((r) => res.on('end', r))

const ok = res.statusCode === 200
  && /id="app"/.test(body)
  && /\/assets\//.test(body)
  && /掼蛋/.test(body)
console.log(`[t4-e2e] status=${res.statusCode} hasAppDiv=${/id="app"/.test(body)} hasAssetsRef=${/\/assets\//.test(body)}`)
console.log(`[t4-e2e] HTML head: ${body.split('\n').slice(0, 5).join(' | ')}`)

// 把 URL 写到文件,告诉主 agent 怎么跑 Playwright
const outFile = '/tmp/t4-e2e-host-url.txt'
fs.writeFileSync(outFile, `${url}\n`)
console.log(`[t4-e2e] URL written to ${outFile}`)

t.close()
process.exit(ok ? 0 : 1)
