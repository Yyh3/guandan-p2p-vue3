/**
 * 首页横屏 E2E
 */
import { test, expect } from '@playwright/test'

test.describe('首页横屏', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('横屏下首页 Logo 与按钮左右分栏', async ({ page }) => {
    await page.goto('/#/')
    await expect(page.locator('.logo')).toBeVisible()
    await expect(page.locator('.actions')).toBeVisible()

    const logoBox = await page.locator('.logo').boundingBox()
    const actionsBox = await page.locator('.actions').boundingBox()
    expect(logoBox && actionsBox).toBeTruthy()

    // 横屏布局下 actions 应在 logo 右侧
    expect(actionsBox.x).toBeGreaterThan(logoBox.x + logoBox.width / 2)

    // 主操作按钮可见且可操作
    await expect(page.locator('[data-testid="home-start-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="home-join-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="home-ai-btn"]')).toBeVisible()
  })
})
