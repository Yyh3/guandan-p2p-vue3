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

  close() {
    if (this._channel) {
      try { this._channel.close() } catch (e) { /* ignore */ }
      this._channel = null
    }
    this._listeners = []
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