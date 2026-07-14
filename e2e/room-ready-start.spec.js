import { test, expect } from '@playwright/test'

/**
 * E2E-001: 房主开房 → 3 位加入者通过房间号加入 → 全部准备 → 房主开始游戏。
 *
 * Phase 3 后房间需要满 4 人且非房主全部准备，房主才能开始；
 * Phase 7 后邀请弹窗在 host IP 可获取时显示二维码，不再显示 .invite-value，
 * 因此改从房间头部直接读取房间号。
 */
test('host creates room, three joiners ready and host starts game', async ({ page, context }) => {
  // Phase 2:跳过发牌动画，让手牌立即渲染，避免 E2E 等待动画
  await context.addInitScript(() => {
    window.__gd_e2e = true
    window.__gd_skipDealAnim = true
  })

  // 房主页
  const hostPage = page
  await hostPage.goto('/#/')
  await hostPage.getByTestId('home-start-btn').click()
  await expect(hostPage).toHaveURL(/#\/room/)

  // 从顶部标题读取房间号
  const roomNo = await hostPage.locator('.header-roomno').innerText()
  expect(roomNo).toMatch(/^\d{4,6}$/)

  // 加入者页（同一浏览器 context 共享 BroadcastChannel）
  const joiners = []
  for (let i = 0; i < 3; i++) {
    const jp = await context.newPage()
    await jp.goto(`/#/room?role=joiner&roomNo=${roomNo}`)
    await expect(jp).toHaveURL(/#\/room/)
    // 等待网络就绪，避免 READY 消息发在 transport open 之前
    await expect(jp.locator('.net-status')).toHaveClass(/net-ok/, { timeout: 10000 })
    joiners.push(jp)
  }

  // 房主视角应看到满 4 人
  await expect(hostPage.locator('.info-count')).toHaveText(/4\/4 人/, { timeout: 10000 })

  // 所有加入者点击「准备」
  for (const jp of joiners) {
    await jp.getByTestId('btn-start').click()
    await expect(jp.locator('[data-testid="btn-start"]')).toContainText('取消准备')
  }

  // 房主视角开始按钮变为可用；点击后开始切牌覆盖层，覆盖层会自动消失并进入对局页
  await expect(hostPage.getByTestId('btn-start')).toBeEnabled({ timeout: 10000 })
  await hostPage.getByTestId('btn-start').click({ force: true })

  // 房主与所有加入者都应进入对局页
  await expect(hostPage).toHaveURL(/#\/game/)
  for (const jp of joiners) {
    await expect(jp).toHaveURL(/#\/game/)
  }

  // Phase 2:host 持有完整手牌，joiner 只收到自己的手牌；验证每页都渲染了自己的手牌列
  await expect(hostPage.locator('.hand-column').first()).toBeVisible({ timeout: 10000 })
  for (const jp of joiners) {
    await expect(jp.locator('.hand-column').first()).toBeVisible({ timeout: 10000 })
  }
})
