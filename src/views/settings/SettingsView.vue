<template>
  <div class="page">
    <div class="bg app-half-table-bg"></div>

    <!-- 顶部返回 -->
    <header class="topbar">
      <button class="back-btn" @click="onBack" aria-label="返回首页">‹ 返回</button>
      <h1 class="topbar-title">设置</h1>
      <div class="topbar-spacer"></div>
    </header>

    <!-- 音乐 / 音效 -->
    <section class="card">
      <h2 class="card-title">🎵 声音</h2>

      <div class="row">
        <span class="row-label">
          <span class="row-icon">🎶</span>
          背景音乐
        </span>
        <label class="switch">
          <input type="checkbox" v-model="bgmEnabled" @change="saveAll" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="row slider-row" :class="{ disabled: !bgmEnabled }">
        <span class="row-sub">音量</span>
        <input
          type="range" min="0" max="100" step="1"
          v-model.number="bgmVolume" :disabled="!bgmEnabled" @change="saveAll"
          class="vol-slider"
        />
        <span class="vol-val">{{ bgmVolume }}</span>
      </div>

      <div class="row">
        <span class="row-label">
          <span class="row-icon">🔊</span>
          出牌音效
        </span>
        <label class="switch">
          <input type="checkbox" v-model="sfxEnabled" @change="saveAll" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="row slider-row" :class="{ disabled: !sfxEnabled }">
        <span class="row-sub">音量</span>
        <input
          type="range" min="0" max="100" step="1"
          v-model.number="sfxVolume" :disabled="!sfxEnabled" @change="saveAll"
          class="vol-slider"
        />
        <span class="vol-val">{{ sfxVolume }}</span>
      </div>

      <!-- BGM 风格切换 -->
      <div class="row" :class="{ disabled: !bgmEnabled }">
        <span class="row-label">
          <span class="row-icon">🎚️</span>
          音乐风格
        </span>
        <div class="seg-group">
          <button
            v-for="opt in bgmStyles"
            :key="opt.id"
            class="seg-btn"
            :class="{ active: bgmStyle === opt.id, disabled: !bgmEnabled }"
            :disabled="!bgmEnabled"
            @click="setStyle(opt.id)"
          >{{ opt.label }}</button>
        </div>
      </div>
      <!-- ★ v0.4.9:音效模式(合成 vs 真实采样) -->
      <div class="row">
        <span class="row-label">
          <span class="row-icon">🔊</span>
          音效风格
        </span>
        <div class="seg-group">
          <button
            v-for="opt in sfxModes"
            :key="opt.id"
            class="seg-btn"
            :class="{ active: sfxMode === opt.id, disabled: !sfxEnabled }"
            :disabled="!sfxEnabled"
            @click="setSfxMode(opt.id)"
          >{{ opt.label }}</button>
        </div>
      </div>
    </section>

    <!-- 视觉(占位) -->
    <section class="card">
      <h2 class="card-title">🎨 视觉</h2>

      <div class="row disabled">
        <span class="row-label">
          <span class="row-icon">✨</span>
          动画效果
        </span>
        <label class="switch">
          <input type="checkbox" v-model="animationEnabled" disabled />
          <span class="slider"></span>
        </label>
        <span class="row-tag">即将开放</span>
      </div>

      <div class="row">
        <span class="row-label">
          <span class="row-icon">🌓</span>
          主题模式
        </span>
        <div class="seg-group">
          <button
            v-for="opt in themes"
            :key="opt.id"
            class="seg-btn"
            :class="{ active: theme === opt.id, disabled: true }"
            disabled
            @click="setTheme(opt.id)"
          >{{ opt.label }}</button>
        </div>
        <span class="row-tag">即将开放</span>
      </div>
    </section>

    <!-- ★ v0.4.9:全局 AI 难度(SettingsView 改 → AIView 默认读这里) -->
    <section class="card">
      <h2 class="card-title">🤖 AI 难度</h2>
      <div class="row">
        <span class="row-label">
          <span class="row-icon">🎯</span>
          默认 AI 难度
        </span>
        <div class="seg-group">
          <button
            v-for="opt in aiDifficulties"
            :key="opt.id"
            class="seg-btn"
            :class="{ active: aiDifficulty === opt.id }"
            @click="setAiDifficulty(opt.id)"
          >{{ opt.label }}</button>
        </div>
      </div>
      <p class="card-hint">
        中等 = 规则 + 贪心搜索;困难 = 防守 + 炸弹保留。设置后,<b>单机 AI 模式</b>
        进入时自动应用,也可在 AI 模式配置页临时覆盖。
      </p>
    </section>

    <!-- 数据 -->
    <section class="card">
      <h2 class="card-title">🗂️ 数据</h2>
      <div class="row">
        <span class="row-label">
          <span class="row-icon">📊</span>
          当前战绩数
        </span>
        <span class="row-value">{{ historyCount }} 条</span>
      </div>
      <div class="row">
        <span class="row-label">
          <span class="row-icon">👤</span>
          昵称
        </span>
        <span class="row-value">{{ nickname }} {{ avatar }}</span>
      </div>
      <button class="action-btn warn" @click="onClearHistory">
        清空全部战绩
      </button>
      <p class="card-hint">清空后不可恢复,本机操作不影响对局进行</p>
    </section>

    <!-- 关于 / 致谢 (v0.4.8 N-3) -->
    <section class="card">
      <h2 class="card-title">ℹ️ 关于</h2>
      <p class="card-hint">
        掼蛋 P2P 局域网版 v{{ appVersion }}<br>
        离线 4 人掼蛋,无网/无流量/无服务器
      </p>
  <p class="card-hint">
    🎵 背景音乐:BGM by Kevin MacLeod (incompetech.com),Licensed under
    <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>
  </p>
  <p class="card-hint">
    🔊 音效占位(f sine + white noise),用户可换真实采样。
    <a href="https://opengameart.org/" target="_blank" rel="noopener">OpenGameArt</a> /
    <a href="https://freesound.org/" target="_blank" rel="noopener">Freesound</a> 找 CC0 扑克音效
  </p>
</section>

    <p class="footer">设置仅保存到本机,不同步到云端</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import audio from '@/common/audio.js'
// ★ V0410-08 修复:从 package.json 读版本号,不再硬编码
//   Vite 编译时把 import 替换成 JSON 字面量,运行时无需额外请求
import pkg from '@/../package.json'

const router = useRouter()
const appVersion = String(pkg.version || '0.0.0')

// 状态(初始化由 onMounted 从 storage 灌入)
const bgmEnabled = ref(true)
const sfxEnabled = ref(true)
const bgmVolume = ref(50)
const sfxVolume = ref(70)
const bgmStyle = ref('energetic')
// ★ v0.4.9:SFX 模式(synth 合成 / real 真实采样)
const sfxMode = ref('synth')
const animationEnabled = ref(true)
const theme = ref('dark')
const historyCount = ref(0)
const nickname = ref('')
const avatar = ref('')

// v0.4.8 N-3:7 首真实 BGM(Kevin MacLeod CC-BY),用户可在设置页切换
const bgmStyles = [
  { id: 'energetic', label: '中式器乐' },  // bgm-chinese.mp3 主对局
  { id: 'calm', label: '轻快明快' },       // bgm-carefree.mp3 等待/结算
  { id: 'bossa', label: 'Bossa 爵士' },    // bgm-bossa.mp3 慵懒闲适
  { id: 'ripples', label: '舒缓氛围' },    // bgm-ripples.mp3 残局
  { id: 'intense', label: '亚洲鼓乐' },    // bgm-asian-drums.mp3 炸弹连击
  { id: 'warm', label: '温暖民谣' },       // bgm-firesong.mp3 大厅
  { id: 'casual', label: '爱尔兰风笛' },   // bgm-galway.mp3 休闲
]
// ★ v0.4.9:SFX 风格(合成 vs 真实采样)
const sfxModes = [
  { id: 'synth', label: '合成' },
  { id: 'real', label: '真实' },
]
// ★ v0.4.9:全局 AI 难度(SettingsView → AIView 默认读 storage.aiDifficulty)
const aiDifficulties = [
  { id: 'medium', label: '中等' },
  { id: 'hard', label: '困难' },
]
const themes = [
  { id: 'dark', label: '深色' },
  { id: 'light', label: '浅色' },
]

onMounted(() => {
  const s = storage.getSettings()
  bgmEnabled.value = s.bgmEnabled !== false
  sfxEnabled.value = s.sfxEnabled !== false
  bgmVolume.value = Math.round((s.bgmVolume ?? 0.5) * 100)
  sfxVolume.value = Math.round((s.sfxVolume ?? 0.7) * 100)
  // 优先用 storage 持久化的值,fallback 到 audio 模块当前值
  bgmStyle.value = s.bgmStyle || audio.getBgmStyle() || 'energetic'
  // ★ v0.4.9:SFX 模式(synth / real)
  sfxMode.value = s.sfxMode || audio.getSfxMode() || 'synth'
  animationEnabled.value = s.animationEnabled !== false
  theme.value = s.theme || 'dark'
  // ★ v0.4.9:从 storage 灌入全局 AI 难度
  aiDifficulty.value = s.aiDifficulty === 'hard' ? 'hard' : 'medium'
  historyCount.value = (storage.getHistory() || []).length
  nickname.value = storage.getNickname()
  avatar.value = storage.getAvatar()
  // 把持久化的 BGM 风格同步到 audio 模块
  audio.setBgmStyle(bgmStyle.value)
  // ★ v0.4.9:把 SFX 模式同步到 audio 模块
  audio.setSfxMode(sfxMode.value)
})

function saveAll() {
  storage.setSettings({
    bgmEnabled: bgmEnabled.value,
    sfxEnabled: sfxEnabled.value,
    bgmVolume: bgmVolume.value / 100,
    sfxVolume: sfxVolume.value / 100,
    bgmStyle: bgmStyle.value,
    sfxMode: sfxMode.value,
    animationEnabled: animationEnabled.value,
    theme: theme.value,
    aiDifficulty: aiDifficulty.value,
  })
  // 实时反映到 audio 模块
  audio.setBgmEnabled(bgmEnabled.value)
  audio.setSfxEnabled(sfxEnabled.value)
  audio.setBgmVolume(bgmVolume.value / 100)
  audio.setSfxVolume(sfxVolume.value / 100)
  audio.setBgmStyle(bgmStyle.value)
}

function setStyle(id) {
  if (!bgmEnabled.value) return
  bgmStyle.value = id
  audio.setBgmStyle(id)
  saveAll()
}

// ★ v0.4.9:SFX 模式切换
function setSfxMode(id) {
  if (!sfxEnabled.value) return
  sfxMode.value = id
  audio.setSfxMode(id)
  saveAll()
}

// ★ v0.4.9:全局 AI 难度切换(立即持久化,AIView 重新进会读到)
function setAiDifficulty(id) {
  if (id !== 'medium' && id !== 'hard') return
  aiDifficulty.value = id
  storage.setSettings({ aiDifficulty: id })
}

function setTheme(id) {
  // 占位,即将开放
  theme.value = id
  saveAll()
}

function onClearHistory() {
  const n = historyCount.value
  if (n === 0) {
    alert('当前没有战绩可清空')
    return
  }
  if (!confirm(`确认清空全部 ${n} 条战绩?此操作不可恢复`)) return
  storage.clearHistory()
  historyCount.value = 0
  alert('已清空战绩')
}

function onBack() {
  router.push('/')
}
</script>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  background: #080b16;
  padding: 60px 20px 40px;
  color: #fff;
  overflow: hidden;
}
.bg {
  z-index: 0;
}
.topbar, .card, .footer { position: relative; z-index: 1; }

/* ====== 顶部返回 ====== */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px;
}
.back-btn {
  background: rgba(4, 8, 22, 0.36);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 10px;
  padding: 8px 14px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
}
.back-btn:hover { background: rgba(255,255,255,0.18); }
.topbar-title {
  font-size: 18px; font-weight: 900; margin: 0;
  letter-spacing: 1px;
  text-shadow: 0 3px 12px rgba(0,0,0,0.35);
}
.topbar-spacer { width: 70px; }

/* ====== 卡片 ====== */
.card {
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 14px 16px 18px;
  margin-bottom: 16px;
  box-shadow: 0 18px 38px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18);
  backdrop-filter: blur(14px);
}
.card-title {
  font-size: 14px; font-weight: 800;
  color: #ffe37c;
  margin: 4px 0 12px;
  letter-spacing: 1px;
}
.card-hint {
  font-size: 11px; color: rgba(255,255,255,0.5);
  margin: 8px 0 0; padding: 0;
}

/* ====== 行 ====== */
.row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0;
}
.row-label {
  flex: 1;
  display: flex; align-items: center; gap: 6px;
  font-size: 14px;
  color: #fff;
}
.row-icon { font-size: 16px; }
.row-sub {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  width: 36px;
}
.row-value {
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  font-variant-numeric: tabular-nums;
}
.row-tag {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.06);
  padding: 2px 6px;
  border-radius: 4px;
}
.row.disabled { opacity: 0.45; }
.slider-row { padding-left: 26px; }

/* ====== 音量滑块 ====== */
.vol-slider {
  flex: 1;
  -webkit-appearance: none; appearance: none;
  height: 4px;
  background: rgba(255,255,255,0.2);
  border-radius: 2px;
  outline: none;
}
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 16px; height: 16px;
  background: var(--gold-metallic, linear-gradient(135deg, #ffd700 0%, #d4af37 50%, #a8862a 100%));
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(255, 215, 0, 0.6);
}
.vol-slider::-moz-range-thumb {
  width: 16px; height: 16px;
  background: var(--gold-metallic, linear-gradient(135deg, #ffd700 0%, #d4af37 50%, #a8862a 100%));
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(255, 215, 0, 0.6);
}
.vol-slider:disabled { cursor: not-allowed; }
.vol-val {
  width: 32px;
  text-align: right;
  font-size: 12px;
  color: rgba(255,255,255,0.8);
  font-variant-numeric: tabular-nums;
}

/* ====== iOS 风格开关 ====== */
.switch {
  position: relative;
  display: inline-block;
  width: 44px; height: 24px;
  flex-shrink: 0;
}
.switch input { display: none; }
.switch input:disabled + .slider { cursor: not-allowed; opacity: 0.5; }
/* v3.8 补:disabled + checked 状态不再显示绿色,改成中性灰,v3.7 verifier 提示的误导视觉 */
.switch input:disabled:checked + .slider { background: rgba(255,255,255,0.25); }
.switch input:disabled + .slider::before { background: rgba(255,255,255,0.7); box-shadow: none; }
.switch .slider {
  position: absolute; cursor: pointer; inset: 0;
  background: rgba(255,255,255,0.25);
  border-radius: 24px;
  transition: background 0.2s;
}
.switch .slider::before {
  content: '';
  position: absolute;
  height: 20px; width: 20px;
  left: 2px; top: 2px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.switch input:checked + .slider { background: linear-gradient(180deg, #66bb6a, #2e7d32); }
.switch input:checked + .slider::before { transform: translateX(20px); }

/* ====== 按钮组(segmented) ====== */
.seg-group {
  display: inline-flex;
  background: rgba(4, 8, 22, 0.36);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 2px;
  gap: 0;
}
.seg-btn {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.7);
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.seg-btn:hover:not(.disabled):not(:disabled) { color: #fff; }
.seg-btn.active {
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  font-weight: bold;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
}
.seg-btn.disabled, .seg-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ====== 清除按钮 ====== */
.action-btn {
  width: 100%;
  height: 44px;
  margin-top: 10px;
  background: rgba(244, 67, 54, 0.18);
  color: #ff8a80;
  border: 1px solid rgba(244, 67, 54, 0.5);
  border-radius: 10px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.action-btn:hover { background: rgba(244, 67, 54, 0.3); color: #fff; }
.action-btn:active { transform: scale(0.98); }

.footer {
  text-align: center;
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  margin-top: 20px;
  letter-spacing: 1.5px;
}
</style>
