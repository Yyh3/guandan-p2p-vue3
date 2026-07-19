import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './styles/tokens.css'
import './styles/app-theme.css'
import './styles/html.css'
import './styles/simple-mode.css'

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
