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
  buildRoomJoinUrl,
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

console.log('\n=== 2. buildJoinUrl / buildRoomJoinUrl — http://IP:port 拼接 ===')

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

// P1-15:带房间号的 hash join URL
const roomUrl = buildRoomJoinUrl('192.168.43.1', 8848, '123456')
eq('buildRoomJoinUrl 生成 hash join URL',
  roomUrl,
  'http://192.168.43.1:8848/#/room?role=joiner&host=192.168.43.1%3A8848&roomNo=123456')

assert('buildRoomJoinUrl 缺 roomNo 时不带 roomNo 参数',
  buildRoomJoinUrl('192.168.43.1', 8848).indexOf('roomNo=') === -1)

assert('buildRoomJoinUrl null IP → null',
  buildRoomJoinUrl(null, 8848, '123') === null)

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

// ============================================================
// v0.4.9:parseQrScanResult 测试
// ============================================================
console.log('\n=== 5. parseQrScanResult: 解析 QR 扫描结果 ===')
{
  const { parseQrScanResult, buildAppDeepLink } = await import('./qr-fallback.js')

  // 1) 纯 IP:port
  const r1 = parseQrScanResult('192.168.43.1:8848')
  assert('★ 纯 IP:port 解析正确', r1 && r1.host === '192.168.43.1' && r1.port === 8848)

  // 2) 纯 IP(无端口,默认 8848)
  const r2 = parseQrScanResult('192.168.43.1')
  assert('★ 纯 IP 默认 8848 端口', r2 && r2.host === '192.168.43.1' && r2.port === 8848)

  // 3) http URL
  const r3 = parseQrScanResult('http://192.168.43.1:8848')
  assert('★ http URL 解析正确', r3 && r3.host === '192.168.43.1' && r3.port === 8848)

  // 4) https URL
  const r4 = parseQrScanResult('https://192.168.43.1:8848')
  assert('★ https URL 解析正确', r4 && r4.host === '192.168.43.1' && r4.port === 8848)

  // 5) 含路径的 URL(取 origin)
  const r5 = parseQrScanResult('http://192.168.43.1:8848/#/join')
  assert('★ URL 含路径仍解析正确', r5 && r5.host === '192.168.43.1' && r5.port === 8848)

  // P1-15:room join URL 提取 roomNo
  const r5b = parseQrScanResult('http://192.168.43.1:8848/#/room?role=joiner&host=192.168.43.1:8848&roomNo=123456')
  assert('★ room URL 解析正确', r5b && r5b.host === '192.168.43.1' && r5b.port === 8848 && r5b.roomNo === '123456')

  const r5c = parseQrScanResult('http://192.168.43.1:8848/#/room?role=joiner&host=192.168.43.1:8848')
  assert('★ room URL 无 roomNo 时 roomNo 为 null', r5c && r5c.host === '192.168.43.1' && r5c.port === 8848 && r5c.roomNo === null)

  // 6) 不同端口
  const r6 = parseQrScanResult('http://10.0.0.5:9000')
  assert('★ 不同端口解析正确', r6 && r6.host === '10.0.0.5' && r6.port === 9000)

  // 7) 非法输入
  assert('空字符串返回 null', parseQrScanResult('') === null)
  assert('非字符串返回 null', parseQrScanResult(null) === null)
  assert('undefined 返回 null', parseQrScanResult(undefined) === null)
  assert('纯文本返回 null', parseQrScanResult('hello world') === null)
  assert('域名(非 IP)返回 null', parseQrScanResult('http://example.com:8848') === null)
  // 8) 边界:前后有空格
  const r7 = parseQrScanResult('  192.168.43.1:8848  ')
  assert('★ 前后空格自动 trim', r7 && r7.host === '192.168.43.1' && r7.port === 8848)

  // 9) ★ v0.4.25:guandan:// App 深链
  const d1 = parseQrScanResult('guandan://room?host=192.168.43.1:8848&roomNo=123456')
  assert('★ guandan://room 解析正确', d1 && d1.host === '192.168.43.1' && d1.port === 8848 && d1.roomNo === '123456')
  const d2 = parseQrScanResult('guandan://room?host=10.0.0.5:9000')
  assert('★ guandan:// 无 roomNo 时为 null', d2 && d2.host === '10.0.0.5' && d2.port === 9000 && d2.roomNo === null)
  const d3 = parseQrScanResult('guandan://join?host=192.168.43.1:8848&roomNo=654321')
  assert('★ guandan://join 兼容', d3 && d3.host === '192.168.43.1' && d3.roomNo === '654321')
  assert('guandan:// 缺 host 返回 null', parseQrScanResult('guandan://room?roomNo=123456') === null)
  assert('guandan:// 非法 IP 返回 null', parseQrScanResult('guandan://room?host=999.1.1.1:8848') === null)
  assert('guandan:// 非法端口返回 null', parseQrScanResult('guandan://room?host=192.168.43.1:99999') === null)
  // buildAppDeepLink
  assert('★ buildAppDeepLink 基本', buildAppDeepLink('192.168.43.1', 8848, '123456') === 'guandan://room?host=192.168.43.1%3A8848&roomNo=123456')
  assert('★ buildAppDeepLink 无 roomNo', buildAppDeepLink('192.168.43.1', 8848) === 'guandan://room?host=192.168.43.1%3A8848')
  assert('buildAppDeepLink null IP 返回 null', buildAppDeepLink(null, 8848, '1') === null)
  // 深链可被 parseQrScanResult 回环解析
  const loop = parseQrScanResult(buildAppDeepLink('192.168.43.1', 8848, '123456'))
  assert('★ buildAppDeepLink ↔ parse 回环', loop && loop.host === '192.168.43.1' && loop.port === 8848 && loop.roomNo === '123456')
}

console.log('\n========== qr-fallback test result: ' + pass + ' pass / ' + fail + ' fail ==========')
if (fail > 0) process.exit(1)