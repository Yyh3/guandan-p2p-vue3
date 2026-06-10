/* ============================================================
 * 特效控制器(纯 JS,无 Vue 依赖)
 * 提供 createEffectController() 给 GameView 调用
 * ============================================================ */

/**
 * 牌型 → 中央大字特效
 * @param {string|number} type TYPE.X(recognize 返回)
 * @returns {{ kind: 'bomb'|'joker'|'super'|'none', text: string } | null}
 */
export function bombFxForType(type) {
  if (type === 'JOKER_BOMB') return { kind: 'joker', text: '王炸' }
  if (typeof type === 'string' && type.startsWith('BOMB')) {
    if (type === 'BOMB_6' || type === 'BOMB_7' || type === 'BOMB_8' || type === 'BOMB_9' || type === 'BOMB_10') {
      return { kind: 'super', text: '超级炸弹' }
    }
    return { kind: 'bomb', text: '炸弹' }
  }
  if (type === 'STRAIGHT_FLUSH') return { kind: 'super', text: '同花顺' }
  return null
}

/**
 * 创建一个特效控制器(reactive refs)
 * @returns {{
 *   bombFx, setBombFx, clearBombFx,
 *   floatingTexts, pushFloating,
 *   shaking, triggerShake
 * }}
 */
export function createEffectController() {
  // 屏幕震动
  let shaking = false
  function triggerShake(ms = 400) {
    shaking = true
    setTimeout(() => { shaking = false }, ms)
  }

  return {
    shaking: () => shaking,
    triggerShake,
  }
}

/**
 * 计算飘字位置(根据座位号)
 * @param {number} seat 0=玩家(下), 1=左, 2=上(队友), 3=右
 * @param {HTMLElement} container 容器,默认 viewport
 * @returns {{ left: string, top: string }}
 */
export function floatingPosition(seat, container) {
  const w = container?.clientWidth || window.innerWidth
  const h = container?.clientHeight || window.innerHeight
  return {
    '0': { left: '50%', top: `${h * 0.72}px` },  // 玩家(下方)
    '1': { left: '20%', top: `${h * 0.45}px` },  // 左
    '2': { left: '50%', top: `${h * 0.20}px` },  // 上
    '3': { left: '80%', top: `${h * 0.45}px` },  // 右
  }[String(seat)] || { left: '50%', top: '50%' }
}
