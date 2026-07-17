/**
 * Bridge to the native Android WebSocket server plugin (WsServer).
 *
 * On a Capacitor Android WebView, the JS layer cannot directly bind a TCP
 * socket for the host (it would conflict with the WebView's network stack
 * and we want a real background-thread server). The native side implements
 * a Java-WebSocket server and exposes a Capacitor plugin; this module is
 * the typed JS bridge.
 *
 * When running in a browser (npm run dev / vitest), WsServer is unavailable
 * and any caller should fall back to the browser / 'ws' transport path.
 */
import { registerPlugin } from '@capacitor/core'

/**
 * @typedef {Object} WsServerPlugin
 * @property {(opts?: {port?: number}) => Promise<{ok: boolean, port: number, ip: string}>} startServer
 * @property {() => Promise<{ok: boolean}>} stopServer
 * @property {() => Promise<{ip: string}>} getLocalIp
 * @property {(opts: {seat: number, message: string}) => Promise<{ok: boolean, sent: boolean}>} sendToClient
 * @property {(opts: {message: string}) => Promise<{ok: boolean, sent: number}>} broadcast
 * @property {(opts: {seat: number}) => Promise<{ok: boolean}>} closeClient  // v2.1 P1:host 主动踢人
 * @property {(event: 'clientConnected' | 'clientDisconnected' | 'message', handler: Function) => Promise<any>} addListener
 * @property {(event: string, handler: Function) => Promise<any>} removeListener
 */

/** @type {WsServerPlugin} */
const WsServer = registerPlugin('WsServer', {
  web: () => {
    // 测试钩子:如果 globalThis.__wsServerTestLog 存在,所有调用都 push 进去(用于 Node 单测)
    const log = (typeof globalThis !== 'undefined' && globalThis.__wsServerTestLog) || null
    const make = (m, ret) => async (opts) => {
      if (log) log.push({ m, opts })
      return ret
    }
    return {
      // Browser fallback — we never run the host side in browser; if a caller
      // accidentally invokes WsServer.startServer() in a dev environment, throw.
      startServer: async () => { throw new Error('WsServer.startServer is Android-only') },
      stopServer: async (opts) => { if (log) log.push({ m: 'stopServer', opts }); return { ok: true } },
      getLocalIp: async () => ({ ip: '127.0.0.1' }),
      sendToClient: make('sendToClient', { ok: false, sent: false }),
      sendToConnection: make('sendToConnection', { ok: false, sent: false }),
      broadcast: make('broadcast', { ok: true, sent: 0 }),
      bindSeat: make('bindSeat', { ok: true, bound: true }),
      closeClient: make('closeClient', { ok: true }),  // v2.1 P1:测试环境默认 no-op-success
      addListener: async () => ({ remove: async () => {} }),
    }
  },
})

/**
 * Detect if we're running in a Capacitor (native) WebView where WsServer is
 * actually backed by the Java plugin. False in dev browser / Node tests.
 */
export function isNativeCapacitor() {
  if (typeof window === 'undefined') return false
  // Capacitor 8 puts the bridge on window.Capacitor; we also check
  // Capacitor.isNativePlatform() if exposed.
  if (!window.Capacitor) return false
  try {
    if (typeof window.Capacitor.isNativePlatform === 'function') {
      return window.Capacitor.isNativePlatform()
    }
  } catch (e) { /* swallow */ }
  // Fallback heuristic: if WsServer plugin is exposed on the bridge, treat as native.
  return !!(window.Capacitor.Plugins && window.Capacitor.Plugins.WsServer)
}

export default WsServer
