import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 基线配置。
 * 仅覆盖核心主流程：开房/加入/准备/开始、退出返回首页、结果弹窗拦截点击。
 *
 * 默认使用 dev 服务器 http://localhost:8848；如果 Vite 因端口占用落到其他端口，
 * 可通过环境变量覆盖，例如：
 *   BASE_URL=http://localhost:8853 npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8848',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
