/**
 * Web Audio API 合成音频
 *
 * 设计原则:
 *   - 零外部依赖 / 零音频文件
 *   - 全部用 OscillatorNode + GainNode + AudioBufferSourceNode + BiquadFilterNode + DelayNode 实时合成
 *   - 版权干净,无第三方音频资源
 *
 * 模块:
 *   - BGM:  鼓点循环(C 大调激昂 loop,280ms 拍 + kick + hi-hat + snare + 旋律)
 *   - SFX:  5 种牌型不同音色 + 炸弹层级 + 王炸 + 超级炸弹 + 报数 tick + 警告 + 紧急蜂鸣
 *
 * 用法:
 *   import audio from '@/common/audio.js'
 *   audio.unlock()                          // 首次用户交互后调用,解锁 AudioContext
 *   audio.startBgm()                        // 开背景音乐(默认 energetic 风格)
 *   audio.setBgmStyle('energetic'|'calm')    // 切换 BGM 风格
 *   audio.stopBgm()
 *   audio.setBgmEnabled(bool)
 *   audio.setBgmVolume(0..1)
 *   audio.playSfxForType(type, count?)      // type: SINGLE|PAIR|...|JOKER_BOMB, count 可选
 *   audio.setSfxEnabled(bool)
 *   audio.setSfxVolume(0..1)
 *   audio.sfxCountdownTick()                // 报数 tick 短音
 *   audio.sfxCountdownWarn()                // ≤5 张警告音
 *   audio.sfxUrgentBeep()                   // ≤5s 蜂鸣
 *   audio.sfxBomb() / sfxJokerBomb() / sfxSuperBomb()
 */

let ctx = null
let masterGain = null
let bgmGain = null
let sfxGain = null

let bgmEnabled = true
let sfxEnabled = true
let bgmVol = 0.25
let sfxVol = 0.5
let masterVol = 1.0

// BGM 风格 ('energetic' 激昂 / 'calm' 平静)
let bgmStyle = 'energetic'
let bgmTimer = null
let bgmStarted = false
let bgmBarIdx = 0
let bgmNoteIdx = 0
let bgmMelodyIdx = 0
let bgmBeatCount = 0
let bgmPadIdx = 0

// 报数 tick cooldown(避免连续出牌爆音)
let lastTickAt = 0
const TICK_COOLDOWN_MS = 500

function getCtx() {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try {
    ctx = new AC()
    masterGain = ctx.createGain()
    masterGain.gain.value = masterVol
    masterGain.connect(ctx.destination)

    bgmGain = ctx.createGain()
    bgmGain.gain.value = bgmVol
    bgmGain.connect(masterGain)

    sfxGain = ctx.createGain()
    sfxGain.gain.value = sfxVol
    sfxGain.connect(masterGain)
  } catch (e) {
    console.warn('[audio] init failed:', e)
    return null
  }
  return ctx
}

/**
 * 销毁 AudioContext + 所有 gain 节点
 * v3.x P3-15 修复(N-13):iOS Safari 限制最多 6 个活跃 AudioContext。
 *   SPA 多次进入/退出房间会泄漏。destroyAudio 显式关 ctx、清所有引用,
 *   下次 getCtx() 会重新创建干净的 ctx。
 */
function destroyAudio() {
  stopBgm()
  // 清所有定时器(SFX 内部还有 setTimeout)
  if (bgmTimer) {
    clearTimeout(bgmTimer)
    bgmTimer = null
  }
  bgmStarted = false
  try {
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {})
    }
  } catch (_) { /* ignore */ }
  ctx = null
  masterGain = null
  bgmGain = null
  sfxGain = null
  // reverb 节点引用清空(getCtx 重新创建时这些是局部变量,模块作用域里是 null)
}

/**
 * 解锁 AudioContext(浏览器策略要求用户首次交互后才能播放音频)
 */
function unlock() {
  const c = getCtx()
  if (!c) return false
  if (c.state === 'suspended') {
    c.resume().catch(() => {})
  }
  return true
}

// ====== Reverb 总线(共享,挂到 sfxGain) ======
let reverbBus = null
let reverbDelay = null
function _ensureReverb() {
  if (!ctx || reverbBus) return reverbBus
  try {
    reverbBus = ctx.createGain()
    reverbBus.gain.value = 0.3
    reverbDelay = ctx.createDelay(1.0)
    reverbDelay.delayTime.value = 0.05
    const fb = ctx.createGain()
    fb.gain.value = 0.3
    reverbBus.connect(reverbDelay)
    reverbDelay.connect(fb)
    fb.connect(reverbDelay)
    reverbDelay.connect(sfxGain)
  } catch (e) {
    reverbBus = null
  }
  return reverbBus
}

// 工具:把 src 节点也连到 reverb(湿声)
function _connectWithReverb(src) {
  if (!ctx) return
  const rb = _ensureReverb()
  if (!rb) return
  try { src.connect(rb) } catch (e) {}
}

// ====== BGM ======
// 280ms 拍(C 大调激昂 loop)
// 主旋律(8 拍循环,C 大调 arpeggio,半拍一个音)
const BGM_BEAT_MS = 280
const BGM_TEMPO = (style) => style === 'energetic' ? 280 : 360

// C 大调旋律(C E G E / G C E G / F A C A / A F C G)
const BGM_MELODY = [
  // bar 1: C major arpeggio up
  [523.25, 659.25, 783.99, 659.25],  // C5 E5 G5 E5
  // bar 2: G major arpeggio
  [391.99, 523.25, 659.25, 783.99],  // G4 C5 E5 G5
  // bar 3: F major
  [349.23, 440.00, 523.25, 587.33],  // F4 A4 C5 D5
  // bar 4: 收尾回到 C
  [261.63, 329.63, 392.00, 523.25],  // C4 E4 G4 C5
]

// 每拍鼓型 — [kick, hat, snare, hat] 节奏(280ms 一拍,4 拍为 1 小节)
const BGM_DRUM_PATTERN = [
  { kick: true, hat: true, snare: false, hat2: true, bass: true, chord: true },
  { kick: false, hat: true, snare: false, hat2: true, bass: false, chord: false },
  { kick: false, hat: true, snare: true, hat2: true, bass: false, chord: false },
  { kick: true, hat: true, snare: false, hat2: true, bass: true, chord: false },
]

// 和弦垫底(C / G / F / C 循环,每小节 1 个和弦)
const BGM_CHORDS = [
  [261.63, 329.63, 392.00],  // C
  [196.00, 246.94, 293.66],  // G
  [349.23, 440.00, 523.25],  // F (注意:用 F4/A4/C5,这里用 F3/A3/C4 是更标准的低八度)
  [261.63, 329.63, 392.00],  // C
]

// 噪声 helper(白噪声)
function _noiseBuffer(durationSec) {
  const c = getCtx()
  if (!c) return null
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * durationSec), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buf
}

// 鼓点 — kick(底鼓,60Hz sine + 80ms 衰减)
function _drumKick() {
  if (!ctx) return
  const c = ctx
  const now = c.currentTime
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120, now)
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.08)
  const g = c.createGain()
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.6, now + 0.005)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
  osc.connect(g)
  g.connect(bgmGain)
  osc.start(now)
  osc.stop(now + 0.2)
}

// 鼓点 — hi-hat(高频白噪声 + highpass)
function _drumHat() {
  if (!ctx) return
  const c = ctx
  const now = c.currentTime
  const noise = c.createBufferSource()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.04), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noise.buffer = buf
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 6000
  const g = c.createGain()
  g.gain.setValueAtTime(0.15, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
  noise.connect(hp)
  hp.connect(g)
  g.connect(bgmGain)
  noise.start(now)
  noise.stop(now + 0.05)
}

// 鼓点 — snare(白噪声 + bandpass 1.5kHz)
function _drumSnare() {
  if (!ctx) return
  const c = ctx
  const now = c.currentTime
  const noise = c.createBufferSource()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.12), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noise.buffer = buf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1500
  bp.Q.value = 0.7
  const g = c.createGain()
  g.gain.setValueAtTime(0.4, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
  noise.connect(bp)
  bp.connect(g)
  g.connect(bgmGain)
  noise.start(now)
  noise.stop(now + 0.13)
}

// 贝斯单音(低 8 度 sawtooth,1 拍 1 音)
function _bassNote(freq) {
  if (!ctx) return
  const c = ctx
  const now = c.currentTime
  const dur = (BGM_BEAT_MS / 1000) * 0.9
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = freq / 2
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 800
  const g = c.createGain()
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.15, now + 0.01)
  g.gain.linearRampToValueAtTime(0.05, now + dur * 0.5)
  g.gain.exponentialRampToValueAtTime(0.001, now + dur)
  osc.connect(lp)
  lp.connect(g)
  g.connect(bgmGain)
  osc.start(now)
  osc.stop(now + dur + 0.05)
}

// 旋律音(主调,sine + 5度叠加)
function _melodyNote(freq) {
  if (!ctx) return
  const c = ctx
  const now = c.currentTime
  const dur = (BGM_BEAT_MS / 1000) * 0.9
  const osc1 = c.createOscillator()
  osc1.type = 'sine'
  osc1.frequency.value = freq
  const osc2 = c.createOscillator()
  osc2.type = 'triangle'
  osc2.frequency.value = freq * 1.5
  const g1 = c.createGain()
  g1.gain.setValueAtTime(0, now)
  g1.gain.linearRampToValueAtTime(0.18, now + 0.02)
  g1.gain.linearRampToValueAtTime(0.1, now + dur * 0.6)
  g1.gain.exponentialRampToValueAtTime(0.001, now + dur)
  const g2 = c.createGain()
  g2.gain.setValueAtTime(0, now)
  g2.gain.linearRampToValueAtTime(0.08, now + 0.02)
  g2.gain.exponentialRampToValueAtTime(0.001, now + dur)
  osc1.connect(g1)
  g1.connect(bgmGain)
  osc2.connect(g2)
  g2.connect(bgmGain)
  osc1.start(now)
  osc1.stop(now + dur + 0.05)
  osc2.start(now)
  osc2.stop(now + dur + 0.05)
}

// 和弦垫底(3 osc 同时,持续 1 小节)
function _chordPad(notes) {
  if (!ctx) return
  const c = ctx
  const now = c.currentTime
  const dur = (BGM_BEAT_MS / 1000) * 4 * 0.9
  notes.forEach((freq, i) => {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq / 2  // 低 8 度垫底
    const g = c.createGain()
    const peak = 0.06
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(peak, now + 0.1)
    g.gain.linearRampToValueAtTime(peak * 0.6, now + dur * 0.7)
    g.gain.exponentialRampToValueAtTime(0.001, now + dur)
    osc.connect(g)
    g.connect(bgmGain)
    osc.start(now)
    osc.stop(now + dur + 0.1)
  })
}

function bgmTick() {
  // v3.x P3-14 修复(N-11):加 bgmStarted 检查
  //   旧版 stopBgm 期间正在执行的 bgmTick 会创建新定时器,即使 stopBgm 已清
  //   一次,这次 tick 仍会 setTimeout 创建新 timer,造成泄漏
  if (!bgmStarted || !bgmEnabled || !ctx) return
  const tempo = BGM_TEMPO(bgmStyle)
  const beat = bgmBeatCount % 4  // 当前拍
  const bar = Math.floor(bgmBeatCount / 4) % BGM_MELODY.length
  const drum = BGM_DRUM_PATTERN[beat]
  const drumStyle = bgmStyle

  // 鼓点(energetic:全 4 拍都打;calm:只打 1/3 拍)
  if (drumStyle === 'energetic') {
    if (drum.kick) _drumKick()
    if (drum.hat) _drumHat()
    if (drum.snare) _drumSnare()
    if (drum.hat2) _drumHat()
    // 贝斯
    if (drum.bass) {
      const bassFreq = BGM_CHORDS[bar][0]
      _bassNote(bassFreq)
    }
    // 和弦垫底(每个 bar 第 1 拍)
    if (beat === 0 && drum.chord) {
      _chordPad(BGM_CHORDS[bar])
    }
    // 旋律(每拍 1 音)
    const melFreq = BGM_MELODY[bar][beat]
    _melodyNote(melFreq)
  } else {
    // calm 风格:只打 1 拍 + 3 拍(hi-hat + 简单旋律)
    if (beat === 0) _drumKick()
    if (beat === 2) _drumSnare()
    if (beat === 1 || beat === 3) _drumHat()
    if (beat === 0 || beat === 2) {
      const bassFreq = BGM_CHORDS[bar][0]
      _bassNote(bassFreq)
    }
    const melFreq = BGM_MELODY[bar][beat]
    _melodyNote(melFreq * 0.5)  // calm 风格低 8 度
  }

  bgmBeatCount++
  bgmTimer = setTimeout(bgmTick, tempo)
}

function startBgm() {
  if (bgmStarted) return
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  bgmStarted = true
  bgmBeatCount = 0
  bgmTick()
}

function stopBgm() {
  if (bgmTimer) {
    clearTimeout(bgmTimer)
    bgmTimer = null
  }
  bgmStarted = false
}

function setBgmEnabled(on) {
  bgmEnabled = !!on
  if (bgmEnabled) startBgm()
  else stopBgm()
}

function setBgmStyle(style) {
  if (style !== 'energetic' && style !== 'calm') return
  bgmStyle = style
}

function isBgmEnabled() { return bgmEnabled }
function isSfxEnabled() { return sfxEnabled }
function isBgmStarted() { return bgmStarted }
function getBgmStyle() { return bgmStyle }

function setBgmVolume(v) {
  bgmVol = clamp01(v)
  if (bgmGain) bgmGain.gain.value = bgmVol
}

// ====== SFX ======
// 5 种牌型音色(v3.7 P1 节奏感 + 音高递增)
//
// 节奏:
//   - sfxSingle:   1 击 200ms
//   - sfxPair:     2 击 0ms + 80ms
//   - sfxStraight: N 击 40ms 间隔(连击)
//
// 音高(count 控制,每张 +30Hz 线性递增,封顶 12 张):
//   - sfxSingle:   base + (count-1) * 30Hz
//   - sfxPair:     每击 +30Hz 步进
//   - sfxStraight: 起步 440Hz,每击 +30Hz

// 出牌音高步进(Hz/张)
const SFX_PITCH_STEP_HZ = 30
// 音高封顶步数(超过则统一用封顶步)
const SFX_PITCH_STEP_MAX = 12

function _steppedFreq(base, step) {
  const s = Math.min(Math.max(step || 0, 0), SFX_PITCH_STEP_MAX)
  return base + s * SFX_PITCH_STEP_HZ
}

// 单张 — 1 击 200ms(triangle),count 越大音越高
function sfxSingle(count) {
  if (!ctx) return
  const now = ctx.currentTime
  const startFreq = _steppedFreq(720, (count || 1) - 1)
  const endFreq = _steppedFreq(360, (count || 1) - 1)
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(startFreq, now)
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.18)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.4, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(now)
  osc.stop(now + 0.22)
}

// 对子 — 2 击 0ms + 80ms(triangle),count 越大音越高
function sfxPair(count) {
  if (!ctx) return
  const now = ctx.currentTime
  const base = count && count >= 3 ? 880 : 660
  ;[0, 0.08].forEach((delay, i) => {
    const f = _steppedFreq(base, ((count || 2) - 1) + i)
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now + delay)
    g.gain.linearRampToValueAtTime(0.35, now + delay + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12)
    osc.connect(g)
    g.connect(sfxGain)
    osc.start(now + delay)
    osc.stop(now + delay + 0.14)
  })
}

// 顺子/连对/钢板/同花顺 — N 击 40ms 间隔连击(sine),起步 440Hz 每击 +30Hz
function sfxStraight(count) {
  if (!ctx) return
  const now = ctx.currentTime
  // count 决定击数:5-13 张(超出截断)
  const beats = Math.min(Math.max(count || 5, 5), 13)
  const baseFreq = 440
  const interval = 0.04  // 40ms 间隔
  for (let i = 0; i < beats; i++) {
    const t = i * interval
    const f = _steppedFreq(baseFreq, i)  // 每击 +30Hz 步进
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now + t)
    g.gain.linearRampToValueAtTime(0.22, now + t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.06)
    osc.connect(g)
    g.connect(sfxGain)
    osc.start(now + t)
    osc.stop(now + t + 0.08)
  }
}

/**
 * 炸弹音效 v2 — 多层合成(低频轰炸 + 高频爆裂 + 金属冲击 + reverb)
 * 设计目标:明显比 v3.6 的"短促嘟"更震撼
 */
function sfxBomb() {
  if (!ctx) return
  const now = ctx.currentTime
  // 1. 低频轰炸(square 80Hz → 30Hz,0.5s,挂 lowpass 100Hz 让"浑厚")
  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(80, now)
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.5)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 100
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.6, now + 0.02)
  g.gain.linearRampToValueAtTime(0.001, now + 0.55)
  osc.connect(lp)
  lp.connect(g)
  g.connect(sfxGain)
  _connectWithReverb(g)
  osc.start(now)
  osc.stop(now + 0.6)

  // 2. 高频爆裂(白噪声 + bandpass 4kHz)
  const noise = ctx.createBufferSource()
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  }
  noise.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 4000
  bp.Q.value = 1.5
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.45, now)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
  noise.connect(bp)
  bp.connect(ng)
  ng.connect(sfxGain)
  _connectWithReverb(ng)
  noise.start(now)
  noise.stop(now + 0.52)

  // 3. 金属冲击(triangle 8kHz,120ms 短促)
  const tri = ctx.createOscillator()
  tri.type = 'triangle'
  tri.frequency.setValueAtTime(8000, now)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.2, now)
  tg.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
  tri.connect(tg)
  tg.connect(sfxGain)
  tri.start(now)
  tri.stop(now + 0.14)
}

/**
 * 王炸音效 — 双层 sfxBomb + 上扫 square 200Hz → 4kHz
 */
function sfxJokerBomb() {
  if (!ctx) return
  const now = ctx.currentTime
  // 第一发 sfxBomb
  sfxBomb()
  // 100ms 后第二发 sfxBomb
  setTimeout(() => sfxBomb(), 100)
  // 上扫 square sweep
  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(200, now + 0.05)
  osc.frequency.exponentialRampToValueAtTime(4000, now + 0.45)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, now + 0.05)
  g.gain.linearRampToValueAtTime(0.18, now + 0.1)
  g.gain.linearRampToValueAtTime(0.001, now + 0.5)
  osc.connect(g)
  g.connect(sfxGain)
  _connectWithReverb(g)
  osc.start(now + 0.05)
  osc.stop(now + 0.55)
  // 末尾 4 个 sine 高频(原逻辑)
  ;[1200, 1500, 1800, 2400].forEach((f, i) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const gg = ctx.createGain()
    gg.gain.setValueAtTime(0.3, now + 0.15 + i * 0.05)
    gg.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + i * 0.05 + 0.25)
    o.connect(gg)
    gg.connect(sfxGain)
    o.start(now + 0.15 + i * 0.05)
    o.stop(now + 0.15 + i * 0.05 + 0.27)
  })
}

/**
 * 超级炸弹音效(BOMB_6+)— 3 次连击 sfxBomb + 持续 drone + shimmer
 */
function sfxSuperBomb() {
  if (!ctx) return
  const now = ctx.currentTime
  // 3 次连击 sfxBomb(0/80/160ms)
  sfxBomb()
  setTimeout(() => sfxBomb(), 80)
  setTimeout(() => sfxBomb(), 160)
  // 持续 drone(60Hz square,2s)
  const drone = ctx.createOscillator()
  drone.type = 'square'
  drone.frequency.value = 60
  const dg = ctx.createGain()
  dg.gain.setValueAtTime(0, now + 0.2)
  dg.gain.linearRampToValueAtTime(0.25, now + 0.4)
  dg.gain.linearRampToValueAtTime(0.001, now + 2.0)
  drone.connect(dg)
  dg.connect(sfxGain)
  _connectWithReverb(dg)
  drone.start(now + 0.2)
  drone.stop(now + 2.05)
  // shimmer(8kHz sine,1.5s 衰减)
  const shi = ctx.createOscillator()
  shi.type = 'sine'
  shi.frequency.value = 8000
  const sg = ctx.createGain()
  sg.gain.setValueAtTime(0, now + 0.3)
  sg.gain.linearRampToValueAtTime(0.18, now + 0.5)
  sg.gain.exponentialRampToValueAtTime(0.001, now + 1.5)
  shi.connect(sg)
  sg.connect(sfxGain)
  _connectWithReverb(sg)
  shi.start(now + 0.3)
  shi.stop(now + 1.55)
}

/**
 * 报数 tick — 短促"嘟"(880Hz triangle,60ms)
 * 用于:出牌后如果剩余牌 ≤10 播 1 次(500ms cooldown)
 */
function sfxCountdownTick() {
  if (!ctx) return
  const now = ctx.currentTime + 0.005
  // 500ms cooldown 防爆音
  const t = performance.now()
  if (t - lastTickAt < TICK_COOLDOWN_MS) return
  lastTickAt = t
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = 880
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.25, now + 0.005)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(now)
  osc.stop(now + 0.07)
}

/**
 * 报数警告 — ≤5 张时的高亢警告音(1200 + 1500Hz + bandpass)
 */
function sfxCountdownWarn() {
  if (!ctx) return
  const now = ctx.currentTime + 0.005
  const osc1 = ctx.createOscillator()
  osc1.type = 'sine'
  osc1.frequency.value = 1200
  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.value = 1500
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1300
  bp.Q.value = 8
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.35, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
  osc1.connect(bp)
  osc2.connect(bp)
  bp.connect(g)
  g.connect(sfxGain)
  osc1.start(now)
  osc2.start(now)
  osc1.stop(now + 0.13)
  osc2.stop(now + 0.13)
}

/**
 * 紧急蜂鸣 — 倒计时 ≤5s 时触发,1100Hz square 80ms 重复 2 次
 */
function sfxUrgentBeep() {
  if (!ctx) return
  const now = ctx.currentTime + 0.005
  ;[0, 0.2].forEach((delay) => {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 1100
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now + delay)
    g.gain.linearRampToValueAtTime(0.3, now + delay + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.08)
    osc.connect(g)
    g.connect(sfxGain)
    osc.start(now + delay)
    osc.stop(now + delay + 0.1)
  })
}

/**
 * 根据牌型播放对应声效
 * @param {string} type - guandan-engine 的 TYPE 常量
 * @param {number} [count] - 牌张数,可选(用于音高递增)
 */
function playSfxForType(type, count) {
  if (!ctx || !sfxEnabled) return
  if (!type) { sfxSingle(count); return }
  if (type === 'JOKER_BOMB') return sfxJokerBomb()
  if (typeof type === 'string' && type.startsWith('BOMB')) {
    // BOMB_6+ 用 sfxSuperBomb
    if (type.length > 5) {
      const num = parseInt(type.replace('BOMB_', ''), 10)
      if (Number.isFinite(num) && num >= 6) return sfxSuperBomb()
    }
    return sfxBomb()
  }
  if (type === 'STRAIGHT_FLUSH') return sfxStraight(count)
  if (type.includes('STRAIGHT')) return sfxStraight(count)
  if (type === 'PAIR' || type === 'TRIPLE_PAIR' || type === 'STRAIGHT_PAIR') return sfxPair(count)
  if (type === 'TRIPLE') return sfxPair(count)
  sfxSingle(count)
}

function setSfxEnabled(on) { sfxEnabled = !!on }
function setSfxVolume(v) {
  sfxVol = clamp01(v)
  if (sfxGain) sfxGain.gain.value = sfxVol
}
function setMasterVolume(v) {
  masterVol = clamp01(v)
  if (masterGain) masterGain.gain.value = masterVol
}

function clamp01(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export {
  unlock,
  startBgm, stopBgm, setBgmEnabled, setBgmVolume, isBgmEnabled, isBgmStarted,
  setBgmStyle, getBgmStyle,
  playSfxForType, setSfxEnabled, setSfxVolume, isSfxEnabled,
  sfxBomb, sfxJokerBomb, sfxSuperBomb,
  sfxCountdownTick, sfxCountdownWarn, sfxUrgentBeep,
  setMasterVolume,
  getCtx,
  destroyAudio,
}

const audio = {
  unlock,
  startBgm, stopBgm, setBgmEnabled, setBgmVolume, isBgmEnabled, isBgmStarted,
  setBgmStyle, getBgmStyle,
  playSfxForType, setSfxEnabled, setSfxVolume, isSfxEnabled,
  sfxBomb, sfxJokerBomb, sfxSuperBomb,
  sfxCountdownTick, sfxCountdownWarn, sfxUrgentBeep,
  setMasterVolume,
  getCtx,
}
export default audio