import { test, expect } from '@playwright/test'
import net, { _setTransportFactory, _resetTransportFactory } from '../src/common/network.js'
import { WebSocketTransport } from '../src/common/network-transport-ws.js'

/**
 * E2E-004: Node WS host + 浏览器 joiner，验证真机跨设备路径。
 *
 * 与 room-ready-start.spec.js 的 BroadcastChannel 同浏览器测试不同，
 * 这里在 Playwright(Node 侧)起一个真正的 WebSocketTransport host，
 * 浏览器页通过 ?host=127.0.0.1:PORT 以 WebSocket client 加入，
 * 确保网络层 WS 路径在 CI 中有回归覆盖。
 */
test('Node WS host accepts browser joiner over WebSocket', async ({ page }) => {
  _setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  const roomNo = 'e2ews' + Math.floor(Math.random() * 1_000_000)
  net.setRoomId(roomNo)
  net.startAsHost({ nickname: 'NodeHost', avatar: '👑' })

  try {
    // 等待 WS server 绑定到临时端口并拿到对外地址
    await expect.poll(() => net.getSelfHostAddress(), {
      timeout: 10000,
      message: '等待 Node host 启动完成',
    }).not.toBeNull()
    const hostAddress = net.getSelfHostAddress()

    // 浏览器 joiner 通过 host 地址加入房间
    await page.goto(
      `/#/room?role=joiner&roomNo=${roomNo}&host=${encodeURIComponent(hostAddress)}&nick=BrowserJ&avatar=🙂`
    )
    await expect(page).toHaveURL(/#\/room/)

    // 浏览器侧网络状态应变为 OK
    await expect(page.locator('.net-status')).toHaveClass(/net-ok/, { timeout: 15000 })

    // host 侧应看到 browser joiner 加入(0 host + 1 joiner = 2 peers)
    await expect.poll(() => net.getPeers().size, {
      timeout: 10000,
      message: '等待 host 感知 joiner',
    }).toBe(2)
  } finally {
    net.close()
    _resetTransportFactory()
  }
})
