/**
 * Playwright E2E 配置
 *
 * 职责:
 *   - 自动启动 Vite dev 服务器(http://localhost:8848)
 *   - 只配 Chromium(项目离线,不依赖外部浏览器)
 *   - 测试目录: e2e/
 *   - 失败时保留截图 / trace,方便排错
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8848',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8848',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
