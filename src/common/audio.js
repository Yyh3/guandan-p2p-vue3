/**
 * 音频系统 — v0.4.8 N-3 真实音乐集成
 *
 * BGM 部分:
 *   - v0.4.8 前:Web Audio API 合成(零文件依赖,但质感有限)
 *   - v0.4.8 起:Kevin MacLeod CC-BY MP3 真实音频,加载失败时自动降级
 *     Web Audio 合成(不会让游戏无声音)
 *   - v0.4.23 起:安装包瘦身,内置 BGM 从 7 首精简为 3 首
 *   - 风格对应:
 *     - 'energetic' / 'normal' / 'main'  → bgm-chinese.mp3 (Shenyang,中式器乐主对局)
 *     - 'calm'      / 'idle'    / 'lobby' → bgm-carefree.mp3 (Carefree,轻快明快,开局/等待/结算)
 *     - 'bossa'                              → bgm-bossa.mp3 (Bossa Antigua,慵懒闲适备选)
 *
 * SFX 部分:
 *   - 仍是 Web Audio API 合成(5 种牌型 + 炸弹层级 + 王炸 + 超级炸弹 + 报数 tick + 警告 + 蜂鸣)
 *
 * 致谢:BGM 全部来自 Kevin MacLeod (incompetech.com),CC BY 4.0 授权
 *
 * 用法:
 *   import audio from '@/common/audio.js'
 *   audio.unlock()                          // 首次用户交互后调用,解锁 AudioContext
 *   audio.startBgm()                        // 开背景音乐(默认 energetic 风格)
 *   audio.setBgmStyle('energetic'|'calm'|'bossa') // 切换 BGM 风格(内置 3 首)
 *   audio.stopBgm()
 *   audio.setBgmEnabled(bool)
 *   audio.setBgmVolume(0..1)
 *   audio.playSfxForType(type, count?)      // type: SINGLE|PAIR|...|JOKER_BOMB(也接受引擎数字 TYPE), count 可选
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
// ★ UX 改进:炸弹/王炸中文语音播报独立开关,默认开启
let voiceEnabled = true
let bgmVol = 0.25
let sfxVol = 0.5
let masterVol = 1.0

// ★ v0.4.9:SFX 模式 — 'synth'(默认,Web Audio 合成) | 'real'(MP3 真实采样,加载失败降级 synth)
let sfxMode = 'synth'

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

// v0.4.8 N-3:真实 BGM 加载 — Kevin MacLeod CC-BY,安装包精简为 3 首 MP3
//   - Vite 用 new URL(import.meta.url) 静态资源处理,会自动 hash + 复制到 dist/assets/
//   - Node 测试环境跑 audio.test.js 时不会触发 startBgmMp3,但 new URL 调用本身不 throw
//   - 用 key → URL map 风格切换;加载失败时降级 Web Audio 合成
const BGM_TRACKS = {
  // 安装包内置 3 首(主对局 / 等待结算 / 备选)
  energetic: 'bgm-chinese.mp3',     // 主对局 — 中式器乐,茶馆打牌氛围
  normal:    'bgm-chinese.mp3',
  main:      'bgm-chinese.mp3',
  calm:      'bgm-carefree.mp3',    // 开局/等待/结算 — 轻快明快
  idle:      'bgm-carefree.mp3',
  lobby:     'bgm-carefree.mp3',
  bossa:     'bgm-bossa.mp3',       // 备选 — Bossa Antigua 慵懒闲适
}

// ★ v0.4.9:真实 SFX 采样表
//   - 占位用 ffmpeg sine + noise 合成(0.06-1.5s 短采样)
//   - 用户后续可用真实扑克音效替换:摔牌声、洗牌声、出牌声等
//   - 缺失时降级 Web Audio 合成(原 sfxSingle/sfxPair/sfxBomb 等函数)
const SFX_TRACKS = {
  SINGLE: 'sfx-single.mp3',           // 单张 — 720Hz 0.18s
  PAIR: 'sfx-pair.mp3',               // 对子 — 660+720Hz 双击 0.14s
  STRAIGHT: 'sfx-pair.mp3',           // 顺子复用 pair(短连击)
  TRIPLE: 'sfx-pair.mp3',             // 三张复用 pair
  TRIPLE_PAIR: 'sfx-pair.mp3',        // 三带二复用 pair
  STRAIGHT_PAIR: 'sfx-pair.mp3',
  STRAIGHT_TRIPLE: 'sfx-pair.mp3',
  STRAIGHT_FLUSH: 'sfx-single.mp3',   // 同花顺复用 single
  BOMB_4: 'sfx-bomb.mp3',            // 4-6 张炸 — 80Hz 0.5s 低频轰炸
  BOMB_5: 'sfx-bomb.mp3',
  BOMB_6: 'sfx-bomb.mp3',
  BOMB_7: 'sfx-bomb.mp3',
  BOMB_8: 'sfx-bomb.mp3',
  JOKER_BOMB: 'sfx-joker-bomb.mp3',  // 王炸 — 200Hz 0.5s 高频上扫
  DEAL: 'sfx-deal.mp3',              // 发牌(白噪声 1.5s 模拟洗牌)
  TICK: 'sfx-tick.mp3',              // 报数 tick — 880Hz 60ms
}

// v0.4.9:真实 SFX 加载 — 同 BGM 模式,new URL 处理 + Node fallback
function sfxTrackUrl(name) {
  try {
    return new URL(`../assets/audio/${name}`, import.meta.url).href
  } catch (e) {
    return `../assets/audio/${name}`  // Node fallback
  }
}

// ★ v0.4.9:SFX 真实采样 — Audio element pool
//   - 旧版单 Audio element 复用:连续快速出牌 reset currentTime 会卡(0.05s 重置+play 跟不上)
//   - 新版 4 池轮询:每个 track 4 个 Audio element,index++ 循环取下一个
//     单次出牌最多 4 张同牌型,pool=4 足够覆盖"同时按 4 下的极限"
//   - pool 也在 autoplay 解锁时重试(用户首次点击 unlock() 后触发未成功的 play)
const SFX_POOL_SIZE = 4
let sfxAudioEl = null
// 缓存:trackName → { elements: Audio[4], nextIndex: 0, unlockPending: Set<index> }
let sfxAudioCache = new Map()

function _getPoolEl(fileName) {
  let entry = sfxAudioCache.get(fileName)
  if (!entry) {
    const elements = []
    for (let i = 0; i < SFX_POOL_SIZE; i++) {
      const el = new window.Audio()
      el.src = sfxTrackUrl(fileName)
      el.volume = sfxVol
      el.preload = 'auto'
      elements.push(el)
    }
    entry = { elements, nextIndex: 0, unlockPending: new Set() }
    sfxAudioCache.set(fileName, entry)
  }
  // 轮询取下一个
  const el = entry.elements[entry.nextIndex]
  entry.nextIndex = (entry.nextIndex + 1) % SFX_POOL_SIZE
  return { el, entry, slot: (entry.nextIndex + SFX_POOL_SIZE - 1) % SFX_POOL_SIZE }
}

function playMp3Sfx(trackName) {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') {
    return false  // Node 环境 / 无 Audio
  }
  if (sfxMode !== 'real') return false  // 仅 real 模式用 MP3
  if (!SFX_TRACKS[trackName] && !SFX_TRACKS[trackName.split('_')[0]]) return false
  const fileName = SFX_TRACKS[trackName]
  if (!fileName) return false
  try {
    const { el, entry, slot } = _getPoolEl(fileName)
    // ★ V049-05 修复:play() 异步失败时返回 false 让上层走 synth fallback
    //   旧版:el.play().catch(noop); return true → 上层永远拿到 true,fallback 不触发
    //   新版:同步检查 el.readyState / el.error,play() 失败异步返 false 累计
    if (el.error) return false  // 媒体错误(404 / 解码失败)
    if (typeof el.readyState === 'number' && el.readyState === 0) {
      // HTMLMediaElement.HAVE_NOTHING = 0:还没拿到任何数据,等 canplay
      // 不直接 return false,先尝试触发 load 再 play
      try { el.load() } catch (e) { /* ignore */ }
    }
    // 重置播放位置 + play()
    try { el.currentTime = 0 } catch (e) { /* ignore */ }
    const p = el.play()
    if (p && typeof p.then === 'function') {
      // ★ V0410-05 修复:成功 resolve 时清理 failedSlots + unlockPending
      //   旧版只用 .catch(noop) 吞错,成功后 slot 不会从 failedSlots 移除
      //   → 该 slot 即使 unlock 后能正常播放,_shouldUseMp3 仍认为它坏
      //   → 真实音效模式长期降级到 synth。现在 .then(() => delete) 保证恢复后立即可用
      p.then(() => {
        if (entry.failedSlots) entry.failedSlots.delete(slot)
        if (entry.unlockPending) entry.unlockPending.delete(slot)
      }).catch(() => {
        // autoplay 拒绝 / 媒体错误 → 不再静默吞,把这个 slot 标记失败,
        // 这样下次同 trackName 触发时上层看到 entry.failedSlots 包含本 slot,
        // 会走 synth fallback。同时也保留 unlockPending 逻辑(用户首次手势后再 retry)。
        entry.unlockPending.add(slot)
        if (!entry.failedSlots) entry.failedSlots = new Set()
        entry.failedSlots.add(slot)
        // ★ 单次失败仅记录,不立即返回 false(autoplay 拒绝是正常的,等 unlock 后能放)
        //   但如果 error 字段存在,说明是真正的资源错误,立即返回 false 让 fallback 生效
        if (el.error) {
          // 已在 entry.failedSlots,后续 playSfxForType 调用会通过 _shouldUseMp3 检测
        }
      })
    }
    return true
  } catch (e) {
    return false  // 同步抛错,降级合成
  }
}

// ★ V049-05 修复:playSfxForType 调 playMp3Sfx 后检查 failedSlots 决定是否走 synth fallback
//   旧版只要 playMp3Sfx 返 true 就 return,async 失败不感知
//   新版:同步 catch 或 entry.failedSlots 命中 → 调 _synthesize(type) 走合成音
function _shouldUseMp3(trackName) {
  if (sfxMode !== 'real') return false
  const fileName = SFX_TRACKS[trackName]
  if (!fileName) return false
  const entry = sfxAudioCache.get(fileName)
  if (!entry) return true  // 还没创建过 pool,信任能正常播放
  if (!entry.failedSlots || entry.failedSlots.size === 0) return true
  // 至少有一个 slot 是好的就能用
  return entry.failedSlots.size < SFX_POOL_SIZE
}

// ★ v0.4.9:unlock 时重试所有 pending 的 SFX play
//   用户首次点击后 AudioContext 解锁,此时可以正常 play 之前被拒绝的 SFX
function _retryPendingSfx() {
  for (const [fileName, entry] of sfxAudioCache.entries()) {
    if (!entry.unlockPending || entry.unlockPending.size === 0) continue
    for (const slot of entry.unlockPending) {
      const el = entry.elements[slot]
      try {
        el.currentTime = 0
        const p = el.play()
        if (p && typeof p.catch === 'function') {
          p.catch(() => { /* 仍失败,保留 slot */ })
        }
      } catch (e) { /* ignore */ }
    }
    entry.unlockPending.clear()
  }
}

// 把 MP3 文件名解析成 Vite 可处理的 URL
//   Vite 编译时把 new URL('../assets/audio/foo.mp3', import.meta.url) 替换成打包后 URL
//   Node 测试环境(无 import.meta.url 时)降级到相对路径,不会 throw
function bgmTrackUrl(name) {
  try {
    return new URL(`../assets/audio/${name}`, import.meta.url).href
  } catch (e) {
    return `../assets/audio/${name}`  // Node fallback
  }
}

// 当前 BGM 用 <audio> 元素(浏览器原生,无需 Web Audio 依赖)
let bgmAudioEl = null
// 是否正在使用真实 MP3(true) / Web Audio 合成 fallback(false)
let bgmUseMp3 = false

function stopMp3Bgm() {
  if (bgmAudioEl) {
    try { bgmAudioEl.pause() } catch (e) { /* swallow */ }
    try { bgmAudioEl.removeAttribute('src') } catch (e) { /* swallow */ }
    bgmAudioEl = null
  }
  bgmUseMp3 = false
}

function startMp3Bgm(style) {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') {
    return false  // Node 环境 / 无 Audio 全局,放弃 MP3
  }
  const fileName = BGM_TRACKS[style] || BGM_TRACKS.energetic
  const url = bgmTrackUrl(fileName)
  try {
    stopMp3Bgm()  // 关旧 audio
    const el = new window.Audio()
    el.src = url
    el.loop = true
    el.volume = bgmVol
    el.preload = 'auto'
    // 自动播放可能被浏览器策略阻止 → catch 不报错
    const playPromise = el.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // 用户没交互前 play 失败,标记为 not-started,等 unlock() 后再试
        bgmUseMp3 = false
      })
    }
    bgmAudioEl = el
    bgmUseMp3 = true
    return true
  } catch (e) {
    return false  // 加载失败,降级合成
  }
}

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
  // v0.4.8 N-3:解锁 AudioContext + 触发 MP3 audio.play()(浏览器策略要求)
  let ok = false
  const c = getCtx()
  if (c) {
    if (c.state === 'suspended') {
      c.resume().catch(() => {})
    }
    ok = true
  }
  // 如果之前 MP3 因策略被拒,这里再 play 一次
  if (bgmAudioEl && bgmAudioEl.paused) {
    try {
      const p = bgmAudioEl.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
      // ★ v0.4.24 修复:恢复播放后把 bgmUseMp3 置回 true — autoplay 被拒时
      //   startMp3Bgm 的 promise catch 已把它置 false,残留 false 会导致之后
      //   setBgmStyle 切歌走不进 startMp3Bgm 分支(bgmTimer 又是 null)→ 静默失效
      bgmUseMp3 = true
    } catch (e) { /* swallow */ }
  }
  return ok
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
  bgmStarted = true
  // v0.4.8 N-3:优先尝试 MP3 真实音频,失败降级 Web Audio 合成
  if (startMp3Bgm(bgmStyle)) {
    return  // MP3 启动成功,直接返回(不再走合成)
  }
  // 降级:Web Audio 合成
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  bgmBeatCount = 0
  bgmTick()
}

function stopBgm() {
  // v0.4.8 N-3:同时停 MP3 和合成 BGM
  stopMp3Bgm()
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
  // v0.4.23:精简为 3 种 BGM 风格 key(任何 BGM_TRACKS 里的 key 都接受)
  //   兼容旧版 'energetic' | 'calm';旧/非法值自动回退到 energetic
  const allowed = Object.keys(BGM_TRACKS)
  const resolved = allowed.includes(style) ? style : 'energetic'
  const changed = resolved !== bgmStyle
  bgmStyle = resolved
  // 如果当前在播放,且 style 改了,无缝切歌
  if (changed && bgmStarted) {
    if (bgmUseMp3) {
      // 切 MP3
      startMp3Bgm(resolved)
    } else if (bgmTimer) {
      // 切合成 — 清掉旧 timer,从新 tempo 重启
      clearTimeout(bgmTimer)
      bgmTimer = null
      bgmBeatCount = 0
      bgmTick()
    }
  }
}

function isBgmEnabled() { return bgmEnabled }
function isSfxEnabled() { return sfxEnabled }
function isVoiceEnabled() { return voiceEnabled }
function setVoiceEnabled(on) { voiceEnabled = !!on }
function isBgmStarted() { return bgmStarted }
function getBgmStyle() { return bgmStyle }
function isBgmMp3() { return bgmUseMp3 }  // v0.4.8 N-3:用于诊断/测试

function setBgmVolume(v) {
  bgmVol = clamp01(v)
  if (bgmGain) bgmGain.gain.value = bgmVol
  // v0.4.8 N-3:同步 MP3 音量
  if (bgmAudioEl) bgmAudioEl.volume = bgmVol
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
 * ★ v0.4.9:优先尝试真实 MP3 采样(sfxMode === 'real'),失败/未启用降级 Web Audio 合成
 * @param {string} type - guandan-engine 的 TYPE 常量
 * @param {number} [count] - 牌张数,可选(用于音高递增)
 */
/**
 * 炸弹中文语音播报(使用浏览器原生 speechSynthesis,无网络依赖)
 * @param {string} text - 默认"炸弹",王炸可传"王炸"
 */
function speakBomb(text = '炸弹') {
  if (!voiceEnabled) return
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    const u = new window.SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    u.rate = 1
    u.pitch = 1
    u.volume = sfxVol * masterVol
    window.speechSynthesis.speak(u)
  } catch (e) { /* ignore */ }
}

// ★ v0.4.24 修复:引擎 TYPE 是数字枚举(SINGLE=1..KINGS_BOMB=14),game 层
//   'play' 事件直接携带数字 type;先映射成字符串牌型名,避免下方
//   type.includes('STRAIGHT') 对数字抛 TypeError,音效静默退化成单张音。
//   命名差异:KINGS_BOMB→'JOKER_BOMB'、THREE→'TRIPLE'、THREE_PAIR→'TRIPLE_PAIR'、
//   PAIR_STRAIGHT→'STRAIGHT_PAIR'、THREE_STRAIGHT→'STRAIGHT_TRIPLE',其余同名。
const TYPE_NUM_TO_NAME = {
  1: 'SINGLE', 2: 'PAIR', 3: 'TRIPLE', 4: 'TRIPLE_PAIR',
  5: 'STRAIGHT', 6: 'STRAIGHT_PAIR', 7: 'STRAIGHT_TRIPLE',
  8: 'BOMB_4', 9: 'BOMB_5', 10: 'BOMB_6', 11: 'BOMB_7', 12: 'BOMB_8',
  13: 'STRAIGHT_FLUSH', 14: 'JOKER_BOMB',
}
function _normalizeSfxType(type) {
  if (typeof type === 'number') return TYPE_NUM_TO_NAME[type] || null
  return type
}

function playSfxForType(type, count) {
  if (!sfxEnabled) return
  type = _normalizeSfxType(type)
  if (!type) {
    if (sfxMode === 'real' && _shouldUseMp3('SINGLE') && playMp3Sfx('SINGLE')) return
    sfxSingle(count); return
  }
  // ★ v0.4.9:real 模式优先 MP3
  // ★ V049-05 修复:先 _shouldUseMp3 检测 failedSlots(pool 是否全坏),
  //   全坏时直接走 synth fallback,不浪费一次 playMp3Sfx 调用
  if (sfxMode === 'real' && _shouldUseMp3(type)) {
    if (playMp3Sfx(type)) {
      // 炸弹/王炸额外播中文语音
      if (type === 'JOKER_BOMB') speakBomb('王炸')
      else if (type.startsWith('BOMB')) speakBomb('炸弹')
      return
    }
    // MP3 失败(sfxMode='real' 但文件不在/load 失败)→ 降级合成
  }
  if (!ctx) {
    // Node / 未解锁:仍尝试语音(测试路径)
    if (type === 'JOKER_BOMB') speakBomb('王炸')
    else if (typeof type === 'string' && type.startsWith('BOMB')) speakBomb('炸弹')
    return
  }
  if (type === 'JOKER_BOMB') { speakBomb('王炸'); return sfxJokerBomb() }
  if (typeof type === 'string' && type.startsWith('BOMB')) {
    speakBomb('炸弹')
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

/**
 * ★ v0.4.9:设置 SFX 模式 + 音量同步
 * @param {string} mode - 'synth'(默认,Web Audio 合成) | 'real'(MP3 真实采样)
 */
function setSfxMode(mode) {
  if (mode !== 'synth' && mode !== 'real') return
  sfxMode = mode
  // real 模式:同步所有缓存 audio 元素音量
  if (mode === 'real') {
    for (const el of sfxAudioCache.values()) {
      try { el.volume = sfxVol } catch (e) { /* ignore */ }
    }
  }
}
function getSfxMode() { return sfxMode }
function isSfxModeReal() { return sfxMode === 'real' }

function setSfxEnabled(on) { sfxEnabled = !!on }
function setSfxVolume(v) {
  sfxVol = clamp01(v)
  if (sfxGain) sfxGain.gain.value = sfxVol
  // ★ v0.4.9:real 模式同步所有缓存 audio 元素
  if (sfxMode === 'real') {
    // ★ v0.4.24 修复:cache 值是 pool entry({ elements, nextIndex, unlockPending }),
    //   对 entry 本身赋 .volume 无效,必须遍历 entry.elements 更新每个 Audio element
    for (const entry of sfxAudioCache.values()) {
      const els = entry && Array.isArray(entry.elements) ? entry.elements : []
      for (const el of els) {
        try { el.volume = sfxVol } catch (e) { /* ignore */ }
      }
    }
  }
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
  setBgmStyle, getBgmStyle, isBgmMp3,
  playSfxForType, setSfxEnabled, setSfxVolume, isSfxEnabled,
  // ★ UX 改进:炸弹/王炸中文语音播报开关
  setVoiceEnabled, isVoiceEnabled,
  sfxBomb, sfxJokerBomb, sfxSuperBomb,
  sfxCountdownTick, sfxCountdownWarn, sfxUrgentBeep,
  // ★ v0.4.9:SFX 模式切换(synth / real)
  setSfxMode, getSfxMode, isSfxModeReal,
  setMasterVolume,
  getCtx,
  destroyAudio,
}

const audio = {
  unlock,
  startBgm, stopBgm, setBgmEnabled, setBgmVolume, isBgmEnabled, isBgmStarted,
  setBgmStyle, getBgmStyle, isBgmMp3,
  playSfxForType, setSfxEnabled, setSfxVolume, isSfxEnabled,
  setVoiceEnabled, isVoiceEnabled,
  sfxBomb, sfxJokerBomb, sfxSuperBomb,
  sfxCountdownTick, sfxCountdownWarn, sfxUrgentBeep,
  setSfxMode, getSfxMode, isSfxModeReal,
  setMasterVolume,
  getCtx,
}
export default audio