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
      <!-- ★ v0.4.9:扫一扫按钮(真机才显示) -->
      <div class="qr-row">
        <button class="action-btn-small" @click="openScanner">📷 扫一扫</button>
        <p class="card-hint">对准房主手机上的二维码</p>
      </div>
      <div class="qr-row" v-if="route.query.scanHost">
        <p class="card-hint">扫到的房主地址:{{ route.query.scanHost }}</p>
        <button class="action-btn-small" @click="useScan">使用该地址</button>
      </div>
    </div>

    <!-- 浏览器版:用 6 位房间号 -->
    <div v-else class="card">
      <h2 class="card-title">方式 1:输入房间号</h2>
      <div class="input-row">
        <span class="input-label">房间号</span>
        <input v-model="roomNo" maxlength="6" placeholder="6 位数字" class="input" />
      </div>
      <p class="card-hint">房主开热点后,会显示一个 6 位数字房间号</p>
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
import { isNativeCapacitor } from '@/common/ws-server.js'
import { parseQrScanResult } from '@/common/qr-fallback.js'
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
const addressError = computed(() => {
  if (!isNative.value) return ''
  const text = hostAddress.value.trim()
  if (!text) return ''
  try {
    const { host, port } = net.parseHostAddress(text)
    const octets = host.split('.').map(Number)
    if (
      octets.length !== 4 ||
      octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)
    ) {
      return 'IP 地址格式不正确'
    }
    if (port < 1 || port > 65535) {
      return '端口应在 1～65535 之间'
    }
    return ''
  } catch (e) {
    return e?.message || '地址格式不正确'
  }
})
const canJoin = computed(() => {
  if (isNative.value) {
    return !addressError.value && hostAddress.value.trim().length > 0
  }
  return roomNo.value.length >= 4
})

function useScan() {
  if (route.query.scanHost) hostAddress.value = String(route.query.scanHost)
}

function onJoin() {
  if (!canJoin.value) return
  if (isNative.value) {
    // ws 模式:URL ?role=joiner&host=1.2.3.4:8848
    router.push(`/room?role=joiner&host=${encodeURIComponent(hostAddress.value.trim())}`)
  } else {
    router.push(`/room?role=joiner&roomNo=${roomNo.value}`)
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
    scannerInstance = new Html5Qrcode('qr-reader')
    await scannerInstance.start(
      { facingMode: 'environment' },  // 后置摄像头
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      (decodedText) => {
        // 扫码成功回调
        const parsed = parseQrScanResult(decodedText)
        if (parsed) {
          hostAddress.value = `${parsed.host}:${parsed.port}`
          closeScanner()
        } else {
          scannerError.value = `无法解析该二维码内容: ${decodedText.slice(0, 50)}`
        }
      },
      () => {
        // 持续扫描的"无码"回调 — 静默忽略
      }
    )
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
