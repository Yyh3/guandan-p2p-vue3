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
    <!-- ★ v0.4.28 P2-2:金色浮尘 — 光柱中缓缓上浮的微粒,让首页“活”起来(纯 CSS 动画) -->
    <div class="dust-layer" aria-hidden="true">
      <i v-for="n in 14" :key="n" class="dust" :style="dustStyle(n)"></i>
    </div>

    <!-- 顶部 Logo:牌叠 + "掼蛋" 金色金属渐变 -->
    <header class="logo">
      <div class="logo-cards" aria-hidden="true">
        <span class="card-layer card-back">A</span>
        <span class="card-layer card-mid">A</span>
        <span class="card-layer card-front">A</span>
      </div>
      <h1 class="logo-title">掼蛋</h1>
      <p class="logo-sub">无需服务器，同一热点即可开局（跨手机联机请用 Android App）</p>
    </header>

    <!-- 中部:主按钮 + 次级按钮 + 文字入口(按 UI 整改分级) -->
    <nav class="actions" aria-label="主菜单">
      <!-- ★ v0.4.28 P0-2:回到上次的牌局(24h 内) — 回访用户一键直达,减少重走建房/加入流程 -->
      <button
        v-if="lastGame"
        class="resume-banner"
        data-testid="home-resume-banner"
        @click="onResumeGame"
      >
        <span class="resume-spade" aria-hidden="true">♠</span>
        <span class="resume-text">
          <strong>{{ lastGame.role === 'host' ? '再开一桌' : '回到上次的牌局' }}</strong>
          <em>房间 {{ lastGame.roomNo }} · {{ lastGame.role === 'host' ? '你开的房' : '你加入的房' }}</em>
        </span>
        <span class="resume-arrow" aria-hidden="true">›</span>
      </button>

      <button
        class="glass-btn glass-btn-primary"
        data-testid="home-start-btn"
        @click="goHost"
      >
        <IconPlay class="glass-btn-icon" :size="22" aria-hidden="true" />
        <span class="glass-btn-text">开始游戏</span>
      </button>
      <p class="capability-hint" data-testid="home-capability-hint">
        {{ isNative ? '当前支持跨手机联机' : '当前为浏览器,创建的房间仅支持本机多标签联机;跨手机请用 Android App' }}
      </p>

      <div class="actions-row">
        <button
          class="glass-btn glass-btn-secondary"
          data-testid="home-join-btn"
          @click="goJoin"
        >
          <IconPhone class="glass-btn-icon" :size="20" aria-hidden="true" />
          <span class="glass-btn-text">加入房间</span>
        </button>
        <button
          class="glass-btn glass-btn-secondary"
          data-testid="home-ai-btn"
          @click="goAI"
        >
          <IconRobot class="glass-btn-icon" :size="20" aria-hidden="true" />
          <span class="glass-btn-text">AI 对战</span>
        </button>
      </div>

      <button
        class="glass-btn glass-btn-link"
        data-testid="home-rules-btn"
        @click="goGuide"
      >
        <span class="glass-btn-text">游戏规则</span>
      </button>
    </nav>

    <!-- 底部:左下齿轮设置 + 右下头像 + 昵称 -->
    <footer class="bottom-bar">
      <button
        class="gear-btn"
        :data-testid="'home-settings-btn'"
        title="设置"
        aria-label="设置"
        @click="onSettings"
      >
        <IconGear :size="22" aria-hidden="true" />
      </button>

      <button
        class="user-pill"
        :data-testid="'home-user-pill'"
        title="点击修改昵称 / 头像"
        @click="onEditNickname"
      >
        <span class="user-pill-avatar" aria-hidden="true">{{ myAvatar }}</span>
        <span class="user-pill-name">{{ myName || '未命名玩家' }}</span>
      </button>
    </footer>

    <!-- ★ v2.1 P1 被踢提示 -->
    <div v-if="kickedToast" class="kicked-toast">
      <IconBan class="kicked-icon" :size="18" aria-hidden="true" />
      <span class="kicked-text">{{ kickedToast }}</span>
      <button class="kicked-close" @click="kickedToast = ''" aria-label="关闭提示">
        <IconClose :size="16" aria-hidden="true" />
      </button>
    </div>

    <NicknameEditor
      v-if="showNickEditor"
      @close="showNickEditor = false"
      @confirm="onNickConfirm"
    />

    <!-- ★ v0.4.28 P0-1:首启引导 — 把“多标签联机”技术黑话换成 30 秒开局三步图卡 -->
    <div v-if="showOnboarding" class="onboard-mask" data-testid="home-onboarding">
      <div class="onboard-card">
        <div class="onboard-suits" aria-hidden="true"><i>♠</i><i class="red">♥</i><i>♣</i><i class="red">♦</i></div>
        <h2 class="onboard-title">30 秒，开一桌</h2>
        <p class="onboard-sub">无需服务器 · 不耗流量 · 同一热点即可</p>
        <ol class="onboard-steps">
          <li class="onboard-step">
            <span class="step-no">1</span>
            <span class="step-body"><strong>一人开热点</strong><em>手机开个人热点，或连同一个 WiFi</em></span>
          </li>
          <li class="onboard-step">
            <span class="step-no">2</span>
            <span class="step-body"><strong>朋友加入</strong><em>扫码或输入 IP / 房间号进房</em></span>
          </li>
          <li class="onboard-step">
            <span class="step-no">3</span>
            <span class="step-body"><strong>开打</strong><em>4 人齐了自动开局，边聊边玩</em></span>
          </li>
        </ol>
        <button class="onboard-cta" data-testid="home-onboard-cta" @click="onOnboardDone">马上开局</button>
        <button class="onboard-skip" @click="onOnboardDone">先看看</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import { isNativeCapacitor } from '@/common/ws-server.js'
import * as haptics from '@/common/haptics.js'
import NicknameEditor from '@/components/NicknameEditor.vue'
import IconPlay from '@/components/icons/IconPlay.vue'
import IconPhone from '@/components/icons/IconPhone.vue'
import IconRobot from '@/components/icons/IconRobot.vue'
import IconGear from '@/components/icons/IconGear.vue'
import IconBan from '@/components/icons/IconBan.vue'
import IconClose from '@/components/icons/IconClose.vue'
import IconBack from '@/components/icons/IconBack.vue'

const route = useRoute()
const router = useRouter()
const myName = ref('')
const myAvatar = ref('🀄')
const showNickEditor = ref(false)
const isNative = ref(false)
// ★ v0.4.28 P0-1/P0-2
const showOnboarding = ref(false)
const lastGame = ref(null)

// ★ v2.1 P1 host 主动踢人:被踢的 joiner 跳到 /?force_disconnected=1 → 首页弹提示
const kickedToast = ref('')
let kickedToastTimer = null

onMounted(() => {
  isNative.value = isNativeCapacitor()
  myName.value = storage.getNickname()
  myAvatar.value = storage.getAvatar()
  // ★ v0.4.28 P0-1:首启引导(仅未标记过时弹)
  try { if (!localStorage.getItem('guandan_onboarded')) showOnboarding.value = true } catch (e) {}
  // ★ v0.4.28 P0-2:读最后 24h 内的牌局记录 → 展示「回到上次的牌局」横幅
  const lg = storage.getLastGame()
  if (lg && lg.roomNo && (Date.now() - (lg.time || 0)) < 24 * 3600 * 1000) lastGame.value = lg
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

function onEditNickname() { haptics.click(); showNickEditor.value = true }
function onNickConfirm({ nickname, avatar }) {
  myName.value = nickname
  myAvatar.value = avatar
  showNickEditor.value = false
}
function onSettings() { haptics.click(); router.push('/settings') }
// ★ v0.4.28 P2-2:浮尘粒子样式 — 由 n 生成确定性伪随机(避免每次渲染拖动)
function dustStyle(n) {
  const rand = (seed) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  const size = (2 + rand(n + 150) * 3).toFixed(1)
  return {
    left: (rand(n) * 100).toFixed(1) + '%',
    width: size + 'px',
    height: size + 'px',
    animationDelay: (rand(n + 50) * 12).toFixed(1) + 's',
    animationDuration: (9 + rand(n + 100) * 10).toFixed(1) + 's',
  }
}
function goHost() { haptics.click(); router.push('/room?role=host') }
function goJoin() { haptics.click(); router.push('/join') }
function goAI() { haptics.click(); router.push('/ai') }
function goGuide() { haptics.click(); router.push('/guide') }
// ★ v0.4.28 P0-1:引导完成(CTA 或“先看看”)— 打标不再弹
function onOnboardDone() {
  haptics.click()
  showOnboarding.value = false
  try { localStorage.setItem('guandan_onboarded', '1') } catch (e) {}
}
// ★ v0.4.28 P0-2:回到上次的牌局 — host 重开一桌;joiner 带上 host 地址重进
function onResumeGame() {
  haptics.click()
  const lg = lastGame.value
  if (!lg) return goHost()
  if (lg.role === 'joiner' && lg.host) {
    router.push(`/room?role=joiner&roomNo=${lg.roomNo}&host=${encodeURIComponent(lg.host)}`)
  } else {
    router.push('/room?role=host')
  }
}
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

/* ★ v0.4.28 P2-2:金色浮尘 — 从底部缓缓上浮、轻微横移,营造光柱氛围 */
.dust-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.dust {
  position: absolute;
  bottom: -12px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.85), rgba(255, 215, 0, 0));
  opacity: 0;
  animation: dustFloat linear infinite;
}
@keyframes dustFloat {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  12%  { opacity: 0.65; }
  85%  { opacity: 0.4; }
  100% { transform: translateY(-105vh) translateX(28px); opacity: 0; }
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
  font-family: var(--font-display-cn);
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
  font-size: 14px;
  color: rgba(255, 255, 255, 0.70);
  letter-spacing: 1px;
  line-height: 1.5;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* ============================================================
 * 中部:分级按钮(主 / 次 / 文字)
 * ============================================================ */
.actions {
  width: 100%;
  max-width: min(460px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 40px;
}
.capability-hint {
  margin: -8px 0 0;
  padding: 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255,255,255,0.55);
  text-align: center;
}
.actions-row { display: flex; gap: 12px; }
.actions-row .glass-btn { flex: 1; }
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
/* 按钮层级:主按钮金色实心 / 次按钮半透明描边 / 文字按钮 */
.glass-btn-primary {
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  border-color: transparent;
  box-shadow: 0 8px 24px rgba(233, 173, 63, 0.26);
}
.glass-btn-primary .glass-btn-icon {
  background: rgba(58, 35, 8, 0.14);
  border-color: rgba(58, 35, 8, 0.25);
  color: #3a2308;
}
.glass-btn-primary:hover {
  background: linear-gradient(180deg, #fff6c0 0%, #ffdf70 42%, #e09e23 100%);
  box-shadow: 0 10px 28px rgba(233, 173, 63, 0.35);
}
.glass-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.96);
}
.glass-btn-secondary .glass-btn-icon {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.9);
}
.glass-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.22);
}
.glass-btn-link {
  height: auto;
  padding: 8px 0;
  background: transparent;
  border: none;
  box-shadow: none;
  color: rgba(255, 255, 255, 0.70);
  font-size: 15px;
  justify-content: center;
}
.glass-btn-link .glass-btn-text { text-align: center; }
.glass-btn-link:hover {
  background: transparent;
  color: rgba(255, 255, 255, 0.96);
  box-shadow: none;
  transform: none;
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
.glass-btn:not(.glass-btn-primary):not(.glass-btn-link):hover {
  border-color: var(--gold-bright);
  background: rgba(255, 255, 255, 0.14);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.45),
    0 0 16px rgba(255, 215, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}
.glass-btn:not(.glass-btn-primary):not(.glass-btn-link):hover .glass-btn-icon {
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
  max-width: min(460px, calc(100vw - 32px));
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

/* ============================================================
 * 横屏适配(手机横屏时把 Logo/按钮左右分栏,避免上下挤爆)
 * ============================================================ */
@media (orientation: landscape) and (max-height: 480px) {
  .page {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 32px;
    /* ★ v0.4.25 P1-15 修复:四值顺序 top right bottom left — bottom 应用 inset-bottom */
    padding: 16px 32px calc(16px + env(safe-area-inset-bottom, 0px)) calc(32px + env(safe-area-inset-left, 0px));
  }
  .logo {
    margin: 0;
    flex: 0 0 auto;
    max-width: 40vw;
  }
  .logo-cards { width: 96px; height: 64px; margin-bottom: 0; }
  .card-layer { width: 44px; height: 64px; font-size: 22px; }
  .card-back { left: 0; top: 2px; transform: rotate(-12deg); }
  .card-mid { left: 26px; top: 0; }
  .card-front { left: 52px; top: 2px; transform: rotate(12deg); }
  .logo-title { font-size: 42px; letter-spacing: 8px; }
  .logo-sub { font-size: 11px; text-align: center; }
  .actions {
    margin: 0;
    flex: 1 1 320px;
    max-width: 420px;
    gap: 12px;
  }
  .glass-btn { height: 52px; font-size: 18px; }
  .bottom-bar {
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 420px;
    margin: 0;
    z-index: 10;
  }
  .kicked-toast { top: 12px; }
}

/* ============================================================
 * ★ v0.4.28 P0-2:「回到上次的牌局」金色横幅
 * 金箔渐变底 + 黑桃水印,悬停微亮,与主 CTA 拉开层级(放在主按钮上方)
 * ============================================================ */
.resume-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px 18px;
  border-radius: 16px;
  border: 1.5px solid rgba(255, 215, 0, 0.55);
  background:
    linear-gradient(120deg, rgba(255, 215, 0, 0.16), rgba(255, 215, 0, 0.05) 55%, rgba(255, 215, 0, 0.14));
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  cursor: pointer;
  text-align: left;
  transition: transform var(--t-fast) var(--ease-out), box-shadow 200ms var(--ease-out), border-color 200ms var(--ease-out);
  animation: resumeIn 420ms var(--ease-spring) both;
}
.resume-banner:hover {
  transform: translateY(-2px);
  border-color: var(--gold-bright);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.4), 0 0 18px rgba(255, 215, 0, 0.28);
}
.resume-banner:active { transform: scale(0.98); }
.resume-spade {
  font-size: 26px;
  color: var(--gold-bright);
  text-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
  line-height: 1;
}
.resume-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.resume-text strong {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--gold-bright);
}
.resume-text em {
  font-style: normal;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.resume-arrow { font-size: 22px; color: var(--gold-primary); line-height: 1; }
@keyframes resumeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ============================================================
 * ★ v0.4.28 P0-1:首启引导图卡(30 秒开局三步)
 * 翡翠绿玻璃面板 + 金边 + 四花色装饰 + 金色序号圆点
 * ============================================================ */
.onboard-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 10, 8, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: onboardFade 280ms var(--ease-out) both;
}
@keyframes onboardFade { from { opacity: 0; } to { opacity: 1; } }
.onboard-card {
  width: 100%;
  max-width: 380px;
  padding: 28px 26px 22px;
  border-radius: 22px;
  border: 1.5px solid var(--gold-primary);
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(31, 122, 85, 0.55), rgba(10, 61, 44, 0.92) 60%),
    var(--emerald-deep);
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55), 0 0 40px rgba(212, 175, 55, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.14);
  text-align: center;
  animation: onboardPop 420ms var(--ease-spring) both;
}
@keyframes onboardPop {
  from { opacity: 0; transform: translateY(24px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.onboard-suits { display: flex; justify-content: center; gap: 14px; margin-bottom: 10px; }
.onboard-suits i {
  font-style: normal;
  font-size: 20px;
  color: var(--gold-bright);
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.45);
  animation: suitBob 2.4s ease-in-out infinite;
}
.onboard-suits i.red { color: #ff8a80; text-shadow: 0 0 10px rgba(229, 57, 53, 0.4); }
.onboard-suits i:nth-child(2) { animation-delay: 0.3s; }
.onboard-suits i:nth-child(3) { animation-delay: 0.6s; }
.onboard-suits i:nth-child(4) { animation-delay: 0.9s; }
@keyframes suitBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
.onboard-title {
  margin: 0 0 4px;
  font-family: var(--font-display-cn);
  font-size: 30px;
  font-weight: 900;
  letter-spacing: 4px;
  background: var(--gold-metallic);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.onboard-sub {
  margin: 0 0 20px;
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.6);
}
.onboard-steps { list-style: none; margin: 0 0 22px; padding: 0; display: flex; flex-direction: column; gap: 12px; text-align: left; }
.onboard-step {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.step-no {
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 900;
  color: #2a1d08;
  background: var(--gold-metallic);
  box-shadow: 0 2px 8px rgba(212, 175, 55, 0.4);
}
.step-body { display: flex; flex-direction: column; gap: 1px; }
.step-body strong { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: 1px; }
.step-body em { font-style: normal; font-size: 12px; color: rgba(255, 255, 255, 0.55); }
.onboard-cta {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 26px;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 3px;
  color: #3a2308;
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  box-shadow: 0 8px 22px rgba(233, 173, 63, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out), filter 160ms var(--ease-out);
}
.onboard-cta:hover { filter: brightness(1.06); }
.onboard-cta:active { transform: scale(0.98); }
.onboard-skip {
  margin-top: 10px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: color 160ms var(--ease-out);
}
.onboard-skip:hover { color: rgba(255, 255, 255, 0.85); }
</style>
