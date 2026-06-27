import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './styles/tokens.css'
import './styles/app-theme.css'

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

const app = createApp(App)
app.use(router)
app.mount('#app')
