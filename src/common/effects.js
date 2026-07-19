/* ============================================================
 * 特效控制器(纯 JS,无 Vue 依赖)
 * 提供 createEffectController() 给 GameView 调用
 * ============================================================ */

/**
 * 牌型 → 中央大字特效
 * @param {string|number} type TYPE.X(recognize 返回)或字符串牌型名
 * @returns {{ kind: 'bomb'|'joker'|'super'|'none', text: string } | null}
 */
// ★ v0.4.24 修复:引擎 TYPE 是数字枚举,game 'play' 事件直接携带数字 type —
//   先做数字→字符串映射,数字入参也能命中炸弹/王炸/同花顺特效(旧版全部返回 null)
const TYPE_NUM_TO_NAME = {
  1: 'SINGLE', 2: 'PAIR', 3: 'TRIPLE', 4: 'TRIPLE_PAIR',
  5: 'STRAIGHT', 6: 'STRAIGHT_PAIR', 7: 'STRAIGHT_TRIPLE',
  8: 'BOMB_4', 9: 'BOMB_5', 10: 'BOMB_6', 11: 'BOMB_7', 12: 'BOMB_8',
  13: 'STRAIGHT_FLUSH', 14: 'JOKER_BOMB',
}
export function bombFxForType(type) {
  if (typeof type === 'number') type = TYPE_NUM_TO_NAME[type]
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
