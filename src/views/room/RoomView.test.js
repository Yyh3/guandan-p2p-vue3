/**
 * RoomView.vue 端到端字符串断言 — v2.4-p2 / T3
 *
 * 目的:锁定 T1+T2 修复的字符串契约,挡住未来 PR 回退:
 *   - host-info-row 在 template 已删(T1)
 *   - cut-card 切牌按钮文字 4 花色齐全(T1)
 *   - landscape media query 已加(T2)
 *   - 浮层红线(不能新增 position: fixed)
 *
 * 不渲染 Vue、不引入 jsdom,只读源文件 + 字符串断言,
 * 跟项目其它 .test.js 模式一致。
 *
 * 用法: node src/views/room/RoomView.test.js
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import assert from 'node:assert/strict'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..', '..', '..') // src/views/room → repo root
const ROOM_VUE = resolve(ROOT, 'src/views/room/RoomView.vue')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, extra ? '\n    ' + extra : '') }
}
function section(s) { console.log('\n=== ' + s + ' ===') }

let roomTemplate = '', roomStyle = '', roomFull = ''
try {
  roomFull = readFileSync(ROOM_VUE, 'utf8')
  // 匹配根 <template> 块:Vue SFC 的根 template 从文件第一个 <template> 开始,
  // 到 <script setup> 之前的最后一个 </template> 结束。内层 <template v-if> 等条件
  // 渲染标签不应影响根块边界。
  const scriptStart = roomFull.indexOf('<script setup>')
  const firstTemplateStart = roomFull.indexOf('<template>')
  const lastTemplateEnd = roomFull.lastIndexOf('</template>', scriptStart >= 0 ? scriptStart : undefined)
  if (firstTemplateStart < 0 || lastTemplateEnd <= firstTemplateStart) {
    throw new Error('找不到根 <template> 块')
  }
  roomTemplate = roomFull.slice(firstTemplateStart + '<template>'.length, lastTemplateEnd)
  const s = roomFull.match(/<style scoped>([\s\S]*?)<\/style>/)
  if (!s) throw new Error('找不到 <style scoped> 块')
  roomStyle    = s[1]
} catch (e) {
  console.error('读 RoomView.vue 失败:', e.message)
  process.exit(1)
}

// =========================================================================
section('1. T1 修复 — host-info-row template 不出现 (T1 已删)')
// =========================================================================

// 测试的是 class= 引用,不是注释里的字面字符串(L85 注释提到 host-info-row 是合理的)
const classRefs = (roomTemplate.match(/class="host-info-row"/g) || []).length
check('template 不出现 class="host-info-row" 引用 (T1 已删)',
  classRefs === 0,
  '实际 ' + classRefs + ' 次')

// =========================================================================
section('2. T1 修复 — cut-card 切牌按钮文字包含四种花色')
// =========================================================================

const cutCardMatch = roomTemplate.match(/<div class="cut-card"[^>]*>([\s\S]*?)<\/div>/)
const cutCardText = cutCardMatch ? cutCardMatch[1] : ''

const suitChars = ['♠', '♦', '♣', '♥']
const missingSuits = suitChars.filter(c => !cutCardText.includes(c))
check('cut-card 文字包含 ♠/♦/♣/♥ 四种花色 (T1 补了 ♥)',
  missingSuits.length === 0 && cutCardText.length > 0,
  missingSuits.length ? '缺: ' + missingSuits.join(' ') : '')

check('cut-card 文字还包含中文"切牌"',
  /切牌/.test(cutCardText))

// =========================================================================
section('3. T2 修复 — style scoped 包含 @media (orientation: landscape)')
// =========================================================================

const landscapeCount = (roomStyle.match(/@media \(orientation: landscape\)/g) || []).length
check('@media (orientation: landscape) 出现 ≥ 3 次 (T2 加 3 段)',
  landscapeCount >= 3,
  '实际 ' + landscapeCount + ' 次')

// 至少要有 .seat-* 在 landscape 下重定位
// 把 4 段独立的 landscape 块分别切出来,各段内单独搜 .seat-X
const landscapeBlockRx = /@media \(orientation: landscape\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g
const landscapeBlocks = []
let bm
while ((bm = landscapeBlockRx.exec(roomStyle)) !== null) landscapeBlocks.push(bm[1])

// 4 座位在所有 landscape 段内合计出现 ≥ 4 次
const seatNames = ['seat-top', 'seat-bottom', 'seat-left', 'seat-right']
const seatHitsInLandscape = seatNames.reduce((sum, n) =>
  sum + landscapeBlocks.filter(b => new RegExp('\\.' + n + '\\s*\\{').test(b)).length, 0)
check('landscape 4 座位 (.seat-*) 都有重定位规则 (T2 改)',
  seatHitsInLandscape >= 4,
  '在 ' + landscapeBlocks.length + ' 段 landscape 内,座位规则合计 ' + seatHitsInLandscape + ' 次')

// landscape .info-card 居中浮动
check('landscape .info-card 居中 (transform: translate(-50%, -50%))',
  /@media \(orientation: landscape\)\s*\{[\s\S]*?\.info-card\s*\{[\s\S]*?transform:\s*translate\(-50%,\s*-50%\)/.test(roomStyle))

// =========================================================================
section('4. QrFallbackCard.vue 中文断行契约 (跟 RoomView 关联, 这里也守一道)')
// =========================================================================

// RoomView 不直接管 word-break,但确保 QrFallbackCard 契约没被回退
// (host info 卡片嵌在 RoomView 里)
import { existsSync } from 'node:fs'
const QR_CARD = resolve(ROOT, 'src/components/QrFallbackCard.vue')
let qrStyle = ''
if (existsSync(QR_CARD)) {
  const qrSrc = readFileSync(QR_CARD, 'utf8')
  const s = qrSrc.match(/<style scoped>([\s\S]*?)<\/style>/)
  qrStyle = s ? s[1] : ''
}

check('QrFallbackCard .qr-fallback-ip 用 word-break: keep-all (中文保整)',
  /\.qr-fallback-ip\s*\{[\s\S]*?word-break:\s*keep-all/.test(qrStyle))

check('QrFallbackCard .qr-fallback-ip 用 overflow-wrap: anywhere (IP 数字串可任意断行)',
  /\.qr-fallback-ip\s*\{[\s\S]*?overflow-wrap:\s*anywhere/.test(qrStyle))

// =========================================================================
section('5. 浮层红线 — RoomView.vue 不出现新 position: fixed (L718 copy-toast 是 v2.2 唯一合法)')
// =========================================================================

const fixedCount = (roomStyle.match(/position:\s*fixed\s*;/g) || []).length
check('RoomView.vue style scoped 内 position: fixed 出现次数 == 1 (只允许 copy-toast)',
  fixedCount === 1,
  '实际 ' + fixedCount + ' 次 — T1+T2 不允许引入新浮层')

// 唯一 fixed 必须在 .copy-toast 选择器里
check('唯一 position: fixed 属于 .copy-toast 选择器 (v2.2 合法的 toast)',
  /\.copy-toast\s*\{[^}]*position:\s*fixed/.test(roomStyle))

// 防御性:不允许新加 .modal / .dialog / .overlay / .popup / .drawer 浮层类(粗筛)
const newOverlayRx = /\.(modal|dialog|overlay|popup|drawer|tooltip|toast-(?!fade)|floating)-?\w*\s*\{[^}]*position:\s*(fixed|absolute)\s*;[^}]*z-index/g
const newOverlays = (roomStyle.match(newOverlayRx) || []).filter(m => !m.includes('copy-toast'))
check('不出现新的浮层类名 (.modal/.dialog/.overlay/.popup/.drawer 等)',
  newOverlays.length === 0,
  newOverlays.length ? '新浮层: ' + newOverlays.join(' | ') : '')

// =========================================================================
section('6. P0-06 浏览器 host 不展示虚假跨设备邀请')
// =========================================================================

check('template 使用 canInviteCrossDevice 控制 IP 显示',
  /canInviteCrossDevice/.test(roomTemplate))
check('template 含浏览器仅本机多标签提示文案',
  /浏览器仅本机多标签/.test(roomTemplate))
check('template 中复制 IP 按钮带 canInviteCrossDevice 守卫',
  /v-if="isHost && canInviteCrossDevice"/.test(roomTemplate))
check('script 中订阅 message:READY_COMMITTED(P1-05)',
  /onNet\('message:READY_COMMITTED'/.test(roomFull))

// =========================================================================
section('7. Phase3 同步切牌契约')
// =========================================================================

check('template 包含同步切牌覆盖层 .cut-overlay',
  /class="cut-overlay"/.test(roomTemplate))
check('template 包含切牌面板 .cut-panel',
  /class="cut-panel"/.test(roomTemplate))
check('template 切牌面板用 v-for 渲染 4 张扣牌 .cut-card-back',
  /v-for="i in 4"[\s\S]*?class="cut-card-back"/.test(roomTemplate))
check('script 中 GAME_START 广播携带 firstSeat',
  /type:\s*'GAME_START'[\s\S]*?firstSeat/.test(roomFull))
check('script 中 GAME_START 监听解析 firstSeat 并加入 URL',
  /payload\.firstSeat/.test(roomFull) && /firstSeat/.test(roomFull))
check('script 中 performCutAndStart 函数存在',
  /function performCutAndStart\(\)/.test(roomFull))

// =========================================================================
console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)
