/**
 * v2.4-p3 T4 — long-running host for Playwright 模拟
 *
 * 起 WebSocketTransport (port=8848),serve dist/,等用户 ctrl-C。
 * Playwright 通过 mcp playwright (browser_navigate) 访问 http://127.0.0.1:8848/
 */
const { WebSocketTransport } = await import('../src/common/network-transport-ws.js?t=t4-host-' + Date.now())
const t = new WebSocketTransport({ port: 8848, host: '127.0.0.1' })
await t.open('self')
const port = t.getBoundPort()
console.log(`[t4-host-daemon] listening on http://127.0.0.1:${port}/ (pid=${process.pid})`)
console.log(`[t4-host-daemon] WS path: ws://127.0.0.1:${port}/`)
console.log(`[t4-host-daemon] press ctrl-C to stop`)
// heartbeat for joiner
t.onMessage((m) => {
  if (m.type === 'JOIN') {
    t.send({ type: 'SYNC', payload: { peers: [[0, { nickname: 'host', avatar: 'H' }], [1, m.payload]] }, to: 1 })
  }
})

process.on('SIGINT', () => { t.close(); process.exit(0) })
process.on('SIGTERM', () => { t.close(); process.exit(0) })
// keep alive
setInterval(() => {}, 1 << 30)
