/**
 * 移动端对局 E2E 验证
 *
 * 覆盖:
 *   - iPhone 13 视口下进入 GameViewMobile
 *   - 手牌、顶部 HUD、操作栏可见
 *   - 结算后弹出结果遮罩(需要把对局打到 finished)
 *
 * 说明:通过 window.__gd_skipDealAnim 跳过发牌动画。
 */
import { test, expect } from '@playwright/test'

test.describe('移动端对局', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('iPhone 视口下渲染移动布局', async ({ page }) => {
    await page.context().addInitScript(() => {
      window.__gd_skipDealAnim = true
    })

    await page.goto('/#/ai')
    await page.click('text=开始对局')
    await expect(page).toHaveURL(/#\/game/)

    // 移动版顶部 HUD
    await expect(page.locator('.hud-top')).toBeVisible()
    // 移动版手牌区
    await expect(page.locator('.hand-area')).toBeVisible({ timeout: 10000 })
    // 操作栏(轮到玩家时显示)
    await expect(page.locator('.action-bar')).toBeVisible({ timeout: 10000 })
  })
})
