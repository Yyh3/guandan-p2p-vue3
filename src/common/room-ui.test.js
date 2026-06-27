/**
 * room-ui 端到端字符串断言 — v3.x 阶段 3 重做 (UI-REDESIGN-V3-SPEC §4)
 *
 * 目的:回应 v3.x RoomView 重做 — 把"深蓝星空 + 玻璃卡 + 菱形座位 + 金色按钮"
 * 的视觉契约落成字符串断言(不渲染 Vue,只用 Node fs + assert)。
 *
 * 跟前版(v2.4-p2)差异:
 *   - info-card 从"底部浮动"改成"顶部浮动"(spec §4.2:房间信息卡玻璃面板顶部居中)
 *     → safe-area 检查改用 inset-top 跟原 inset-bottom 等价
 *   - 新增 v3.x 视觉契约:
 *       玻璃面板 (.glass-bg + backdrop-filter)
 *       金色金属头像边框 (.seat-avatar border)
 *       HOST 皇冠徽章 (.seat-badge-crown)
 *       金色金属开始按钮 (.btn-primary + gold-metallic)
 *       玻璃拟态邀请按钮 (.btn-secondary + backdrop-filter)
 *       星空背景 (.bg-stars + .star)
 *       felt 椭圆 (.bg-felt)
 *       data-testid 契约
 *
 * 跟项目其它 src/common/*.test.js 模式完全一致。
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

let roomTemplate = '', roomStyle = '', qrStyle = '', roomFull = ''
try {
  roomFull = readFileSync(ROOM_VUE, 'utf8')
  roomTemplate = extractTemplate(roomFull)
  roomStyle    = extractStyleScoped(roomFull)
  const qrSrc   = readFileSync(QR_CARD, 'utf8')
  qrStyle       = extractStyleScoped(qrSrc)
} catch (e) {
  console.error('读源文件失败:', e.message)
  process.exit(1)
}

// =========================================================================
// 关键契约 — 守住 v2.4-p2 / T1+T2 修复不回归(本版 v3.x 仍必须)
// =========================================================================

// =========================================================================
section('1. RoomView.vue <template> 关键 class 必须存在')
// =========================================================================

check('template 包含 class="info-card" (顶部玻璃信息卡)',
  /class="info-card"/.test(roomTemplate))

check('template 包含 class="cut-card" (切牌按钮,T1 修复)',
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
// 模板里 0 次 class= 引用即可,功能影响 0。
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
section('4. T2 修复 — style scoped 包含 ≥ 3 段 landscape media query')
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
section('6. v3.x — info-card 内部滚动保护 (portrait 长内容不溢出)')
// =========================================================================

// v3.x info-card 在 portrait 用 top 定位(顶部居中),不再像 v2.4 那样用 bottom;
// 但 spirit 不变:卡片要有 max-height + overflow-y 防止超出屏。
const infoCardPortrait = roomStyle.match(/\.info-card\s*\{([^{}]*)\}/)
const infoCardPortraitBody = infoCardPortrait ? infoCardPortrait[1] : ''

check('portrait .info-card 包含 max-height: 80vh (防溢出)',
  /max-height:\s*80vh/.test(infoCardPortraitBody))

check('portrait .info-card 包含 overflow-y: auto (内部滚动保护)',
  /overflow-y:\s*auto/.test(infoCardPortraitBody))

// =========================================================================
section('7. v3.x — info-card 用 safe-area 避开刘海/home indicator')
// =========================================================================

// v3.x info-card 在 portrait 用 top 定位 + env(safe-area-inset-top),而不是 bottom。
// (v2.4 时代 info-card 在底部所以测 inset-bottom;v3.x 顶部所以改 inset-top,
//  spirit 都是"避开手机刘海 / 状态栏 / home indicator"。)
check('portrait .info-card 用 env(safe-area-inset-top) 安全区 (顶部避开刘海)',
  /\.info-card\s*\{[\s\S]*?top:\s*max\([^)]*env\(safe-area-inset-top/.test(roomStyle))

// 全局安全区用 env() 不用硬编码
check('使用 env(safe-area-inset-*) 安全区 (iPhone notch / home indicator)',
  /env\(safe-area-inset-(top|bottom)/.test(roomStyle))

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
section('9. position: fixed 浮层红线 — 当前只允许 1 处 (copy-toast)')
// =========================================================================

const fixedMatches = roomStyle.match(/position:\s*fixed\s*;/g) || []
check('RoomView.vue style scoped 内 position: fixed 出现次数 == 1 (只允许 copy-toast)',
  fixedMatches.length === 1,
  '实际 ' + fixedMatches.length + ' 次,新引入浮层是违规红线')

// 浮层上下文断言 — 唯一 fixed 必须在 .copy-toast 选择器里
check('唯一 position: fixed 属于 .copy-toast (v2.2 task A 合法的 toast)',
  /\.copy-toast\s*\{[^}]*position:\s*fixed/.test(roomStyle))

// =========================================================================
// v3.x 新增契约 (UI-REDESIGN-V3-SPEC §4)
// =========================================================================

// =========================================================================
section('10. v3.x §4.1 — 背景层:深蓝星空 (.bg-stars + .star) + felt 椭圆 (.bg-felt)')
// =========================================================================

check('template 包含 .bg-stars 星空层容器',
  /class="bg-stars"/.test(roomTemplate))

check('template 包含 .star 星点(14 个,v-for 渲染)',
  (roomTemplate.match(/class="star"/g) || []).length >= 1)

check('CSS .bg-stars 容器 position: absolute + inset: 0',
  /\.bg-stars\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/.test(roomStyle))

check('CSS .star 元素 border-radius: 50% (圆形星点)',
  /\.star\s*\{[\s\S]*?border-radius:\s*50%/.test(roomStyle))

check('CSS .star 元素 background: var(--room-star) (token 化颜色)',
  /\.star\s*\{[\s\S]*?background:\s*var\(--room-star\)/.test(roomStyle))

check('CSS .bg-felt 椭圆 felt 桌面',
  /\.bg-felt\s*\{/.test(roomStyle))

check('CSS .bg-felt 用 var(--felt-base) 渐变',
  /\.bg-felt\s*\{[\s\S]*?background:\s*var\(--felt-base\)/.test(roomStyle))

// =========================================================================
section('11. v3.x §4.2 — 房间信息卡 (.info-card) 玻璃拟态')
// =========================================================================

check('CSS .info-card 用 var(--glass-bg) 玻璃背景',
  /\.info-card\s*\{[\s\S]*?background:\s*var\(--glass-bg\)/.test(roomStyle))

check('CSS .info-card 用 backdrop-filter 玻璃模糊',
  /\.info-card\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-blur\)/.test(roomStyle))

check('CSS .info-card 用 var(--glass-border) 玻璃边框',
  /\.info-card\s*\{[\s\S]*?border:\s*1px solid var\(--glass-border\)/.test(roomStyle))

check('CSS .info-card 房间号用 var(--font-display) 32px bold 金色',
  /\.info-roomno\s*\{[\s\S]*?font:\s*var\(--font-display\)/.test(roomStyle) &&
  /\.info-roomno\s*\{[\s\S]*?color:\s*var\(--gold-bright\)/.test(roomStyle))

check('CSS .info-roomno 用 gold-metallic 渐变文字',
  /\.info-roomno\s*\{[\s\S]*?background:\s*var\(--gold-metallic\)/.test(roomStyle))

// =========================================================================
section('12. v3.x §4.3 — 4 座位菱形布局 + 金色头像边框 + 玻璃卡底')
// =========================================================================

// 座位卡底(玻璃)
check('CSS .seat 玻璃背景 var(--glass-bg)',
  /\.seat\s*\{[\s\S]*?background:\s*var\(--glass-bg\)/.test(roomStyle))

check('CSS .seat backdrop-filter 玻璃模糊',
  /\.seat\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-blur\)/.test(roomStyle))

// 金色头像边框
check('CSS .seat-avatar border: 3px solid var(--gold-primary) 金色边框',
  /\.seat-avatar\s*\{[\s\S]*?border:\s*3px solid var\(--gold-primary\)/.test(roomStyle))

check('CSS .seat-avatar border-radius: 50% 圆形头像',
  /\.seat-avatar\s*\{[\s\S]*?border-radius:\s*50%/.test(roomStyle))

// HOST 头像特殊光环
check('CSS .seat-top .seat-avatar 边框用 var(--gold-bright) 高亮金',
  /\.seat-top\s+\.seat-avatar\s*\{[\s\S]*?border-color:\s*var\(--gold-bright\)/.test(roomStyle))

check('CSS .seat-top .seat-avatar 用 pulse-glow 脉冲动画',
  /\.seat-top\s+\.seat-avatar\s*\{[\s\S]*?animation:\s*pulse-glow/.test(roomStyle))

// 等待加入座位 dashed 边框 + 脉冲
check('CSS .seat.empty 边框虚线 dashed',
  /\.seat\.empty\s*\{[\s\S]*?border-style:\s*dashed/.test(roomStyle))

// 准备就绪绿色角标
check('CSS .ready-mark 绿色背景',
  /\.ready-mark\s*\{[\s\S]*?background:\s*linear-gradient\([^)]*#4caf50/.test(roomStyle))

// =========================================================================
section('13. v3.x §4.3 — HOST 皇冠徽章 (.seat-badge-crown)')
// =========================================================================

check('template 包含 .seat-badge-crown 皇冠徽章(只 seat-top 有)',
  /class="seat-badge seat-badge-crown"/.test(roomTemplate))

check('CSS .seat-badge-crown 字号 ≥ 24px (皇冠足够大)',
  /\.seat-badge-crown\s*\{[\s\S]*?font-size:\s*(2[4-9]|3[0-9])px/.test(roomStyle))

// =========================================================================
section('14. v3.x §4.4 — 底部按钮 (.btn-primary 金色金属 + .btn-secondary 玻璃)')
// =========================================================================

check('template 包含 .btn-primary 主按钮 (开始游戏 / 准备)',
  /class="btn btn-primary"/.test(roomTemplate))

check('template 包含 .btn-secondary 副按钮 (邀请好友)',
  /class="btn btn-secondary"/.test(roomTemplate))

check('template actions-row 包含开始游戏 + 邀请好友两个按钮',
  /data-testid="actions-row"/.test(roomTemplate) &&
  /data-testid="btn-start"/.test(roomTemplate) &&
  /data-testid="btn-invite"/.test(roomTemplate))

check('CSS .btn-primary 用 var(--gold-metallic) 金色金属渐变背景',
  /\.btn-primary\s*\{[\s\S]*?background:\s*var\(--gold-metallic\)/.test(roomStyle))

// 共享样式(.btn 基类)— 高度/字体/圆角在 .btn 上(DRY),.btn-primary/secondary 继承
check('CSS .btn 基类高度 56px (spec §4.4 要求)',
  /\.btn\s*\{[\s\S]*?height:\s*56px/.test(roomStyle))

check('CSS .btn 基类用 var(--font-button) 按钮字体',
  /\.btn\s*\{[\s\S]*?font:\s*var\(--font-button\)/.test(roomStyle))

check('CSS .btn 基类圆角 var(--radius-pill) 胶囊',
  /\.btn\s*\{[\s\S]*?border-radius:\s*var\(--radius-pill\)/.test(roomStyle))

check('CSS .btn-secondary 玻璃背景 + 金色边框',
  /\.btn-secondary\s*\{[\s\S]*?background:\s*var\(--glass-bg\)[\s\S]*?border:\s*1\.5px solid var\(--gold-primary\)/.test(roomStyle))

check('CSS .btn-secondary 用 backdrop-filter 玻璃模糊',
  /\.btn-secondary\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-blur\)/.test(roomStyle))

check('CSS .btn-secondary 文字色 var(--gold-bright) 高亮金',
  /\.btn-secondary\s*\{[\s\S]*?color:\s*var\(--gold-bright\)/.test(roomStyle))

// =========================================================================
section('15. v3.x — data-testid 测试钩子覆盖(8 个关键节点)')
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
const missingTestIds = testIds.filter(id =>
  !new RegExp('data-testid="' + id + '"').test(roomTemplate))
check('template 含所有 data-testid 测试钩子 (11 个)',
  missingTestIds.length === 0,
  missingTestIds.length ? '缺: ' + missingTestIds.join(', ') : '')

// =========================================================================
section('16. v3.x — 硬编码色替换 token 化(绿 / 金 / 玻璃 / 房间深蓝)')
// =========================================================================

// 不允许新出现硬编码 #4a7eff 等(应该用 token);旧的死 CSS 允许保留
// 这里只检查新加的样式块是否引用 token
const newGoldRef = /\.btn-primary[\s\S]{0,200}gold-metallic/.test(roomStyle)
const newGlassRef = /\.info-card[\s\S]{0,300}--glass-bg/.test(roomStyle)
const newRoomBgRef = /\.page\s*\{[\s\S]{0,400}--room-bg-(deep|mid)/.test(roomStyle)
const newEmeraldRef = /\.bg-felt[\s\S]{0,300}--felt-base|--emerald-/.test(roomStyle)

check('新 CSS 块引用 --gold-metallic token (无硬编码)',
  newGoldRef)
check('新 CSS 块引用 --glass-bg token',
  newGlassRef)
check('新 .page CSS 引用 --room-bg-* token',
  newRoomBgRef)
check('新 .bg-felt CSS 引用 --felt-base 或 --emerald- token',
  newEmeraldRef)

// =========================================================================
console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)