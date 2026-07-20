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

// ============================================================
// v0.4.9:真实 SFX 模式测试
// ============================================================
console.log('\n=== 11. SFX 模式切换: synth/real API 表面 ===')
{
  // 默认模式
  eq('★ 默认 SFX 模式 = synth', audio.getSfxMode(), 'synth')
  eq('★ isSfxModeReal() 默认 false', audio.isSfxModeReal(), false)
  // 切换到 real
  audio.setSfxMode('real')
  eq('★ setSfxMode("real") 后 getSfxMode() = real', audio.getSfxMode(), 'real')
  eq('★ isSfxModeReal() = true', audio.isSfxModeReal(), true)
  // 切回 synth
  audio.setSfxMode('synth')
  eq('★ setSfxMode("synth") 后 = synth', audio.getSfxMode(), 'synth')
  // 非法值不改变
  audio.setSfxMode('real')
  audio.setSfxMode('invalid')
  eq('★ setSfxMode("invalid") 不改变(real 不变)', audio.getSfxMode(), 'real')
  audio.setSfxMode('synth')  // 恢复
}

console.log('\n=== 12. SFX 真实采样:Node 环境安全 noop ===')
{
  // 在 Node 环境(无 window)调 playSfxForType 不抛错
  let threw = false
  try {
    audio.setSfxMode('real')
    audio.playSfxForType('SINGLE', 1)
    audio.playSfxForType('PAIR', 2)
    audio.playSfxForType('BOMB_4', 4)
    audio.playSfxForType('JOKER_BOMB')
    audio.playSfxForType('STRAIGHT_FLUSH', 5)
    audio.setSfxMode('synth')
    audio.playSfxForType('SINGLE', 1)  // synth 路径也不抛
  } catch (e) {
    threw = true
    console.log('  [err]', e.message)
  }
  eq('★ Node 环境 playSfxForType 不抛错(real/synth 都 OK)', threw, false)
}

console.log('\n=== 13. SFX 资源存在性:占位 MP3 已生成 ===')
{
  // 真实 SFX 占位 ffmpeg 生成(0.06-1.5s 短采样)
  // Node 静态检查文件存在
  const fs = await import('fs')
  const path = await import('path')
  const sfxFiles = ['sfx-single', 'sfx-pair', 'sfx-bomb', 'sfx-joker-bomb', 'sfx-deal', 'sfx-tick']
  for (const name of sfxFiles) {
    const p = path.resolve(`./src/assets/audio/${name}.mp3`)
    const exists = fs.existsSync(p)
    assert(`★ ${name}.mp3 存在`, exists)
  }
}

console.log('\n=== 14. SFX audio pool:多实例轮询 + autoplay unlock retry ===')
{
  // ★ v0.4.9:audio.js 把 sfxAudioCache 从 Map<file, Audio> 单实例改成 Map<file, {elements[4], nextIndex}>
  // 验证 Node 环境可注入 mock Audio + 测 pool 行为 + unlock retry
  // 真实浏览器:window.Audio 不可用 → playMp3Sfx 早退,pool 不创建
  const origAudio = globalThis.Audio
  const origWindow = globalThis.window
  // 构造 mock Audio class,记录所有创建
  const createdEls = []
  const playCalls = []
  class MockAudio {
    constructor() {
      this.src = ''
      this.volume = 0
      this.preload = ''
      this.currentTime = 0
      this._rejected = false
      createdEls.push(this)
    }
    play() {
      playCalls.push(this)
      // 模拟 autoplay 拒绝(只有 rejectNoUnlock=true 的元素才 reject)
      if (this._rejected) {
        return Promise.reject(new Error('autoplay blocked'))
      }
      return Promise.resolve()
    }
    set src(v) { this._src = v }
    get src() { return this._src }
  }
  globalThis.Audio = MockAudio
  globalThis.window = { Audio: MockAudio }

  // 重置状态(避免上轮测试遗留)
  try { audio.destroyAudio() } catch (e) { /* ignore */ }
  audio.setSfxMode('real')

  // ★ 测试 1:连续 5 次 playSfxForType('SINGLE', 1) → 5 次调 playMp3Sfx('SINGLE')
  //   pool=4 → 第一次 play 创建 4 个,后 4 次轮询不创建新的
  const beforeCreate = createdEls.length
  audio.playSfxForType('SINGLE', 1)
  audio.playSfxForType('SINGLE', 1)
  audio.playSfxForType('SINGLE', 1)
  audio.playSfxForType('SINGLE', 1)
  const afterCreate4 = createdEls.length - beforeCreate
  eq('★ 连续 4 次 playSfxForType(SINGLE) 创建一个 pool = 4', afterCreate4, 4)
  // 第 5 次:轮询到 slot 0,复用,不再创建
  audio.playSfxForType('SINGLE', 1)
  const afterCreate5 = createdEls.length - beforeCreate
  eq('★ 第 5 次 playSfxForType(SINGLE) 复用 pool slot,不再创建新 Audio', afterCreate5, 4)

  // ★ 测试 2:不同 trackName 各自一个 pool(SINGLE 和 PAIR 共 8 个 Audio)
  const beforeNew = createdEls.length
  audio.playSfxForType('PAIR', 2)
  audio.playSfxForType('PAIR', 2)
  audio.playSfxForType('PAIR', 2)
  audio.playSfxForType('PAIR', 2)
  const afterPair = createdEls.length - beforeNew
  eq('★ PAIR 也是独立 pool,4 次创建 4 个', afterPair, 4)
  eq('★ SINGLE+PAIR 独立 pool,共 8 个 Audio 实例', createdEls.length - beforeCreate, 8)

  // ★ 测试 3:play 调用次数
  const playsBefore = playCalls.length
  audio.playSfxForType('SINGLE', 1)
  audio.playSfxForType('SINGLE', 1)
  eq('★ 两次 playSfxForType 调用 2 次 .play()', playCalls.length - playsBefore, 2)

  // 还原环境
  audio.setSfxMode('synth')
  if (origAudio === undefined) delete globalThis.Audio
  else globalThis.Audio = origAudio
  if (origWindow === undefined) delete globalThis.window
  else globalThis.window = origWindow
}

console.log('\n=== 15. 牌型中文语音播报(v0.4.25 扩展到特殊牌型) ===')
{
  const origWindow = globalThis.window
  const spoken = []
  let cancelCount = 0
  globalThis.window = {
    speechSynthesis: {
      speak(u) { spoken.push(u.text) },
      cancel() { cancelCount++ },
    },
    SpeechSynthesisUtterance: function(text) {
      this.text = text
      this.lang = 'zh-CN'
      this.rate = 1
      this.pitch = 1
      this.volume = 1
    }
  }
  audio.setSfxEnabled(true)
  audio.playSfxForType('BOMB_4')
  assert('★ BOMB_4 触发语音"炸弹"', spoken.includes('炸弹'))
  audio.playSfxForType('JOKER_BOMB')
  assert('★ JOKER_BOMB 触发语音"王炸"', spoken.includes('王炸'))
  // v0.4.25:特殊牌型播报
  audio.playSfxForType('STRAIGHT')
  assert('★ STRAIGHT 触发语音"顺子"', spoken.includes('顺子'))
  audio.playSfxForType('STRAIGHT_PAIR')
  assert('★ STRAIGHT_PAIR 触发语音"连对"', spoken.includes('连对'))
  audio.playSfxForType('STRAIGHT_TRIPLE')
  assert('★ STRAIGHT_TRIPLE 触发语音"钢板"', spoken.includes('钢板'))
  audio.playSfxForType('TRIPLE_PAIR')
  assert('★ TRIPLE_PAIR 触发语音"三带二"', spoken.includes('三带二'))
  audio.playSfxForType('STRAIGHT_FLUSH')
  assert('★ STRAIGHT_FLUSH 触发语音"同花顺"', spoken.includes('同花顺'))
  // 数字 type(v0.4.24 归一化)也要触发语音
  spoken.length = 0
  audio.playSfxForType(5)
  assert('★ 数字 type 5(STRAIGHT)触发语音"顺子"', spoken.includes('顺子'))
  audio.playSfxForType(8)
  assert('★ 数字 type 8(BOMB_4)触发语音"炸弹"', spoken.includes('炸弹'))
  // 普通牌型(太频繁)不播报
  spoken.length = 0
  audio.playSfxForType('SINGLE')
  audio.playSfxForType('PAIR')
  audio.playSfxForType('TRIPLE')
  assert('★ SINGLE/PAIR/TRIPLE 不播报', spoken.length === 0)
  // 每次播报前 cancel 旧语音(防排队积压)
  assert('★ 播报前 cancel 旧语音', cancelCount >= 9)
  // 语音开关关闭后不播报
  audio.setVoiceEnabled(false)
  audio.playSfxForType('BOMB_4')
  assert('★ voiceEnabled=false 时不播报', spoken.length === 0)
  audio.setVoiceEnabled(true)
  // ★ v0.4.25:通用 speakText(快捷聊天配音)
  spoken.length = 0
  audio.speakText('打得不错')
  assert('★ speakText 朗读聊天文本', spoken.includes('打得不错'))
  audio.speakText('')
  assert('★ speakText 空文本不播', spoken.length === 1)
  globalThis.window = origWindow
}

console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)