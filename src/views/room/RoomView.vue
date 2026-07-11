<!--
  RoomView.vue — v4.x 房间大厅大改版

  设计目标（UI-P1 阶段）:
    - 顶部信息一行展示，不再拥挤
    - 二维码/邀请改为弹窗，不常驻右上角
    - 空座位仅保留头像轮廓 + "等待加入"
    - 队友/对手用边框色区分；房主只保留皇冠徽章
    - 非核心入口（切牌）压缩，花色选择器/详情按钮收起
    - 按钮统一使用 app-theme 的 .app-btn-* 层级

  保留的网络/状态逻辑与 v3.x 一致。
-->
<template>
  <div class="page">
    <!-- 背景 -->
    <div class="bg-stars" aria-hidden="true">
      <span
        v-for="(s, i) in stars"
        :key="i"
        class="star"
        :style="{ top: s.top, left: s.left, width: s.size, height: s.size, opacity: s.opacity, animationDelay: s.delay + 's' }"
      ></span>
    </div>
    <div class="bg-felt" aria-hidden="true"></div>

    <!-- 顶部栏 -->
    <header class="room-header">
      <button class="header-menu" @click="showMenu" title="菜单" data-testid="menu-btn">≡</button>
      <div class="header-title">
        <span class="header-label">房间</span>
        <span class="header-roomno">{{ roomNo }}</span>
      </div>
      <div class="header-meta">
        <span class="net-status" :class="netStatusClass">{{ netStatus }}</span>
        <button class="header-more" @click="onEditMyInfo" title="编辑昵称" data-testid="edit-info-btn">⋯</button>
      </div>
    </header>

    <!-- 房间信息卡 -->
    <div class="info-card" data-testid="room-info-card">
      <div class="info-main">
        <div class="info-roomno">{{ roomNo }}</div>
        <div class="info-host-ip">
          <span class="info-host-label">{{ isHost ? '本机 IP' : '房间号' }}</span>
          <code class="info-host-value">{{ isHost ? formatHostAddr() : roomNo }}</code>
        </div>
      </div>
      <div class="info-side">
        <div class="info-count"><strong>{{ peers.size }}</strong>/4 人</div>
        <button class="info-copy-btn" @click="onCopyIp" title="复制" data-testid="copy-ip-btn">📋</button>
      </div>
    </div>

    <!-- 4 座位 -->
    <div class="seat seat-top" :class="seatClass(0)" data-testid="seat-top">
      <div class="seat-badge seat-badge-crown" aria-label="房主">👑</div>
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon">{{ getPeer(0)?.avatar || '🀄' }}</span>
          <div v-if="getPeer(0)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(0)?.nickname || '等待加入' }}</div>
      <button v-if="isSelfSeat(0)" class="seat-ready-btn" @click="onToggleReady" data-testid="seat-ready-btn-0">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
    </div>

    <div class="seat seat-left" :class="seatClass(1)" data-testid="seat-left">
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon">{{ getPeer(1)?.avatar || '' }}</span>
          <div v-if="getPeer(1)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(1)?.nickname || '等待加入' }}</div>
      <button v-if="isSelfSeat(1)" class="seat-ready-btn" @click="onToggleReady" data-testid="seat-ready-btn-1">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
      <button v-if="isHost && getPeer(1)" class="seat-kick" @click="onKickPlayer(1)" title="踢出房间" data-testid="kick-seat-1">✕</button>
    </div>

    <div class="seat seat-right" :class="seatClass(3)" data-testid="seat-right">
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon">{{ getPeer(3)?.avatar || '' }}</span>
          <div v-if="getPeer(3)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(3)?.nickname || '等待加入' }}</div>
      <button v-if="isSelfSeat(3)" class="seat-ready-btn" @click="onToggleReady" data-testid="seat-ready-btn-3">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
      <button v-if="isHost && getPeer(3)" class="seat-kick" @click="onKickPlayer(3)" title="踢出房间" data-testid="kick-seat-3">✕</button>
    </div>

    <div class="seat seat-bottom" :class="seatClass(2)" data-testid="seat-bottom">
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon">{{ getPeer(2)?.avatar || '' }}</span>
          <div v-if="getPeer(2)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(2)?.nickname || '等待加入' }}</div>
      <button v-if="isSelfSeat(2)" class="seat-ready-btn" @click="onToggleReady" data-testid="seat-ready-btn-2">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
      <button v-if="isHost && getPeer(2)" class="seat-swap" @click="onSwapWithTeammate" data-testid="swap-btn">换队友</button>
    </div>

    <!-- 底部操作 -->
    <div class="actions-row" data-testid="actions-row">
      <button class="app-btn app-btn-primary" @click="onToggleReady" data-testid="btn-start">
        <span class="btn-icon">▶</span>
        <span class="btn-text">{{ primaryBtnText }}</span>
      </button>
      <button class="app-btn app-btn-secondary" @click="openInvite" data-testid="btn-invite">
        <span class="btn-icon">🔗</span>
        <span class="btn-text">邀请好友</span>
      </button>
    </div>

    <!-- 切牌（保留但弱化） -->
    <div class="cut-card" @click="onCut" data-testid="cut-card">♠♦♣♥<br/><span class="cut-card-text">切牌</span></div>

    <NicknameEditor
      v-if="showNickEditor"
      @close="showNickEditor = false"
      @confirm="onNickConfirm"
    />

    <InviteDialog
      v-if="showInvite"
      :is-host="isHost"
      :room-no="roomNo"
      :host-ip="hostIp"
      :host-port="hostPort"
      :qr-data-url="qrDataUrl"
      @copied="onCopied"
      @close="showInvite = false"
    />

    <!-- 唯一 position: fixed 浮层 -->
    <div v-if="copyToast" class="copy-toast" role="status" data-testid="copy-toast">{{ copyToast }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import net from '@/common/network.js'
import WsServer, { isNativeCapacitor } from '@/common/ws-server.js'
import NicknameEditor from '@/components/NicknameEditor.vue'
import InviteDialog from '@/components/InviteDialog.vue'

const route = useRoute()
const router = useRouter()
const isHost = ref(route.query.role !== 'joiner')
const isNative = ref(false)
const hostIp = ref('')
const hostPort = ref(8848)
const qrDataUrl = ref('')
const qrLibOk = ref(true)

if (typeof window !== 'undefined') window.__gd_net = net

const disposers = []
function onNet(event, handler) {
  net.on(event, handler)
  disposers.push(() => {
    try { net.off(event, handler) } catch (e) { /* swallow */ }
  })
}
function cleanupRoomListeners() {
  while (disposers.length) {
    try { disposers.pop()() } catch (e) { /* swallow */ }
  }
}

function genStars() {
  const positions = [
    [8, 12, 2, 0.7, 0],
    [22, 38, 1.5, 0.55, 1.2],
    [5, 55, 2.5, 0.85, 2.4],
    [15, 78, 1.8, 0.6, 0.6],
    [28, 92, 2, 0.75, 1.8],
    [10, 18, 1.2, 0.5, 2.7],
    [25, 26, 2.2, 0.8, 3.5],
    [18, 62, 1.6, 0.6, 1.5],
    [30, 48, 2, 0.7, 0.3],
    [12, 85, 1.4, 0.55, 2.0],
    [6, 30, 1.8, 0.65, 3.0],
    [20, 70, 2.2, 0.85, 1.0],
    [3, 65, 1.5, 0.55, 2.2],
    [27, 8, 1.8, 0.7, 0.9],
  ]
  return positions.map(([top, left, size, opacity, delay]) => ({
    top: top + '%',
    left: left + '%',
    size: size + 'px',
    opacity,
    delay,
  }))
}
const stars = ref(genStars())

let QRCodeLib = null
async function ensureQrcodeLib() {
  if (QRCodeLib !== null) return QRCodeLib
  try {
    const mod = await import('qrcode')
    QRCodeLib = (mod && mod.default) || mod
    if (typeof QRCodeLib?.toDataURL !== 'function') {
      QRCodeLib = null
      qrLibOk.value = false
    }
  } catch (e) {
    QRCodeLib = null
    qrLibOk.value = false
  }
  return QRCodeLib
}

function pickRoomNo() {
  if (route.query.roomNo) return String(route.query.roomNo)
  if (isHost.value) {
    const saved = sessionStorage.getItem('guandan_host_room')
    if (saved) return saved
    const fresh = String(Math.floor(100000 + Math.random() * 900000))
    sessionStorage.setItem('guandan_host_room', fresh)
    return fresh
  }
  return String(Math.floor(100000 + Math.random() * 900000))
}
const roomNo = ref(pickRoomNo())
const myName = ref('')
const myAvatar = ref('🀄')
const myReady = ref(false)
const mySuit = ref(0)
const mySeat = ref(isHost.value ? 0 : null)
const showNickEditor = ref(false)
const showInvite = ref(false)
const netStatus = ref('⏺')
const peers = reactive(new Map())

const primaryBtnText = computed(() => {
  if (isHost.value) return '开始游戏'
  return myReady.value ? '取消准备' : '准备'
})
const netStatusClass = computed(() => {
  if (netStatus.value === '🟢') return 'net-ok'
  if (netStatus.value === '🔴') return 'net-bad'
  return 'net-pending'
})

async function generateQr() {
  if (!hostIp.value) return
  const lib = await ensureQrcodeLib()
  if (!lib) return
  const text = `ws://${hostIp.value}:${hostPort.value}`
  try {
    qrDataUrl.value = await lib.toDataURL(text, { width: 180, margin: 1 })
  } catch (e) {
    qrLibOk.value = false
  }
}

function getPeer(seat) { return peers.get(seat) }
function seatClass(idx) { return peers.has(idx) ? 'filled' : 'empty' }
function isSelfSeat(idx) { return idx === mySeat.value }
function formatHostAddr() {
  if (!hostIp.value) return '获取中...'
  return `${hostIp.value}:${hostPort.value}`
}

async function initNetwork() {
  onNet('connect', ({ seat, info }) => {
    netStatus.value = '🟢'
    if (seat != null && seat !== 0 && info) {
      peers.set(seat, { ...info, ready: false })
      if (!isHost.value) mySeat.value = seat
    }
  })
  onNet('error', (e) => {
    netStatus.value = '🔴'
    console.error('network error:', e)
  })
  onNet('peer:leave', ({ seat, reason }) => {
    if (seat == null) return
    peers.delete(seat)
    if (seat === 0) {
      const isMyself = (() => { try { return net.getSelfSeat && net.getSelfSeat() === 0 } catch { return false } })()
      if (isMyself) return
      cleanupRoomListeners()
      try { net.close() } catch (e) { /* swallow */ }
      router.push('/?force_disconnected=1&reason=' + encodeURIComponent('房主已退出,房间解散'))
    }
  })
  onNet('self:kicked', ({ reason }) => {
    cleanupRoomListeners()
    try { net.close() } catch (e) { /* swallow */ }
    router.push('/?force_disconnected=1' + (reason ? '&reason=' + encodeURIComponent(reason) : ''))
  })
  onNet('message:NICK_UPDATE', (payload, from) => {
    if (peers.has(from)) {
      const old = peers.get(from)
      peers.set(from, { ...old, ...payload })
    }
  })
  onNet('message:READY', (payload, from) => {
    // ★ LOGIC-14 修复:READY 消息必须来自已知 peer 且 payload 合法
    if (typeof payload?.ready !== 'boolean') return
    const hostSeat = (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hostSeat && !isHost.value) return
    if (peers.has(from)) {
      peers.set(from, { ...peers.get(from), ready: payload.ready })
      tryStartGame()
    }
  })
  onNet('message:SYNC', (payload, from) => {
    // ★ LOGIC-14 修复:SYNC 只能由 host 权威发出
    const hostSeat = (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hostSeat) return
    if (payload && payload.peers) {
      peers.clear()
      for (const [s, info] of payload.peers) peers.set(s, info)
      tryStartGame()
    }
  })
  onNet('message:GAME_START', (payload, from) => {
    // ★ LOGIC-14 修复:GAME_START 只能由 host 权威发出
    const hostSeat = (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hostSeat) return
    if (!isHost.value) {
      router.push('/game?roomNo=' + roomNo.value + '&role=joiner')
    }
  })
  onNet('peer:seat_swap', (payload) => {
    if (!payload) return
    const a = payload.a
    const b = payload.b
    if (typeof a !== 'number' || typeof b !== 'number') return
    try {
      const fresh = net.getPeers ? net.getPeers() : null
      if (fresh && fresh.get) {
        const infoA = fresh.get(a)
        const infoB = fresh.get(b)
        if (infoA) peers.set(b, infoA)
        else peers.delete(b)
        if (infoB) peers.set(a, infoB)
        else peers.delete(a)
      }
    } catch (e) { /* swallow */ }
    try {
      const netSelfSeat = net.getSelfSeat ? net.getSelfSeat() : null
      if (netSelfSeat != null && netSelfSeat >= 0 && netSelfSeat <= 3) {
        mySeat.value = netSelfSeat
        const me = peers.get(netSelfSeat)
        if (me) {
          if (me.name) myName.value = me.name
          if (me.avatar) myAvatar.value = me.avatar
          myReady.value = !!me.ready
        }
      }
    } catch (e) { /* swallow */ }
  })
  onNet('message:SEAT_SWAP', (payload) => {
    if (!payload || !Array.isArray(payload.between) || payload.between.length !== 2) return
    const [a, b] = payload.between
    if (a == null || b == null) return
    const infoA = peers.get(a)
    const infoB = peers.get(b)
    if (infoA) peers.set(b, infoA)
    if (infoB) peers.set(a, infoB)
  })

  if (isHost.value) {
    net.setRoomId(roomNo.value)
    const r = net.startAsHost({ nickname: myName.value, avatar: myAvatar.value })
    netStatus.value = r.ok ? '🟢' : '🔴'
    peers.set(0, { nickname: myName.value, avatar: myAvatar.value, ready: myReady.value })
    if (isNative.value) {
      try {
        const ipRes = await WsServer.getLocalIp()
        hostIp.value = ipRes?.ip || ''
        const t = net._getTransport && net._getTransport()
        if (t && typeof t.getBoundPort === 'function') hostPort.value = t.getBoundPort() || 8848
        await generateQr()
      } catch (e) {
        hostIp.value = '(获取失败)'
      }
    } else {
      hostIp.value = (typeof location !== 'undefined' && location.hostname) || '127.0.0.1'
      await generateQr()
    }
  } else {
    const hostParam = route.query.host ? String(route.query.host) : null
    if (hostParam) {
      const r = net.joinRemoteRoom(hostParam, { nickname: myName.value, avatar: myAvatar.value })
      netStatus.value = r.ok ? '🟢' : '🔴'
    } else {
      const r = net.joinRoom(route.query.roomNo || 'default', { nickname: myName.value, avatar: myAvatar.value })
      netStatus.value = r.ok ? '🟢' : '🔴'
    }
  }
}

onMounted(() => {
  myName.value = route.query.nick ? String(route.query.nick) : storage.getNickname()
  myAvatar.value = route.query.avatar ? String(route.query.avatar) : storage.getAvatar()
  isNative.value = isNativeCapacitor()
  initNetwork()
})
onUnmounted(() => {
  cleanupRoomListeners()
  if (_copyToastTimer) clearTimeout(_copyToastTimer)
})

function showMenu() {
  if (!confirm('退出房间?')) return
  cleanupRoomListeners()
  try { net.close(isHost.value ? { broadcast: true } : {}) } catch (e) { /* swallow */ }
  router.push('/')
}
function onEditMyInfo() { showNickEditor.value = true }
function onNickConfirm({ nickname, avatar }) {
  myName.value = nickname
  myAvatar.value = avatar
  showNickEditor.value = false
  net.broadcast({ type: 'NICK_UPDATE', payload: { nickname, avatar } })
}
function onCopyIp() {
  if (isHost.value && hostIp.value) {
    const text = `${hostIp.value}:${hostPort.value}`
    navigator.clipboard.writeText(text).then(
      () => showCopyToast(`已复制 ${text}`),
      () => showCopyToast(`复制失败,IP: ${text}`)
    )
  } else {
    navigator.clipboard.writeText(roomNo.value).then(
      () => showCopyToast(`已复制房间号: ${roomNo.value}`),
      () => showCopyToast(`房间号: ${roomNo.value}`)
    )
  }
}
function openInvite() { showInvite.value = true }

const copyToast = ref('')
let _copyToastTimer = null
function onCopied(text) {
  if (!text) return
  navigator.clipboard.writeText(text).then(
    () => showCopyToast(`已复制 ${text}`),
    () => showCopyToast(`复制失败,IP: ${text}`)
  )
}
function showCopyToast(msg) {
  copyToast.value = msg
  if (_copyToastTimer) clearTimeout(_copyToastTimer)
  _copyToastTimer = setTimeout(() => { copyToast.value = '' }, 1800)
}
function onToggleReady() {
  myReady.value = !myReady.value
  const myCurrentSeat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
  if (myCurrentSeat != null && peers.has(myCurrentSeat)) {
    peers.set(myCurrentSeat, { ...peers.get(myCurrentSeat), ready: myReady.value })
  }
  net.broadcast({ type: 'READY', payload: { ready: myReady.value } })
  tryStartGame()
}
function tryStartGame() {
  if (!isHost.value) return
  if (peers.size < 4) return
  const allReady = Array.from(peers.values()).every(p => p.ready)
  if (allReady) {
    net.broadcast({ type: 'GAME_START', payload: { roomNo: roomNo.value } })
    router.push('/game?roomNo=' + roomNo.value + '&role=host')
  }
}
function onSwapWithTeammate() {
  if (!peers.has(2)) return
  if (!confirm('和队友换座?')) return
  const r = net.swapSeats(0, 2)
  if (!r.ok) {
    console.warn('swapSeats 失败:', r.error)
    return
  }
  net.broadcast({ type: 'NICK_UPDATE', payload: { nickname: myName.value, avatar: myAvatar.value } })
}
function onCut() { alert('切牌完成') }
function onKickPlayer(seat) {
  if (!isHost.value) return
  if (seat !== 1 && seat !== 3) return
  const target = peers.get(seat)
  if (!target) return
  const nickname = target.nickname || `座位 ${seat}`
  if (!confirm(`确定要踢出 ${nickname} 吗?\n\n该玩家将立即断开连接。`)) return
  const r = net.kickPlayer(seat, 'kicked')
  if (!r || !r.ok) {
    console.warn('kickPlayer 失败:', r && r.error)
    return
  }
  peers.delete(seat)
}
</script>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: var(--bg-page, #071426);
  color: var(--text-primary, #fff);
  font: var(--font-body);
}

/* 背景层 — 更克制的深蓝 + 底部 felt */
.bg-stars {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.star {
  position: absolute;
  background: var(--room-star);
  border-radius: 50%;
  animation: star-twinkle 3.5s ease-in-out infinite;
}
@keyframes star-twinkle {
  0%, 100% { transform: scale(1); opacity: var(--tw-opacity, 0.7); }
  50%      { transform: scale(1.25); opacity: 1; }
}
.bg-felt {
  position: absolute;
  left: 50%;
  top: -78vh;
  width: 120vw;
  height: 140vh;
  min-width: 720px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--felt-base);
  background-image:
    radial-gradient(ellipse at 50% 38%, rgba(156, 184, 255, 0.36), transparent 28%),
    repeating-radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),
    radial-gradient(ellipse at 50% 42%, #7387ce 0%, #435690 44%, #2f3768 74%, #202548 100%);
  box-shadow:
    0 24px 0 18px rgba(110, 64, 36, 0.55),
    inset 0 -34px 72px rgba(0,0,0,0.42),
    inset 0 4px 16px rgba(255,255,255,0.12);
  z-index: 0;
  pointer-events: none;
}

/* 顶部栏 */
.room-header {
  position: absolute;
  top: max(16px, env(safe-area-inset-top, 0px) + 12px);
  left: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  z-index: 12;
}
.header-menu,
.header-more {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-menu:hover,
.header-more:hover { background: rgba(255,255,255,0.14); }
.header-menu:active,
.header-more:active { transform: scale(0.95); }
.header-title {
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}
.header-label {
  font-size: 14px;
  color: rgba(255,255,255,0.6);
}
.header-roomno {
  font: var(--font-display);
  color: var(--gold-bright);
  letter-spacing: 3px;
}
.header-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.net-status {
  font-size: 13px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.8);
}
.net-status.net-ok    { color: #6fdb6f; }
.net-status.net-bad   { color: #ff7e7e; }
.net-status.net-pending { color: #ffd56b; }

/* 房间信息卡 */
.info-card {
  position: absolute;
  left: 16px;
  right: 16px;
  top: max(72px, env(safe-area-inset-top, 0px) + 64px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: 14px 18px;
  box-shadow: var(--glass-shadow);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  z-index: 8;
  max-height: 80vh;
  overflow-y: auto;
}
.info-main { min-width: 0; }
.info-roomno {
  font: var(--font-display);
  color: var(--gold-bright);
  background: var(--gold-metallic);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.info-host-ip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
}
.info-host-label { color: rgba(255,255,255,0.55); font-size: 12px; }
.info-host-value {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 13px;
  background: rgba(255,255,255,0.1);
  padding: 3px 8px;
  border-radius: 6px;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.info-side {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.info-count {
  font-size: 13px;
  color: rgba(255,255,255,0.8);
}
.info-count strong {
  color: var(--gold-bright);
  font-weight: 800;
}
.info-copy-btn {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.info-copy-btn:hover { background: rgba(255,255,255,0.2); }

/* 4 座位 */
.seat {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 5;
  padding: 14px 16px 12px;
  background: rgba(3, 7, 20, 0.45);
  border: 1.5px solid rgba(255,255,255,0.12);
  border-radius: var(--radius-lg);
  min-width: 120px;
  transition: border-color 0.2s ease-out;
}
.seat.filled { border-color: rgba(255,255,255,0.22); }
.seat.empty {
  border-style: dashed;
  border-color: rgba(255,255,255,0.18);
}
.seat-top.filled { border-color: rgba(244, 196, 94, 0.45); }
.seat-bottom.filled { border-color: rgba(94, 156, 244, 0.55); }
.seat-left.filled,
.seat-right.filled { border-color: rgba(180, 94, 244, 0.55); }

.seat-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
}
.seat-badge-crown {
  font-size: 26px;
  filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.7));
}
.seat-avatar-wrap { position: relative; margin-top: 4px; }
.seat-avatar {
  position: relative;
  width: 68px;
  height: 68px;
  background: linear-gradient(135deg, #2a3a5e, #1a2a4e);
  border: 3px solid rgba(255,255,255,0.25);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease-out;
}
.seat.empty .seat-avatar {
  border-style: dashed;
  background: transparent;
  opacity: 0.55;
}
.seat-top.filled .seat-avatar {
  border-color: var(--gold-bright);
  box-shadow: 0 0 0 3px rgba(244, 196, 94, 0.25), 0 0 18px rgba(244, 196, 94, 0.25);
}
.seat-bottom.filled .seat-avatar {
  border-color: #5e9cf4;
  box-shadow: 0 0 0 3px rgba(94, 156, 244, 0.22);
}
.seat-left.filled .seat-avatar,
.seat-right.filled .seat-avatar {
  border-color: #b45ef4;
  box-shadow: 0 0 0 3px rgba(180, 94, 244, 0.22);
}
.seat-avatar .avatar-icon { font-size: 34px; line-height: 1; }
.seat.empty .seat-avatar .avatar-icon { font-size: 28px; opacity: 0.6; }
.seat-name {
  font-size: 14px;
  font-weight: 600;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  color: rgba(255,255,255,0.9);
}
.seat.empty .seat-name { color: rgba(255,255,255,0.55); }

.ready-mark {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 22px;
  height: 22px;
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: #fff;
  border-radius: 50%;
  font-size: 13px;
  font-weight: bold;
  border: 2px solid var(--bg-page, #071426);
  display: flex;
  align-items: center;
  justify-content: center;
}

.seat-ready-btn {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.1);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease-out;
}
.seat-ready-btn:hover { background: rgba(255,255,255,0.18); }

.seat-kick {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 24px;
  height: 24px;
  background: linear-gradient(180deg, #ff7e7e, #d4404a);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  z-index: 6;
  padding: 0;
}
.seat-kick:hover { transform: scale(1.1); }

.seat-swap {
  background: var(--gold-metallic);
  color: #1a1a00;
  font-size: 11px;
  font-weight: bold;
  padding: 4px 10px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
}
.seat-swap:hover { filter: brightness(1.1); }

/* 座位定位 — portrait 菱形 */
.seat-top {
  left: 50%;
  top: 210px;
  transform: translateX(-50%);
}
.seat-left {
  left: 16px;
  top: 350px;
}
.seat-right {
  right: 16px;
  top: 350px;
}
.seat-bottom {
  left: 50%;
  bottom: max(150px, calc(140px + env(safe-area-inset-bottom, 0px)));
  transform: translateX(-50%);
}

/* 底部操作 */
.actions-row {
  position: absolute;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom, 0px) + 12px);
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  width: calc(100% - 32px);
  max-width: 440px;
  z-index: 10;
}
.actions-row .app-btn {
  flex: 1;
  height: 52px;
  border-radius: var(--radius-pill);
  font: var(--font-button);
}

/* 切牌（弱化） */
.cut-card {
  position: absolute;
  right: 16px;
  bottom: max(86px, calc(76px + env(safe-area-inset-bottom, 0px)));
  width: 56px;
  height: 56px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 50%;
  color: rgba(255,255,255,0.7);
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  line-height: 1.1;
  text-align: center;
}
.cut-card:hover { border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.1); }
.cut-card:active { transform: scale(0.94); }
.cut-card-text {
  font-size: 9px;
  margin-top: 2px;
}

/* copy toast — 全局唯一 position: fixed */
.copy-toast {
  position: fixed;
  left: 50%;
  bottom: 110px;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.78);
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  padding: 8px 16px;
  border-radius: 18px;
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
  animation: copy-toast-fade 1.8s ease-in-out forwards;
}
@keyframes copy-toast-fade {
  0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
  10% { opacity: 1; transform: translateX(-50%) translateY(0); }
  85% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
}

/* 小屏切牌压缩 */
@media (max-width: 360px) {
  .cut-card {
    width: 60px;
    height: 60px;
    font-size: 14px;
    right: 8px;
    bottom: max(86px, calc(76px + env(safe-area-inset-bottom, 0px)));
  }
  .seat-avatar { width: 60px; height: 60px; }
  .seat-avatar .avatar-icon { font-size: 30px; }
  .seat { min-width: 110px; padding: 12px 14px 10px; }
  .info-card { padding: 12px 14px; }
  .info-roomno { font-size: 28px !important; }
}

/* landscape 横屏 */
@media (orientation: landscape) {
  .seat-top {
    left: 50%;
    top: 56px;
    transform: translateX(-50%);
  }
  .seat-bottom {
    left: 50%;
    bottom: 130px;
    transform: translateX(-50%);
  }
  .seat-left {
    left: 60px;
    top: 50%;
    transform: translateY(-50%);
  }
  .seat-right {
    right: 60px;
    top: 50%;
    transform: translateY(-50%);
  }
}

@media (orientation: landscape) {
  .info-card {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: 460px;
    width: min(460px, calc(100% - 32px));
  }
}

@media (orientation: landscape) {
  .cut-card {
    right: 30px;
    bottom: 100px;
  }
}
</style>
