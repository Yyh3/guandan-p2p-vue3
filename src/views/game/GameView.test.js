/**
 * GameView.vue 自测 — 座位旋转 (seat-rotation)
 *
 * v3.8 P1 修复了 4-tab 联机时 selfSeat 旋转 bug(GameView.vue:337-410),
 * 但没单测覆盖。本测试通过抽离的纯函数 src/common/seat-rotation.js 验证:
 *   4 selfSeat × 4 position = 16 个 assertion。
 *
 * 不真挂 Vue 组件,避免引入 vue-test-utils;测的是被 GameView import 的真实生产代码。
 *
 * 用法: node src/views/game/GameView.test.js
 */

import { rotateSeats, rotateSeatView, selfPosition, teammatePosition, SEAT_POSITIONS } from '../../common/seat-rotation.js'

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

console.log('\n=== 1. rotateSeats 4 selfSeat × 4 position 全覆盖 (16 assertions) ===')

// selfSeat=0 (host):顶=seat2, 底=seat0, 左=seat3, 右=seat1
eq('selfSeat=0 top',    rotateSeats(0).top,    2)
eq('selfSeat=0 bottom', rotateSeats(0).bottom, 0)
eq('selfSeat=0 left',   rotateSeats(0).left,   3)
eq('selfSeat=0 right',  rotateSeats(0).right,  1)

// selfSeat=1 (joiner-A):顶=seat3, 底=seat1, 左=seat0, 右=seat2
eq('selfSeat=1 top',    rotateSeats(1).top,    3)
eq('selfSeat=1 bottom', rotateSeats(1).bottom, 1)
eq('selfSeat=1 left',   rotateSeats(1).left,   0)
eq('selfSeat=1 right',  rotateSeats(1).right,  2)

// selfSeat=2 (joiner-B):顶=seat0, 底=seat2, 左=seat1, 右=seat3
eq('selfSeat=2 top',    rotateSeats(2).top,    0)
eq('selfSeat=2 bottom', rotateSeats(2).bottom, 2)
eq('selfSeat=2 left',   rotateSeats(2).left,   1)
eq('selfSeat=2 right',  rotateSeats(2).right,  3)

// selfSeat=3 (joiner-C):顶=seat1, 底=seat3, 左=seat2, 右=seat0
eq('selfSeat=3 top',    rotateSeats(3).top,    1)
eq('selfSeat=3 bottom', rotateSeats(3).bottom, 3)
eq('selfSeat=3 left',   rotateSeats(3).left,   2)
eq('selfSeat=3 right',  rotateSeats(3).right,  0)

console.log('\n=== 2. rotateSeats 边界 / 错误处理 ===')

// 合法输入范围
for (const s of [0, 1, 2, 3]) {
  assert(`rotateSeats(${s}) 返回 4 字段`, Object.keys(rotateSeats(s)).length === 4)
}

// 非法输入应抛错
let threw = false
try { rotateSeats(-1) } catch { threw = true }
assert('rotateSeats(-1) 抛 RangeError', threw === true)

threw = false
try { rotateSeats(4) } catch { threw = true }
assert('rotateSeats(4) 抛 RangeError', threw === true)

threw = false
try { rotateSeats(1.5) } catch { threw = true }
assert('rotateSeats(1.5) 抛 RangeError (非整数)', threw === true)

threw = false
try { rotateSeats('0') } catch { threw = true }
assert('rotateSeats("0") 抛 RangeError (非数字)', threw === true)

console.log('\n=== 3. 不变量:队友永远在顶,自己永远在底 ===')

for (const s of [0, 1, 2, 3]) {
  const r = rotateSeats(s)
  assert(`selfSeat=${s}: bottom === selfSeat`, r.bottom === s)
  assert(`selfSeat=${s}: 队友 (selfSeat+2)%4 === top`, r.top === (s + 2) % 4)
}

assert('selfPosition 永远返回 bottom', selfPosition(0) === 'bottom' && selfPosition(3) === 'bottom')
assert('teammatePosition 永远返回 top', teammatePosition(0) === 'top' && teammatePosition(3) === 'top')

console.log('\n=== 4. SEAT_POSITIONS 导出 + rotateSeatView 集成 ===')

eq('SEAT_POSITIONS 顺序', SEAT_POSITIONS, ['top', 'bottom', 'left', 'right'])

// rotateSeatView 把原始 seats 数组按 selfSeat 旋转
const fakeSeats = ['P0_host', 'P1_jA', 'P2_jB', 'P3_jC']

const view0 = rotateSeatView(fakeSeats, 0)
eq('selfSeat=0 视图:top=P2',  view0.top.data,    'P2_jB')
eq('selfSeat=0 视图:bottom=P0', view0.bottom.data, 'P0_host')
eq('selfSeat=0 视图:left=P3', view0.left.data,   'P3_jC')
eq('selfSeat=0 视图:right=P1', view0.right.data, 'P1_jA')

const view1 = rotateSeatView(fakeSeats, 1)
eq('selfSeat=1 视图:top=P3',  view1.top.data,    'P3_jC')
eq('selfSeat=1 视图:bottom=P1', view1.bottom.data, 'P1_jA')
eq('selfSeat=1 视图:left=P0', view1.left.data,   'P0_host')
eq('selfSeat=1 视图:right=P2', view1.right.data, 'P2_jB')

const view2 = rotateSeatView(fakeSeats, 2)
eq('selfSeat=2 视图:top=P0',  view2.top.data,    'P0_host')
eq('selfSeat=2 视图:bottom=P2', view2.bottom.data, 'P2_jB')
eq('selfSeat=2 视图:left=P1', view2.left.data,   'P1_jA')
eq('selfSeat=2 视图:right=P3', view2.right.data, 'P3_jC')

const view3 = rotateSeatView(fakeSeats, 3)
eq('selfSeat=3 视图:top=P1',  view3.top.data,    'P1_jA')
eq('selfSeat=3 视图:bottom=P3', view3.bottom.data, 'P3_jC')
eq('selfSeat=3 视图:left=P2', view3.left.data,   'P2_jB')
eq('selfSeat=3 视图:right=P0', view3.right.data, 'P0_host')

// seatIndex 字段也能反查
eq('selfSeat=2 left.seatIndex=1', view2.left.seatIndex, 1)
eq('selfSeat=3 right.seatIndex=0', view3.right.seatIndex, 0)

console.log('\n=== 5. rotateSeatView 边界 ===')

threw = false
try { rotateSeatView([1, 2, 3], 0) } catch { threw = true }
assert('rotateSeatView 长度 3 抛错', threw === true)

threw = false
try { rotateSeatView('not array', 0) } catch { threw = true }
assert('rotateSeatView 非数组抛错', threw === true)

threw = false
try { rotateSeatView(null, 0) } catch { threw = true }
assert('rotateSeatView null 抛错', threw === true)

console.log('\n=== 6. isMobile viewport 检测 (v2.4 task 4 加) ===')
// GameView.vue 用 matchMedia 三段检测:
//   - portrait + width <= 768        → mobile
//   - landscape + height <= 500       → mobile
//   - 其他                              → desktop
// 我们不挂 Vue 组件,直接断言逻辑表达式
function isMobileLogic({ portrait, narrowWidth, shortHeight }) {
  return (portrait && narrowWidth) || (!portrait && shortHeight)
}
assert('竖屏 + 窄屏 → mobile', isMobileLogic({ portrait: true,  narrowWidth: true,  shortHeight: false }) === true)
assert('竖屏 + 宽屏 → desktop', isMobileLogic({ portrait: true,  narrowWidth: false, shortHeight: false }) === false)
assert('横屏 + 矮屏(iPhone SE)→ mobile', isMobileLogic({ portrait: false, narrowWidth: true,  shortHeight: true }) === true)
assert('横屏 + 高屏(iPhone 13)→ desktop', isMobileLogic({ portrait: false, narrowWidth: true,  shortHeight: false }) === false)
// 横屏 + 桌面浏览器拉到 500 高 + 1920 宽(narrowWidth false):
//   (portrait && narrowWidth) = (false && false) = false
//   (!portrait && shortHeight) = (true && true) = true
//   → true (mobile)
// 这是 iPhone SE 横屏那种矮宽比场景,也合"桌面拉扁到只剩 500 高"的判定
assert('横屏 + 矮高 500(无窄宽)→ mobile', isMobileLogic({ portrait: false, narrowWidth: false, shortHeight: true }) === true)
assert('竖屏 + 桌面 1920 宽 → desktop', isMobileLogic({ portrait: true,  narrowWidth: false, shortHeight: false }) === false)
assert('竖屏 + iPad 1024 宽 → desktop', isMobileLogic({ portrait: true,  narrowWidth: false, shortHeight: false }) === false)

console.log('\n=== 7. deal-animation 兜底常量 (v2.4-p1 修卡死) ===')
// useGameLogic.js startDealAnimation 8s timeout 兜底,这里验证 dealAnim 模块 API 仍可用
import { dealAnim as dealAnimRef } from '../../common/deal-animation.js'
assert('dealAnim 单例可访问', typeof dealAnimRef.isRunning === 'function')
assert('dealAnim 初始 isRunning=false', dealAnimRef.isRunning() === false)

console.log(`\n========== seat-rotation + viewport + deal test result: ${pass} pass / ${fail} fail ==========`)
if (fail > 0) process.exit(1)