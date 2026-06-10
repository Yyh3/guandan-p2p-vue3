import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'

import HomeView from './views/index/HomeView.vue'
import RoomView from './views/room/RoomView.vue'
import JoinView from './views/join/JoinView.vue'
import GameView from './views/game/GameView.vue'
import AIView from './views/ai/AIView.vue'
import GuideView from './views/guide/GuideView.vue'
import HistoryView from './views/history/HistoryView.vue'
import SettingsView from './views/settings/SettingsView.vue'

const routes = [
  { path: '/', component: HomeView },
  { path: '/room', component: RoomView },
  { path: '/join', component: JoinView },
  { path: '/game', component: GameView },
  { path: '/ai', component: AIView },
  { path: '/guide', component: GuideView },
  { path: '/history', component: HistoryView },
  { path: '/settings', component: SettingsView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

const app = createApp(App)
app.use(router)
app.mount('#app')
