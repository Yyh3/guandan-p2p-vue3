import { test, expect } from '@playwright/test'

/**
 * E2E-003: 对局结束后结算遮罩出现，拦截其下方点击；
 * 且遮罩上只提供「返回首页」类操作，不含「下一局」。
 *
 * 这里通过 dev 环境暴露的 window.__gd_phase 直接把 phase 置为 finished，
 * 避免完整打完一局带来的不稳定性。
 */
test('finished game result overlay blocks clicks and offers only return actions', async ({ page }) => {
  // 进入 AI 单机对局可最快到达游戏页
  await page.goto('/#/ai')
  await page.getByRole('button', { name: /开始/ }).click()
  await expect(page).toHaveURL(/#\/game/)

  // 等待 dev hook 就绪，再强制进入结算态
  await page.waitForFunction(() => !!window.__gd_phase)
  await page.evaluate(() => {
    const g = window.__gd_game
    if (g && g.value && g.value.getState) {
      const st = g.value.getState()
      st.phase = 'finished'
      st.finishedOrder = [0, 2, 1, 3]
      st.isRestartAfterA = false
    }
    if (window.__gd_phase) {
      window.__gd_phase.value = 'finished'
    }
  })

  const overlay = page.locator('.result-mask')
  await expect(overlay).toBeVisible({ timeout: 10000 })

  // 遮罩应覆盖可点击区域，点击遮罩空白处不应误触底层手牌
  await overlay.click({ position: { x: 10, y: 10 } })
  await expect(overlay).toBeVisible()

  // 遮罩内不应出现「下一局」文案
  await expect(page.getByText('下一局')).toHaveCount(0)

  // 应出现「返回首页」类文案
  await expect(page.getByText(/返回首页/)).toBeVisible()
})
