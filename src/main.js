import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './styles/tokens.css'
import './styles/app-theme.css'
import './styles/html.css'
import './styles/simple-mode.css'
import './styles/table-themes.css'
import audio from '@/common/audio.js'
import storage from '@/common/storage.js'

import HomeView from './views/index/HomeView.vue'
import RoomView from './views/room/RoomView.vue'
import JoinView from './views/join/JoinView.vue'
import GameView from './views/game/GameView.vue'
import AIView from './views/ai/AIView.vue'
import GuideView from './views/guide/GuideView.vue'
import HistoryView from './views/history/HistoryView.vue'
import SettingsView from './views/settings/SettingsView.vue'
import MobileTablePreview from './views/ui-preview/MobileTablePreview.vue'
import RestartAfterAPreview from './views/ui-preview/RestartAfterAPreview.vue'

const routes = [
  { path: '/', component: HomeView },
  { path: '/room', component: RoomView },
  { path: '/join', component: JoinView },
  { path: '/game', component: GameView },
  { path: '/ai', component: AIView },
  { path: '/guide', component: GuideView },
  { path: '/history', component: HistoryView },
  { path: '/settings', component: SettingsView },
  { path: '/ui-preview/table', component: MobileTablePreview },
  { path: '/ui-preview/restart-after-a', component: RestartAfterAPreview },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// ★ v0.4.25:guandan:// 深链 — App 被系统/浏览器/扫码拉起时解析并直达房间
//   覆盖冷启动(getLaunchUrl)与热启动(appUrlOpen 事件);纯浏览器环境为 no-op
import { App as CapApp } from '@capacitor/app'
import { parseQrScanResult } from '@/common/qr-fallback.js'

function _routeDeepLink(url) {
  if (!url || !String(url).startsWith('guandan://')) return
  const parsed = parseQrScanResult(url)
  if (!parsed) return
  const roomQ = parsed.roomNo ? `&roomNo=${parsed.roomNo}` : ''
  router.push(`/room?role=joiner${roomQ}&host=${encodeURIComponent(`${parsed.host}:${parsed.port}`)}`)
}
try {
  CapApp.addListener('appUrlOpen', ({ url }) => _routeDeepLink(url))
  CapApp.getLaunchUrl()
    .then((res) => { if (res && res.url) _routeDeepLink(res.url) })
    .catch(() => {})
} catch (e) { /* 非 Capacitor 环境(纯浏览器)忽略 */ }

const app = createApp(App)
app.use(router)
app.mount('#app')

// ★ v0.4.25:进 App 即播 BGM + 全局按钮轻音效
//   浏览器 autoplay 策略要求首次用户手势才出声 — 注册一次性 pointerdown 解锁;
//   原生 WebView(Capacitor)通常无此限制,直接按设置尝试启动
if (typeof document !== 'undefined') {
  // 首次任意交互:解锁 AudioContext + 按设置启动 BGM(此后按钮轻音效也可出声)
  const unlockAndStart = () => {
    try {
      audio.unlock()
      if (storage.getSettings().bgmEnabled !== false) audio.startBgm()
    } catch (e) { /* ignore */ }
    document.removeEventListener('pointerdown', unlockAndStart)
  }
  document.addEventListener('pointerdown', unlockAndStart)
  // 原生环境:进 App 直接尝试播(App WebView 一般允许 autoplay)
  try {
    if (storage.getSettings().bgmEnabled !== false) audio.startBgm()
  } catch (e) { /* ignore */ }

  // 全局按钮轻音效:点到 button / a / [role=button] 播一声很轻的"嗒"
  document.addEventListener('pointerdown', (e) => {
    try {
      if (e.target && e.target.closest && e.target.closest('button, a, [role="button"]')) {
        audio.sfxClick()
      }
    } catch (err) { /* ignore */ }
  })
}
