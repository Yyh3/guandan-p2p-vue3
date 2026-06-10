<template>
  <div class="page">
    <div class="bg"></div>
    <h1 class="title">掼蛋 P2P</h1>
    <p class="title-sub">局域网 · 离线 · 4 人联机</p>

    <div class="user-card" @click="onEditNickname">
      <div class="user-avatar">{{ myAvatar }}</div>
      <div class="user-info">
        <div class="user-name">{{ myName }}</div>
        <div class="user-hint">点击修改昵称 / 头像</div>
      </div>
      <span class="user-arrow">›</span>
    </div>

    <div class="hero">
      <div class="hero-card">♠ ♥ ♣ ♦</div>
    </div>

    <div class="actions">
      <button class="action-btn primary" @click="onCreate">
        <span class="action-main">开热点建房</span>
        <span class="action-sub">当房主,等其他人连</span>
      </button>
      <button class="action-btn" @click="onJoin">
        <span class="action-main">连热点加入</span>
        <span class="action-sub">输入房间号</span>
      </button>
      <button class="action-btn" @click="onAI">
        <span class="action-main">单机 AI 对战</span>
        <span class="action-sub">一人三局,无网络</span>
      </button>
      <button class="action-btn ghost" @click="onGuide">
        <span class="action-main">新手引导</span>
        <span class="action-sub">开热点 / 加房间教程</span>
      </button>
      <button class="action-btn ghost" @click="onHistory">
        <span class="action-main">本地战绩</span>
        <span class="action-sub">只存本机,不联网</span>
      </button>
      <button class="action-btn ghost" @click="onSettings">
        <span class="action-main">设置</span>
        <span class="action-sub">音乐 / 音效 / 数据</span>
      </button>
    </div>

    <!-- 音效 / 音乐设置(v1-features) -->
    <div class="settings-card">
      <div class="settings-title">音效与音乐</div>

      <div class="setting-row">
        <span class="setting-label">
          <span class="setting-icon">🎵</span>
          背景音乐
        </span>
        <label class="switch">
          <input type="checkbox" v-model="bgmEnabled" @change="saveSettings" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="setting-row slider-row" :class="{ disabled: !bgmEnabled }">
        <span class="setting-sub">音量</span>
        <input
          type="range" min="0" max="100" step="1"
          v-model.number="bgmVolume" :disabled="!bgmEnabled" @change="saveSettings"
          class="vol-slider"
        />
        <span class="vol-val">{{ bgmVolume }}</span>
      </div>

      <div class="setting-row">
        <span class="setting-label">
          <span class="setting-icon">🔊</span>
          出牌声效
        </span>
        <label class="switch">
          <input type="checkbox" v-model="sfxEnabled" @change="saveSettings" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="setting-row slider-row" :class="{ disabled: !sfxEnabled }">
        <span class="setting-sub">音量</span>
        <input
          type="range" min="0" max="100" step="1"
          v-model.number="sfxVolume" :disabled="!sfxEnabled" @change="saveSettings"
          class="vol-slider"
        />
        <span class="vol-val">{{ sfxVolume }}</span>
      </div>
    </div>

    <p class="footer">纯本地 · 无服务器 · 无流量</p>

    <NicknameEditor
      v-if="showNickEditor"
      @close="showNickEditor = false"
      @confirm="onNickConfirm"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import audio from '@/common/audio.js'
import NicknameEditor from '@/components/NicknameEditor.vue'

const router = useRouter()
const myName = ref('')
const myAvatar = ref('🀄')
const showNickEditor = ref(false)

// 音效 / 音乐设置
const bgmEnabled = ref(true)
const sfxEnabled = ref(true)
const bgmVolume = ref(50)
const sfxVolume = ref(70)

onMounted(() => {
  myName.value = storage.getNickname()
  myAvatar.value = storage.getAvatar()
  const s = storage.getSettings()
  bgmEnabled.value = s.bgmEnabled !== false
  sfxEnabled.value = s.sfxEnabled !== false
  bgmVolume.value = Math.round((s.bgmVolume ?? 0.5) * 100)
  sfxVolume.value = Math.round((s.sfxVolume ?? 0.7) * 100)
  // 同步到 audio 模块(虽然首页不自动放,但用户测音量滑块需要)
  audio.setBgmEnabled(bgmEnabled.value)
  audio.setSfxEnabled(sfxEnabled.value)
  audio.setBgmVolume(bgmVolume.value / 100)
  audio.setSfxVolume(sfxVolume.value / 100)
})

function saveSettings() {
  storage.setSettings({
    bgmEnabled: bgmEnabled.value,
    sfxEnabled: sfxEnabled.value,
    bgmVolume: bgmVolume.value / 100,
    sfxVolume: sfxVolume.value / 100,
  })
  // 实时反映到 audio
  audio.setBgmEnabled(bgmEnabled.value)
  audio.setSfxEnabled(sfxEnabled.value)
  audio.setBgmVolume(bgmVolume.value / 100)
  audio.setSfxVolume(sfxVolume.value / 100)
  // 拨动音量滑块时,如果启用了 BGM,试播一下短促音符(让用户确认音量)
  // 用 user gesture 的方式:直接 startBgm 即可(此时页面刚加载允许)
}

function onEditNickname() { showNickEditor.value = true }
function onNickConfirm({ nickname, avatar }) {
  myName.value = nickname
  myAvatar.value = avatar
  showNickEditor.value = false
}
function onCreate() { router.push('/room?role=host') }
function onJoin() { router.push('/join') }
function onAI() { router.push('/ai') }
function onGuide() { router.push('/guide') }
function onHistory() { router.push('/history') }
function onSettings() { router.push('/settings') }
</script>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  background: linear-gradient(180deg, #1a2a5e 0%, #2a3464 50%, #1a3a2a 100%);
  overflow-x: hidden;
  padding: 60px 24px 40px;
}
.bg {
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 30% 20%, rgba(108, 195, 245, 0.15), transparent 50%),
    radial-gradient(circle at 70% 80%, rgba(47, 138, 79, 0.3), transparent 50%);
  z-index: 0;
}
.title, .title-sub, .user-card, .hero, .actions, .footer { position: relative; z-index: 1; }
.title { font-size: 42px; font-weight: bold; color: #fff; text-align: center; letter-spacing: 4px; margin-top: 30px; }
.title-sub { font-size: 14px; color: rgba(255,255,255,0.7); text-align: center; margin-top: 8px; }
.user-card {
  margin: 24px 0;
  display: flex; align-items: center; gap: 16px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 12px;
  padding: 14px 18px;
  cursor: pointer;
}
.user-avatar {
  width: 50px; height: 50px;
  background: #ffd9b8;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px;
}
.user-info { flex: 1; }
.user-name { font-size: 18px; font-weight: bold; color: #fff; }
.user-hint { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 2px; }
.user-arrow { font-size: 28px; color: rgba(255,255,255,0.5); }
.hero { text-align: center; margin: 20px 0; }
.hero-card {
  display: inline-block;
  font-size: 38px; color: #ffeb3b;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 14px;
  padding: 12px 28px;
  letter-spacing: 6px;
}
.actions { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
.action-btn {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 12px;
  padding: 16px 20px;
  color: #fff;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.action-btn:hover { background: rgba(255,255,255,0.12); }
.action-btn.primary {
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}
.action-btn.ghost {
  background: transparent;
  border-color: rgba(255,255,255,0.2);
}
.action-main { display: block; font-size: 17px; font-weight: bold; }
.action-sub { display: block; font-size: 12px; opacity: 0.75; margin-top: 4px; }

/* ====== 音效 / 音乐设置 ====== */
.settings-card {
  margin-top: 24px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 14px 16px;
}
.settings-title {
  font-size: 13px;
  font-weight: bold;
  color: rgba(255,255,255,0.7);
  letter-spacing: 1px;
  margin-bottom: 10px;
}
.setting-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 0;
}
.setting-label {
  flex: 1;
  display: flex; align-items: center; gap: 6px;
  font-size: 14px;
  color: #fff;
}
.setting-icon { font-size: 16px; }
.setting-sub { font-size: 12px; color: rgba(255,255,255,0.6); width: 36px; }
.slider-row { padding-left: 26px; }
.slider-row.disabled { opacity: 0.4; }
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
/* iOS 风格开关 */
.switch {
  position: relative;
  display: inline-block;
  width: 44px; height: 24px;
  flex-shrink: 0;
}
.switch input { display: none; }
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

.footer { text-align: center; font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 32px; letter-spacing: 2px; }
</style>
