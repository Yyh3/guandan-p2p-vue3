/**
 * 本地存储工具(localStorage 封装)
 * 零依赖,纯 JS
 */

const KEY_NICKNAME = 'guandan_nickname'
const KEY_AVATAR = 'guandan_avatar'
const KEY_HISTORY = 'guandan_history'
const KEY_SETTINGS = 'guandan_settings'
// ★ v0.4.28 P0-2:记录「上次的牌局」,首页可一键回到最近的对局
const KEY_LAST_GAME = 'guandan_last_game'

function getNickname() {
  try {
    const v = localStorage.getItem(KEY_NICKNAME)
    if (v) return v
  } catch (e) {}
  const def = '玩家' + Math.floor(1000 + Math.random() * 9000)
  setNickname(def)
  return def
}
function setNickname(name) {
  try { localStorage.setItem(KEY_NICKNAME, name); return true } catch (e) { return false }
}

function getAvatar() {
  try { return localStorage.getItem(KEY_AVATAR) || '🀄' } catch (e) { return '🀄' }
}
function setAvatar(a) {
  try { localStorage.setItem(KEY_AVATAR, a); return true } catch (e) { return false }
}

// 设置项默认值
const DEFAULT_SETTINGS = {
  playTime: 30,
  ghostMode: false,
  showLastTrick: true,
  // v1.0 新增:音乐/音效(v1-features 任务)
  bgmEnabled: true,
  sfxEnabled: true,
  bgmVolume: 0.5,   // 0..1
  sfxVolume: 0.7,   // 0..1
  // v3.8 补:音乐风格持久化(verifier P2 复查时发现的尾巴)
  bgmStyle: 'energetic', // 'energetic' | 'calm'
  // ★ v0.4.9:全局默认 AI 难度(SettingsView 设置 → AIView / 联机房间默认读这个)
  //   之前 AIView.vue 写死 ref('medium'),每次刷新重置 → 用户上次选 hard 被覆盖
  //   现在持久化到 storage,AIView onMounted 从 storage.getSettings().aiDifficulty 读
  aiDifficulty: 'medium', // 'medium' | 'hard'
  // v0.4.22:触控反馈开关
  hapticsEnabled: true,
  // v0.4.25:简洁模式 — 隐藏牌桌/牌面装饰纹理,界面更干净(对局页 .page 加 simple-mode class)
  simpleMode: false,
  // ★ v0.4.28 P1-3:牌桌/牌背主题 — classic/bamboo/lacquer/porcelain
  tableTheme: 'classic',
}

function getSettings() {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const obj = JSON.parse(raw)
    // 合并默认值,防止老版本/部分写入
    return { ...DEFAULT_SETTINGS, ...obj }
  } catch (e) { return { ...DEFAULT_SETTINGS } }
}
function setSettings(s) {
  // ★ V049-06 修复:setSettings 合并当前存储值,而不是默认值
  //   旧版:{ ...DEFAULT_SETTINGS, ...s } → 调用方传局部字段(如只 aiDifficulty)
  //   会把 bgmEnabled / sfxEnabled / bgmVolume / sfxVolume / theme / bgmStyle / sfxMode
  //   等其他设置重置为默认值,导致用户改 AI 难度后其他设置被悄悄恢复默认
  //   新版:getSettings() 拿到当前(已经合并默认值的完整对象),再叠加本次传入的 s
  if (!s || typeof s !== 'object') return false
  try {
    const current = getSettings()  // 已经合并 DEFAULT_SETTINGS 的完整对象
    const next = { ...current, ...s }
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(next))
    return true
  } catch (e) { return false }
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_HISTORY)) || [] } catch (e) { return [] }
}
function addHistory(record) {
  const list = getHistory()
  // ★ Phase 3-B:按 (matchId, roundId, mySeat, myPlayerId) 去重;缺字段时退到 time
  const hasKey = record &&
    record.matchId != null && record.roundId != null &&
    record.mySeat != null && record.myPlayerId != null
  const key = hasKey
    ? `${record.matchId}-${record.roundId}-${record.mySeat}-${record.myPlayerId}`
    : record?.time
  const exists = list.some(r => {
    if (hasKey) {
      return r && `${r.matchId}-${r.roundId}-${r.mySeat}-${r.myPlayerId}` === key
    }
    return r && r.time === key
  })
  if (!exists) list.unshift(record)
  if (list.length > 50) list.length = 50
  try { localStorage.setItem(KEY_HISTORY, JSON.stringify(list)); return true } catch (e) { return false }
}
function clearHistory() {
  try { localStorage.removeItem(KEY_HISTORY); return true } catch (e) { return false }
}

// ★ v0.4.28 P0-2:上次的牌局(房间号 / host 地址 / 角色 / 时间戳)
//   首页读到最后 24h 内的记录时展示「回到上次的牌局」金色横幅。
function setLastGame(info) {
  if (!info || typeof info !== 'object') return false
  try {
    localStorage.setItem(KEY_LAST_GAME, JSON.stringify({ ...info, time: Date.now() }))
    return true
  } catch (e) { return false }
}
function getLastGame() {
  try {
    const raw = localStorage.getItem(KEY_LAST_GAME)
    return raw ? JSON.parse(raw) : null
  } catch (e) { return null }
}
function clearLastGame() {
  try { localStorage.removeItem(KEY_LAST_GAME); return true } catch (e) { return false }
}

export {
  getNickname, setNickname,
  getAvatar, setAvatar,
  getSettings, setSettings,
  getHistory, addHistory, clearHistory,
  setLastGame, getLastGame, clearLastGame,
}

// Default export for convenient `import storage from '@/common/storage.js'`
const storage = {
  getNickname, setNickname,
  getAvatar, setAvatar,
  getSettings, setSettings,
  getHistory, addHistory, clearHistory,
  setLastGame, getLastGame, clearLastGame,
}
export default storage
