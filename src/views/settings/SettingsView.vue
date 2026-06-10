<template>
  <div class="page">
    <div class="bg"></div>

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

    <p class="footer">设置仅保存到本机,不同步到云端</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import audio from '@/common/audio.js'

const router = useRouter()

// 状态(初始化由 onMounted 从 storage 灌入)
const bgmEnabled = ref(true)
const sfxEnabled = ref(true)
const bgmVolume = ref(50)
const sfxVolume = ref(70)
const bgmStyle = ref('energetic')
const animationEnabled = ref(true)
const theme = ref('dark')
const historyCount = ref(0)
const nickname = ref('')
const avatar = ref('')

const bgmStyles = [
  { id: 'calm', label: '平静' },
  { id: 'energetic', label: '激昂' },
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
  animationEnabled.value = s.animationEnabled !== false
  theme.value = s.theme || 'dark'
  historyCount.value = (storage.getHistory() || []).length
  nickname.value = storage.getNickname()
  avatar.value = storage.getAvatar()
  // 把持久化的 BGM 风格同步到 audio 模块
  audio.setBgmStyle(bgmStyle.value)
})

function saveAll() {
  storage.setSettings({
    bgmEnabled: bgmEnabled.value,
    sfxEnabled: sfxEnabled.value,
    bgmVolume: bgmVolume.value / 100,
    sfxVolume: sfxVolume.value / 100,
    bgmStyle: bgmStyle.value,
    animationEnabled: animationEnabled.value,
    theme: theme.value,
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
  background: linear-gradient(180deg, #1a2a5e 0%, #2a3464 50%, #1a3a2a 100%);
  padding: 60px 20px 40px;
  color: #fff;
}
.bg {
  position: fixed; inset: 0;
  background:
    radial-gradient(circle at 30% 20%, rgba(108, 195, 245, 0.15), transparent 50%),
    radial-gradient(circle at 70% 80%, rgba(47, 138, 79, 0.3), transparent 50%);
  z-index: 0;
}
.topbar, .card, .footer { position: relative; z-index: 1; }

/* ====== 顶部返回 ====== */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px;
}
.back-btn {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 10px;
  padding: 8px 14px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
}
.back-btn:hover { background: rgba(255,255,255,0.18); }
.topbar-title {
  font-size: 18px; font-weight: bold; margin: 0;
  letter-spacing: 1px;
}
.topbar-spacer { width: 70px; }

/* ====== 卡片 ====== */
.card {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 14px;
  padding: 14px 16px 18px;
  margin-bottom: 16px;
}
.card-title {
  font-size: 14px; font-weight: bold;
  color: rgba(255,255,255,0.85);
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
  background: linear-gradient(180deg, #6cc3f5, #2a85d0);
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: pointer;
}
.vol-slider::-moz-range-thumb {
  width: 16px; height: 16px;
  background: linear-gradient(180deg, #6cc3f5, #2a85d0);
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: pointer;
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
  background: rgba(0,0,0,0.25);
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
  background: linear-gradient(180deg, #6cc3f5, #2a85d0);
  color: #fff;
  font-weight: bold;
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
