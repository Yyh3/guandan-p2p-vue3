/**
 * WebSocketTransport —— 真机 / Capacitor WebView 用
 *
 * Host 端：起 ws server，监听 0.0.0.0:8848（生产）/ 0（测试自动分配端口）
 *   - 维护 (ws -> seat) 映射
 *   - 收到 joiner JOIN 后分配 seat（1-3），通过 bindLastSenderSeat 告知
 *   - send(msg)：msg.to != null 时定向给该 seat 的 ws；否则广播给所有 joiner
 *
 * ★ v2.4-p3 T4:joiner 端访问 host IP 时（电脑浏览器输入 http://IP:8848 加载 PWA）,
 *   在 ws server 同一端口叠加 http handler：
 *   - 'upgrade' 事件 → ws server.handleUpgrade（保持 ws 协议完全不变）
 *   - 'request' 事件 → 返回 dist/index.html + dist/assets/* （让 joiner 浏览器能加载 PWA）
 *   - 0.0.0.0:8848 监听行为不变
 *   - 既有 v2.0 P0 sendToClient / v2.1 心跳 6-8s / v2.1 P1 踢人 / v2.1 P3 迁移 / v2.2 joinRemoteRoom 全部不动
 *
 * Joiner 端：ws://host-ip:8848
 *   - 单连接，只连 host
 *   - send(msg) 直接发给 host，host 负责转发/广播
 *
 * 消息格式：{type, payload, from, to?, ts} —— 跟 BC 模式完全一致。
 *
 * 异步 open：
 *   - open('self') 等 ws server bind 完成才 resolve
 *   - open('client', hostIp) 等 ws open 完成才 resolve
 *   - send() 在 ready 之前会被缓存，open 成功后 flush（避免 startAsHost 同步发 JOIN 丢消息）
 */

const DEFAULT_PORT = 8848
const DEFAULT_HTTP_DOC_ROOT = 'dist'

/**
 * 找到 PWA 的 dist 根目录(相对于当前文件 / cwd)。
 * 优先 process.cwd()/dist 命中 index.html;否则试 import.meta.url 解析的 src/common/../dist。
 * 测试环境通常没有 dist,返回 null 让 http server 走 503 fallback 而不是 throw。
 *
 * @param {object} deps —— 注入的 fs/path/fileURLToPath/url,方便单测 mock
 * @returns {string|null} docRoot 绝对路径 / null
 */
function findDocRoot(deps) {
  const fs = deps?.fs
  const path = deps?.path
  const fileURLToPath = deps?.fileURLToPath
  if (!fs || !path) return null
  // 候选 1:cwd/dist
  try {
    if (typeof process !== 'undefined' && process.cwd) {
      const c = path.join(process.cwd(), 'dist')
      if (fs.existsSync(path.join(c, 'index.html'))) return c
    }
  } catch (e) { /* swallow */ }
  // 候选 2:从 import.meta.url 推断的 repo root /dist (file: /abs/path/src/common/network-transport-ws.js → /abs/path/dist)
  try {
    const metaUrl = (typeof import.meta !== 'undefined' && import.meta.url) || ''
    if (metaUrl && fileURLToPath) {
      const fp = fileURLToPath(metaUrl)
      // /abs/path/src/common/network-transport-ws.js → /abs/path/dist
      const idx = fp.lastIndexOf(`${path.sep}src${path.sep}`)
      if (idx >= 0) {
        const c = path.join(fp.slice(0, idx), 'dist')
        if (fs.existsSync(path.join(c, 'index.html'))) return c
      }
    }
  } catch (e) { /* swallow */ }
  return null
}

export class WebSocketTransport {
  /**
   * @param {object} [opts]
   * @param {number} [opts.port=8848] —— 0 = ephemeral（测试用）
   * @param {string} [opts.host='0.0.0.0'] —— server bind 地址
   * @param {string} [opts.path='/'] —— ws path
   */
  constructor(opts = {}) {
    this._port = opts.port != null ? opts.port : DEFAULT_PORT
    this._host = opts.host || '0.0.0.0'
    this._path = opts.path || '/'

    this._mode = null        // 'self' | 'client'
    this._ws = null          // client 端
    this._wss = null         // host 端 WebSocketServer (v2.4-p3 T4 起 noServer 模式)
    this._httpServer = null  // host 端 http server (v2.4-p3 T4 新增,PWA 入口)
    this._clients = new Map() // ws -> { seat: number }
    this._listeners = []
    this._outbox = []        // ready 之前的消息队列
    this._ready = false
    this._hostIp = null      // client 端连接的目标 IP
    // v3.x P1-12 修复(N-2):重连状态
    this._closedByUser = false   // 用户主动 close 时为 true,不再重连
    this._reconnecting = false   // 重连过程中为 true,避免重复触发
    this._reconnectAttempts = 0
    this._reconnectTimer = null
    this._url = null              // client 端 ws URL,重连用
    this._lastSenderWs = null // host 端最近一次发消息的 ws（用于 bindLastSenderSeat）
  }

  /**
   * @param {'self'|'client'} mode
   * @param {string} [hostIp] —— mode='client' 时必填
   * @param {number} [hostPort] —— mode='client' 时覆盖默认端口 (默认 8848)
   */
  async open(mode, hostIp, hostPort) {
    if (mode === 'self') {
      return await this._openServer()
    } else if (mode === 'client') {
      if (!hostIp) throw new Error('client mode 需要 hostIp')
      return await this._openClient(hostIp, hostPort)
    } else {
      throw new Error('未知 mode: ' + mode)
    }
  }

  async _openServer() {
    this._mode = 'self'
    // 动态 import 'ws'（避免在浏览器环境 / BC 测试时强制加载）
    const { WebSocketServer } = await import('ws')
    const httpModule = await import('http')
    const pathModule = await import('path')
    const fsModule = await import('fs')
    const urlModule = await import('url')
    const http = httpModule.default || httpModule
    const path = pathModule.default || pathModule
    const fs = fsModule.default || fsModule
    const fileURLToPath = urlModule.fileURLToPath || (urlModule.default && urlModule.default.fileURLToPath)

    // ★ v2.4-p3 T4:在 ws server 同一端口起一个 http server,让 joiner 浏览器访问
    //   http://IP:8848 能加载 PWA(dist/index.html + dist/assets/*)。
    //   0.0.0.0:8848 监听行为不变(显式 server.listen(host, port))。
    const docRoot = findDocRoot({ fs, path, fileURLToPath })
    const hasDist = !!(docRoot && fs.existsSync(path.join(docRoot, 'index.html')))

    this._httpServer = http.createServer((req, res) => {
      try {
        // ★ v3.x P1-13 修复:防御 .. 路径穿越(包括 URL 编码 %2e%2e)
        // 先 decode,再剥离 ..,最后用 path.resolve 归一化并校验仍在 docRoot 内
        let rawPath
        try { rawPath = decodeURIComponent((req.url || '/').split('?')[0]) }
        catch (e) { rawPath = (req.url || '/').split('?')[0] }  // 编码不合法时退回原始
        const safePath = rawPath.replace(/\.\.+/g, '')
        if (safePath === '/' || safePath === '') {
          // PWA 入口
          if (!hasDist) {
            res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('PWA dist/ not found; run `npm run build` first.\n')
            return
          }
          const html = fs.readFileSync(path.join(docRoot, 'index.html'))
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length })
          res.end(html)
          return
        }
        // /assets/* 静态资源
        if (safePath.startsWith('/assets/')) {
          if (!hasDist) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('not found')
            return
          }
          const fp = path.join(docRoot, safePath)
          // 防止 ../ 跳出 docRoot
          if (!fp.startsWith(docRoot)) {
            res.writeHead(403); res.end('forbidden'); return
          }
          if (!fs.existsSync(fp)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('not found')
            return
          }
          const buf = fs.readFileSync(fp)
          const ext = path.extname(fp).toLowerCase()
          const mime = ext === '.js' ? 'application/javascript'
            : ext === '.css' ? 'text/css'
            : ext === '.svg' ? 'image/svg+xml'
            : ext === '.png' ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
            : 'application/octet-stream'
          res.writeHead(200, { 'Content-Type': mime, 'Content-Length': buf.length })
          res.end(buf)
          return
        }
        // 其他路径 → SPA fallback 到 index.html (让前端 router 处理)
        if (hasDist) {
          const html = fs.readFileSync(path.join(docRoot, 'index.html'))
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length })
          res.end(html)
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('not found')
        }
      } catch (e) {
        try { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('server error') } catch (_) {}
      }
    })

    // ★ 用 noServer 模式:ws server 不自起 http server,我们显式管理。
    //   path 匹配交给 wss.shouldHandle(同 ws 库默认行为)。
    this._wss = new WebSocketServer({ noServer: true, path: this._path })
    this._wss.on('connection', (ws) => {
      ws._seat = -1
      ws._isAlive = true
      this._clients.set(ws, { seat: -1 })
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          this._lastSenderWs = ws
          this._emit(msg)
        } catch (e) {
          // 非法 JSON 忽略
        }
      })
      ws.on('pong', () => { ws._isAlive = true })
      ws.on('close', () => {
        const meta = this._clients.get(ws)
        this._clients.delete(ws)
        if (meta && meta.seat >= 0) {
          // 通知 network.js：peer 断开（沿用 PEER_LEAVE 协议）
          this._emit({ type: '_DISCONNECT', payload: { seat: meta.seat }, ts: Date.now() })
        }
      })
      ws.on('error', () => { /* swallow */ })
    })

    // ★ upgrade 事件 → 交给 wss.handleUpgrade(保持 ws 协议路径匹配完全一致)
    this._httpServer.on('upgrade', (req, socket, head) => {
      // 路径不匹配 ws.path → 忽略(浏览器 ws client 默认走 '/',path 默认为 '/',一般会命中)
      if (this._wss.shouldHandle(req)) {
        this._wss.handleUpgrade(req, socket, head, (ws) => {
          this._wss.emit('connection', ws, req)
        })
      } else {
        try { socket.destroy() } catch (e) { /* swallow */ }
      }
    })

    // 等待 server bind 完成(0.0.0.0:8848 行为不变)
    await new Promise((resolve, reject) => {
      this._httpServer.once('listening', () => resolve(undefined))
      this._httpServer.once('error', (err) => reject(err))
      this._httpServer.listen(this._port, this._host)
    })
    this._ready = true
    this._flushOutbox()
  }

  async _openClient(hostIp, hostPort) {
    this._mode = 'client'
    this._hostIp = hostIp
    const port = hostPort != null ? hostPort : this._port
    this._url = `ws://${hostIp}:${port}${this._path}`
    const url = this._url
    // ★ v2.2 task B:跨设备联机 — 浏览器环境用原生 WebSocket 全局,Node 测试环境用 'ws'
    //   浏览器 Vite bundle 里没有 'ws' npm 包(只在 devDependencies 里),所以 import('ws') 会失败。
    //   优先用 globalThis.WebSocket (浏览器原生);只在它不存在时才尝试 'ws' (Node 测试环境)。
    let WebSocketImpl = null
    if (typeof globalThis.WebSocket !== 'undefined') {
      WebSocketImpl = globalThis.WebSocket
    } else {
      try {
        const wsModule = await import('ws')
        WebSocketImpl = wsModule.default || wsModule.WebSocket
      } catch (e) {
        throw new Error('WebSocket 不支持(浏览器需要原生 WebSocket,Node 测试环境需要 npm "ws"): ' + (e?.message || e))
      }
    }
    this._ws = new WebSocketImpl(url)
    // ★ 兼容 Node 'ws' 的 EventEmitter API + 浏览器原生 WebSocket API (use addEventListener)
    //   两条路径用同一段代码:用 addEventListener 当原生,on() 当 'ws'。
    const isNativeBrowserWs = (typeof globalThis.WebSocket !== 'undefined') && (this._ws instanceof globalThis.WebSocket)
    if (isNativeBrowserWs) {
      this._ws.addEventListener('open', () => {
        this._ready = true
        this._flushOutbox()
      })
      this._ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
          this._emit(msg)
        } catch (e) {
          // 非法 JSON 忽略
        }
      })
      this._ws.addEventListener('close', () => {
        const wasReady = this._ready
        this._ready = false
        if (wasReady) {
          this._emit({ type: '_DISCONNECT', payload: { seat: -1 }, ts: Date.now() })
        }
        // v3.x P1-12 修复(N-2):浏览器 ws client 断线后尝试重连(指数退避,最多 3 次)
        if (!this._closedByUser && !this._reconnecting) {
          this._scheduleReconnect()
        }
      })
      this._ws.addEventListener('error', () => { /* swallow; close handler will fire */ })
      // 等待 ws open
      await new Promise((resolve, reject) => {
        this._ws.addEventListener('open', () => resolve(undefined), { once: true })
        this._ws.addEventListener('error', () => reject(new Error('WebSocket connect failed')), { once: true })
      })
    } else {
      // Node 'ws' EventEmitter 风格
      this._ws.on('open', () => {
        this._ready = true
        this._flushOutbox()
      })
      this._ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          this._emit(msg)
        } catch (e) {
          // 非法 JSON 忽略
        }
      })
      this._ws.on('close', () => {
        const wasReady = this._ready
        this._ready = false
        if (wasReady) {
          this._emit({ type: '_DISCONNECT', payload: { seat: -1 }, ts: Date.now() })
        }
        // v3.x P1-12 修复(N-2):Node ws 客户端断线后尝试重连
        if (!this._closedByUser && !this._reconnecting) {
          this._scheduleReconnect()
        }
      })
      this._ws.on('error', () => { /* swallow; close handler will fire */ })
      // 等待 ws open
      await new Promise((resolve, reject) => {
        this._ws.once('open', () => resolve(undefined))
        this._ws.once('error', (err) => reject(err))
      })
    }
  }

  send(msg) {
    const data = JSON.stringify(msg)
    if (!this._ready) {
      this._outbox.push(data)
      return true
    }
    if (this._mode === 'self') {
      this._sendHost(data, msg)
    } else if (this._mode === 'client') {
      this._sendClient(data)
    }
    return true
  }

  _sendHost(data, msg) {
    if (msg.to != null) {
      // 定向：找到 seat === msg.to 的 ws
      for (const ws of this._clients.keys()) {
        if (ws._seat === msg.to && ws.readyState === 1 /* OPEN */) {
          try { ws.send(data) } catch (e) { /* swallow */ }
          return
        }
      }
    } else {
      // 广播：所有 OPEN 的 ws
      for (const ws of this._clients.keys()) {
        if (ws.readyState === 1) {
          try { ws.send(data) } catch (e) { /* swallow */ }
        }
      }
    }
  }

  _sendClient(data) {
    if (this._ws && this._ws.readyState === 1 /* OPEN */) {
      try { this._ws.send(data) } catch (e) { /* swallow */ }
    }
  }

  _flushOutbox() {
    if (!this._ready) return
    const pending = this._outbox
    this._outbox = []
    for (const data of pending) {
      if (this._mode === 'self') {
        // 异步 flush 时没有完整 msg 对象了，统一广播
        for (const ws of this._clients.keys()) {
          if (ws.readyState === 1) {
            try { ws.send(data) } catch (e) { /* swallow */ }
          }
        }
      } else if (this._mode === 'client') {
        if (this._ws && this._ws.readyState === 1) {
          try { this._ws.send(data) } catch (e) { /* swallow */ }
        }
      }
    }
  }

  /**
   * Host：把最近一次收到消息的 ws 绑定到指定 seat。
   * network.js 在处理完 JOIN 后调用，让后续 send(msg.to=seat) 能正确路由。
   */
  bindLastSenderSeat(seat) {
    if (this._mode !== 'self') return
    if (!this._lastSenderWs) return
    this._lastSenderWs._seat = seat
    const meta = this._clients.get(this._lastSenderWs)
    if (meta) meta.seat = seat
  }

  /**
   * Host:主动断开指定 seat (v2.1 P1 host 主动踢人)。
   *
   * 真做机制 (2 步):
   *   1. 找到 seat 绑定的 ws,立即从 _clients map 删除(防止后续 sendToClient 路由到死连接)
   *   2. ws.close() —— server 端关闭连接,joiner 端 ws.on('close') 会触发 _DISCONNECT
   *
   * v2.1 owner steer 修正:**不**通过 _DISCONNECT 立即清 host peers Map / lastHeartbeat / aiPlayers。
   *   - 保留 v2.1 心跳 6-8s 路径,host 端 peers 释放由 _tickHeartbeatChecker 在 6s 后处理
   *   - 立即 UI 反馈由调用方 (RoomView) 同步改自己的 reactive peers Map (UI 状态,跟 network.js 内部 Map 隔离)
   *   - 其他 joiner 端:从 host 的 PEER_LEAVE 广播(或自己 ws.on('close'))收到通知
   *
   * 广播 PEER_LEAVE { kick: true } 走 WS send 路径(此处用 transport.send 把 PEER_LEAVE 注入网络),
   *   实际上 v2.1 走 ws.on('close') 触发 clientDisconnected → _tickHeartbeatChecker → broadcast PEER_LEAVE,
   *   joiner 端 6-8s 后收到 PEER_LEAVE。为了让 joiner 立即被踢,在 ws.close() 同时我们也 broadcast PEER_LEAVE { kick: true }
   *
   * 返回 true = 找到并踢了;false = 没找到。
   */
  forceDisconnectSeat(seat) {
    if (this._mode !== 'self') return false
    let target = null
    for (const ws of this._clients.keys()) {
      if (ws._seat === seat) { target = ws; break }
    }
    if (!target) return false
    // 1) 立即从 _clients 移除 — 防止后续 sendToClient 路由到死连接
    this._clients.delete(target)
    // 2) broadcast PEER_LEAVE { kick: true } 给其它 joiner,让被踢的人立即跳 /?force_disconnected=1
    //    (kick=true 标识"主动踢"vs "网络掉线")
    const data = JSON.stringify({
      type: 'PEER_LEAVE',
      payload: { seat, kick: true, reason: 'kicked' },
      from: 0,
      ts: Date.now(),
    })
    for (const ws of this._clients.keys()) {
      if (ws.readyState === 1) {
        try { ws.send(data) } catch (e) { /* swallow */ }
      }
    }
    // 3) 关连接(joiner 端 ws.on('close') 触发 _DISCONNECT — 仅 transport 内部信号,不动 host peers)
    try { target.close() } catch (e) { /* swallow */ }
    return true
  }

  close() {
    // v3.x P1-12 修复(N-2):标记用户主动 close,停止重连
    this._closedByUser = true
    this._ready = false
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    if (this._wss) {
      try { this._wss.close() } catch (e) { /* swallow */ }
      this._wss = null
    }
    // ★ v2.4-p3 T4:同步关 v2.4-p3 新增的 http server,释放 8848 端口
    // v3.x P2-28 修复(N-28):关 server 时先 close 所有活跃 ws 连接,再 close httpServer
    if (this._httpServer) {
      for (const ws of this._clients.keys()) {
        try { ws.close() } catch (e) { /* swallow */ }
      }
      try { this._httpServer.close() } catch (e) { /* swallow */ }
      this._httpServer = null
    }
    if (this._ws) {
      try { this._ws.close() } catch (e) { /* swallow */ }
      this._ws = null
    }
    this._clients.clear()
    this._outbox = []
    this._listeners = []
    this._mode = null
    this._lastSenderWs = null
  }

  // v3.x P1-12 修复(N-2):浏览器/Node ws client 断线后自动重连
  //   指数退避:1s → 2s → 4s,最多 3 次,失败后放弃让上层处理
  _scheduleReconnect() {
    if (this._closedByUser || this._reconnecting) return
    if (this._reconnectAttempts >= 3) {
      this._emit({ type: 'reconnect:failed', payload: { attempts: this._reconnectAttempts }, ts: Date.now() })
      return
    }
    this._reconnecting = true
    this._reconnectAttempts++
    const delay = 1000 * Math.pow(2, this._reconnectAttempts - 1)  // 1s, 2s, 4s
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null
      this._reconnecting = false
      if (this._closedByUser || !this._url) return
      try {
        // 重新走 _openClient 路径,会触发 _emit('connect') 等
        // 注意:_openClient 内部会用 this._hostIp/this._port/this._path
        //   URL 包含 path,所以直接传 URL 不可行 — 改为调内部重新打开逻辑
        await this._openClient(this._hostIp, this._port)
        this._reconnectAttempts = 0  // 成功后重置
        this._emit({ type: 'reconnect:ok', payload: {}, ts: Date.now() })
      } catch (e) {
        // 重连失败,继续 schedule 下次
        this._scheduleReconnect()
      }
    }, delay)
  }

  onMessage(cb) {
    if (typeof cb !== 'function') return
    this._listeners.push(cb)
  }

  offMessage(cb) {
    const i = this._listeners.indexOf(cb)
    if (i >= 0) this._listeners.splice(i, 1)
  }

  /**
   * @returns {Array<{seat:number,info:any}>}
   */
  getPeers() {
    if (this._mode !== 'self') return []
    const out = []
    for (const [ws] of this._clients.entries()) {
      out.push({ seat: ws._seat, info: null })
    }
    return out
  }

  /** 测试 / 诊断：server 实际绑定的端口（ephemeral 时用）
   *  v2.4-p3 T4:bind 端口的现在是我们显式起的 http server(_wss 用 noServer 模式不自 listen)
   */
  getBoundPort() {
    if (this._httpServer && typeof this._httpServer.address === 'function') {
      const addr = this._httpServer.address()
      return typeof addr === 'object' ? addr.port : null
    }
    if (this._wss && this._wss.address) {
      const addr = this._wss.address()
      return typeof addr === 'object' ? addr.port : null
    }
    return null
  }

  isReady() { return this._ready }

  _emit(msg) {
    for (const cb of this._listeners) {
      try { cb(msg) } catch (e) { /* swallow */ }
    }
  }
}

// ★ v2.4-p3 T4 导出 findDocRoot 方便单测
export { findDocRoot }