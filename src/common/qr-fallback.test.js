/**
 * qr-fallback 纯函数自测 — v2.2 / task A — QR fallback UI
 *
 * 抽到 src/common/qr-fallback.js 的纯函数:
 *   - formatHostAddress(hostIp, hostPort) → string|null
 *   - buildJoinUrl(hostIp, hostPort)      → string|null
 *   - shouldShowFallback(hostIp)          → boolean
 *   - describeFallbackMode(qrcodeUrl)     → { showQr, headline, subhead?, tone }
 *   - clipboardPayload(hostIp, hostPort)  → string|null  (= formatHostAddress)
 *
 * 不挂 Vue 组件,纯 Node assert + ESM import,跟项目其它 src/common/*.test.js 一致。
 *
 * 用法: node src/common/qr-fallback.test.js
 */

import {
  formatHostAddress,
  buildJoinUrl,
  shouldShowFallback,
  describeFallbackMode,
  clipboardPayload,
} from './qr-fallback.js'

let pass = 0, fail = 0
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, '\n    期望:', JSON.stringify(b), '\n    实际:', JSON.stringify(a)) }
}
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

console.log('\n=== 1. formatHostAddress — IP:port 拼接 ===')

eq('基本 IPv4 + 端口',
  formatHostAddress('192.168.43.1', 8848),
  '192.168.43.1:8848')

eq('字符串端口也接受',
  formatHostAddress('10.0.0.1', '9090'),
  '10.0.0.1:9090')

eq('null IP → null',
  formatHostAddress(null, 8848),
  null)

eq('空字符串 IP → null',
  formatHostAddress('', 8848),
  null)

eq('undefined IP → null',
  formatHostAddress(undefined, 8848),
  null)

eq('null port → 省略端口部分(只有 IP)',
  formatHostAddress('127.0.0.1', null),
  '127.0.0.1')

eq('空字符串 port → 省略端口',
  formatHostAddress('127.0.0.1', ''),
  '127.0.0.1')

console.log('\n=== 2. buildJoinUrl — http://IP:port 拼接 ===')

eq('基本 IPv4 + 端口',
  buildJoinUrl('192.168.43.1', 8848),
  'http://192.168.43.1:8848')

eq('null IP → null',
  buildJoinUrl(null, 8848),
  null)

eq('null port → 默认 8848 (v3.x P1-14 修复:与 ws-server 端口一致)',
  buildJoinUrl('192.168.43.1', null),
  'http://192.168.43.1:8848')

eq('空字符串 port → 默认 8848 (v3.x P1-14 修复)',
  buildJoinUrl('192.168.43.1', ''),
  'http://192.168.43.1:8848')

eq('hostname (localhost) 也接受',
  buildJoinUrl('localhost', 3000),
  'http://localhost:3000')

console.log('\n=== 3. shouldShowFallback — 卡片显示判断 ===')

assert('IP="192.168.43.1" → true', shouldShowFallback('192.168.43.1') === true)
assert('IP="localhost" → true', shouldShowFallback('localhost') === true)
assert('IP=null → false', shouldShowFallback(null) === false)
assert('IP="" → false', shouldShowFallback('') === false)
assert('IP=undefined → false', shouldShowFallback(undefined) === false)

console.log('\n=== 4. describeFallbackMode — QR 在/不在模式文案 ===')

// QR 库正常(给到 dataURL):info 模式,头条"扫码或手输"
const okMode = describeFallbackMode('data:image/png;base64,iVBORw0K...')
eq('okMode.showQr=true', okMode.showQr, true)
eq('okMode.tone=info', okMode.tone, 'info')
eq('okMode.headline="扫码或手输 IP 加入"', okMode.headline, '扫码或手输 IP 加入')
assert('okMode 没 subhead(不重复警示)', okMode.subhead === undefined)

// QR 库失败(qrcodeUrl=null):warning 模式
const failMode = describeFallbackMode(null)
eq('failMode.showQr=false', failMode.showQr, false)
eq('failMode.tone=warning', failMode.tone, 'warning')
assert('failMode.headline 包含 ⚠️ emoji', failMode.headline.indexOf('⚠️') >= 0)
assert('failMode.subhead 包含 "加入" 提示', failMode.subhead && failMode.subhead.indexOf('加入') >= 0)

// QR 库失败(qrcodeUrl="" 也算 falsy):warning 模式
const failMode2 = describeFallbackMode('')
eq('空字符串 qrcodeUrl → warning', failMode2.tone, 'warning')

console.log('\n=== 5. clipboardPayload — 复制按钮 payload ===')

eq('基本 IP+port 复制串',
  clipboardPayload('192.168.43.1', 8848),
  '192.168.43.1:8848')

eq('null IP → null (UI 应禁用按钮)',
  clipboardPayload(null, 8848),
  null)

eq('和 formatHostAddress 完全一致',
  clipboardPayload('10.0.0.1', 9090),
  formatHostAddress('10.0.0.1', 9090))

console.log('\n=== 6. 集成场景 — 三种调用组合 ===')

// 场景 A:qrcode 库 OK + host 拿到 IP (最常见)
const sceneA = {
  address: formatHostAddress('192.168.43.1', 8848),
  joinUrl: buildJoinUrl('192.168.43.1', 8848),
  show: shouldShowFallback('192.168.43.1'),
  mode: describeFallbackMode('data:image/png;base64,XYZ'),
  copy: clipboardPayload('192.168.43.1', 8848),
}
eq('场景 A 完整 props', sceneA, {
  address: '192.168.43.1:8848',
  joinUrl: 'http://192.168.43.1:8848',
  show: true,
  mode: { showQr: true, headline: '扫码或手输 IP 加入', tone: 'info' },
  copy: '192.168.43.1:8848',
})

// 场景 B:qrcode 库失败 + host 拿到 IP (兜底场景,本任务核心)
const sceneB = {
  address: formatHostAddress('192.168.43.1', 8848),
  joinUrl: buildJoinUrl('192.168.43.1', 8848),
  show: shouldShowFallback('192.168.43.1'),
  mode: describeFallbackMode(null),
  copy: clipboardPayload('192.168.43.1', 8848),
}
assert('场景 B 卡片仍然 show=true', sceneB.show === true)
assert('场景 B 不显示 QR img', sceneB.mode.showQr === false)
assert('场景 B 文案是 warning 调', sceneB.mode.tone === 'warning')
assert('场景 B headline 含 ⚠️', sceneB.mode.headline.indexOf('⚠️') >= 0)
eq('场景 B copy 串仍可用', sceneB.copy, '192.168.43.1:8848')

// 场景 C:host 还没拿到 IP (initNetwork 中) — 不渲染卡片
const sceneC = {
  show: shouldShowFallback(''),
  mode: describeFallbackMode(null),
}
assert('场景 C 卡片不渲染 (IP 没拿到)', sceneC.show === false)

console.log('\n========== qr-fallback test result: ' + pass + ' pass / ' + fail + ' fail ==========')
if (fail > 0) process.exit(1)