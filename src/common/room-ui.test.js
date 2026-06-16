/**
 * room-ui 端到端字符串断言 — v2.4-p2 / T3
 *
 * 目的:回应用户「测试不到位」反馈 — 把 T1/T2 视觉修复(纯 CSS / 模板)落成字符串断言。
 * 不渲染 Vue、不引入 jsdom,只用 Node 原生 fs + assert + console.log,
 * 跟项目其它 src/common/*.test.js 模式完全一致。
 *
 * 用法: node src/common/room-ui.test.js
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import assert from 'node:assert/strict'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..', '..') // src/common → repo root
const ROOM_VUE   = resolve(ROOT, 'src/views/room/RoomView.vue')
const QR_CARD    = resolve(ROOT, 'src/components/QrFallbackCard.vue')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, extra ? '\n    ' + extra : '') }
}
function section(s) { console.log('\n=== ' + s + ' ===') }

// 抽 <template>...</template> 段 — 模板断言只对该段 grep (避免和 style scoped 死 CSS 混淆)
function extractTemplate(src) {
  const m = src.match(/<template>([\s\S]*?)<\/template>/)
  if (!m) throw new Error('找不到 <template> 块')
  return m[1]
}
// 抽 <style scoped>...</style scoped> 段
function extractStyleScoped(src) {
  const m = src.match(/<style scoped>([\s\S]*?)<\/style>/)
  if (!m) throw new Error('找不到 <style scoped> 块')
  return m[1]
}

let roomTemplate = '', roomStyle = '', qrStyle = ''
try {
  const roomSrc = readFileSync(ROOM_VUE, 'utf8')
  roomTemplate = extractTemplate(roomSrc)
  roomStyle    = extractStyleScoped(roomSrc)
  const qrSrc   = readFileSync(QR_CARD, 'utf8')
  qrStyle       = extractStyleScoped(qrSrc)
} catch (e) {
  console.error('读源文件失败:', e.message)
  process.exit(1)
}

// =========================================================================
section('1. RoomView.vue <template> 关键 class 必须存在')
// =========================================================================

check('template 包含 class="info-card" (portrait 浮动信息卡)',
  /class="info-card"/.test(roomTemplate))

check('template 包含 class="cut-card" (切牌按钮)',
  /class="cut-card"/.test(roomTemplate))

const seatHits = [
  /class="seat seat-top"/,
  /class="seat seat-bottom"/,
  /class="seat seat-left"/,
  /class="seat seat-right"/,
]
const missingSeats = seatHits.filter(rx => !rx.test(roomTemplate))
check('template 4 座位 (seat-top/bottom/left/right) 都存在',
  missingSeats.length === 0,
  missingSeats.length ? '缺: ' + missingSeats.map(rx => rx.source).join(', ') : '')

// =========================================================================
section('2. T1 修复 — host-info-row 必须从 template 删除 (T1 删了)')
// =========================================================================

check('template 不出现 class="host-info-row" (T1 已删)',
  !/class="host-info-row"/.test(roomTemplate))

// style scoped 死 CSS 仍可存在(故意留给 future cleanup),
// 模板里 0 次 class= 引用即可,功能影响 0(L85 注释里提到 "host-info-row" 是文档
// 上下文,不是 class 引用,允许存在)。
const templateClassRefs = (roomTemplate.match(/class="host-info-row"/g) || []).length
check('template 内 class="host-info-row" 引用次数 == 0 (T1 已删)',
  templateClassRefs === 0,
  '实际 ' + templateClassRefs)

// =========================================================================
section('3. T1 修复 — 切牌按钮文字必须包含四种花色 (♠ ♦ ♣ ♥) 不漏花色')
// =========================================================================

const suitChars = ['♠', '♦', '♣', '♥']
const cutCardMatch = roomTemplate.match(/<div class="cut-card"[^>]*>([\s\S]*?)<\/div>/)
const cutCardText = cutCardMatch ? cutCardMatch[1] : ''

const missingSuits = suitChars.filter(c => !cutCardText.includes(c))
check('cut-card 按钮文字包含四种花色 ♠/♦/♣/♥ (T1 补了 ♥)',
  missingSuits.length === 0,
  missingSuits.length ? '缺: ' + missingSuits.join(' ') : '')

check('cut-card 按钮还包含中文"切牌"提示',
  /切牌/.test(cutCardText))

// =========================================================================
section('4. T2 修复 — style scoped 包含 3 段 landscape media query')
// =========================================================================

const landscapeBlocks = roomStyle.match(/@media \(orientation: landscape\)\s*\{/g) || []
check('@media (orientation: landscape) 出现 ≥ 3 次 (.seat-* / .info-card / .cut-card 各一段)',
  landscapeBlocks.length >= 3,
  '实际 ' + landscapeBlocks.length + ' 次')

// 横屏切牌按钮贴右下 (避开中心信息卡)
check('landscape .cut-card 贴右下 (T2 改 right/bottom)',
  /@media \(orientation: landscape\)\s*\{[\s\S]*?\.cut-card\s*\{[^}]*right:\s*30px[^}]*bottom:\s*100px/.test(roomStyle))

// 横屏 .info-card 居中浮动 + max-width 460
check('landscape .info-card 居中 + max-width: 460px',
  /@media \(orientation: landscape\)\s*\{[\s\S]*?\.info-card\s*\{[\s\S]*?transform:\s*translate\(-50%,\s*-50%\)/.test(roomStyle) &&
  /@media \(orientation: landscape\)\s*\{[\s\S]*?\.info-card\s*\{[\s\S]*?max-width:\s*460px/.test(roomStyle))

// 横屏 4 座位都重定位
const landscapeSeats = ['seat-top', 'seat-bottom', 'seat-left', 'seat-right']
const missingLandscapeSeats = landscapeSeats.filter(s => {
  const rx = new RegExp('@media \\(orientation: landscape\\)\\s*\\{[\\s\\S]*?\\.' + s + '\\s*\\{')
  return !rx.test(roomStyle)
})
check('landscape 4 座位 (.seat-*) 都重新定位',
  missingLandscapeSeats.length === 0,
  missingLandscapeSeats.length ? '缺: ' + missingLandscapeSeats.join(', ') : '')

// =========================================================================
section('5. T1 修复 — 320px 屏切牌按钮压缩到 60×60')
// =========================================================================

check('存在 @media (max-width: 360px) 切牌按钮压缩段',
  /@media \(max-width: 360px\)\s*\{[\s\S]*?\.cut-card\s*\{/.test(roomStyle))

check('压缩段: width: 60px',
  /@media \(max-width: 360px\)\s*\{[\s\S]*?\.cut-card\s*\{[\s\S]*?width:\s*60px/.test(roomStyle))

check('压缩段: height: 60px',
  /@media \(max-width: 360px\)\s*\{[\s\S]*?\.cut-card\s*\{[\s\S]*?height:\s*60px/.test(roomStyle))

// =========================================================================
section('6. T1 修复 — info-card 内部滚动保护 320px 屏不溢出')
// =========================================================================

check('portrait .info-card 包含 max-height: 80vh (T1 加)',
  /\.info-card\s*\{[\s\S]*?max-height:\s*80vh/.test(roomStyle))

check('portrait .info-card 包含 overflow-y: auto (T1 加)',
  /\.info-card\s*\{[\s\S]*?overflow-y:\s*auto/.test(roomStyle))

// =========================================================================
section('7. T1 修复 — portrait 用 bottom 定位 info-card (不是硬编码 top)')
// =========================================================================

check('portrait .info-card 用 bottom 定位 (自适应 SafeArea)',
  /\.info-card\s*\{[\s\S]*?bottom:\s*max\(20px,\s*env\(safe-area-inset-bottom,\s*0px\)\s*\+\s*20px\)/.test(roomStyle))

// 安全区用 env() 不用硬编码 34px
check('使用 env(safe-area-inset-bottom) 安全区 (iPhone notch / home indicator)',
  /env\(safe-area-inset-bottom/.test(roomStyle))

// =========================================================================
section('8. QrFallbackCard.vue 中文断行 — word-break: keep-all + overflow-wrap: anywhere')
// =========================================================================

check('QrFallbackCard .qr-fallback-ip 用 word-break: keep-all (中文保整)',
  /\.qr-fallback-ip\s*\{[\s\S]*?word-break:\s*keep-all/.test(qrStyle))

check('QrFallbackCard .qr-fallback-ip 用 overflow-wrap: anywhere (IP 串允许任意断行)',
  /\.qr-fallback-ip\s*\{[\s\S]*?overflow-wrap:\s*anywhere/.test(qrStyle))

check('QrFallbackCard .qr-fallback-join-url 也用 keep-all + anywhere',
  /\.qr-fallback-join-url\s*\{[\s\S]*?word-break:\s*keep-all/.test(qrStyle) &&
  /\.qr-fallback-join-url\s*\{[\s\S]*?overflow-wrap:\s*anywhere/.test(qrStyle))

// =========================================================================
section('9. position: fixed 浮层红线 — 当前只允许 1 处 (L718 copy-toast, T1+T2 未引入新浮层)')
// =========================================================================

const fixedMatches = roomStyle.match(/position:\s*fixed\s*;/g) || []
check('RoomView.vue style scoped 内 position: fixed 出现次数 == 1 (只允许 copy-toast)',
  fixedMatches.length === 1,
  '实际 ' + fixedMatches.length + ' 次,新引入浮层是违规红线')

// 浮层上下文断言 — 唯一 fixed 必须在 .copy-toast 选择器里
check('唯一 position: fixed 属于 .copy-toast (v2.2 task A 合法的 toast, T1+T2 未引入新浮层)',
  /\.copy-toast\s*\{[^}]*position:\s*fixed/.test(roomStyle))

// =========================================================================
console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)
