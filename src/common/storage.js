/**
 * 本地存储工具(localStorage 封装)
 * 零依赖,纯 JS
 */

const KEY_NICKNAME = 'guandan_nickname'
const KEY_AVATAR = 'guandan_avatar'
const KEY_HISTORY = 'guandan_history'
const KEY_SETTINGS = 'guandan_settings'

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
  try { localStorage.setItem(KEY_SETTINGS, JSON.stringify({ ...DEFAULT_SETTINGS, ...s })); return true } catch (e) { return false }
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_HISTORY)) || [] } catch (e) { return [] }
}
function addHistory(record) {
  const list = getHistory()
  list.unshift(record)
  if (list.length > 50) list.length = 50
  try { localStorage.setItem(KEY_HISTORY, JSON.stringify(list)); return true } catch (e) { return false }
}
function clearHistory() {
  try { localStorage.removeItem(KEY_HISTORY); return true } catch (e) { return false }
}

export {
  getNickname, setNickname,
  getAvatar, setAvatar,
  getSettings, setSettings,
  getHistory, addHistory, clearHistory,
}

// Default export for convenient `import storage from '@/common/storage.js'`
const storage = {
  getNickname, setNickname,
  getAvatar, setAvatar,
  getSettings, setSettings,
  getHistory, addHistory, clearHistory,
}
export default storage
