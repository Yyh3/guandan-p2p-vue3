/**
 * 发牌动画控制器
 *
 * 4 家从中心点同时发牌,每轮同时发 4 张,每张之间 stagger。
 * 纯 DOM 操控 + CSS transition,无依赖。
 *
 * 用法:
 *   import dealAnim from '@/common/deal-animation.js'
 *   dealAnim.start({
 *     container,           // HTMLElement 容器(覆盖在 .page 上)
 *     center: {x, y},      // 牌堆中心点
 *     targets: {0:{x,y},1:{x,y},2:{x,y},3:{x,y}},  // 4 个座位目标
 *     cardsPerSeat: 27,
 *     stagger: 60,         // ms
 *     flightDuration: 400, // ms
 *     onProgress(p) {},    // 0..1
 *     onComplete(),
 *   })
 */

const DEFAULTS = {
  cardsPerSeat: 27,
  // v2.5:stagger 60 → 70,flightDuration 400 → 380,曲线 ease-out-back(微微 overshoot,自然)
  stagger: 70,
  flightDuration: 380,
  onProgress: null,
  onComplete: null,
}

class DealAnimation {
  constructor() {
    this._running = false
    this._cancel = false
  }

  isRunning() { return this._running }

  start(opts) {
    if (this._running) return
    const o = Object.assign({}, DEFAULTS, opts)
    const { container, center, targets } = o
    if (!container || !center || !targets) {
      console.warn('[deal-animation] missing required opts')
      return
    }
    // v2.4 t3 测试 hook:window.__gd_skipDealAnim=true 时立即调 onComplete(用于 headless 截图)
    if (typeof window !== 'undefined' && window.__gd_skipDealAnim) {
      this._running = true
      // 下个 microtask 触发 onComplete,跟正常路径行为一致
      Promise.resolve().then(() => {
        this._running = false
        o.onComplete && o.onComplete()
      })
      return
    }
    this._running = true
    this._cancel = false
    container.style.pointerEvents = 'none'

    const total = o.cardsPerSeat
    const seats = [0, 1, 2, 3]
    let sent = 0
    const cards = []

    // 预创建所有牌(放在中心,不可见),然后逐批触发 transition
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < total; i++) {
        const card = document.createElement('div')
        card.className = 'deal-flying-card'
        card.dataset.seat = String(s)
        card.dataset.idx = String(i)
        // v2.5:加随机旋转初值(-25~25度),让牌从中心飞出时呈扇形散开,更自然
        const initRot = (Math.random() * 50 - 25)
        const targetRot = (s === 0 || s === 2) ? 0 : (s === 1 ? -8 : 8)
        card.style.cssText = [
          'position:absolute',
          `left:${center.x}px`,
          `top:${center.y}px`,
          'width:34px',
          'height:50px',
          'background:linear-gradient(135deg,#1e88e5,#1565c0)',
          'border:1.5px solid #fff',
          'border-radius:5px',
          'box-shadow:0 2px 6px rgba(0,0,0,0.4)',
          'z-index:9999',
          'opacity:0',
          // v2.5:初值 scale 1.4(大)+ 随机 rotate,飞向 target 时缩到 0.5 + 转正 + 透明度 0.85(模拟飞远)
          `transform:translate(-50%,-50%) scale(1.4) rotate(${initRot}deg)`,
          // v2.5:cubic-bezier(.34,1.56,.64,1) ease-out-back,微微 overshoot 更自然
          `transition:transform ${o.flightDuration}ms cubic-bezier(.34,1.56,.64,1),opacity ${o.flightDuration}ms ease-out`,
          'will-change:transform,opacity',
          'pointer-events:none',
        ].join(';')
        container.appendChild(card)
        cards.push(card)
      }
    }

    const sendBatch = () => {
      if (this._cancel) {
        this._cleanup(container, cards)
        return
      }
      if (sent >= total) {
        // 等最后一批飞完再回调
        setTimeout(() => {
          if (!this._cancel) {
            this._cleanup(container, cards, /* keep */ false)
            this._running = false
            o.onComplete && o.onComplete()
          } else {
            this._running = false
          }
        }, o.flightDuration + 80)
        return
      }
      seats.forEach(seat => {
        const idx = sent
        const card = cards[seat * total + idx]
        if (!card) return
        const target = targets[seat] || center
        const dx = target.x - center.x
        const dy = target.y - center.y
        // v2.5:从写死的 ±14 改用 pre-baked targetRot(±8,更柔和)
        const rot = (seat === 0 || seat === 2) ? 0 : (seat === 1 ? -8 : 8)
        // 先显示
        card.style.opacity = '0.85'  // v2.5:末态半透明,模拟"飞远"
        // 强制重排后改 transform 触发 transition
        // eslint-disable-next-line no-unused-expressions
        card.offsetWidth
        // v2.5:target scale 0.5(牌最终缩到 0.5,飞过去更小更远)
        card.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5) rotate(${rot}deg)`
      })
      sent++
      if (o.onProgress) o.onProgress(sent / total)
      setTimeout(sendBatch, o.stagger)
    }
    // 下一帧启动
    requestAnimationFrame(sendBatch)
  }

  cancel() {
    this._cancel = true
  }

  _cleanup(container, cards) {
    cards.forEach(c => {
      if (c && c.parentNode) c.parentNode.removeChild(c)
    })
    container.style.pointerEvents = ''
  }
}

const dealAnim = new DealAnimation()
export { DealAnimation, dealAnim }
export default dealAnim
