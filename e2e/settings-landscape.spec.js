/**
 * 设置页横屏/宽屏 E2E
 */
import { test, expect } from '@playwright/test'

test.describe('设置页宽屏双栏', () => {
  test.use({ viewport: { width: 1024, height: 600 } })

  test('宽屏下设置分组呈双栏布局', async ({ page }) => {
    await page.goto('/#/settings')
    await expect(page.locator('.topbar')).toBeVisible()

    const sections = await page.locator('.settings-section').all()
    expect(sections.length).toBeGreaterThanOrEqual(2)

    const boxes = await Promise.all(sections.map((s) => s.boundingBox()))
    const leftXs = boxes.map((b) => b.x)
    const uniqueXs = new Set(leftXs)

    // 双栏布局下至少出现两种不同的水平起始位置
    expect(uniqueXs.size).toBeGreaterThanOrEqual(2)

    // 返回按钮可用
    await page.click('.back-btn')
    await expect(page).toHaveURL(/#\/$/)
  })
})
