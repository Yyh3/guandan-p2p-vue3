import { test, expect } from '@playwright/test'

/**
 * E2E-002: 房主在房间页点击菜单/退出，返回首页。
 * Phase 7 已将原生 confirm 替换为 ConfirmDialog，需要点击自定义弹窗的确认按钮。
 */
test('host exits room from menu and returns home', async ({ page }) => {
  await page.goto('/#/room?role=host')
  await expect(page).toHaveURL(/#\/room/)

  // 顶部菜单按钮打开自定义确认框
  await page.getByTestId('menu-btn').click()
  await expect(page.locator('.confirm-overlay')).toBeVisible()

  // 点击确认退出
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page).toHaveURL(/#\/$/)
})
