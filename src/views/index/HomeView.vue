<template>
  <!--
   * v3.x 首页(UI-REDESIGN-V3-SPEC.md §2)
   * 翡翠绿径向渐变 + 中央菱形金色装饰纹(SVG pattern)
   * 顶部:扑克牌叠(3 张错位 + 旋转)+ "掼蛋" 毛笔字 + 金色金属渐变
   * 中部:4 个玻璃拟态按钮(开始游戏 / 加入房间 / AI 对战 / 游戏规则)
   * 底部:左下齿轮设置 + 右下头像 + 昵称(玻璃面板)
   * 配色全部走 tokens(--emerald-base / --gold-primary / --glass-bg / --glass-blur)
   -->
  <div class="page">
    <!-- 背景层:深翡翠绿径向 + 菱形金色纹样(opacity 8-12%) -->
    <div class="bg app-half-table-bg"></div>
    <div class="bg-pattern" aria-hidden="true"></div>

    <!-- 顶部 Logo:牌叠 + "掼蛋" 金色金属渐变 -->
    <header class="logo">
      <div class="logo-cards" aria-hidden="true">
        <span class="card-layer card-back">A</span>
        <span class="card-layer card-mid">A</span>
        <span class="card-layer card-front">A</span>
      </div>
      <h1 class="logo-title">掼蛋</h1>
      <p class="logo-sub">局域网 · 离线 · 4 人联机</p>
    </header>

    <!-- 中部:4 个玻璃拟态按钮(垂直堆叠,间距 16px,高度 64px,圆角 32px) -->
    <nav class="actions" aria-label="主菜单">
      <button
        v-for="btn in mainButtons"
        :key="btn.id"
        class="glass-btn"
        :class="`glass-btn-${btn.tone}`"
        :data-testid="btn.testid"
        @click="btn.handler"
      >
        <span class="glass-btn-icon">{{ btn.icon }}</span>
        <span class="glass-btn-text">{{ btn.label }}</span>
      </button>
    </nav>

    <!-- 底部:左下齿轮设置 + 右下头像 + 昵称 -->
    <footer class="bottom-bar">
      <button
        class="gear-btn"
        :data-testid="'home-settings-btn'"
        title="设置"
        @click="onSettings"
      >⚙</button>

      <button
        class="user-pill"
        :data-testid="'home-user-pill'"
        title="点击修改昵称 / 头像"
        @click="onEditNickname"
      >
        <span class="user-pill-avatar">{{ myAvatar }}</span>
        <span class="user-pill-name">{{ myName || '未命名玩家' }}</span>
      </button>
    </footer>

    <!-- ★ v2.1 P1 被踢提示 -->
    <div v-if="kickedToast" class="kicked-toast">
      <span class="kicked-icon">🚫</span>
      <span class="kicked-text">{{ kickedToast }}</span>
      <button class="kicked-close" @click="kickedToast = ''">×</button>
    </div>

    <NicknameEditor
      v-if="showNickEditor"
      @close="showNickEditor = false"
      @confirm="onNickConfirm"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import NicknameEditor from '@/components/NicknameEditor.vue'

const route = useRoute()
const router = useRouter()
const myName = ref('')
const myAvatar = ref('🀄')
const showNickEditor = ref(false)

// ★ v2.1 P1 host 主动踢人:被踢的 joiner 跳到 /?force_disconnected=1 → 首页弹提示
const kickedToast = ref('')
let kickedToastTimer = null

// 4 个主按钮(按 spec §2.1):开始游戏 / 加入房间 / AI 对战 / 游戏规则
// tone 决定按钮的微调色调(都是金色玻璃基底,只是底色 hint 不同)
const mainButtons = [
  {
    id: 'start',
    icon: '▶',
    label: '开始游戏',
    tone: 'amber',
    testid: 'home-start-btn',
    handler: () => router.push('/room?role=host'),
  },
  {
    id: 'join',
    icon: '📱',
    label: '加入房间',
    tone: 'cyan',
    testid: 'home-join-btn',
    handler: () => router.push('/join'),
  },
  {
    id: 'ai',
    icon: '🤖',
    label: 'AI 对战',
    tone: 'purple',
    testid: 'home-ai-btn',
    handler: () => router.push('/ai'),
  },
  {
    id: 'rules',
    icon: '📖',
    label: '游戏规则',
    tone: 'green',
    testid: 'home-rules-btn',
    handler: () => router.push('/guide'),
  },
]

onMounted(() => {
  myName.value = storage.getNickname()
  myAvatar.value = storage.getAvatar()
  // ★ v2.1 P1 处理被踢提示
  if (route.query.force_disconnected === '1') {
    const reason = route.query.reason ? String(route.query.reason) : ''
    const msg = reason === 'kicked'
      ? '你已被房主踢出房间'
      : '连接已断开,已返回首页'
    kickedToast.value = msg
    // 5 秒后自动消失,或点击 × 立刻消失
    if (kickedToastTimer) clearTimeout(kickedToastTimer)
    kickedToastTimer = setTimeout(() => { kickedToast.value = '' }, 5000)
    // 清理 URL,避免刷新再次触发
    router.replace({ path: '/', query: {} })
  }
})

onUnmounted(() => {
  if (kickedToastTimer) clearTimeout(kickedToastTimer)
})

function onEditNickname() { showNickEditor.value = true }
function onNickConfirm({ nickname, avatar }) {
  myName.value = nickname
  myAvatar.value = avatar
  showNickEditor.value = false
}
function onSettings() { router.push('/settings') }
</script>

<style scoped>
/* ============================================================
 * v3.x 首页(UI-REDESIGN-V3-SPEC.md §2)
 * 翡翠绿背景 + 玻璃拟态按钮 + 金色装饰
 * ============================================================ */

.page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: 56px 24px 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #080b16;
}

.bg {
  z-index: 0;
}

/* 中央菱形金色装饰纹样 — 内联 SVG pattern,opacity 10% */
.bg-pattern {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><pattern id='diamond' x='0' y='0' width='60' height='60' patternUnits='userSpaceOnUse'><path d='M 30 6 L 54 30 L 30 54 L 6 30 Z' fill='none' stroke='%23d4af37' stroke-width='1' opacity='0.35'/><circle cx='30' cy='30' r='2' fill='%23d4af37' opacity='0.4'/></pattern></defs><rect width='200' height='200' fill='url(%23diamond)'/></svg>");
  background-repeat: repeat;
  opacity: 0.08;
  mix-blend-mode: screen;
}

/* 顶部内容上浮 */
.logo, .actions, .bottom-bar { position: relative; z-index: 1; }

/* ============================================================
 * 顶部 Logo:牌叠 + 毛笔字 "掼蛋"
 * ============================================================ */
.logo {
  margin-top: 24px;
  margin-bottom: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.logo-cards {
  position: relative;
  width: 120px;
  height: 80px;
  margin-bottom: 4px;
}
.card-layer {
  position: absolute;
  width: 56px;
  height: 80px;
  border-radius: 8px;
  background: var(--card-cream);
  border: 1.5px solid var(--gold-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 900;
  color: var(--text-on-card);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px rgba(255, 215, 0, 0.18);
  font-family: Georgia, serif;
}
.card-back {
  left: 0;
  top: 4px;
  transform: rotate(-12deg);
  color: var(--red-card);
}
.card-mid {
  left: 32px;
  top: 0;
  transform: rotate(0deg);
  color: var(--text-on-card);
}
.card-front {
  left: 64px;
  top: 4px;
  transform: rotate(12deg);
  color: var(--red-card);
}
.logo-title {
  font: var(--font-display);
  font-size: 56px;
  font-weight: 900;
  letter-spacing: 12px;
  margin: 0;
  background: var(--gold-metallic);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2px 8px rgba(212, 175, 55, 0.25);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}
.logo-sub {
  margin: 0;
  font-size: 13px;
  color: var(--gold-soft);
  letter-spacing: 4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* ============================================================
 * 中部:4 个玻璃拟态按钮(垂直堆叠,间距 16px,高度 64px,圆角 32px)
 * ============================================================ */
.actions {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 40px;
}
.glass-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  height: 64px;
  padding: 0 24px 0 16px;
  border-radius: 32px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1.5px solid var(--gold-primary);
  color: var(--gold-bright);
  font: var(--font-button);
  font-size: 20px;
  letter-spacing: 2px;
  cursor: pointer;
  font-family: inherit;
  transition:
    transform var(--t-fast, 120ms) var(--ease-out, ease),
    border-color 200ms var(--ease-out, ease),
    box-shadow 200ms var(--ease-out, ease),
    background 200ms var(--ease-out, ease);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
/* 按钮底色 hint(4 种 tone)— 共享金色玻璃基底,微调底色 */
.glass-btn-amber {
  background: linear-gradient(135deg,
    rgba(212, 175, 55, 0.18) 0%,
    rgba(255, 215, 0, 0.08) 100%);
}
.glass-btn-cyan {
  background: linear-gradient(135deg,
    rgba(212, 175, 55, 0.18) 0%,
    rgba(33, 150, 243, 0.10) 100%);
}
.glass-btn-purple {
  background: linear-gradient(135deg,
    rgba(212, 175, 55, 0.18) 0%,
    rgba(126, 87, 194, 0.10) 100%);
}
.glass-btn-green {
  background: linear-gradient(135deg,
    rgba(212, 175, 55, 0.18) 0%,
    rgba(67, 160, 71, 0.10) 100%);
}
.glass-btn-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  border: 1.5px solid var(--gold-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--gold-bright);
  line-height: 1;
}
.glass-btn-text {
  flex: 1;
  text-align: left;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
/* hover:边框亮度 +30% + 阴影增强 */
.glass-btn:hover {
  border-color: var(--gold-bright);
  background: rgba(255, 255, 255, 0.14);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.45),
    0 0 16px rgba(255, 215, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}
.glass-btn:hover .glass-btn-icon {
  border-color: var(--gold-bright);
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
}
/* active:按下缩小 0.98 + 阴影减弱 */
.glass-btn:active {
  transform: scale(0.98);
  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.glass-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.4);
}

/* ============================================================
 * 底部:齿轮设置 + 头像 + 昵称
 * ============================================================ */
.bottom-bar {
  width: 100%;
  max-width: 360px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}
.gear-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1.5px solid var(--gold-primary);
  color: var(--gold-bright);
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms var(--ease-out, ease);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  padding: 0;
  line-height: 1;
}
.gear-btn:hover {
  border-color: var(--gold-bright);
  background: rgba(255, 215, 0, 0.12);
  transform: rotate(45deg);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45),
              0 0 12px rgba(255, 215, 0, 0.3);
}
.gear-btn:active { transform: rotate(45deg) scale(0.95); }
.user-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 18px 0 6px;
  border-radius: 24px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1.5px solid var(--gold-primary);
  cursor: pointer;
  font-family: inherit;
  transition: all 200ms var(--ease-out, ease);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  max-width: 200px;
}
.user-pill:hover {
  border-color: var(--gold-bright);
  background: rgba(255, 255, 255, 0.12);
}
.user-pill:active { transform: scale(0.98); }
.user-pill-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--gold-metallic);
  border: 1.5px solid var(--gold-bright);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.user-pill-name {
  color: var(--gold-bright);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* ============================================================
 * v2.1 P1 被踢提示(沿用旧版样式,微调配色与背景)
 * ============================================================ */
.kicked-toast {
  position: fixed;
  top: 80px; left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: linear-gradient(180deg, rgba(229, 57, 53, 0.92), rgba(183, 28, 28, 0.92));
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  color: #fff;
  padding: 12px 20px;
  border-radius: 24px;
  border: 1.5px solid var(--gold-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: bold;
  animation: kickToastIn 0.3s var(--ease-out, ease);
  max-width: calc(100vw - 48px);
}
.kicked-icon { font-size: 18px; }
.kicked-text { flex: 1; }
.kicked-close {
  background: rgba(255, 255, 255, 0.25);
  border: none; color: #fff;
  width: 24px; height: 24px;
  border-radius: 50%;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.kicked-close:hover { background: rgba(255, 255, 255, 0.4); }
@keyframes kickToastIn {
  from { opacity: 0; transform: translate(-50%, -20px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* ============================================================
 * 响应式:小屏(< 380px)压缩按钮高度 + 字号
 * ============================================================ */
@media (max-width: 380px) {
  .page { padding: 40px 16px 80px; }
  .logo-title { font-size: 44px; letter-spacing: 8px; }
  .logo-sub { font-size: 11px; letter-spacing: 3px; }
  .glass-btn { height: 56px; padding: 0 18px 0 12px; }
  .glass-btn-icon { width: 32px; height: 32px; font-size: 16px; }
  .glass-btn-text { font-size: 17px; letter-spacing: 1px; }
  .user-pill { padding: 0 14px 0 4px; height: 44px; max-width: 160px; }
  .user-pill-avatar { width: 32px; height: 32px; font-size: 16px; }
  .user-pill-name { font-size: 13px; max-width: 90px; }
}

/* 触摸目标 ≥ 48px (iOS HIG) */
@media (pointer: coarse) {
  .glass-btn { min-height: 56px; }
  .gear-btn { min-width: 48px; min-height: 48px; }
  .user-pill { min-height: 48px; }
}
</style>
