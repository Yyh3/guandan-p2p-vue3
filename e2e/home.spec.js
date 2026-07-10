/**
 * 首页 E2E 验证
 *
 * 覆盖:
 *   - 首页正常渲染、标题、4 个主按钮
 *   - 点击「AI 对战」进入 AIView
 */
import { test, expect } from '@playwright/test'

test.describe('首页', () => {
  test('首页渲染标题与主按钮', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1.logo-title')).toHaveText('掼蛋')
    await expect(page.locator('text=开始游戏')).toBeVisible()
    await expect(page.locator('text=加入房间')).toBeVisible()
    await expect(page.locator('text=AI 对战')).toBeVisible()
    await expect(page.locator('text=游戏规则')).toBeVisible()
  })

  test('点击 AI 对战进入 AIView', async ({ page }) => {
    await page.goto('/')
    await page.click('text=AI 对战')
    await expect(page).toHaveURL(/#\/ai/)
    await expect(page.locator('text=单机 AI 模式')).toBeVisible()
  })
})
