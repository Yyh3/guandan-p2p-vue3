/**
 * WebSocketTransport —— 真机 / Capacitor WebView 用
 *
 * Host 端：起 ws server，监听 0.0.0.0:8848（生产）/ 0（测试自动分配端口）
 *   - 维护 (ws -> seat) 映射
 *   - 收到 joiner JOIN 后分配 seat（1-3），通过 bindLastSenderSeat 告知
 *   - send(msg)：msg.to != null 时定向给该 seat 的 ws；否则广播给所有 joiner
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
    this._wss = null         // host 端 WebSocketServer
    this._clients = new Map() // ws -> { seat: number }
    this._listeners = []
    this._outbox = []        // ready 之前的消息队列
    this._ready = false
    this._hostIp = null      // client 端连接的目标 IP
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
    this._wss = new WebSocketServer({ host: this._host, port: this._port, path: this._path })
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
    // 等待 server bind 完成
    await new Promise((resolve, reject) => {
      this._wss.once('listening', () => resolve(undefined))
      this._wss.once('error', (err) => reject(err))
    })
    this._ready = true
    this._flushOutbox()
  }

  async _openClient(hostIp, hostPort) {
    this._mode = 'client'
    this._hostIp = hostIp
    const port = hostPort != null ? hostPort : this._port
    const url = `ws://${hostIp}:${port}${this._path}`
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
    this._ready = false
    if (this._wss) {
      try { this._wss.close() } catch (e) { /* swallow */ }
      this._wss = null
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

  /** 测试 / 诊断：server 实际绑定的端口（ephemeral 时用） */
  getBoundPort() {
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