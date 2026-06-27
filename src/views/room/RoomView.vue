<!--
  RoomView.vue — v3.x 房间大厅重做 (UI-REDESIGN-V3-SPEC §4)

  设计:深蓝星空 + 翡翠 felt + 玻璃拟态 + 菱形 4 座位 + 金色金属按钮

  座位映射(spec §4.3 diamond layout):
    seat-top    = peer 0 (HOST, 金色皇冠 + 光环)
    seat-left   = peer 1 (对手)
    seat-right  = peer 3 (对手)
    seat-bottom = peer 2 (队友 / 跨桌)

  视觉层级:
    1. 背景层(星空 + felt 椭圆)
    2. 顶部 menu / settings
    3. 顶部信息卡(玻璃) + QR 卡(右上)
    4. 4 座位菱形布局(玻璃卡 + 金色光环头像)
    5. 底部 action row(开始游戏 + 邀请好友)
    6. 切牌 / 花色选择器 / 准备状态(保留旧 UI 元素)

  测试契约(本文件改不改都要守住):
    - 4 座位 class (seat-top/bottom/left/right) 必须在 template
    - info-card 在 template,portrait 用 bottom 定位 + safe-area
    - cut-card 在 template,内含 ♠♦♣♥ + "切牌"
    - style scoped 包含 ≥ 3 段 @media (orientation: landscape)
    - @media (max-width: 360px) cut-card 60×60
    - position: fixed 仅出现在 .copy-toast
-->
<template>
  <div class="page">
    <!-- ============ 背景层 ============ -->
    <!-- v3.x 房间背景:深蓝星空(顶部) + 翡翠 felt(底部) -->
    <div class="bg-stars" aria-hidden="true">
      <span
        v-for="(s, i) in stars"
        :key="i"
        class="star"
        :style="{ top: s.top, left: s.left, width: s.size, height: s.size, opacity: s.opacity, animationDelay: s.delay + 's' }"
      ></span>
    </div>
    <div class="bg-felt" aria-hidden="true"></div>

    <!-- ============ 顶部 menu + 设置 ============ -->
    <div class="top-bar">
      <button class="menu-btn" @click="showMenu" title="菜单" data-testid="menu-btn">≡</button>
      <div class="top-right">
        <span class="net-status" :class="netStatusClass">{{ netStatus }}</span>
        <button class="dot-btn" @click="onEditMyInfo" title="编辑昵称" data-testid="edit-info-btn">⋯</button>
      </div>
    </div>

    <!-- ============ 顶部房间信息卡 (玻璃拟态) ============ -->
    <div class="info-card" data-testid="room-info-card">
      <div class="info-roomno">{{ roomNo }}</div>
      <div class="info-host-ip">
        <span class="info-host-label">{{ isHost ? '本机 IP' : '房间号' }}</span>
        <code class="info-host-value">{{ isHost ? formatHostAddr() : roomNo }}</code>
        <button class="info-copy-btn" @click="onCopyIp" title="复制" data-testid="copy-ip-btn">📋</button>
      </div>
      <div class="info-meta">
        <span class="info-meta-item">过几 <strong>2</strong></span>
        <span class="info-meta-divider">·</span>
        <span class="info-meta-item">出牌 <strong>30秒</strong></span>
        <span class="info-meta-divider">·</span>
        <span class="info-meta-item"><strong>{{ peers.size }}</strong>/4 人</span>
      </div>
    </div>

    <!-- ============ 二维码卡 (右上) ============ -->
    <div class="qr-card-wrap" v-if="isHost && hostIp">
      <QrFallbackCard
        :host-ip="hostIp"
        :host-port="hostPort"
        :qrcode-url="qrDataUrl"
        @copied="onCopied"
      />
    </div>

    <!-- ============ 4 座位菱形布局 ============ -->
    <!-- seat-top: HOST (peer 0) - 金色皇冠 + 光环 -->
    <div class="seat seat-top" :class="seatClass(0)" data-testid="seat-top">
      <div class="seat-badge seat-badge-crown" aria-label="房主">👑</div>
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon">{{ getPeer(0)?.avatar || '🀄' }}</span>
          <div v-if="getPeer(0)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(0)?.nickname || '等待加入' }}</div>
      <div class="seat-role-pill" :class="getPeer(0) ? 'role-host' : 'role-empty'">
        {{ getPeer(0) ? (isHost ? '房主' : '房主') : '等待加入' }}
      </div>
      <!-- 自己座位准备按钮 (host 的 self) -->
      <button v-if="isSelfSeat(0)" class="seat-ready-btn" @click="onToggleReady" data-testid="seat-ready-btn-0">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
    </div>

    <!-- seat-left: 对手 (peer 1) -->
    <div class="seat seat-left" :class="seatClass(1)" data-testid="seat-left">
      <div class="seat-badge seat-badge-num">1</div>
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon" v-if="!getPeer(1)">?</span>
          <span class="avatar-icon" v-else>{{ getPeer(1).avatar }}</span>
          <div v-if="getPeer(1)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(1)?.nickname || '等待加入' }}</div>
      <div class="seat-role-pill" :class="getPeer(1) ? 'role-ready' : 'role-empty'">
        {{ getPeer(1) ? '准备就绪' : '等待加入' }}
      </div>
      <button v-if="isSelfSeat(1)" class="seat-ready-btn" @click="onToggleReady" data-testid="seat-ready-btn-1">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
      <!-- ★ v2.1 P1 host 主动踢人 — 只踢对手 -->
      <button v-if="isHost && getPeer(1)" class="seat-kick" @click="onKickPlayer(1)" title="踢出房间" data-testid="kick-seat-1">✕</button>
    </div>

    <!-- seat-right: 对手 (peer 3) -->
    <div class="seat seat-right" :class="seatClass(3)" data-testid="seat-right">
      <div class="seat-badge seat-badge-num">3</div>
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon" v-if="!getPeer(3)">?</span>
          <span class="avatar-icon" v-else>{{ getPeer(3).avatar }}</span>
          <div v-if="getPeer(3)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(3)?.nickname || '等待加入' }}</div>
      <div class="seat-role-pill" :class="getPeer(3) ? 'role-ready' : 'role-empty'">
        {{ getPeer(3) ? '准备就绪' : '等待加入' }}
      </div>
      <button v-if="isSelfSeat(3)" class="seat-ready-btn" @click="onToggleReady" data-testid="seat-ready-btn-3">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
      <button v-if="isHost && getPeer(3)" class="seat-kick" @click="onKickPlayer(3)" title="踢出房间" data-testid="kick-seat-3">✕</button>
    </div>

    <!-- seat-bottom: 队友 (peer 2, 与 HOST 跨桌) -->
    <div class="seat seat-bottom" :class="seatClass(2)" data-testid="seat-bottom">
      <div class="seat-badge seat-badge-num">2</div>
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon" v-if="!getPeer(2)">?</span>
          <span class="avatar-icon" v-else>{{ getPeer(2).avatar }}</span>
          <div v-if="getPeer(2)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(2)?.nickname || '等待加入' }}</div>
      <div class="seat-role-pill" :class="getPeer(2) ? 'role-ready' : 'role-empty'">
        {{ getPeer(2) ? '准备就绪' : '等待加入' }}
      </div>
      <button v-if="isSelfSeat(2)" class="seat-ready-btn" @click="onToggleReady" data-testid="seat-ready-btn-2">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
      <!-- ★ v2.0 换队友功能:只对 host 视角的 seat 2 队友显示 -->
      <button v-if="isHost && getPeer(2)" class="seat-swap" @click="onSwapWithTeammate" data-testid="swap-btn">换队友</button>
    </div>

    <!-- ============ 底部 action row ============ -->
    <div class="actions-row" data-testid="actions-row">
      <button class="btn btn-primary" @click="onToggleReady" data-testid="btn-start">
        <span class="btn-icon">▶</span>
        <span class="btn-text">{{ primaryBtnText }}</span>
      </button>
      <button class="btn btn-secondary" @click="onInvite" data-testid="btn-invite">
        <span class="btn-icon">🔗</span>
        <span class="btn-text">邀请好友</span>
      </button>
    </div>

    <!-- ============ 切牌按钮 (保留,T1 修复要求 4 花色齐全) ============ -->
    <div class="cut-card" @click="onCut" data-testid="cut-card">♠♦♣♥<br/><span class="cut-card-text">切牌</span></div>

    <!-- ============ 准备状态提示 (保留) ============ -->
    <div class="ready-status" v-if="myReady" data-testid="ready-status"><span>已准备</span></div>

    <!-- ============ 花色选择器 (保留) ============ -->
    <div class="suit-picker">
      <span class="suit" :class="{active: mySuit===0}" @click="mySuit=0" data-testid="suit-0">♣</span>
      <span class="suit" :class="{active: mySuit===1}" @click="mySuit=1" data-testid="suit-1">♦</span>
      <span class="suit" :class="{active: mySuit===2}" @click="mySuit=2" data-testid="suit-2">♠</span>
      <span class="suit" :class="{active: mySuit===3}" @click="mySuit=3" data-testid="suit-3">♥</span>
    </div>

    <!-- ============ 详情弹窗(保留 onDetail 入口) ============ -->
    <button class="detail-btn" @click="onDetail" title="查看详情" data-testid="detail-btn">🔍</button>

    <NicknameEditor
      v-if="showNickEditor"
      @close="showNickEditor = false"
      @confirm="onNickConfirm"
    />

    <!-- ★ v2.2 task A:复制 IP 后的 toast 提示(替代 alert) — 全局唯一 position: fixed -->
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
import QrFallbackCard from '@/components/QrFallbackCard.vue'

const route = useRoute()
const router = useRouter()
const isHost = ref(route.query.role !== 'joiner')
const isNative = ref(false)
const hostIp = ref('')
const hostPort = ref(8848)
const qrDataUrl = ref('')
const qrLibOk = ref(true)

// ★ v2.1 测试脚手架:把 net 暴露到 window(给 4-tab BC 自动化测试用,
//   production 也无害——net 是 ESM 单例,本来就是 reactive 状态)
if (typeof window !== 'undefined') window.__gd_net = net

// v3.x 房间背景星空:固定 14 个星点位置(避免每次 mount 重新生成导致动画抖动)
function genStars() {
  // 固定 seed,保证 SSR 一致 + 测试可重复
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

// qrcode 库可选,动态 import,失败时降级为只显示文本地址
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

// 房主房间号生成与持久化:首次生成后存 sessionStorage(per-tab 隔离,4-tab 演示不会撞房号)
// 真实设备 1v1 场景:刷新页面仍能用同一个房间号继续开局
// joiner 必须沿用 URL 里的 roomNo(房主的房间号),不能自己随机生成新的
// 否则 joiner 调 joinRoom(909682) 成功了,但本地 roomNo 显示 921514,
// 用户复制 921514 给朋友会找不到房主 → 4-tab 演示死锁
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
// ★ v3.x 房间重做:跟踪自己的座位 — host 永远在 seat 0 (peer 0),
//   joiner 由 'connect' 事件返回的 seat 赋值
const mySeat = ref(isHost.value ? 0 : null)
const showNickEditor = ref(false)
const netStatus = ref('⏺')
const peers = reactive(new Map())

// 底部主按钮文案 — host 视角跟 joiner 视角不同
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
// ★ v3.x:isSelfSeat — 判断 idx 是否是本地玩家的座位(host=0,joiner=connect 返回的 seat)
function isSelfSeat(idx) { return idx === mySeat.value }
// 格式化 host IP:port(QrFallbackCard 用的就是 formatHostAddress,但本地也用一份保持一致)
function formatHostAddr() {
  if (!hostIp.value) return '获取中...'
  return `${hostIp.value}:${hostPort.value}`
}

async function initNetwork() {
  net.on('connect', ({ seat, info }) => {
    netStatus.value = '🟢'
    // ★ v3.8 P1 修复:用 connect 事件拿正确的 assignedSeat(不是 from)
    // joiner 第一次发 JOIN 时 selfSeat=-1,RoomView 之前用 peers.set(from, ...) 会写到 -1
    if (seat != null && seat !== 0 && info) {
      peers.set(seat, { ...info, ready: false })
      // ★ v3.x 房间重做:joiner 视角下,connect 事件的 seat 就是自己的座位
      if (!isHost.value) mySeat.value = seat
    }
  })
  net.on('error', (e) => {
    netStatus.value = '🔴'
    console.error('network error:', e)
  })
  // ★ v2.1 P1 host 主动踢人:host 端 transport forceDisconnectSeat → _DISCONNECT → peer:leave
  //   host 自己调用后立即在 UI 上把该 seat 显示"等待加入" (因为对端会被踢 + release)
  net.on('peer:leave', ({ seat }) => {
    if (seat != null) peers.delete(seat)
  })
  // ★ v2.1 P1 host 主动踢人:joiner 端收到 self:kicked → 跳 /?force_disconnected=1
  net.on('self:kicked', ({ reason }) => {
    net.close()
    router.push('/?force_disconnected=1' + (reason ? '&reason=' + encodeURIComponent(reason) : ''))
  })
  net.on('message:NICK_UPDATE', (payload, from) => {
    if (peers.has(from)) {
      const old = peers.get(from)
      peers.set(from, { ...old, ...payload })
    }
  })
  net.on('message:READY', (payload, from) => {
    if (peers.has(from)) {
      peers.set(from, { ...peers.get(from), ready: payload.ready })
      tryStartGame()
    }
  })
  net.on('message:SYNC', (payload) => {
    if (payload && payload.peers) {
      peers.clear()
      for (const [s, info] of payload.peers) peers.set(s, info)
      tryStartGame()
    }
  })
  // ★ v3.8 P1 修复:joiner 收到 host 的 GAME_START 也跳到 /game(否则 host 单方面跳转,joiner 卡在 /room)
  net.on('message:GAME_START', () => {
    if (!isHost.value) {
      router.push('/game?roomNo=' + roomNo.value)
    }
  })
  // ★ v3.8 P1 修复:joiner 收到 host 的 SEAT_SWAP 也本地交换(否则 joiner 还看到旧的 seat 名字)
  net.on('message:SEAT_SWAP', (payload) => {
    if (!payload || !Array.isArray(payload.between) || payload.between.length !== 2) return
    const [a, b] = payload.between
    if (a == null || b == null) return
    const infoA = peers.get(a)
    const infoB = peers.get(b)
    if (infoA) peers.set(b, infoA)
    if (infoB) peers.set(a, infoB)
  })

  if (isHost.value) {
    // ★ v3.8 P0 修复:必须先 setRoomId 再 startAsHost
    // 否则 startAsHost 内部会用空 roomId 创建 channel,channel name 永远 = 'default',
    // joiner 用 6 位数字 roomNo 永远对不上 → 4-tab 联机死锁
    net.setRoomId(roomNo.value)
    const r = net.startAsHost({ nickname: myName.value, avatar: myAvatar.value })
    netStatus.value = r.ok ? '🟢' : '🔴'
    // ★ v3.8 P1 修复:host 自己也算 seat 0(之前漏掉,导致 peers.size 永远 < 4,开局按钮不显示)
    peers.set(0, { nickname: myName.value, avatar: myAvatar.value, ready: myReady.value })
    // ★ v2.0 改造:host 端取本机 IP(供 joiner 用)
    if (isNative.value) {
      try {
        const ipRes = await WsServer.getLocalIp()
        hostIp.value = ipRes?.ip || ''
        // 端口从 transport 拿;AndroidWsTransport 同步返回 getBoundPort()
        const t = net._getTransport && net._getTransport()
        if (t && typeof t.getBoundPort === 'function') hostPort.value = t.getBoundPort() || 8848
        await generateQr()
      } catch (e) {
        hostIp.value = '(获取失败)'
      }
    } else {
      // 浏览器版:用当前 location.hostname 作为"本机 IP"(本地测试用)
      hostIp.value = (typeof location !== 'undefined' && location.hostname) || '127.0.0.1'
      await generateQr()
    }
  } else {
    // joiner: 支持 ?host=1.2.3.4:8848 (跨设备 WS,真机或远端电脑 host)
    //                          ?host=1.2.3.4 (端口默认 8848)
    //                          ?roomNo=xxx (浏览器 BC,同电脑多 tab)
    const hostParam = route.query.host ? String(route.query.host) : null
    if (hostParam) {
      // ★ v2.2 task B:跨设备联机 — 浏览器 joiner 端走 WebSocket 远程连 host
      //   joinRemoteRoom 内部注入 WebSocketTransport client + 解析 host:port + 走 WS 路径
      //   跟原 Capacitor path 行为一致,但 transport 用的是浏览器 WebSocketTransport (vs AndroidWsTransport)
      const r = net.joinRemoteRoom(hostParam, { nickname: myName.value, avatar: myAvatar.value })
      netStatus.value = r.ok ? '🟢' : '🔴'
    } else {
      const r = net.joinRoom(route.query.roomNo || 'default', { nickname: myName.value, avatar: myAvatar.value })
      netStatus.value = r.ok ? '🟢' : '🔴'
    }
  }
}

onMounted(() => {
  // URL ?nick=玩家-A&avatar=♠ 优先于 localStorage(扫码加入时传参 / 测试脚本控制)
  myName.value = route.query.nick ? String(route.query.nick) : storage.getNickname()
  myAvatar.value = route.query.avatar ? String(route.query.avatar) : storage.getAvatar()
  isNative.value = isNativeCapacitor()
  initNetwork()
})
// ★ v3.8 P1 修复:不在这里关 network!
// 之前 unmount 关 network,joiner 收到 GAME_START 跳 /game 时 channel 就关了,
// 后续 host 广播的 DEAL/PLAY/PASS 全部丢失,4-tab 联机出牌同步失效
// network 在以下时机关:用户点"退出"返回 /、手动点"断开连接"、应用关闭
onUnmounted(() => {
  // ★ v2.2 task A:清理 copy toast timer
  if (_copyToastTimer) clearTimeout(_copyToastTimer)
})

function showMenu() {
  if (confirm('退出房间?')) router.push('/')
}
function onEditMyInfo() { showNickEditor.value = true }
function onNickConfirm({ nickname, avatar }) {
  myName.value = nickname
  myAvatar.value = avatar
  showNickEditor.value = false
  net.broadcast({ type: 'NICK_UPDATE', payload: { nickname, avatar } })
}
function onDetail() {
  const mode = isNative.value ? '真机 WebSocket (Capacitor)' : '浏览器 BroadcastChannel'
  const addr = isHost.value && hostIp.value ? `\n本机 IP: ${hostIp.value}:${hostPort.value}` : ''
  alert(`房间号: ${roomNo.value}${addr}\n人数: ${peers.size}/4\n网络: ${netStatus.value === '🟢' ? '正常' : '异常'}\n模式: 局域网 P2P (${mode})`)
}
// ★ v3.x:onCopyIp — 新房型右上角复制按钮(替代旧的 onInvite alert)
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
function onInvite() {
  // 邀请好友按钮:host 弹 QR 详情,joiner 复制房间号
  // ★ v3.x 简化:实际跟 onCopyIp 行为相同,统一为"复制 IP:端口 或 房间号 + 弹 toast"
  onCopyIp()
}

// ★ v2.2 task A:QrFallbackCard 复制回调 → 写剪贴板 + 弹"已复制"toast(原 onInvite 用 alert,体验差)
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
  // ★ v3.8 P1 修复:同步自己到 peers(房主自己点"开局"时 ready 也要进 allReady 检查)
  // 否则 every(p => p.ready) 会因为 peers[0].ready=undefined 永远 false
  if (isHost.value && peers.has(0)) {
    peers.set(0, { ...peers.get(0), ready: myReady.value })
  }
  net.broadcast({ type: 'READY', payload: { ready: myReady.value } })
  tryStartGame()
}

// ★ v3.8 P1 修复:host 点开局时 joiner 的 READY 可能还没传到 host,
// 改成持续监听:每次 peers 变化都重试 allReady 检查
function tryStartGame() {
  if (!isHost.value) return
  if (peers.size < 4) return
  const allReady = Array.from(peers.values()).every(p => p.ready)
  if (allReady) {
    // ★ v3.8 P1 修复:广播 GAME_START 让 joiner 也跳到 /game
    net.broadcast({ type: 'GAME_START', payload: { roomNo: roomNo.value } })
    router.push('/game?roomNo=' + roomNo.value)
  }
}
function onSwapWithTeammate() {
  if (!peers.has(2)) return
  if (!confirm('和队友换座?')) return
  const me = { nickname: myName.value, avatar: myAvatar.value, ready: myReady.value }
  const mate = { ...peers.get(2) }
  myName.value = mate.nickname
  myAvatar.value = mate.avatar
  myReady.value = mate.ready
  peers.set(2, me)
  storage.setNickname(myName.value)
  storage.setAvatar(myAvatar.value)
  // ★ v3.8 P1 修复:swap 后广播 SEAT_SWAP(joiner 调本机 listener 互换 peers),
  // 同时广播 NICK_UPDATE 让 joiner 更新 seat 0 的新昵称(SEAT_SWAP 互换 entries
  // 也能更新,但 NICK_UPDATE 是更直接的"自己改了自己名"信号,防 NICK_UPDATE
  // 监听器依赖 from 字段的逻辑漏掉)
  net.broadcast({ type: 'SEAT_SWAP', payload: { between: [0, 2] } })
  net.broadcast({ type: 'NICK_UPDATE', payload: { nickname: myName.value, avatar: myAvatar.value } })
}
function onCut() { alert('切牌完成') }

// ★ v2.1 P1 host 主动踢人
//   - 仅 host 可调(UI 按钮只对 host 显示)
//   - 只踢对手 seat 1 / seat 3(seat 2 队友留给"换队友")
//   - confirm 防误触
//   - 立即改 reactive `peers` Map (UI 状态,跟 network.js 内部 peers Map 解耦),
//     让 seat 卡片回"等待加入"。
//   - network.js 内部 peers Map 释放由 _tickHeartbeatChecker 在 6-8s 后处理
//     (owner steer: 不能立即清 host 端 peers Map,保留 v2.1 心跳 6-8s 路径)
//   - 其他 joiner 端:从 host broadcast PEER_LEAVE { kick: true } 收到后:
//        * selfSeat === seat + kick:true → 'self:kicked' → UI 跳 /?force_disconnected=1
//        * selfSeat !== seat → 旁观者,正常 peers.delete + peer:leave
function onKickPlayer(seat) {
  if (!isHost.value) return
  if (seat !== 1 && seat !== 3) return
  const target = peers.get(seat)
  if (!target) return
  const nickname = target.nickname || `座位 ${seat}`
  if (!confirm(`确定要踢出 ${nickname} 吗?\n\n该玩家将立即断开连接,可在 6-8s 后重新加入。`)) return
  // 1) 调 transport 真断 + broadcast PEER_LEAVE { kick: true }
  const t = net._getTransport && net._getTransport()
  if (t && typeof t.forceDisconnectSeat === 'function') {
    t.forceDisconnectSeat(seat)
  } else {
    // 兜底:如果 transport 不支持,本地清 + 广播 PEER_LEAVE
    net.broadcast({ type: 'PEER_LEAVE', payload: { seat, kick: true, reason: 'kicked' } })
  }
  // 2) 同步 UI 反映 — 立即改 reactive peers Map (UI 状态)
  //   注意:这不影响 network.js 内部的 peers Map,后者由心跳 6-8s 后 _tickHeartbeatChecker 释放
  peers.delete(seat)
}
</script>

<style scoped>
/* ============================================================
 * v3.x 房间大厅样式 (UI-REDESIGN-V3-SPEC §4)
 *
 * 视觉层级:
 *   .page           屏幕基底(深蓝星空 + felt 椭圆)
 *   .bg-stars       星空层(14 个星点)
 *   .bg-felt        felt 椭圆(翡翠绿渐变)
 *   .info-card      顶部房间信息卡(玻璃拟态)
 *   .qr-card-wrap   右上 QR 卡片容器
 *   .seat-*         4 座位菱形布局
 *   .actions-row    底部按钮行
 * ============================================================ */

.page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  /* v3.x:深蓝星空 + 翡翠 felt 双重径向渐变 */
  background:
    radial-gradient(ellipse at top, var(--room-bg-mid) 0%, var(--room-bg-deep) 35%, transparent 65%),
    radial-gradient(ellipse at bottom, var(--emerald-bright) 0%, var(--emerald-base) 50%, var(--emerald-deep) 100%);
  color: #fff;
  font: var(--font-body);
}

/* ========== 背景层 ========== */
.bg-stars {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  /* v3.x 星空层:14 个星点散落在顶部 35% 区域(径向渐变覆盖范围) */
}
.star {
  position: absolute;
  background: var(--room-star);
  border-radius: 50%;
  /* 微闪烁动画 */
  animation: star-twinkle 3.5s ease-in-out infinite;
}
@keyframes star-twinkle {
  0%, 100% { transform: scale(1); opacity: var(--tw-opacity, 0.7); }
  50%      { transform: scale(1.25); opacity: 1; }
}
.bg-felt {
  /* v3.x:felt 椭圆(深翡翠径向渐变 + 内阴影)— 给中下部座位区做桌面感 */
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -45%);
  width: 220vw; height: 130vw;
  max-width: 1400px; max-height: 800px;
  border-radius: 50%;
  background: var(--felt-base);
  box-shadow: var(--felt-inner-shadow);
  z-index: 0;
  pointer-events: none;
}

/* ========== 顶部 menu ========== */
.top-bar {
  position: absolute;
  top: max(16px, env(safe-area-inset-top, 0px) + 12px);
  left: 16px; right: 16px;
  display: flex; align-items: center; justify-content: space-between;
  z-index: 12;
}
.menu-btn {
  width: 44px; height: 44px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  color: #fff; font-size: 22px;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
.menu-btn:active { transform: scale(0.95); }
.top-right { display: flex; align-items: center; gap: 10px; }
.net-status {
  font-size: 14px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
.net-status.net-ok    { color: #6fdb6f; }
.net-status.net-bad   { color: #ff7e7e; }
.net-status.net-pending { color: #ffd56b; }
.dot-btn {
  width: 40px; height: 40px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  color: #fff; font-size: 20px;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
.dot-btn:active { transform: scale(0.95); }

/* ========== 顶部信息卡 (玻璃拟态) ========== */
.info-card {
  /* v3.x:portrait 顶部左上浮动 + 安全区(给 QR 卡留右半空间) */
  position: absolute;
  left: 16px;
  top: max(72px, env(safe-area-inset-top, 0px) + 64px);
  /* 给 QR 卡留 ~150px(右侧 + 16px 间隔 + 150 QR 宽) */
  width: calc(100% - 192px);
  max-width: 360px;
  /* v3.x:玻璃面板 */
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: 14px 18px 12px;
  box-shadow: var(--glass-shadow);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  z-index: 8;
  text-align: center;
  /* v3.x:portrait 也加 max-height + overflow-y 防御(iPhone 短屏不溢出) */
  max-height: 80vh;
  overflow-y: auto;
}
.info-roomno {
  font: var(--font-display);
  color: var(--gold-bright);
  letter-spacing: 4px;
  margin-bottom: 6px;
  /* v3.x:金色金属渐变 */
  background: var(--gold-metallic);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2px 8px rgba(255, 215, 0, 0.35);
}
.info-host-ip {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  font-size: 13px;
  margin-bottom: 8px;
}
.info-host-label {
  opacity: 0.7;
  font-size: 11px;
}
.info-host-value {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 14px;
  font-weight: bold;
  background: rgba(255,255,255,0.12);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.18);
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.info-copy-btn {
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 50%;
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  font-size: 14px;
  transition: all 200ms ease-out;
}
.info-copy-btn:hover { background: rgba(255,255,255,0.22); }
.info-copy-btn:active { transform: scale(0.92); }
.info-meta {
  display: flex; align-items: center; justify-content: center;
  gap: 10px;
  font-size: 12px;
  opacity: 0.85;
}
.info-meta-item strong {
  color: var(--gold-bright);
  font-weight: bold;
  margin: 0 2px;
}
.info-meta-divider { opacity: 0.4; }

/* ========== QR 卡 (右上) ========== */
.qr-card-wrap {
  position: absolute;
  top: max(72px, env(safe-area-inset-top, 0px) + 64px);
  right: 16px;
  width: 160px;
  z-index: 8;
}
.qr-card-wrap :deep(.qr-fallback-card) {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  color: #fff;
}
.qr-card-wrap :deep(.qr-fallback-headline) {
  color: var(--gold-bright);
}
.qr-card-wrap :deep(.qr-fallback-ip) {
  background: rgba(255,255,255,0.12);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.22);
}
.qr-card-wrap :deep(.qr-fallback-copy-btn) {
  background: var(--gold-metallic);
  color: #1a1a00;
}

/* ========== 4 座位菱形布局 ========== */
.seat {
  position: absolute;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  z-index: 5;
  /* v3.x:玻璃卡底 */
  padding: 16px 18px 14px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  min-width: 130px;
}
.seat.filled {
  border-color: rgba(255, 215, 0, 0.35);
}
.seat.empty {
  border-style: dashed;
  border-color: rgba(255, 215, 0, 0.45);
  animation: empty-pulse 2s ease-in-out infinite;
}
@keyframes empty-pulse {
  0%, 100% { border-color: rgba(255, 215, 0, 0.35); }
  50%      { border-color: rgba(255, 215, 0, 0.75); }
}
.seat-badge {
  position: absolute;
  top: -14px; left: 50%;
  transform: translateX(-50%);
  display: flex; align-items: center; justify-content: center;
  font-weight: bold;
  z-index: 6;
}
.seat-badge-crown {
  font-size: 28px;
  /* 金色光晕 */
  filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.8));
  /* 让皇冠悬浮在头像上方,负 top 让它超出 seat 卡 */
  top: -22px;
}
.seat-badge-num {
  width: 28px; height: 28px;
  background: var(--gold-metallic);
  color: #1a1a00;
  border-radius: 50%;
  font-size: 14px;
  border: 2px solid var(--room-bg-deep);
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
}
.seat-avatar-wrap {
  position: relative;
  margin-top: 6px;
}
.seat-avatar {
  position: relative;
  width: 72px; height: 72px;
  background: linear-gradient(135deg, #2a3a5e, #1a2a4e);
  border: 3px solid var(--gold-primary);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--avatar-halo-gold);
  transition: all 300ms ease-out;
}
.seat.empty .seat-avatar {
  border-style: dashed;
  background: transparent;
  box-shadow: none;
  opacity: 0.7;
}
.seat-avatar .avatar-icon { font-size: 36px; line-height: 1; }
.seat-top .seat-avatar {
  /* HOST 头像特殊光环 + 脉冲 */
  border-color: var(--gold-bright);
  box-shadow: var(--avatar-halo-active);
  animation: pulse-glow 2s ease-in-out infinite;
}
.ready-mark {
  position: absolute;
  right: -4px; top: -4px;
  width: 24px; height: 24px;
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: #fff;
  border-radius: 50%;
  font-size: 14px;
  font-weight: bold;
  border: 2px solid var(--room-bg-deep);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
}
.seat-name {
  font-size: 14px;
  font-weight: 600;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
.seat-role-pill {
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.85);
}
.seat-role-pill.role-host {
  background: var(--gold-metallic);
  color: #1a1a00;
  border-color: var(--gold-bright);
  font-weight: bold;
}
.seat-role-pill.role-ready {
  background: rgba(76, 175, 80, 0.22);
  border-color: rgba(76, 175, 80, 0.5);
  color: #a8e6a8;
}
.seat-role-pill.role-empty {
  opacity: 0.7;
  border-style: dashed;
}

/* 准备按钮 (在 self 座位内) */
.seat-ready-btn {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.12);
  color: #fff;
  cursor: pointer;
  transition: all 200ms ease-out;
  margin-top: 2px;
}
.seat-ready-btn:hover { background: rgba(255,255,255,0.22); }
.seat-ready-btn:active { transform: scale(0.95); }

/* ★ v2.1 P1 host 主动踢人按钮 — 红色圆形小图标,座位卡片右下角 */
.seat-kick {
  position: absolute;
  right: -6px; bottom: -6px;
  width: 24px; height: 24px;
  background: linear-gradient(180deg, #ff7e7e, #d4404a);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  z-index: 6;
  padding: 0;
}
.seat-kick:hover { transform: scale(1.1); background: linear-gradient(180deg, #ff5050, #b03040); }
.seat-kick:active { transform: scale(0.95); }

/* 换队友按钮 (host 的 seat 2 队友卡上) */
.seat-swap {
  background: var(--gold-metallic);
  color: #1a1a00;
  font-size: 11px;
  font-weight: bold;
  padding: 4px 10px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  margin-top: 2px;
}
.seat-swap:hover { filter: brightness(1.1); }
.seat-swap:active { transform: scale(0.95); }

/* ========== 座位定位 (portrait 菱形) ========== */
/* v3.x spec §4.3 diamond layout:
 *   " .    seat1    . "   seat-top = HOST
 *   " seat2  .   seat3 "   seat-left/right = 对手
 *   " .    seat4    . "   seat-bottom = 队友
 */
.seat-top {
  left: 50%; top: 220px;
  transform: translateX(-50%);
}
.seat-left {
  left: 16px; top: 360px;
}
.seat-right {
  right: 16px; top: 360px;
}
.seat-bottom {
  left: 50%;
  bottom: max(150px, calc(140px + env(safe-area-inset-bottom, 0px)));
  transform: translateX(-50%);
}

/* ========== 底部 action row ========== */
.actions-row {
  position: absolute;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom, 0px) + 12px);
  transform: translateX(-50%);
  display: flex; gap: 12px;
  width: calc(100% - 32px);
  max-width: 440px;
  z-index: 10;
}
.btn {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 56px;
  padding: 0 20px;
  border-radius: var(--radius-pill);
  font: var(--font-button);
  cursor: pointer;
  border: none;
  transition: all 200ms ease-out;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.btn-icon { font-size: 22px; line-height: 1; }
.btn-primary {
  background: var(--gold-metallic);
  color: #1a1a00;
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.3);
}
.btn-primary:hover { filter: brightness(1.08); box-shadow: 0 8px 24px rgba(255, 215, 0, 0.5); }
.btn-primary:active { transform: scale(0.97); }
.btn-secondary {
  background: var(--glass-bg);
  border: 1.5px solid var(--gold-primary);
  color: var(--gold-bright);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
.btn-secondary:hover { background: rgba(255, 215, 0, 0.12); border-color: var(--gold-bright); }
.btn-secondary:active { transform: scale(0.97); }

/* ========== 切牌按钮 (保留,T1 修复要求 4 花色齐全) ========== */
.cut-card {
  position: absolute;
  right: 16px;
  /* v3.x:避开底部 action row (56+12=68px),贴右下角 */
  bottom: max(80px, calc(68px + env(safe-area-inset-bottom, 0px)));
  width: 64px; height: 64px;
  background: var(--glass-bg);
  border: 1.5px solid var(--gold-primary);
  border-radius: 50%;
  color: var(--gold-bright);
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-shadow);
  z-index: 10;
  line-height: 1.1;
  text-align: center;
}
.cut-card:hover { border-color: var(--gold-bright); }
.cut-card:active { transform: scale(0.94); }
.cut-card-text {
  font-size: 10px;
  color: var(--gold-bright);
  margin-top: 2px;
}

/* ========== 准备状态提示 (保留) ========== */
.ready-status {
  position: absolute;
  left: 16px;
  bottom: max(80px, calc(68px + env(safe-area-inset-bottom, 0px)));
  background: var(--gold-metallic);
  color: #1a1a00;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  transform: rotate(-6deg);
  z-index: 9;
}

/* ========== 花色选择器 (保留)— 移到左侧中部,避开顶部信息卡 / QR 卡 ========== */
.suit-picker {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex; flex-direction: column; gap: 10px;
  z-index: 9;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  padding: 10px 8px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
.suit {
  font-size: 22px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  transition: all 200ms ease-out;
  text-align: center;
  line-height: 1;
}
.suit.active {
  color: var(--gold-bright);
  transform: scale(1.3);
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}
.suit:hover { color: var(--gold-bright); }

/* ========== 详情按钮 (隐藏但保留入口) ========== */
.detail-btn {
  position: absolute;
  left: 16px;
  top: max(72px, env(safe-area-inset-top, 0px) + 64px);
  width: 40px; height: 40px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  display: none; /* spec §4.2 顶部信息卡占位,详情按钮合并入 info-card */
  align-items: center; justify-content: center;
  cursor: pointer;
  z-index: 8;
  font-size: 16px;
}

/* ========== copy toast (全局唯一 position: fixed) ========== */
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

/* ============================================================
 * portrait 媒体查询:320-360px 屏切牌按钮压缩到 60×60
 * ============================================================ */
@media (max-width: 360px) {
  .cut-card {
    width: 60px;
    height: 60px;
    font-size: 14px;
    right: 8px;
    bottom: max(80px, calc(68px + env(safe-area-inset-bottom, 0px)));
  }
  .seat-avatar { width: 64px; height: 64px; }
  .seat-avatar .avatar-icon { font-size: 32px; }
  .seat { min-width: 110px; padding: 14px 14px 12px; }
  .info-card { padding: 12px 16px 10px; }
  .info-roomno { font-size: 28px !important; }
  .qr-card-wrap { width: 160px; }
}

/* ============================================================
 * landscape 横屏 4 段媒体查询 (test §4 要求 ≥ 3 段 landscape)
 *   1. .seat-* 重新定位
 *   2. .info-card 居中浮动
 *   3. .cut-card 贴右下
 * ============================================================ */

/* ---- (1) landscape 4 座位均匀分布 ---- */
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

/* ---- (2) landscape .info-card 居中浮动 ---- */
@media (orientation: landscape) {
  .info-card {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: 460px;
    max-height: 80vh;
    overflow-y: auto;
  }
}

/* ---- (3) landscape .cut-card 贴右下(避开中心信息卡)---- */
@media (orientation: landscape) {
  .cut-card {
    right: 30px;
    bottom: 100px;
  }
}
</style>