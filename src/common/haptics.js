/**
 * haptics.js — 触控反馈封装
 *
 * 原生环境走 @capacitor/haptics,浏览器回退到 navigator.vibrate。
 * 受 storage `hapticsEnabled` 设置控制,可在 SettingsView 关闭。
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { getSettings } from './storage.js'

const STYLE_MAP = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
}

const NOTIFY_MAP = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
}

function enabled() {
  try {
    return getSettings().hapticsEnabled !== false
  } catch (e) {
    return true
  }
}

function webVibrate(ms) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(ms) } catch (_) {}
  }
}

async function run(fn) {
  if (!enabled()) return
  try {
    await fn()
  } catch (e) {
    // 原生未就绪或浏览器不支持时静默回退
  }
}

/**
 * 短振动(按钮点击等)
 * @param {'light'|'medium'|'heavy'} style
 */
export async function impact(style = 'light') {
  const mapped = STYLE_MAP[style] || STYLE_MAP.light
  await run(() => Haptics.impact({ style: mapped }))
}

/**
 * 通知型振动(成功/警告/错误)
 * @param {'success'|'warning'|'error'} type
 */
export async function notify(type = 'success') {
  const mapped = NOTIFY_MAP[type] || NOTIFY_MAP.success
  await run(() => Haptics.notification({ type: mapped }))
}

/** 轻点反馈 */
export async function click() { return impact('light') }

/** 选中/切换反馈 */
export async function select() { return impact('light') }

/** 出牌/主操作反馈 */
export async function action() { return impact('medium') }

/** 胜利/结算反馈 */
export async function success() { return notify('success') }

/** 错误/非法操作反馈 */
export async function error() { return notify('error') }

export { enabled as isHapticsEnabled }
