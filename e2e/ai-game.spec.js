/**
 * AI 单机对局 E2E 验证
 *
 * 覆盖:
 *   - 从 AIView 选择难度并开始对局
 *   - GameView 渲染手牌、桌面、HUD
 *   - 点击手牌列可选中/取消选中
 *
 * 说明:通过 window.__gd_skipDealAnim 跳过发牌动画,加速测试。
 */
import { test, expect } from '@playwright/test'

test.describe('AI 单机对局', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('进入对局后渲染手牌与 HUD', async ({ page }) => {
    // 跳过发牌动画,让手牌立即出现
    await page.context().addInitScript(() => {
      window.__gd_e2e = true
      window.__gd_skipDealAnim = true
    })

    await page.goto('/#/ai')
    await page.click('text=开始对局')
    await expect(page).toHaveURL(/#\/game/)

    // HUD 与桌面存在
    await expect(page.locator('.hud-topleft .level-card')).toBeVisible()
    await expect(page.locator('.table-stage')).toBeVisible()

    // 手牌列出现(27 张牌分组后若干列)
    const columns = page.locator('.hand-column')
    await expect(columns.first()).toBeVisible()

    // 手牌卡片出现
    const cards = page.locator('.hand-card')
    await expect(cards.first()).toBeVisible()
  })

  test('点击手牌列可切换选中状态', async ({ page }) => {
    await page.context().addInitScript(() => {
      window.__gd_e2e = true
      window.__gd_skipDealAnim = true
    })

    await page.goto('/#/ai')
    await page.click('text=开始对局')
    await expect(page).toHaveURL(/#\/game/)

    const firstColumn = page.locator('.hand-column').first()
    await expect(firstColumn).toBeVisible({ timeout: 10000 })

    // 初始未选中
    await expect(firstColumn).not.toHaveClass(/is-selected/)
    await firstColumn.click()
    // 点击后应添加 is-selected 类
    await expect(firstColumn).toHaveClass(/is-selected/)
    await firstColumn.click()
    await expect(firstColumn).not.toHaveClass(/is-selected/)
  })
})
