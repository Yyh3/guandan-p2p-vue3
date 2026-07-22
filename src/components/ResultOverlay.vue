<template>
  <!--
    ★ v0.4.29 精简:结算战绩卡抽成共享组件,桌面/移动端复用同一份模板与样式。
    翡翠绿玻璃卡 + 金箔胜/负印章 + 双上/旗开得胜/惜败徽章。
    保留 .result-mask 类名与「本局结束/返回首页/下一局」文案(E2E result-overlay.spec.js 依赖)。
    响应式:基础为桌面尺寸,@media (max-width:768px) 收紧为移动端尺寸。
  -->
  <div v-if="phase === 'finished'" class="result-mask">
    <div class="result-card" :class="myWin ? 'is-win' : 'is-lose'">
      <div class="result-seal" aria-hidden="true"><span>{{ myWin ? '胜' : '负' }}</span></div>
      <div class="result-head">
        <h2 class="result-title">{{ isRestartAfterA ? '本轮过 A' : '本局结束' }}</h2>
        <p class="result-meta" v-if="!isRestartAfterA">升 {{ levelUp }} 级 · 下一局打 {{ nextLevelLabel }}</p>
        <p class="result-meta" v-else>本轮已从 A 过关,点击下方按钮开启新一轮对局</p>
      </div>
      <div class="result-badges">
        <span v-if="doubleUp" class="r-badge r-badge-gold">双上</span>
        <span v-if="myWin" class="r-badge r-badge-green">旗开得胜</span>
        <span v-else class="r-badge r-badge-gray">惜败</span>
      </div>
      <div class="result-list">
        <div
          v-for="(seat, i) in finishedOrder"
          :key="i"
          class="result-row"
          :class="rankColor(i)"
        >
          <span class="result-rank">{{ ['头游', '二游', '三游', '末游'][i] }}</span>
          <span class="result-name">{{ playerName(seat) }}</span>
          <span class="result-team"><span aria-hidden="true">{{ isWinningSeat(seat) ? '🏆' : '💀' }}</span> {{ isWinningSeat(seat) ? '胜方' : '负方' }}</span>
        </div>
      </div>
      <div class="result-actions">
        <button class="r-btn ghost" @click="$emit('back')">返回首页</button>
        <!-- ★ P1-01:明确的「下一局/重开一轮」按钮;primary 统一回调由父级 onPrimaryResultAction 处理 -->
        <button
          v-if="!isP2PMode"
          class="r-btn primary"
          @click="$emit('primary')"
        >
          {{ isRestartAfterA ? '重开一轮' : '下一局' }}
        </button>
        <button
          v-else-if="isNetworkHost"
          class="r-btn primary"
          @click="$emit('primary')"
        >
          {{ isRestartAfterA ? '重开一轮' : '开始下一局' }}
        </button>
        <button v-else class="r-btn primary" disabled>
          等待房主开始下一局
        </button>
        <button v-if="isP2PMode" class="r-btn ghost" @click="$emit('backToRoom')">返回房间</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  phase: { type: String, default: 'idle' },
  isRestartAfterA: { type: Boolean, default: false },
  levelUp: { type: Number, default: 0 },
  nextLevelLabel: { type: String, default: '2' },
  finishedOrder: { type: Array, default: () => [] },
  myWin: { type: Boolean, default: false },
  doubleUp: { type: Boolean, default: false },
  isP2PMode: { type: Boolean, default: false },
  isNetworkHost: { type: Boolean, default: false },
  playerName: { type: Function, default: (s) => `玩家${s}` },
  rankColor: { type: Function, default: (i) => ['gold', 'silver', 'bronze', 'last'][i] },
  isWinningSeat: { type: Function, default: () => false },
})
defineEmits(['back', 'primary', 'backToRoom'])
</script>

<style scoped>
.result-mask {
  position: fixed; inset: 0;
  background: rgba(2, 8, 6, 0.72);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 16px;
  animation: resultFade 260ms var(--ease-out) both;
}
@keyframes resultFade { from { opacity: 0; } to { opacity: 1; } }
.result-card {
  position: relative;
  width: 90%; max-width: 400px;
  padding: 40px 26px 24px;
  border-radius: 22px;
  border: 1.5px solid var(--gold-primary);
  background:
    radial-gradient(130% 90% at 50% 0%, rgba(31, 122, 85, 0.5), rgba(10, 61, 44, 0.94) 62%),
    var(--emerald-deep);
  color: #fff;
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55), 0 0 44px rgba(212, 175, 55, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.14);
  animation: resultPop 460ms var(--ease-spring) both;
}
@keyframes resultPop {
  from { opacity: 0; transform: translateY(26px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.result-seal {
  position: absolute;
  top: -20px; right: 22px;
  width: 76px; height: 76px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  transform: rotate(12deg);
  border: 3px double currentColor;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4), inset 0 0 0 4px rgba(255, 255, 255, 0.08);
  animation: sealStamp 520ms var(--ease-spring) 120ms both;
}
@keyframes sealStamp {
  from { opacity: 0; transform: rotate(12deg) scale(1.7); }
  to { opacity: 1; transform: rotate(12deg) scale(1); }
}
.result-seal span { font-size: 38px; font-weight: 900; line-height: 1; letter-spacing: 0; }
.result-card.is-win .result-seal { color: #ffd700; background: radial-gradient(circle at 35% 30%, #c62828, #8e1b1b); }
.result-card.is-win .result-seal span { text-shadow: 0 0 12px rgba(255, 215, 0, 0.7); }
.result-card.is-lose .result-seal { color: #b0bec5; background: radial-gradient(circle at 35% 30%, #455a64, #263238); }
.result-head { text-align: center; margin-bottom: 14px; }
.result-title {
  margin: 0 0 6px;
  font-family: var(--font-display-cn);
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 4px;
  background: var(--gold-metallic);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.result-meta { margin: 0; font-size: 13px; letter-spacing: 1px; color: rgba(255, 255, 255, 0.66); }
.result-badges { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; }
.r-badge {
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 2px;
  border: 1px solid transparent;
}
.r-badge-gold { color: #2a1d08; background: var(--gold-metallic); box-shadow: 0 2px 10px rgba(212, 175, 55, 0.45); }
.r-badge-green { color: #e8f5e9; background: rgba(67, 160, 71, 0.28); border-color: rgba(102, 187, 106, 0.5); }
.r-badge-gray { color: rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.18); }
.result-list { border-radius: 14px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1); }
.result-list .result-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.045);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.result-list .result-row:last-child { border-bottom: none; }
.result-rank { font-size: 15px; font-weight: 900; width: 52px; letter-spacing: 2px; }
.result-name { flex: 1; font-size: 15px; color: rgba(255, 255, 255, 0.92); }
.result-team { font-size: 12px; color: rgba(255, 255, 255, 0.6); }
.result-row.gold { border-left: 4px solid var(--gold-bright); }
.result-row.gold .result-rank { color: var(--gold-bright); }
.result-row.silver { border-left: 4px solid #cfd8dc; }
.result-row.silver .result-rank { color: #cfd8dc; }
.result-row.bronze { border-left: 4px solid #cd7f32; }
.result-row.bronze .result-rank { color: #e0a06b; }
.result-row.last { border-left: 4px solid #607d8b; }
.result-row.last .result-rank { color: #90a4ae; }
.result-actions { display: flex; gap: 12px; margin-top: 18px; }
.r-btn { flex: 1; height: 48px; border: none; border-radius: 24px; font-size: 15px; font-weight: 800; letter-spacing: 2px; cursor: pointer; transition: transform var(--t-fast) var(--ease-out), filter 160ms var(--ease-out); }
.r-btn:active:not(:disabled) { transform: scale(0.97); }
.r-btn.primary { background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%); color: #3a2308; box-shadow: 0 8px 20px rgba(233, 173, 63, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.55); }
.r-btn.primary:hover:not(:disabled) { filter: brightness(1.06); }
.r-btn.ghost { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.85); border: 1px solid rgba(255, 255, 255, 0.18); }
.r-btn.ghost:hover { background: rgba(255, 255, 255, 0.14); }
.r-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 移动端收紧尺寸 */
@media (max-width: 768px) {
  .result-card { max-width: 340px; padding: 36px 18px 16px; }
  .result-seal { width: 66px; height: 66px; top: -18px; right: 18px; }
  .result-seal span { font-size: 32px; }
  .result-title { font-size: 24px; }
  .result-rank { width: 44px; }
}
</style>
