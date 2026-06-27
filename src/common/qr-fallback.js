/**
 * QR fallback 卡片 — 纯函数工具 (无 Vue 依赖)
 *
 * v2.2 / task A — QR fallback UI:
 *   - 当 qrcode 库 import 失败时,RoomView 仍要给 host 一个明显的"输 IP 加入"卡片
 *   - 整卡片永远显示,作为兜底,不是 qr 失败后才出现
 *   - IP:port 高亮 + 等宽字体 + 旁边 📋 复制按钮
 *   - 提示"或用电脑浏览器打开 http://IP:port 也可加入"
 *
 * 纯函数,不依赖 Vue,可被 Node assert 直接测试。
 */

// 拼接 IP:port 字符串(始终保留端口)
//   null / undefined IP → 返回 null(调用方据此决定是否渲染卡片)
export function formatHostAddress(hostIp, hostPort) {
  if (hostIp == null || hostIp === '') return null
  const port = hostPort == null || hostPort === '' ? '' : `:${hostPort}`
  return `${hostIp}${port}`
}

// 构建 join URL(http://IP:port),给 fallback 卡片"或用电脑浏览器打开 ..."提示用
//   null IP → 返回 null
//   默认端口 = 8848(与 ws-server.js 一致),不再是 80
//   v3.x P1-14 修复:旧默认 80 没人访问,joiner 连错端口连不上
export function buildJoinUrl(hostIp, hostPort) {
  if (hostIp == null || hostIp === '') return null
  const port = hostPort == null || hostPort === '' ? 8848 : hostPort
  return `http://${hostIp}:${port}`
}

// 判断是否应该展示 QR fallback 卡片
//   永远 true(IP 存在时) — 卡片是兜底,不是 qr 失败后才出现
//   null IP 时不渲染(等 initNetwork 拿到 hostIp)
//   qrcodeUrl 为 null 时只显示 fallback 卡,不为 null 时卡片与 QR 并排
export function shouldShowFallback(hostIp) {
  return hostIp != null && hostIp !== ''
}

// 卡片状态描述 — 给 UI 文案用
//   qrcodeUrl truthy → "library OK, fallback 也展示,告诉用户两种都能用"
//   qrcodeUrl falsy → "library missing, 强调只能手动输 IP"
export function describeFallbackMode(qrcodeUrl) {
  if (qrcodeUrl) {
    return {
      showQr: true,
      headline: '扫码或手输 IP 加入',
      tone: 'info',
    }
  }
  return {
    showQr: false,
    headline: '⚠️ 无法生成二维码',
    subhead: '请让对方打开 App,点"加入",输入下面的 IP 加入:',
    tone: 'warning',
  }
}

// 复制按钮调用的字符串 — 给 navigator.clipboard.writeText 用
//   优先 hostIp:port,缺失 IP 时回退到 null(UI 应禁用按钮)
export function clipboardPayload(hostIp, hostPort) {
  return formatHostAddress(hostIp, hostPort)
}

// ★ v0.4.9:解析 QR 扫描结果(joinRemoteRoom 走 IP:port 格式)
//
//   支持 3 种格式:
//     1) 纯 IP:port  "192.168.43.1:8848"
//     2) join URL    "http://192.168.43.1:8848" 或 "https://..."
//     3) 含路径      "http://192.168.43.1:8848/#/join"  → 取 origin
//   返回 { host, port } 或 null(无法解析)
//
//   设计:不依赖 parseHostAddress(network.js)避免循环依赖
export function parseQrScanResult(text) {
  if (typeof text !== 'string' || text.trim() === '') return null
  const trimmed = text.trim()
  // 1) 纯 IP:port
  const ipPortMatch = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d{1,5}))?$/)
  if (ipPortMatch) {
    return {
      host: ipPortMatch[1],
      port: ipPortMatch[2] ? Number(ipPortMatch[2]) : 8848,
    }
  }
  // 2) http(s)://... → 提取 host:port
  try {
    const url = new URL(trimmed)
    if (url.hostname && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname)) {
      return {
        host: url.hostname,
        port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
      }
    }
    // hostname 不是 IP(比如域名)→ 暂不支持
  } catch (e) {
    // 不是合法 URL,继续往下
  }
  return null
}