/**
 * audio 模块自测脚本
 * 用法: node common/audio.test.js
 *
 * 浏览器 Web Audio API 在 Node 里不存在,只验证:
 *   - API 表面 / 默认值 / 状态开关
 *   - 在没 window 时不抛错(SSR / Node 安全)
 *   - getCtx / playSfxForType 等都能在无 window 下安全 noop
 */
import * as audio from './audio.js'

let pass = 0, fail = 0
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, '\n    期望:', b, '\n    实际:', a) }
}
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

console.log('\n=== 1. 模块导出 ===')
const required = [
  'unlock', 'startBgm', 'stopBgm', 'setBgmEnabled', 'setBgmVolume',
  'isBgmEnabled', 'isBgmStarted',
  'setBgmStyle', 'getBgmStyle',
  'playSfxForType', 'setSfxEnabled', 'setSfxVolume', 'isSfxEnabled',
  'sfxBomb', 'sfxJokerBomb', 'sfxSuperBomb',
  'sfxCountdownTick', 'sfxCountdownWarn', 'sfxUrgentBeep',
  'setMasterVolume', 'getCtx',
]
for (const k of required) {
  assert(`导出 ${k}`, typeof audio[k] === 'function')
}

console.log('\n=== 2. 状态查询 ===')
assert('默认 bgm 启用', audio.isBgmEnabled() === true)
assert('默认 sfx 启用', audio.isSfxEnabled() === true)
assert('默认 bgm 未开始', audio.isBgmStarted() === false)
assert('getCtx 在无 window 下返回 null', audio.getCtx() === null)
assert('默认 bgm 风格为 energetic', audio.getBgmStyle() === 'energetic')

console.log('\n=== 3. Node 环境不抛错(无 window) ===')
let threw = false
try { audio.unlock() } catch (e) { threw = true }
assert('unlock() 不抛错', threw === false)

threw = false
try { audio.startBgm() } catch (e) { threw = true }
assert('startBgm() 不抛错(noop)', threw === false)

threw = false
try { audio.stopBgm() } catch (e) { threw = true }
assert('stopBgm() 不抛错', threw === false)

threw = false
try { audio.playSfxForType('BOMB_4') } catch (e) { threw = true }
assert('playSfxForType 不抛错(noop)', threw === false)

threw = false
try { audio.playSfxForType(null) } catch (e) { threw = true }
assert('playSfxForType(null) 不抛错', threw === false)

threw = false
try { audio.playSfxForType(undefined) } catch (e) { threw = true }
assert('playSfxForType(undefined) 不抛错', threw === false)

console.log('\n=== 4. setBgmEnabled / setSfxEnabled 立即生效 ===')
audio.setBgmEnabled(false)
assert('关闭 BGM', audio.isBgmEnabled() === false)
audio.setBgmEnabled(true)
assert('开启 BGM', audio.isBgmEnabled() === true)
audio.setSfxEnabled(false)
assert('关闭 SFX', audio.isSfxEnabled() === false)
audio.setSfxEnabled(true)
assert('开启 SFX', audio.isSfxEnabled() === true)

console.log('\n=== 5. 音量 clamp ===')
threw = false
try { audio.setBgmVolume(-1) } catch (e) { threw = true }
assert('setBgmVolume(-1) 不抛错', threw === false)
threw = false
try { audio.setBgmVolume(2) } catch (e) { threw = true }
assert('setBgmVolume(2) 不抛错', threw === false)
threw = false
try { audio.setSfxVolume('abc') } catch (e) { threw = true }
assert('setSfxVolume(字符串) 不抛错', threw === false)
threw = false
try { audio.setMasterVolume(NaN) } catch (e) { threw = true }
assert('setMasterVolume(NaN) 不抛错', threw === false)

console.log('\n=== 6. playSfxForType 接受所有已知牌型 ===')
const types = [
  'SINGLE', 'PAIR', 'TRIPLE', 'TRIPLE_PAIR',
  'STRAIGHT', 'STRAIGHT_PAIR', 'STRAIGHT_TRIPLE', 'STRAIGHT_FLUSH',
  'BOMB_4', 'BOMB_5', 'BOMB_6', 'BOMB_7', 'BOMB_8', 'BOMB_9', 'BOMB_10', 'BOMB_11', 'BOMB_12', 'BOMB_13', 'BOMB_14',
  'JOKER_BOMB',
]
for (const t of types) {
  threw = false
  try { audio.playSfxForType(t) } catch (e) { threw = true }
  assert(`playSfxForType(${t}) 不抛错`, threw === false)
}

console.log('\n=== 7. playSfxForType 接受 count 参数(牌张数) ===')
for (const c of [1, 2, 3, 5, 7, 10, 13]) {
  threw = false
  try { audio.playSfxForType('SINGLE', c) } catch (e) { threw = true }
  assert(`playSfxForType(SINGLE, ${c}) 不抛错`, threw === false)
}
for (const c of [3, 5, 7, 10, 13]) {
  threw = false
  try { audio.playSfxForType('STRAIGHT', c) } catch (e) { threw = true }
  assert(`playSfxForType(STRAIGHT, ${c}) 不抛错`, threw === false)
}

console.log('\n=== 8. 炸弹层级(BOMB_4/5 → sfxBomb, BOMB_6+ → sfxSuperBomb) ===')
threw = false
try { audio.sfxBomb() } catch (e) { threw = true }
assert('sfxBomb() 不抛错', threw === false)
threw = false
try { audio.sfxJokerBomb() } catch (e) { threw = true }
assert('sfxJokerBomb() 不抛错', threw === false)
threw = false
try { audio.sfxSuperBomb() } catch (e) { threw = true }
assert('sfxSuperBomb() 不抛错', threw === false)
threw = false
try { audio.playSfxForType('BOMB_6') } catch (e) { threw = true }
assert('playSfxForType(BOMB_6) 走 sfxSuperBomb 不抛错', threw === false)
threw = false
try { audio.playSfxForType('BOMB_14') } catch (e) { threw = true }
assert('playSfxForType(BOMB_14) 走 sfxSuperBomb 不抛错', threw === false)

console.log('\n=== 9. 报数 tick / 警告 / 紧急蜂鸣 ===')
threw = false
try { audio.sfxCountdownTick() } catch (e) { threw = true }
assert('sfxCountdownTick() 不抛错', threw === false)
// 连续触发应该被 cooldown 拦截,不抛错
threw = false
try { audio.sfxCountdownTick() } catch (e) { threw = true }
assert('sfxCountdownTick() cooldown 内连发不抛错', threw === false)

threw = false
try { audio.sfxCountdownWarn() } catch (e) { threw = true }
assert('sfxCountdownWarn() 不抛错', threw === false)

threw = false
try { audio.sfxUrgentBeep() } catch (e) { threw = true }
assert('sfxUrgentBeep() 不抛错', threw === false)

console.log('\n=== 10. setBgmStyle 风格切换 ===')
audio.setBgmStyle('calm')
assert('setBgmStyle("calm") 生效', audio.getBgmStyle() === 'calm')
audio.setBgmStyle('energetic')
assert('setBgmStyle("energetic") 生效', audio.getBgmStyle() === 'energetic')
threw = false
try { audio.setBgmStyle('invalid') } catch (e) { threw = true }
assert('setBgmStyle(无效值) 不抛错', threw === false)
// 无效值应保持原风格
assert('setBgmStyle(无效值) 不改变风格', audio.getBgmStyle() === 'energetic')

console.log('\n=== 11. P1 出牌音分级(sfxSingle / sfxPair / sfxStraight 接受 count) ===')
// v3.7 P1:single / pair / straight 节奏 + 音高(count 控制)
// 单张 1 击 200ms,count 越大音越高
for (const c of [1, 2, 3, 5, 7, 10, 13, 20]) {
  threw = false
  try { audio.playSfxForType('SINGLE', c) } catch (e) { threw = true }
  assert(`playSfxForType(SINGLE, ${c}) 节奏 1 击不抛错`, threw === false)
}
// 对子 2 击 0+80ms
for (const c of [2, 3, 4, 5, 6, 10]) {
  threw = false
  try { audio.playSfxForType('PAIR', c) } catch (e) { threw = true }
  assert(`playSfxForType(PAIR, ${c}) 节奏 2 击不抛错`, threw === false)
}
// 顺子 N 击 40ms 间隔
for (const c of [5, 6, 7, 8, 10, 12, 13, 15]) {
  threw = false
  try { audio.playSfxForType('STRAIGHT', c) } catch (e) { threw = true }
  assert(`playSfxForType(STRAIGHT, ${c}) 节奏连击不抛错`, threw === false)
}
// 同花顺(STRAIGHT_FLUSH)也走 sfxStraight
for (const c of [5, 7, 10, 13]) {
  threw = false
  try { audio.playSfxForType('STRAIGHT_FLUSH', c) } catch (e) { threw = true }
  assert(`playSfxForType(STRAIGHT_FLUSH, ${c}) 不抛错`, threw === false)
}

console.log('\n=== 12. P1 sfxUrgentBeep(紧急蜂鸣 / 倒计时 <=5s) ===')
// 单次触发
threw = false
try { audio.sfxUrgentBeep() } catch (e) { threw = true }
assert('sfxUrgentBeep() 单次不抛错', threw === false)
// 连续触发(模拟 1s 内多次倒计时回调)不抛错
for (let i = 0; i < 3; i++) {
  threw = false
  try { audio.sfxUrgentBeep() } catch (e) { threw = true }
  assert(`sfxUrgentBeep() 第 ${i + 1} 次连发不抛错`, threw === false)
}
// 跟其它 sfx 串联不抛错
threw = false
try { audio.sfxUrgentBeep(); audio.sfxCountdownTick(); audio.sfxCountdownWarn() } catch (e) { threw = true }
assert('sfxUrgentBeep + sfxCountdownTick + sfxCountdownWarn 串联不抛错', threw === false)

console.log('\n=== 13. P1 playSfxForType 全牌型 × 全 count 覆盖 ===')
const allTypes = [
  'SINGLE', 'PAIR', 'TRIPLE', 'TRIPLE_PAIR',
  'STRAIGHT', 'STRAIGHT_PAIR', 'STRAIGHT_TRIPLE', 'STRAIGHT_FLUSH',
]
const allCounts = [1, 2, 3, 5, 7, 10, 13]
let comboPass = 0
for (const t of allTypes) {
  for (const c of allCounts) {
    threw = false
    try { audio.playSfxForType(t, c) } catch (e) { threw = true }
    if (!threw) comboPass++
  }
}
assert(`playSfxForType(8 牌型 × 7 count = 56 组) 全部不抛错(${comboPass} pass)`, comboPass === 56)

console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)