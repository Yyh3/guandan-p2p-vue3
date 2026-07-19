<template>
  <!--
   * v0.4.25 级牌进度轨 — 2→3→…→A 升级路径 + 双方队伍位置标记
   * 掼蛋是升级游戏,把"我方/对方打到哪一级"做成顶部进度轨,
   * 替代只有"打 X"单点数字的信息缺口(主流掼蛋手游标配)
   * 圆点:绿 = 我方队伍,红 = 对方队伍;金底 = 本局级牌
   -->
  <div
    class="level-track"
    role="img"
    :aria-label="`等级进度:我方 ${labelOf(teamLevels[myTeam])},对方 ${labelOf(teamLevels[oppTeam])}`"
  >
    <div class="lt-nodes">
      <div
        v-for="r in SEQ"
        :key="r"
        class="lt-node"
        :class="{ current: r === levelRank }"
      >
        <span class="lt-label">{{ labelOf(r) }}</span>
        <span class="lt-dots">
          <i v-if="teamLevels[0] === r" class="lt-dot" :class="myTeam === 0 ? 'me' : 'opp'"></i>
          <i v-if="teamLevels[1] === r" class="lt-dot" :class="myTeam === 1 ? 'me' : 'opp'"></i>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 双方队伍等级 [team0, team1](rank 值,见 LEVEL_SEQUENCE)
  teamLevels: { type: Array, default: () => [15, 15] },
  // 本局级牌 rank
  levelRank: { type: Number, default: 15 },
  // 自己座位(0..3),用于判定我方队伍 = selfSeat % 2
  selfSeat: { type: Number, default: 0 },
})

// 升级顺序:2 → 3 → 4 → … → A(与 guandan-engine.LEVEL_SEQUENCE 一致)
const SEQ = [15, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
const LABELS = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' }

const myTeam = computed(() => props.selfSeat % 2)
const oppTeam = computed(() => 1 - myTeam.value)

function labelOf(r) { return LABELS[r] || '?' }
</script>

<style scoped>
.level-track {
  pointer-events: none;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 10px;
  padding: 3px 8px 4px;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}
.lt-nodes {
  display: flex;
  align-items: flex-end;
  gap: 1px;
}
.lt-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 15px;
  padding: 0 1px;
  border-radius: 4px;
}
.lt-node.current {
  background: rgba(255, 215, 0, 0.22);
  box-shadow: inset 0 -2px 0 var(--gold, #FFD700);
}
.lt-label {
  font-size: 8px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.2;
}
.lt-node.current .lt-label { color: var(--gold, #FFD700); }
.lt-dots {
  display: flex;
  gap: 2px;
  height: 6px;
  align-items: center;
}
.lt-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  display: inline-block;
}
.lt-dot.me  { background: #66bb6a; box-shadow: 0 0 4px rgba(102, 187, 106, 0.8); }
.lt-dot.opp { background: #ef5350; box-shadow: 0 0 4px rgba(239, 83, 80, 0.8); }
</style>
