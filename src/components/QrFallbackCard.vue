<!--
  QrFallbackCard — host IP:port 兜底卡片 (v2.2 / task A — QR fallback UI)

  设计目标:
    - IP 加载好之后永远显示(作为兜底,不是 qr 失败后才出现)
    - QR 库加载成功时:QR 图 + 卡片并排显示
    - QR 库加载失败时:只显示卡片(突出"手输 IP"路径)
    - IP:port 高亮 + 等宽字体 + 旁边 📋 复制按钮
    - 提示"或用电脑浏览器打开 http://IP:port 也可加入"

  Props:
    hostIp       string|null   本机 IP(没拿到时 null,整卡片不渲染)
    hostPort     number|string 端口
    qrcodeUrl    string|null   二维码 dataURL(库失败时 null)

  Emits:
    copied       (text: string)  复制成功后通知父组件(可弹 toast)
-->
<template>
  <div v-if="shouldShowFallback(hostIp)" class="qr-fallback-card" :class="`tone-${mode.tone}`">
    <!-- QR 区域:qrcodeUrl 存在时显示,失败时整个 img 不渲染(不显示 broken icon) -->
    <div v-if="mode.showQr" class="qr-fallback-qr">
      <img :src="qrcodeUrl" alt="QR" class="qr-img" />
    </div>

    <!-- 文案区域:永远渲染(IP 一拿到就显示) -->
    <div class="qr-fallback-body">
      <div class="qr-fallback-headline">{{ mode.headline }}</div>
      <div v-if="mode.subhead" class="qr-fallback-subhead">{{ mode.subhead }}</div>

      <!-- IP + port 高亮 + 复制按钮 -->
      <div class="qr-fallback-ip-row">
        <code class="qr-fallback-ip">{{ formatHostAddress(hostIp, hostPort) }}</code>
        <button
          class="qr-fallback-copy-btn"
          type="button"
          :data-testid="'qr-copy-btn'"
          @click="onCopy"
        >📋 复制</button>
      </div>

      <!-- join URL 备选提示 -->
      <div v-if="joinUrl" class="qr-fallback-join-url">
        或用电脑浏览器打开 <a :href="joinUrl" target="_blank" rel="noopener">{{ joinUrl }}</a> 也可加入
      </div>

      <!-- ★ v0.4.25:App 直达深链(guandan://)— 已装 APK 的用户点链接直接拉起 App 进房 -->
      <div v-if="deepLink" class="qr-fallback-join-url">
        已安装 App?<a :href="deepLink">点此直接拉起 App 加入</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  formatHostAddress,
  buildRoomJoinUrl,
  buildAppDeepLink,
  shouldShowFallback,
  describeFallbackMode,
  clipboardPayload,
} from '@/common/qr-fallback.js'

const props = defineProps({
  hostIp: { type: String, default: null },
  hostPort: { type: [Number, String], default: 8848 },
  qrcodeUrl: { type: String, default: null },
  roomNo: { type: String, default: '' },
})

const emit = defineEmits(['copied'])

const mode = computed(() => describeFallbackMode(props.qrcodeUrl))
const joinUrl = computed(() => buildRoomJoinUrl(props.hostIp, props.hostPort, props.roomNo))
// ★ v0.4.25:guandan:// App 深链(已装 APK 用户点击直接拉起)
const deepLink = computed(() => buildAppDeepLink(props.hostIp, props.hostPort, props.roomNo))

function onCopy() {
  const text = clipboardPayload(props.hostIp, props.hostPort)
  if (!text) return
  emit('copied', text)
}
</script>

<style scoped>
.qr-fallback-card {
  display: flex;
  /* v2.4-p2 T1:横屏/窄屏宽度不够时 QR 单独一行 */
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  margin: 10px 0 14px;
  border-radius: 12px;
  background: rgba(255,255,255,0.55);
  color: #2a3464;
}
.qr-fallback-card.tone-warning {
  background: linear-gradient(180deg, #fff5e1, #ffe6b8);
  border: 2px dashed #ff7e3d;
  box-shadow: 0 2px 8px rgba(255,126,61,0.18);
}
.qr-fallback-card.tone-info {
  background: rgba(255,255,255,0.55);
  border: 2px dashed rgba(44,111,217,0.45);
}
.qr-fallback-qr {
  flex: 0 0 auto;
}
.qr-fallback-qr .qr-img {
  width: 100px;
  height: 100px;
  background: #fff;
  border-radius: 6px;
  padding: 4px;
}
.qr-fallback-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* v2.4-p2 T1:降低最小宽度,320px 屏允许 body 换行;QR 在新一行,文字仍占 200px+ */
  min-width: 200px;
}
.qr-fallback-headline {
  font-size: 14px;
  font-weight: bold;
}
.tone-warning .qr-fallback-headline {
  color: #b71c1c;
}
.tone-info .qr-fallback-headline {
  color: #2c6fd9;
}
.qr-fallback-subhead {
  font-size: 12px;
  color: #6e3f00;
  line-height: 1.4;
}
.qr-fallback-ip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
.qr-fallback-ip {
  flex: 1 1 auto;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 16px;
  font-weight: bold;
  color: #2c6fd9;
  background: rgba(255,255,255,0.85);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(44,111,217,0.35);
  /* v2.4-p2 T1:中文保整(不会字间断),英文/数字允许任意断行 */
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.qr-fallback-copy-btn {
  flex: 0 0 auto;
  background: linear-gradient(180deg, #6cc3f5, #2a85d0);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  padding: 6px 12px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.qr-fallback-copy-btn:hover { filter: brightness(1.1); }
.qr-fallback-copy-btn:active { transform: scale(0.96); }
.qr-fallback-join-url {
  font-size: 11px;
  color: #6e3f00;
  opacity: 0.85;
  line-height: 1.4;
  /* v2.4-p2 T1:中文保整,英文/数字允许任意断行(避免"加/入"被拆到不同行) */
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.qr-fallback-join-url a {
  color: #2c6fd9;
  text-decoration: underline;
}
</style>