<template>
  <!--
   * v0.4.25 记牌器 — 各点数剩余张数面板(掼蛋玩家刚需)
   * 数据由 useGameLogic.cardCounter 计算(总数 - 已出 - 自己手牌)
   * 级牌行高亮「级」标;剩余 0 置灰
   -->
  <div class="card-counter">
    <button
      class="cc-toggle"
      :aria-expanded="open"
      aria-label="记牌器"
      title="记牌器"
      @click="open = !open"
    ><span aria-hidden="true">🧮</span></button>
    <transition name="cc-slide">
      <div v-if="open" class="cc-panel" role="table" aria-label="各点数剩余张数">
        <div class="cc-title">
          <span>记牌器</span>
          <span class="cc-sub">剩余张数</span>
        </div>
        <div class="cc-grid">
          <div
            v-for="r in rows"
            :key="r.rank"
            class="cc-cell"
            :class="{ zero: r.left === 0, level: r.rank === levelRank }"
            role="row"
          >
            <span class="cc-rank">{{ r.label }}<i v-if="r.rank === levelRank" class="cc-level-tag">级</i></span>
            <span class="cc-left">{{ r.left }}</span>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  // cardCounter 行: [{ rank, label, total, out, left }]
  rows: { type: Array, default: () => [] },
  // 当前级牌 rank(高亮)
  levelRank: { type: Number, default: 0 },
})

const open = ref(false)
</script>

<style scoped>
.card-counter {
  position: relative;
  z-index: 70;
  pointer-events: none;
}
.cc-toggle {
  pointer-events: auto;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1.5px solid var(--gold, #FFD700);
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.cc-toggle:hover { transform: scale(1.08); box-shadow: 0 0 12px rgba(255, 215, 0, 0.4); }
.cc-toggle:active { transform: scale(0.94); }
.cc-toggle[aria-expanded="true"] { background: rgba(255, 215, 0, 0.25); }

.cc-panel {
  position: absolute;
  right: 52px;
  top: 50%;
  transform: translateY(-50%);
  width: 208px;
  padding: 10px 12px;
  background: rgba(8, 12, 32, 0.94);
  border: 1.5px solid var(--gold, #FFD700);
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}
.cc-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  font-weight: 800;
  color: var(--gold, #FFD700);
  margin-bottom: 8px;
  letter-spacing: 1px;
}
.cc-sub { font-size: 9px; color: rgba(255, 255, 255, 0.45); font-weight: 400; }
.cc-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.cc-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3px 0 2px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  line-height: 1.15;
}
.cc-rank { font-size: 11px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 1px; }
.cc-left { font-size: 10px; font-weight: 900; color: #ffd76a; }
.cc-cell.zero { opacity: 0.35; }
.cc-cell.zero .cc-left { color: #aaa; }
.cc-cell.level { border-color: var(--accent-orange, #FF9800); background: rgba(255, 152, 0, 0.14); }
.cc-level-tag {
  font-style: normal;
  font-size: 8px;
  background: var(--accent-orange, #FF9800);
  color: #fff;
  border-radius: 3px;
  padding: 0 2px;
  line-height: 1.2;
}
.cc-slide-enter-active, .cc-slide-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.cc-slide-enter-from, .cc-slide-leave-to { opacity: 0; transform: translateY(-50%) translateX(8px); }

/* 移动端:面板改到按钮左侧上方,避免出屏 */
@media (max-width: 768px) {
  .cc-panel {
    width: 188px;
    padding: 8px 10px;
  }
}
</style>
