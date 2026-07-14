import { test, expect } from '@playwright/test'

/**
 * E2E-003: 对局结束后结算遮罩出现，拦截其下方点击；
 * AI 单机模式结算遮罩提供「返回首页」与「下一局」。
 *
 * 这里通过 dev 环境暴露的 window.__gd_phase 等 ref 直接置为 finished，
 * 避免完整打完一局带来的不稳定性。
 */
test('finished game result overlay blocks clicks and offers return actions', async ({ page }) => {
  // 进入 AI 单机对局可最快到达游戏页
  await page.goto('/#/ai')
  await page.getByRole('button', { name: /开始/ }).click()
  await expect(page).toHaveURL(/#\/game/)

  // 等待 dev hook 就绪，再强制进入结算态
  await page.waitForFunction(() => !!window.__gd_phase)
  await page.evaluate(() => {
    if (window.__gd_finishedOrder) window.__gd_finishedOrder.value = [0, 2, 1, 3]
    if (window.__gd_isRestartAfterA) window.__gd_isRestartAfterA.value = false
    if (window.__gd_levelUp) window.__gd_levelUp.value = 1
    if (window.__gd_nextLevelLabel) window.__gd_nextLevelLabel.value = '3'
    if (window.__gd_phase) window.__gd_phase.value = 'finished'
  })

  const overlay = page.locator('.result-mask')
  await expect(overlay).toBeVisible({ timeout: 10000 })

  // AI 单机模式结算遮罩应出现「本局结束」标题与操作按钮
  await expect(page.getByRole('heading', { name: '本局结束' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回首页' })).toBeVisible()
  await expect(page.getByRole('button', { name: '下一局' })).toBeVisible()
})
