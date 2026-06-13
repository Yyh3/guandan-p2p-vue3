/**
 * 座位旋转 (seat-rotation)
 *
 * 4 人掼蛋 2v2:队友永远在正上方。
 * 视角旋转规则(以 selfSeat 为参考):
 *   - 上 (top)   = (selfSeat + 2) % 4   ← 队友
 *   - 下 (bottom)= selfSeat            ← 自己
 *   - 左 (left)  = (selfSeat + 3) % 4
 *   - 右 (right) = (selfSeat + 1) % 4
 *
 * 历史:v3.8 P1 修复(GameView.vue:337-410)。原本硬编码 seat 0=自己,只对 host 正确,
 * joiner 看自己时是 AI 默认。从 GameView seatData 抽出来,做纯函数 + 单测覆盖。
 *
 * 4 个 selfSeat 的完整覆盖:
 *   selfSeat=0: top=2, bottom=0, left=3, right=1
 *   selfSeat=1: top=3, bottom=1, left=0, right=2
 *   selfSeat=2: top=0, bottom=2, left=1, right=3
 *   selfSeat=3: top=1, bottom=3, left=2, right=0
 *
 * 无 Vue / 无浏览器依赖,纯函数,可在 Node 直接 import。
 */

export const SEAT_POSITIONS = ['top', 'bottom', 'left', 'right']

/**
 * 计算给定 selfSeat 时,4 个视角位置对应的原始 seat 索引。
 * @param {number} selfSeat 自己所在的原始 seat (0-3)
 * @returns {{ top: number, bottom: number, left: number, right: number }}
 */
export function rotateSeats(selfSeat) {
  if (selfSeat < 0 || selfSeat > 3 || !Number.isInteger(selfSeat)) {
    throw new RangeError(`selfSeat must be int 0-3, got: ${selfSeat}`)
  }
  return {
    top: (selfSeat + 2) % 4,    // 队友
    bottom: selfSeat,           // 自己
    left: (selfSeat + 3) % 4,
    right: (selfSeat + 1) % 4,
  }
}

/**
 * 把 seats[0..3] 的数组按 selfSeat 旋转成 { top, bottom, left, right } 顺序的对象。
 * 每个元素会附带原始 seatIndex 方便回溯。
 *
 * @param {Array} seats 长度 4 的数组(seat 0..3 顺序)
 * @param {number} selfSeat 自己所在的原始 seat (0-3)
 * @returns {{ top: {seatIndex: number, data: any}, bottom: ..., left: ..., right: ... }}
 */
export function rotateSeatView(seats, selfSeat) {
  if (!Array.isArray(seats) || seats.length !== 4) {
    throw new RangeError(`seats must be length-4 array, got: ${seats?.length}`)
  }
  const r = rotateSeats(selfSeat)
  return {
    top: { seatIndex: r.top, data: seats[r.top] },
    bottom: { seatIndex: r.bottom, data: seats[r.bottom] },
    left: { seatIndex: r.left, data: seats[r.left] },
    right: { seatIndex: r.right, data: seats[r.right] },
  }
}

/**
 * 给定 selfSeat,返回哪个 position 是"自己"。永远返回 'bottom'。
 * 显式函数,避免外部硬编码字符串,改规则时一处改完。
 * @param {number} _selfSeat (unused; interface compatibility)
 * @returns {'bottom'}
 */
export function selfPosition(_selfSeat) {
  return 'bottom'
}

/**
 * 给定 selfSeat,返回哪个 position 是"队友"。永远返回 'top'。
 * @param {number} _selfSeat (unused)
 * @returns {'top'}
 */
export function teammatePosition(_selfSeat) {
  return 'top'
}