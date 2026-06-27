/**
 * BroadcastChannelTransport —— 浏览器 / Node 测试版
 *
 * 用 BroadcastChannel 实现同 origin 多 tab 联机。
 * 适用于：
 *   - 浏览器开发模式（npm run dev）
 *   - Node 测试（通过 globalThis.BroadcastChannel 注入 Mock）
 *
 * 行为完全等同 v3.8 直接用 BroadcastChannel 的实现：
 *   - host/joiner 用同一个 channel name（`guandan-p2p-<roomId>`）
 *   - postMessage 不发给自己（BC spec）
 *   - 异步派发（microtask）
 *
 * 对外只暴露 Transport 接口，network.js 不直接接触 BroadcastChannel。
 */

const BC_NAME_PREFIX = 'guandan-p2p-'

export class BroadcastChannelTransport {
  constructor() {
    this._channel = null
    this._listeners = []
    this._roomId = ''
  }

  /**
   * 打开 transport。
   * @param {'self'|'client'} mode —— 仅决定 channel name 一致，host/joiner 都连同一个 BC
   * @param {string} [roomId]
   */
  async open(mode, roomId) {
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('BroadcastChannel 不支持')
    }
    this._roomId = roomId || 'default'
    this._channel = new BroadcastChannel(BC_NAME_PREFIX + this._roomId)
    this._channel.onmessage = (event) => {
      const msg = event.data
      if (msg == null) return
      this._emit(msg)
    }
    return undefined
  }

  /**
   * 发送一条消息到所有同 channel 的 peer。
   * BroadcastChannel spec：不发给自己。
   * @param {{type:string,payload:any,from?:number,to?:number,ts?:number}} msg
   * @returns {boolean}
   */
  send(msg) {
    if (!this._channel) return false
    try {
      this._channel.postMessage(msg)
      return true
    } catch (e) {
      return false
    }
  }

  /**
   * Host: 主动断开指定 seat (v2.1 P1 host 主动踢人)。
   *
   * BC 路径没有"定向踢某个 client"的原语(BC 是广播的,不分听众)。
   * 真做机制:
   *   1. broadcast PEER_LEAVE { kick: true } 给所有其它 tab
   *      - 被踢 joiner (seat===selfSeat && kick):network.js 触发 'self:kicked' 事件
   *        → UI 跳 /?force_disconnected=1
   *      - 其它 joiner:正常 peers.delete + peer:leave
   *
   * v2.1 owner steer:**不**通过 _DISCONNECT 立即清 host peers Map / lastHeartbeat —
   *   host 端 seat 释放走 6-8s 心跳路径。host UI 立即反映由调用方 (RoomView) 改 reactive peers Map。
   *
   * 返回 true / false (仅表示调用是否合法,BC 模式 channel 已开就 true)
   */
  forceDisconnectSeat(seat) {
    if (!this._channel) return false
    try {
      this._channel.postMessage({
        type: 'PEER_LEAVE',
        payload: { seat, kick: true, reason: 'kicked' },
        from: 0, // host 是 seat=0
        ts: Date.now(),
      })
    } catch (e) {
      // swallow
    }
    return true
  }

  close() {
    if (this._channel) {
      try { this._channel.close() } catch (e) { /* ignore */ }
      this._channel = null
    }
    this._listeners = []
  }

  /**
   * v0.4.8 N-1:BC transport 不需要真 rebuild(同 origin BroadcastChannel 共享)。
   *   joiner 升为 host 后,只需要 network.js 改 isHostFlag + selfSeat,
   *   BC channel 本身不变。返回即代表 OK。
   *
   * 保留此方法是为了 transport 接口对称 — network.js 不需要 if instanceof 判 transport 类型。
   *
   * @returns {Promise<void>}
   */
  async rebuildAsServer() {
    // BC 模式:同 channel 仍在,无需任何操作
    return undefined
  }

  /**
   * v0.4.8 N-1:BC transport 不需要真 rebuild。
   *
   * @returns {Promise<void>}
   */
  async rebuildAsClient() {
    // BC 模式:同 channel 仍在,无需任何操作
    return undefined
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
   * @returns {Array<{seat:number,info:any}>} —— BC 模式下不可知 peer 列表，
   * 仅返回自己（host=0 / joiner=-1）；peer 信息由 network.js 维护。
   */
  getPeers() {
    return []
  }

  /** 测试 / 诊断用：transport 是否已打开 */
  isReady() { return !!this._channel }

  _emit(msg) {
    for (const cb of this._listeners) {
      try { cb(msg) } catch (e) { /* 同 network.js emit 吞错策略 */ }
    }
  }
}