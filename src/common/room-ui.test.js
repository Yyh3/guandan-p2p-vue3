/**
 * room-ui 端到端字符串断言 — v4.x RoomView 大改版
 *
 * 目的: 在 RoomView / GameView 大改版阶段,把新的视觉契约落成字符串断言。
 * 不渲染 Vue,只用 Node fs + assert,跟项目其它 *.test.js 模式一致。
 *
 * 用法: node src/common/room-ui.test.js
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..', '..') // src/common → repo root
const ROOM_VUE = resolve(ROOT, 'src/views/room/RoomView.vue')
const QR_CARD = resolve(ROOT, 'src/components/QrFallbackCard.vue')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, extra ? '\n    ' + extra : '') }
}
function section(s) { console.log('\n=== ' + s + ' ===') }

function extractTemplate(src) {
  // 匹配根 <template> 块:Vue SFC 的根 template 从文件第一个 <template> 开始,
  // 到 <script setup> 之前的最后一个 </template> 结束。内层 <template v-if> 等条件
  // 渲染标签不应影响根块边界。
  const scriptStart = src.indexOf('<script setup>')
  const firstTemplateStart = src.indexOf('<template>')
  const lastTemplateEnd = src.lastIndexOf('</template>', scriptStart >= 0 ? scriptStart : undefined)
  if (firstTemplateStart < 0 || lastTemplateEnd <= firstTemplateStart) {
    throw new Error('找不到根 <template> 块')
  }
  return src.slice(firstTemplateStart + '<template>'.length, lastTemplateEnd)
}
function extractStyleScoped(src) {
  const m = src.match(/<style scoped>([\s\S]*?)<\/style>/)
  if (!m) throw new Error('找不到 <style scoped> 块')
  return m[1]
}

let roomTemplate = '', roomStyle = '', qrStyle = '', roomFull = ''
try {
  roomFull = readFileSync(ROOM_VUE, 'utf8')
  roomTemplate = extractTemplate(roomFull)
  roomStyle = extractStyleScoped(roomFull)
  const qrSrc = readFileSync(QR_CARD, 'utf8')
  qrStyle = extractStyleScoped(qrSrc)
} catch (e) {
  console.error('读源文件失败:', e.message)
  process.exit(1)
}

// =========================================================================
section('1. RoomView.vue <template> 关键 class 必须存在')
// =========================================================================

check('template 包含 class="info-card"',
  /class="info-card"/.test(roomTemplate))

check('template 包含 class="cut-card"',
  /class="cut-card"/.test(roomTemplate))

const seatClasses = ['seat-top', 'seat-bottom', 'seat-left', 'seat-right']
const missingSeatClasses = seatClasses.filter(c => !roomTemplate.includes(c))
check('template 仍包含 4 个位置类名 (seat-top/bottom/left/right)',
  missingSeatClasses.length === 0,
  missingSeatClasses.length ? '缺: ' + missingSeatClasses.join(', ') : '')
check('template 使用 v-for 渲染 4 座位',
  /v-for=\s*"\s*s\s+in\s+\[\s*0\s*,\s*1\s*,\s*2\s*,\s*3\s*\]"/.test(roomTemplate),
  '未找到 v-for="s in [0,1,2,3]"')

// =========================================================================
section('2. host-info-row 已从 template 删除')
// =========================================================================

check('template 不出现 class="host-info-row"',
  !/class="host-info-row"/.test(roomTemplate))

// =========================================================================
section('3. 切牌按钮文字包含四种花色 (♠ ♦ ♣ ♥) 不漏花色')
// =========================================================================

const suitChars = ['♠', '♦', '♣', '♥']
const cutCardMatch = roomTemplate.match(/<div class="cut-card"[^>]*>([\s\S]*?)<\/div>/)
const cutCardText = cutCardMatch ? cutCardMatch[1] : ''

const missingSuits = suitChars.filter(c => !cutCardText.includes(c))
check('cut-card 按钮文字包含四种花色 ♠/♦/♣/♥',
  missingSuits.length === 0 && cutCardText.length > 0,
  missingSuits.length ? '缺: ' + missingSuits.join(' ') : '')

check('cut-card 按钮还包含中文"切牌"提示',
  /切牌/.test(cutCardText))

// =========================================================================
section('4. style scoped 包含 ≥ 3 段 landscape media query')
// =========================================================================

const landscapeBlocks = roomStyle.match(/@media \(orientation: landscape\)\s*\{/g) || []
check('@media (orientation: landscape) 出现 ≥ 3 次',
  landscapeBlocks.length >= 3,
  '实际 ' + landscapeBlocks.length + ' 次')

check('landscape .cut-card 贴右下',
  /@media \(orientation: landscape\)\s*\{[\s\S]*?\.cut-card\s*\{[^}]*right:\s*calc\(16px[^}]*bottom:\s*80px/.test(roomStyle))

check('landscape .info-card 居中 + 最大宽度适配窄屏',
  /@media \(orientation: landscape\)\s*\{[\s\S]*?\.info-card\s*\{[\s\S]*?transform:\s*translate\(-50%,\s*-50%\)/.test(roomStyle) &&
  /@media \(orientation: landscape\)\s*\{[\s\S]*?\.info-card\s*\{[\s\S]*?max-width:\s*min\(320px,\s*42vw\)/.test(roomStyle))

const landscapeSeats = ['seat-top', 'seat-bottom', 'seat-left', 'seat-right']
const missingLandscapeSeats = landscapeSeats.filter(s => {
  const rx = new RegExp(`@media \\(orientation: landscape\\)\\s*\\{[\\s\\S]*?\\.${s}\\s*\\{`)
  return !rx.test(roomStyle)
})
check('landscape 4 座位 (.seat-*) 都重新定位',
  missingLandscapeSeats.length === 0,
  missingLandscapeSeats.length ? '缺: ' + missingLandscapeSeats.join(', ') : '')

// =========================================================================
section('5. 320px 屏切牌按钮压缩到 60×60')
// =========================================================================

check('存在 @media (max-width: 360px) 切牌按钮压缩段',
  /@media \(max-width: 360px\)\s*\{[\s\S]*?\.cut-card\s*\{/.test(roomStyle))

check('压缩段: width: 60px',
  /@media \(max-width: 360px\)\s*\{[\s\S]*?\.cut-card\s*\{[\s\S]*?width:\s*60px/.test(roomStyle))

check('压缩段: height: 60px',
  /@media \(max-width: 360px\)\s*\{[\s\S]*?\.cut-card\s*\{[\s\S]*?height:\s*60px/.test(roomStyle))

// =========================================================================
section('6. info-card 内部滚动保护')
// =========================================================================

const infoCardPortrait = roomStyle.match(/\.info-card\s*\{([^{}]*)\}/)
const infoCardPortraitBody = infoCardPortrait ? infoCardPortrait[1] : ''

check('portrait .info-card 包含 max-height: 80vh',
  /max-height:\s*80vh/.test(infoCardPortraitBody))

check('portrait .info-card 包含 overflow-y: auto',
  /overflow-y:\s*auto/.test(infoCardPortraitBody))

// =========================================================================
section('7. safe-area 安全区')
// =========================================================================

check('使用 env(safe-area-inset-*)',
  /env\(safe-area-inset-(top|bottom)/.test(roomStyle))

// =========================================================================
section('8. QrFallbackCard.vue 中文断行')
// =========================================================================

check('QrFallbackCard .qr-fallback-ip 用 word-break: keep-all',
  /\.qr-fallback-ip\s*\{[\s\S]*?word-break:\s*keep-all/.test(qrStyle))

check('QrFallbackCard .qr-fallback-ip 用 overflow-wrap: anywhere',
  /\.qr-fallback-ip\s*\{[\s\S]*?overflow-wrap:\s*anywhere/.test(qrStyle))

check('QrFallbackCard .qr-fallback-join-url 也用 keep-all + anywhere',
  /\.qr-fallback-join-url\s*\{[\s\S]*?word-break:\s*keep-all/.test(qrStyle) &&
  /\.qr-fallback-join-url\s*\{[\s\S]*?overflow-wrap:\s*anywhere/.test(qrStyle))

// =========================================================================
section('9. position: fixed 浮层红线 — 只允许 1 处 (copy-toast)')
// =========================================================================

const fixedMatches = roomStyle.match(/position:\s*fixed\s*;/g) || []
check('RoomView.vue style scoped 内 position: fixed 出现次数 == 1',
  fixedMatches.length === 1,
  '实际 ' + fixedMatches.length + ' 次')

check('唯一 position: fixed 属于 .copy-toast',
  /\.copy-toast\s*\{[^}]*position:\s*fixed/.test(roomStyle))

// =========================================================================
section('10. 背景层与星空')
// =========================================================================

check('template 包含 .bg-stars 星空层容器',
  /class="bg-stars"/.test(roomTemplate))

check('template 包含 .star 星点',
  (roomTemplate.match(/class="star"/g) || []).length >= 1)

check('CSS .bg-stars 容器 position: absolute + inset: 0',
  /\.bg-stars\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/.test(roomStyle))

check('CSS .star 元素 border-radius: 50%',
  /\.star\s*\{[\s\S]*?border-radius:\s*50%/.test(roomStyle))

check('CSS .bg-felt 用 var(--felt-base)',
  /\.bg-felt\s*\{[\s\S]*?background:\s*var\(--felt-base\)/.test(roomStyle))

// =========================================================================
section('11. 房间信息卡玻璃拟态')
// =========================================================================

check('CSS .info-card 用 var(--glass-bg)',
  /\.info-card\s*\{[\s\S]*?background:\s*var\(--glass-bg\)/.test(roomStyle))

check('CSS .info-card 用 backdrop-filter',
  /\.info-card\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-blur\)/.test(roomStyle))

check('CSS .info-card 用 var(--glass-border)',
  /\.info-card\s*\{[\s\S]*?border:\s*1px solid var\(--glass-border\)/.test(roomStyle))

check('CSS .info-roomno 用渐变金色',
  /\.info-roomno\s*\{[\s\S]*?background:\s*var\(--gold-metallic\)/.test(roomStyle))

// =========================================================================
section('12. 4 座位布局与头像')
// =========================================================================

check('CSS .seat 存在',
  /\.seat\s*\{/.test(roomStyle))

check('CSS .seat-avatar 圆形头像',
  /\.seat-avatar\s*\{[\s\S]*?border-radius:\s*50%/.test(roomStyle))

check('CSS .seat-top.filled 用金色头像边框',
  /\.seat-top\.filled\s+\.seat-avatar\s*\{[\s\S]*?border-color:\s*var\(--gold-bright\)/.test(roomStyle))

check('CSS .seat-bottom.filled 用队友蓝边框',
  /\.seat-bottom\.filled\s+\.seat-avatar\s*\{[\s\S]*?border-color:/.test(roomStyle))

check('CSS .seat.empty 边框虚线',
  /\.seat\.empty\s*\{[\s\S]*?border-style:\s*dashed/.test(roomStyle))

check('CSS .ready-mark 绿色背景',
  /\.ready-mark\s*\{[\s\S]*?background:\s*linear-gradient\([^)]*#4caf50/.test(roomStyle))

// =========================================================================
section('13. HOST 皇冠徽章')
// =========================================================================

check('template 包含 .seat-badge-crown',
  /class="seat-badge seat-badge-crown"/.test(roomTemplate))

check('CSS .seat-badge-crown 字号 ≥ 24px',
  /\.seat-badge-crown\s*\{[\s\S]*?font-size:\s*(2[4-9]|3[0-9])px/.test(roomStyle))

// =========================================================================
section('14. 底部按钮层级')
// =========================================================================

check('template 包含 app-btn-primary 主按钮',
  /class="app-btn app-btn-primary"/.test(roomTemplate))

check('模板包含邀请好友按钮',
  /data-testid="btn-invite"/.test(roomTemplate))

check('template actions-row 包含开始游戏 + 邀请好友两个按钮',
  /data-testid="actions-row"/.test(roomTemplate) &&
  /data-testid="btn-start"/.test(roomTemplate) &&
  /data-testid="btn-invite"/.test(roomTemplate))

// =========================================================================
section('15. data-testid 测试钩子覆盖')
// =========================================================================

const testIds = [
  'room-info-card',
  'seat-top',
  'seat-bottom',
  'seat-left',
  'seat-right',
  'actions-row',
  'btn-start',
  'btn-invite',
  'copy-ip-btn',
  'cut-card',
  'copy-toast',
]
const missingTestIds = testIds.filter(id => {
  const literal = new RegExp('data-testid="' + id + '"').test(roomTemplate)
  const dynamic = roomTemplate.includes('`seat-' + id.split('-')[1] + '`') ||
                  roomTemplate.includes("'seat-" + id.split('-')[1] + "'")
  return !literal && !dynamic
})
check('template 含所有 data-testid 测试钩子 (11 个)',
  missingTestIds.length === 0,
  missingTestIds.length ? '缺: ' + missingTestIds.join(', ') : '')

// =========================================================================
section('16. 新 CSS 引用主题 token')
// =========================================================================

check('.info-card 引用 --glass-bg token',
  /\.info-card[\s\S]{0,300}--glass-bg/.test(roomStyle))

check('.info-roomno 引用 --gold-metallic token',
  /\.info-roomno[\s\S]{0,200}gold-metallic/.test(roomStyle))

check('.page 引用 --bg-page token',
  /\.page\s*\{[\s\S]{0,400}--bg-page/.test(roomStyle))

check('.bg-felt 引用 --felt-base token',
  /\.bg-felt[\s\S]{0,300}--felt-base/.test(roomStyle))

// =========================================================================
console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)
