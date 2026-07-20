<template>
  <div class="page">
    <div class="bg"></div>
    <div class="page-header">
      <button class="back-btn" @click="router.back()" aria-label="返回">← 返回</button>
      <h1 class="page-title">加入房间</h1>
      <span class="header-spacer"></span>
    </div>

    <!-- Capacitor / Android 真机:用 IP 加入 -->
    <div v-if="isNative" class="card">
      <h2 class="card-title">方式 1:扫码 / 输入房主 IP</h2>
      <p class="card-hint">让房主把手机开热点,你连上同一热点后,扫码或输入他的 IP</p>
      <div class="input-row">
        <span class="input-label">IP:端口</span>
        <input
          v-model="hostAddress"
          placeholder="192.168.43.1:8848"
          class="input"
        />
      </div>
      <p v-if="addressError" class="form-error">{{ addressError }}</p>
      <!-- ★ v0.4.26 BUG-02:支持“输房间号加入” — 输号后点扫描/加入会自动匹配同网房主 -->
      <div class="input-row">
        <span class="input-label">或房间号</span>
        <input v-model="roomNo" maxlength="6" placeholder="6 位数字(自动扫描匹配)" class="input" />
      </div>
      <p class="card-hint">不知道 IP?输房间号后点下方“扫描局域网房间”,会自动找到同网房主</p>
      <!-- ★ v0.4.9:扫一扫按钮(真机才显示) -->
      <div class="qr-row">
        <button class="action-btn-small" @click="openScanner">📷 扫一扫</button>
        <p class="card-hint">对准房主手机上的二维码</p>
      </div>
      <div class="scan-row">
        <button class="action-btn-small" :class="{ disabled: scanning }" @click="scanRooms">
          {{ scanning ? '扫描中...' : '🔍 扫描局域网房间' }}
        </button>
        <p class="card-hint">自动搜索同一 Wi-Fi 下的房主</p>
      </div>
      <p v-if="scanError" class="form-error">{{ scanError }}</p>
      <ul v-if="discovered.length" class="discovered-list">
        <li v-for="room in discovered" :key="room.key">
          <!-- ★ v0.4.24:li@click 不可键盘聚焦,改 button -->
          <button type="button" class="discovered-item" @click="selectRoom(room)">
            {{ room.name }}
          </button>
        </li>
      </ul>
      <!-- ★ v0.4.24:扫描完成但无结果的空态反馈 -->
      <p v-else-if="scanDone && !scanning && !scanError" class="card-hint scan-empty">
        未发现局域网房间,请确认房主已开房,或手动输入地址
      </p>
      <div class="qr-row" v-if="route.query.scanHost">
        <p class="card-hint">扫到的房主地址:{{ route.query.scanHost }}</p>
        <button class="action-btn-small" @click="useScan">使用该地址</button>
      </div>
    </div>

    <!-- 浏览器版:用 6 位房间号 或 房主 IP -->
    <div v-else class="card">
      <h2 class="card-title">方式 1:输入房主 IP(跨设备)</h2>
      <p class="card-hint">房主是 Android App 时会显示「本机 IP」,连同一 Wi-Fi 后填在这里可跨设备加入</p>
      <div class="input-row">
        <span class="input-label">IP:端口</span>
        <input
          v-model="hostAddress"
          placeholder="192.168.43.1:8848"
          class="input"
        />
      </div>
      <p v-if="addressError" class="form-error">{{ addressError }}</p>

      <h2 class="card-title" style="margin-top:16px">方式 2:输入房间号(同一浏览器多标签)</h2>
      <div class="input-row">
        <span class="input-label">房间号</span>
        <input v-model="roomNo" maxlength="6" placeholder="6 位数字" class="input" />
      </div>
      <p class="card-hint">不知道 IP？输房间号后点「加入房间」会自动匹配同网房主；也可点下方扫描</p>
      <div class="scan-row">
        <button class="action-btn-small" :class="{ disabled: scanning }" @click="scanRooms">
          {{ scanning ? '扫描中...' : '🔍 扫描局域网房间' }}
        </button>
        <p class="card-hint">自动搜索同一 Wi-Fi 下的房主</p>
      </div>
      <p v-if="scanError" class="form-error">{{ scanError }}</p>
      <ul v-if="discovered.length" class="discovered-list">
        <li v-for="room in discovered" :key="room.key">
          <!-- ★ v0.4.24:li@click 不可键盘聚焦,改 button -->
          <button type="button" class="discovered-item" @click="selectRoom(room)">
            {{ room.name }}
          </button>
        </li>
      </ul>
      <!-- ★ v0.4.25:扫描完成但无结果的空态反馈 -->
      <p v-else-if="scanDone && !scanning && !scanError" class="card-hint scan-empty">
        未发现局域网房间,请确认房主已开房,或手动输入地址
      </p>
      <!-- ★ v0.4.25:浏览器→App 桥 — 已装 APK 的用户一键切到 App 进房(guandan:// 深链) -->
      <div class="scan-row" v-if="appDeepLink">
        <a class="app-deep-link" :href="appDeepLink">📱 已安装 App？点此用 App 加入</a>
      </div>
    </div>

    <!-- 本机模拟说明仅在开发环境显示,避免干扰普通用户 -->
    <div v-if="isDev" class="card">
      <h2 class="card-title">方式 2:本机模拟(同浏览器多标签)</h2>
      <p class="card-hint">
        浏览器内已用 BroadcastChannel 自动通信,
        <span v-if="isNative">暂未启用</span>
        <span v-else>直接用房间号加入即可</span>
      </p>
    </div>

    <div class="action">
      <button class="action-btn" :class="{ disabled: !canJoin }" @click="onJoin">加入房间</button>
    </div>

    <!-- ★ v0.4.9:扫码 Modal(全屏,真机才用) -->
    <div v-if="showScanner" class="scanner-modal" @click.self="closeScanner">
      <div class="scanner-box">
        <div class="scanner-header">
          <h3 class="scanner-title">扫描房主二维码</h3>
          <button class="scanner-close" @click="closeScanner" aria-label="关闭">×</button>
        </div>
        <!-- html5-qrcode 会接管这个 id="qr-reader" 元素 -->
        <div id="qr-reader" class="scanner-video"></div>
        <p class="scanner-hint" v-if="scannerError">{{ scannerError }}</p>
        <p class="scanner-hint" v-else>请把摄像头对准房主手机的二维码</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import WsServer, { isNativeCapacitor } from '@/common/ws-server.js'
import { parseQrScanResult, buildAppDeepLink } from '@/common/qr-fallback.js'
import net from '@/common/network.js'

const router = useRouter()
const route = useRoute()
const isNative = ref(false)
const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true
const hostAddress = ref('')
const roomNo = ref(route.query.roomNo ? String(route.query.roomNo) : '')

// ★ v0.4.9:扫一扫状态
const showScanner = ref(false)
const scannerError = ref('')
let scannerInstance = null  // html5-qrcode Html5Qrcode 实例(避免热重载 leak)

// v0.4.22 P1:局域网扫描发现
const scanning = ref(false)
const scanError = ref('')
const discovered = ref([])
// ★ v0.4.24:一轮扫描结束后置 true,用于「未发现房间」空态提示
const scanDone = ref(false)

onMounted(() => {
  isNative.value = isNativeCapacitor()
  // 预填扫码传入的 host
  if (route.query.host) {
    hostAddress.value = String(route.query.host)
  } else if (route.query.scanHost) {
    hostAddress.value = String(route.query.scanHost)
  } else if (route.query.ip) {
    // 兼容:从 URL ?ip=1.2.3.4&port=8848 预填
    const p = route.query.port ? String(route.query.port) : '8848'
    hostAddress.value = `${String(route.query.ip)}:${p}`
  }
})

onUnmounted(() => {
  // ★ 组件卸载时关闭扫描器(释放相机)
  closeScanner()
})

// ★ P1-11 修复:IP 地址校验不只检查形状,还检查有效范围与端口。
// ★ v0.4.26 BUG-04:浏览器端也支持手动输入房主 IP,校验对两端都生效(空则不报错)。
const addressError = computed(() => {
  const text = hostAddress.value.trim()
  if (!text) return ''
  try {
    // ★ v0.4.24 修复:parseHostAddress 返回 { hostIp, hostPort }(不是 host/port),
    //   旧解构拿到两个 undefined,host.split 直接抛 TypeError,真机加房全灭。
    const { hostIp, hostPort } = net.parseHostAddress(text)
    const octets = hostIp.split('.').map(Number)
    if (
      octets.length !== 4 ||
      octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)
    ) {
      return 'IP 地址格式不正确'
    }
    if (hostPort < 1 || hostPort > 65535) {
      return '端口应在 1～65535 之间'
    }
    return ''
  } catch {
    // ★ v0.4.24 修复:不把 TypeError 等英文原始消息弹给用户
    return '地址格式不正确,示例 192.168.43.1:8848'
  }
})
const selectedWsHost = ref('') // ★ P1-11 修复:浏览器扫描到 WS host 后记录 IP:port,加入时携带 host 参数
// ★ v0.4.25:浏览器→App 深链(guandan://room?host=...)— 有房主地址时可一键切到 App
const appDeepLink = computed(() => {
  if (isNative.value) return null
  const src = selectedWsHost.value || hostAddress.value.trim() || String(route.query.scanHost || '')
  if (!src) return null
  try {
    const { hostIp, hostPort } = net.parseHostAddress(src)
    return buildAppDeepLink(hostIp, hostPort, roomNo.value || null)
  } catch { return null }
})
const canJoin = computed(() => {
  if (isNative.value) {
    // ★ v0.4.26 BUG-02:有效房主 IP 或 已输房间号(扫描匹配)均可加入
    if (hostAddress.value.trim()) return !addressError.value
    return roomNo.value.length >= 4
  }
  // 浏览器模式:手动填的房主 IP(跨设备)> 扫描到的 WS 房间 > 房间号(本机多标签)
  if (hostAddress.value.trim()) return !addressError.value
  if (selectedWsHost.value) return true
  return roomNo.value.length >= 4
})

function useScan() {
  if (route.query.scanHost) hostAddress.value = String(route.query.scanHost)
}

async function onJoin() {
  if (!canJoin.value) return
  if (isNative.value) {
    // ★ v0.4.26 BUG-02:只输了房间号没输 IP → 先扫描局域网匹配该房间号
    if (!hostAddress.value.trim() && roomNo.value.length >= 4) {
      await scanRooms()  // 扫描内部会自动 selectRoom 匹配项 → 回填 hostAddress
      if (!hostAddress.value.trim()) {
        scanError.value = `未找到房间号 ${roomNo.value},请确认房主已开房且在同一 Wi-Fi`
        return
      }
    }
    // ws 模式:URL ?role=joiner&host=1.2.3.4:8848
    router.push(`/room?role=joiner&host=${encodeURIComponent(hostAddress.value.trim())}`)
  } else if (hostAddress.value.trim()) {
    // ★ v0.4.26 BUG-04:浏览器手动输入房主 IP → 走 WS 跨设备加入(joinRemoteRoom)
    router.push(`/room?role=joiner&host=${encodeURIComponent(hostAddress.value.trim())}`)
  } else if (selectedWsHost.value) {
    // ★ P1-11 修复:浏览器扫描到 WS 房间后,按真实 IP:port 加入,不走本地 BC
    router.push(`/room?role=joiner&roomNo=${roomNo.value}&host=${encodeURIComponent(selectedWsHost.value)}`)
  } else {
    // ★ v0.4.27 一致性修复(对齐安卓):只输房间号 → 先自动扫描匹配同网房主,
    //   匹配到 selectedWsHost 则走 WS 跨设备加入;扫不到才回退本机多标签 BC。
    //   旧版直接走 BC,安卓房主的房间收不到 → 8 秒后报"未找到房间",用户以为房间不存在。
    if (roomNo.value.length >= 4) await scanRooms()  // 匹配到会自动填 selectedWsHost
    if (selectedWsHost.value) {
      router.push(`/room?role=joiner&roomNo=${roomNo.value}&host=${encodeURIComponent(selectedWsHost.value)}`)
    } else {
      router.push(`/room?role=joiner&roomNo=${roomNo.value}`)  // 扫不到 → 回退本机多标签
    }
  }
}

async function scanRooms() {
  // ★ v0.4.24 修复:重入守卫 — 扫描中重复点击会并发多轮扫描
  if (scanning.value) return
  scanning.value = true
  scanError.value = ''
  scanDone.value = false
  try {
    // ★ v0.4.26 BUG-02:优先按本机 IP 推导本子网扫描(覆盖 Windows 热点/非常见网段),
    //   拿不到本机 IP 时回退默认候选。
    let candidates = null
    if (isNative.value) {
      try {
        const ipRes = await WsServer.getLocalIp()
        const localIp = ipRes?.ip
        // 浏览器 fallback 返回 127.0.0.1 无意义,仅原生真实 IP 才用
        if (localIp && localIp !== '127.0.0.1' && typeof net.buildScanCandidates === 'function') {
          candidates = net.buildScanCandidates(localIp)
        }
      } catch (_) { /* 拿不到本机 IP,走默认候选 */ }
    }
    const baseOpts = candidates ? { candidates } : {}
    // ★ v0.4.27 P2-2:已输房间号 → 先"找到即停"快扫(候选网关优先,通常第一批就命中),
    //   命中目标即选中返回;快扫到的房间不匹配才退回全量扫描,确保不漏目标房。
    const wantRoomNo = roomNo.value && roomNo.value.length >= 4
    if (wantRoomNo) {
      const quick = await net.scanLanRooms({ ...baseOpts, stopOnFirst: true })
      const hit = quick.find(r => String(r.roomNo) === String(roomNo.value))
      if (hit) {
        discovered.value = quick
        selectRoom(hit)
        return
      }
    }
    discovered.value = await net.scanLanRooms(baseOpts)
    // ★ v0.4.26 BUG-02:若已输入房间号,扫到后自动匹配对应房间(实现"输房间号加入")
    if (wantRoomNo) {
      const match = discovered.value.find(r => String(r.roomNo) === String(roomNo.value))
      if (match) selectRoom(match)
    }
  } catch (e) {
    discovered.value = []
    scanError.value = `扫描失败: ${e?.message || e}`
  } finally {
    scanning.value = false
    scanDone.value = true
  }
}

function selectRoom(room) {
  if (!room) return
  if (isNative.value) {
    hostAddress.value = `${room.ip}:${room.port}`
  } else {
    // ★ P1-11 修复:浏览器扫描到 WS 房间后记录 IP:port,加入时携带 host 参数
    selectedWsHost.value = `${room.ip}:${room.port}`
    if (room.roomNo) roomNo.value = room.roomNo
  }
}

// ★ v0.4.9:打开扫码 Modal + 启动 html5-qrcode
async function openScanner() {
  if (showScanner.value) return
  showScanner.value = true
  scannerError.value = ''
  // 动态 import html5-qrcode(避免 SSR / 桌面浏览器 bundle 增加)
  try {
    const { Html5Qrcode } = await import('html5-qrcode')
    if (!showScanner.value) return  // 用户可能已经关掉
    const inst = new Html5Qrcode('qr-reader')
    scannerInstance = inst
    await inst.start(
      { facingMode: 'environment' },  // 后置摄像头
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      (decodedText) => {
        // 扫码成功回调
        const parsed = parseQrScanResult(decodedText)
        if (parsed) {
          closeScanner()
          // ★ v0.4.25:扫码成功直接进房(旧版只填地址,还要手点一次「加入房间」)
          const hostAddr = `${parsed.host}:${parsed.port}`
          if (isNative.value) {
            router.push(`/room?role=joiner&host=${encodeURIComponent(hostAddr)}`)
          } else {
            const roomQ = parsed.roomNo ? `&roomNo=${parsed.roomNo}` : ''
            router.push(`/room?role=joiner${roomQ}&host=${encodeURIComponent(hostAddr)}`)
          }
        } else {
          scannerError.value = `无法解析该二维码内容: ${decodedText.slice(0, 50)}`
        }
      },
      () => {
        // 持续扫描的"无码"回调 — 静默忽略
      }
    )
    // ★ v0.4.24 修复:start() 挂起期间用户点了关闭 — closeScanner 已对未运行的实例
    //   stop() 失败并把句柄置空,相机实际已开。resolve 后复查,立即释放。
    if (!showScanner.value) {
      try { await inst.stop(); await inst.clear() } catch { /* 忽略已停止 */ }
      if (scannerInstance === inst) scannerInstance = null
    }
  } catch (e) {
    console.warn('[JoinView] 扫码启动失败:', e)
    scannerError.value = `扫码启动失败: ${e?.message || e}。请检查相机权限后重试。`
  }
}

// ★ v0.4.9:关闭扫码 Modal + 停止扫描器
async function closeScanner() {
  showScanner.value = false
  if (scannerInstance) {
    try {
      const inst = scannerInstance
      scannerInstance = null
      await inst.stop()
      await inst.clear()
    } catch (e) {
      // ignore - 实例可能已停止
    }
  }
}
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: #080b16; padding: 70px 20px 30px; overflow: hidden; }
.bg { position: fixed; inset: 0; background:
    radial-gradient(ellipse at 50% 18%, rgba(119, 142, 222, 0.45), transparent 45%),
    linear-gradient(180deg, #222744 0%, #19152a 56%, #090910 100%); overflow: hidden; }
.bg::before, .bg::after { content: ''; position: absolute; left: 50%; pointer-events: none; transform: translateX(-50%); border-radius: 50%; }
.bg::before {
  top: -98vh; width: 132vw; height: 178vh; min-width: 760px;
  background:
    radial-gradient(ellipse at 50% 48%, transparent 0 66%, rgba(67, 40, 24, 0.94) 67%, #c18b51 71%, #6e4024 76%, transparent 77%),
    conic-gradient(from 18deg, #754425, #c18b51, #6d3e21, #ad7441, #553019, #c7965b, #754425);
  box-shadow: 0 28px 54px rgba(0, 0, 0, 0.56), inset 0 0 28px rgba(255, 235, 180, 0.17);
}
.bg::after {
  top: -86vh; width: 124vw; height: 160vh; min-width: 720px;
  background:
    radial-gradient(ellipse at 50% 38%, rgba(156, 184, 255, 0.36), transparent 28%),
    repeating-radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),
    radial-gradient(ellipse at 50% 42%, #7387ce 0%, #435690 44%, #2f3768 74%, #202548 100%);
  box-shadow: inset 0 -34px 72px rgba(0,0,0,0.42), inset 0 4px 16px rgba(255,255,255,0.12);
}
.title, .card, .action { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: 900; color: #fff; text-align: center; margin-bottom: 24px; text-shadow: 0 3px 12px rgba(0,0,0,0.35); }
.page-header { position: relative; z-index: 1; display: flex; align-items: center; margin-bottom: 20px; }
.back-btn { flex: 0 0 auto; font-size: 15px; color: rgba(255,255,255,0.82); background: transparent; border: none; cursor: pointer; padding: 6px 0; }
.page-title { flex: 1 1 auto; font-size: 20px; font-weight: 800; color: #fff; text-align: center; }
.header-spacer { flex: 0 0 auto; width: 56px; }
.card {
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  color: #fff;
  box-shadow: 0 18px 38px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18);
  backdrop-filter: blur(14px);
}
.card-title { font-size: 17px; font-weight: 800; margin-bottom: 14px; color: #ffe37c; }
.card-hint { font-size: 12px; color: rgba(255,255,255,0.68); margin-top: 8px; line-height: 1.6; }
.input-row {
  display: flex; align-items: center; gap: 10px;
  background: rgba(4, 8, 22, 0.36);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 10px 14px;
}
.input-label { font-size: 15px; color: #fff; width: 80px; flex-shrink: 0; white-space: nowrap; min-width: fit-content; }
.input {
  flex: 1; background: transparent; border: none; outline: none;
  color: #fff; font-size: 17px;
  font-family: inherit;
}
.qr-row { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
.action-btn-small {
  background: rgba(255, 210, 78, 0.22);
  color: #fff; border: none; border-radius: 6px;
  padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.action { margin-top: 24px; }
.action-btn {
  width: 100%; height: 56px;
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308; border: none; border-radius: 12px;
  font-size: 17px; font-weight: 900;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(255, 178, 24, 0.38), inset 0 1px 0 rgba(255,255,255,0.72);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
}
.action-btn.disabled { background: rgba(255,255,255,0.2); cursor: not-allowed; }
.scan-row { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
.discovered-list {
  list-style: none; margin: 10px 0 0 0; padding: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.discovered-list li {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  font-size: 13px;
  color: #fff;
}
.discovered-list li:hover { background: rgba(255, 210, 78, 0.18); }
/* ★ v0.4.24:li 内 button 占满整行,保持原 li 可点外观并支持键盘聚焦 */
.discovered-item {
  display: block; width: 100%; padding: 10px 12px;
  background: transparent; border: none; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
}
.scan-empty { margin-top: 10px; opacity: 0.85; }

/* ★ v0.4.9:扫码 Modal 样式 */
.scanner-modal {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.85);
  display: grid; place-items: center;
  padding: 16px;
}
.scanner-box {
  width: 100%; max-width: 480px;
  background: var(--bg-deep, #0a3d2c);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  padding: 16px;
  color: #fff;
}
.scanner-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.scanner-title { font-size: 16px; font-weight: 700; }
.scanner-close {
  width: 36px; height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: 0; color: #fff; font-size: 24px;
  border-radius: 50%; cursor: pointer;
  line-height: 1;
}
.scanner-video {
  width: 100%; min-height: 300px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}
/* html5-qrcode 内部 video 元素占满容器 */
.scanner-video :deep(video) { width: 100%; height: auto; display: block; }
.scanner-hint {
  margin-top: 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}
</style>
