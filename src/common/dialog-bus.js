/**
 * 全局轻量对话框/Toast 事件总线。
 *
 * 用于替代 alert()/confirm()，让任何模块（包括纯 JS 的 useGameLogic）
 * 都能触发应用内浮层，而不阻塞主线程或依赖浏览器原生弹窗。
 */

const listeners = {
  toast: [],
  confirm: [],
}

/**
 * 显示临时 Toast（默认 2 秒）。
 * @param {string} message 提示文本
 * @param {number} [duration=2000] 停留毫秒数
 */
export function showToast(message, duration = 2000) {
  for (const cb of listeners.toast) {
    try { cb(message, duration) } catch (e) { console.error(e) }
  }
}

/**
 * 显示确认对话框，通过回调返回用户选择。
 * @param {object} opts
 * @param {string} [opts.title='提示']
 * @param {string} opts.message
 * @param {string} [opts.confirmText='确定']
 * @param {string} [opts.cancelText='取消']
 * @param {() => void} [opts.onConfirm]
 * @param {() => void} [opts.onCancel]
 */
export function showConfirm({ title = '提示', message, confirmText = '确定', cancelText = '取消', onConfirm, onCancel }) {
  for (const cb of listeners.confirm) {
    try { cb({ title, message, confirmText, cancelText, onConfirm, onCancel }) } catch (e) { console.error(e) }
  }
}

/**
 * 订阅 Toast 事件（一般由全局 ToastOverlay.vue 调用）。
 * @param {(message: string, duration: number) => void} cb
 * @returns {() => void} 取消订阅函数
 */
export function onToast(cb) {
  listeners.toast.push(cb)
  return () => {
    const idx = listeners.toast.indexOf(cb)
    if (idx >= 0) listeners.toast.splice(idx, 1)
  }
}

/**
 * 订阅 Confirm 事件（一般由全局 ConfirmDialog.vue 调用）。
 * @param {(opts: object) => void} cb
 * @returns {() => void} 取消订阅函数
 */
export function onConfirm(cb) {
  listeners.confirm.push(cb)
  return () => {
    const idx = listeners.confirm.indexOf(cb)
    if (idx >= 0) listeners.confirm.splice(idx, 1)
  }
}
