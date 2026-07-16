/**
 * 移动端横屏对局 E2E 验证
 *
 * 覆盖:
 *   - iPhone 13 横屏视口(844×390)进入 GameViewMobile
 *   - .is-landscape class 生效
 *   - 手牌区、顶部 HUD、操作栏可见且不重叠
 */
import { test, expect } from '@playwright/test'

test.describe('移动端横屏对局', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('横屏视口下渲染移动横屏布局', async ({ page }) => {
    await page.context().addInitScript(() => {
      window.__gd_e2e = true
      window.__gd_skipDealAnim = true
    })

    await page.goto('/#/ai')
    await page.click('text=开始对局')
    await expect(page).toHaveURL(/#\/game/)

    // 应路由到移动版并加上 is-landscape
    const pageRoot = page.locator('.page')
    await expect(pageRoot).toHaveClass(/is-landscape/)

    // 关键区域可见
    await expect(page.locator('.hud-top')).toBeVisible()
    await expect(page.locator('.hand-area')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.action-bar')).toBeVisible({ timeout: 10000 })

    // 操作栏与手牌区不应在相同垂直位置严重重叠(操作栏底部为 0,手牌区底部应在其上方)
    const handBox = await page.locator('.hand-area').boundingBox()
    const actionBox = await page.locator('.action-bar').boundingBox()
    expect(handBox && actionBox).toBeTruthy()
    expect(handBox.y + handBox.height).toBeLessThanOrEqual(actionBox.y + 4)
  })
})
