<template>
  <main class="table-preview" aria-label="手机横屏掼蛋 UI 预览">
    <div class="portrait-tip" aria-hidden="true">
      <div class="portrait-icon">↻</div>
      <p>请旋转手机查看牌桌预览</p>
    </div>
    <div class="floor" aria-hidden="true"></div>
    <div class="table-rim" aria-hidden="true"></div>
    <div class="table-cloth" aria-hidden="true">
      <div class="cloth-logo">掼蛋</div>
    </div>

    <section class="top-left">
      <button class="menu-button" aria-label="菜单">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <div class="round-chip">
        <small>本局打</small>
        <strong>2</strong>
      </div>
      <div class="round-chip multiplier">
        <small>倍数</small>
        <strong>1</strong>
      </div>
    </section>

    <div class="system-strip">
      <span>01:28</span>
      <span>100%</span>
      <span>4G</span>
    </div>

    <section class="player top-player">
      <div class="avatar teammate">
        <span>😎</span>
        <b>队友</b>
      </div>
      <div class="player-text">
        <strong>用户1601...</strong>
        <small>LV6 · 猫头鹰蛋</small>
      </div>
    </section>

    <section class="player left-player">
      <div class="avatar opponent">
        <span>🎎</span>
        <b>对手</b>
      </div>
      <div class="player-text compact">
        <strong>起风了</strong>
        <small>LV15 · 象鸟蛋</small>
      </div>
    </section>

    <section class="player right-player">
      <div class="avatar opponent">
        <span>😎</span>
        <b>对手</b>
      </div>
      <div class="player-text compact">
        <strong>用户3738...</strong>
        <small>LV9 · 鸡蛋</small>
      </div>
    </section>

    <section class="center-actions">
      <div class="timer">30</div>
      <button class="game-button hint">提示</button>
      <button class="game-button play" disabled>出牌</button>
    </section>

    <section class="played-cards" aria-label="桌面已出牌">
      <article
        v-for="(card, index) in playedCards"
        :key="`played-${index}`"
        class="card table-card"
        :class="cardClass(card)"
      >
        <div class="corner">
          <strong>{{ card.rank }}</strong>
          <span>{{ card.suit }}</span>
        </div>
        <div class="center-suit">{{ card.suit }}</div>
      </article>
    </section>

    <section class="hand" aria-label="我的手牌">
      <div
        v-for="group in handGroups"
        :key="group.key"
        class="hand-stack"
        :style="stackStyle(group)"
      >
        <article
          v-for="(card, index) in group.cards"
          :key="`${group.key}-${index}`"
          class="card hand-card"
          :class="cardClass(card)"
          :style="cardStyle(group, index)"
        >
          <template v-if="card.joker">
            <div class="joker-mark">JOKER</div>
            <img class="joker-image" :src="bigJokerImg" alt="" />
          </template>
          <template v-else>
            <div class="corner">
              <strong>{{ card.rank }}</strong>
              <span>{{ card.suit }}</span>
            </div>
            <div v-if="isBottomCard(group, index)" class="center-suit">{{ card.suit }}</div>
          </template>
        </article>
      </div>
    </section>

    <footer class="bottom-bar">
      <div class="self-player">
        <div class="self-avatar">👶</div>
        <strong>本机玩家</strong>
        <button class="add-button" aria-label="添加">+</button>
      </div>
      <div class="suit-tabs" aria-label="花色筛选">
        <button>♣</button>
        <button>♦</button>
        <button class="active">♠</button>
        <button>♥</button>
      </div>
      <div class="bottom-actions">
        <button class="sort-button">理牌</button>
        <button class="auto-button">一键理</button>
        <button class="chat-button" aria-label="聊天">•••</button>
      </div>
    </footer>
  </main>
</template>

<script setup>
import bigJokerImg from '@/assets/cards/big-joker.png'

const playedCards = [
  { rank: '10', suit: '♦' },
  { rank: '10', suit: '♥' },
  { rank: '10', suit: '♠' },
]

const handGroups = [
  { key: 'joker', cards: [{ rank: 'JOKER', suit: '🃏', joker: true }] },
  { key: 'a', cards: [{ rank: 'A', suit: '♦' }, { rank: 'A', suit: '♦' }, { rank: 'A', suit: '♥' }, { rank: 'A', suit: '♠' }] },
  { key: 'k', cards: [{ rank: 'K', suit: '♦' }, { rank: 'K', suit: '♥' }, { rank: 'K', suit: '♥' }, { rank: 'K', suit: '♠' }] },
  { key: 'q', cards: [{ rank: 'Q', suit: '♠' }] },
  { key: 'j', cards: [{ rank: 'J', suit: '♣' }, { rank: 'J', suit: '♠' }] },
  { key: '10', cards: [{ rank: '10', suit: '♦' }, { rank: '10', suit: '♥' }, { rank: '10', suit: '♠' }] },
  { key: '9', cards: [{ rank: '9', suit: '♦' }, { rank: '9', suit: '♥' }] },
  { key: '8', cards: [{ rank: '8', suit: '♦' }, { rank: '8', suit: '♣' }, { rank: '8', suit: '♥' }] },
  { key: '6', cards: [{ rank: '6', suit: '♦' }, { rank: '6', suit: '♠' }] },
  { key: '3', cards: [{ rank: '3', suit: '♦' }, { rank: '3', suit: '♣' }, { rank: '3', suit: '♥' }, { rank: '3', suit: '♥' }] },
]

const RED_SUITS = new Set(['♥', '♦'])
const SUIT_NAME = { '♠': 'spade', '♥': 'heart', '♣': 'club', '♦': 'diamond' }
const STACK_RISE_PX = 26

function cardClass(card) {
  if (card.joker) return ['joker-card']
  return [`suit-${SUIT_NAME[card.suit]}`, RED_SUITS.has(card.suit) ? 'red-card' : 'black-card']
}

function isBottomCard(group, index) {
  return index === group.cards.length - 1
}

function stackStyle(group) {
  return { '--stack-extra-height': `${(group.cards.length - 1) * STACK_RISE_PX}px` }
}

function cardStyle(group, index) {
  return {
    '--card-index': index,
    '--card-bottom': `${(group.cards.length - 1 - index) * STACK_RISE_PX}px`,
  }
}
</script>

<style scoped>
.table-preview {
  --card-w: clamp(50px, 6.4vw, 72px);
  --card-h: calc(var(--card-w) * 1.42);
  --stack-rise: clamp(17px, 4.3vh, 19px);
  position: relative;
  width: 100%;
  max-width: 100vw;
  height: 100vh;
  min-width: 0;
  min-height: 360px;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(ellipse at 50% 24%, rgba(118, 141, 221, 0.48), transparent 43%),
    linear-gradient(180deg, #232947 0%, #181426 58%, #090910 100%);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  user-select: none;
}

/* 竖屏时只显示旋转提示,不渲染宽牌桌内容 */
.portrait-tip { display: none; }
@media (orientation: portrait) {
  .table-preview > *:not(.portrait-tip) { display: none !important; }
  .portrait-tip {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: absolute; inset: 0; z-index: 10;
    background: linear-gradient(180deg, #232947 0%, #181426 58%, #090910 100%);
    color: rgba(255,255,255,0.9); text-align: center; padding: 24px;
  }
  .portrait-icon { font-size: 48px; margin-bottom: 12px; animation: tip-pulse 1.6s ease-in-out infinite; }
  .portrait-tip p { font-size: 16px; line-height: 1.5; }
  @keyframes tip-pulse {
    0%, 100% { opacity: 0.7; transform: rotate(0deg); }
    50% { opacity: 1; transform: rotate(90deg); }
  }
}

button {
  font: inherit;
  border: 0;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.floor,
.table-rim,
.table-cloth {
  position: absolute;
  pointer-events: none;
}

.floor {
  inset: 0;
  background:
    repeating-linear-gradient(24deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 38px),
    linear-gradient(135deg, #3a261f 0%, #181019 52%, #0b0a12 100%);
}

.table-rim {
  left: 50%;
  top: -105%;
  width: 125vw;
  height: 190vh;
  transform: translateX(-50%);
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 50% 48%, transparent 0 67%, rgba(64, 37, 21, 0.94) 68%, #c69255 72%, #6e4024 76%, transparent 77%),
    conic-gradient(from 20deg, #774626, #c18b51, #6d3e21, #ad7441, #553019, #c7965b, #774626);
  box-shadow: 0 26px 52px rgba(0,0,0,0.58), inset 0 0 28px rgba(255,235,180,0.18);
}

.table-cloth {
  left: 50%;
  top: -92%;
  width: 118vw;
  height: 176vh;
  transform: translateX(-50%);
  border-radius: 50%;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 48% 36%, rgba(156, 177, 236, 0.55), transparent 28%),
    radial-gradient(ellipse at 52% 52%, #7488ca 0%, #526aad 45%, #34477a 77%, #202846 100%);
  box-shadow:
    inset 0 0 0 2px rgba(255,255,255,0.1),
    inset 0 -24px 80px rgba(0,0,0,0.35),
    inset 0 18px 50px rgba(255,255,255,0.12);
}

.table-cloth::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(64deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 7px),
    repeating-linear-gradient(-34deg, rgba(12,20,60,0.12) 0 1px, transparent 1px 8px);
  opacity: 0.72;
}

.table-cloth::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 0% 50%, rgba(10,13,32,0.6), transparent 28%),
    radial-gradient(ellipse at 100% 50%, rgba(10,13,32,0.6), transparent 28%),
    radial-gradient(ellipse at 50% 100%, rgba(3,5,12,0.45), transparent 28%);
}

.cloth-logo {
  position: absolute;
  left: 50%;
  top: 67%;
  z-index: 1;
  transform: translate(-50%, -50%);
  color: rgba(22,31,75,0.25);
  font-size: clamp(42px, 9vw, 100px);
  font-weight: 900;
  letter-spacing: 10px;
  text-shadow: 0 2px 0 rgba(255,255,255,0.1);
}

.top-left {
  position: absolute;
  left: 4.5vw;
  top: 1.5vh;
  z-index: 8;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.menu-button {
  width: 58px;
  height: 58px;
  display: grid;
  place-content: center;
  gap: 5px;
  border-radius: 50%;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.28), rgba(10,13,28,0.72)),
    radial-gradient(circle at 35% 25%, #6d758e, #24283c 70%);
  box-shadow: inset 0 1px 2px rgba(255,255,255,0.45), 0 5px 14px rgba(0,0,0,0.42);
}

.menu-button span {
  display: block;
  width: 28px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255,255,255,0.86);
  box-shadow: -11px 0 0 -1px rgba(255,255,255,0.86);
}

.round-chip {
  min-width: 84px;
  height: 58px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.55);
  border-radius: 4px;
  background: linear-gradient(180deg, #fff 0%, #e9edf8 100%);
  text-align: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.32);
}

.round-chip small {
  display: block;
  height: 26px;
  line-height: 26px;
  font-size: 15px;
  font-weight: 900;
  background: linear-gradient(180deg, #ff8624, #f25f13);
}

.round-chip strong {
  display: block;
  color: #bd3d16;
  font-size: 28px;
  line-height: 32px;
}

.multiplier {
  min-width: 118px;
  background: linear-gradient(180deg, #2b2d60, #172144);
}

.multiplier small {
  background: rgba(255,255,255,0.08);
}

.multiplier strong {
  color: #ffd88b;
}

.system-strip {
  position: absolute;
  left: 4.5vw;
  top: 77px;
  z-index: 8;
  display: flex;
  gap: 7px;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 3px;
  background: rgba(12,15,31,0.56);
  color: rgba(255,255,255,0.82);
  font-size: 16px;
}

.player {
  position: absolute;
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-player {
  left: 47.5vw;
  top: 0.8vh;
  transform: translateX(-50%);
}

.left-player,
.right-player {
  top: 23vh;
  flex-direction: column;
  align-items: flex-start;
}

.left-player {
  left: 4.7vw;
}

.right-player {
  right: 5vw;
}

.avatar {
  position: relative;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border: 2px solid #ffe08a;
  border-radius: 5px;
  background: linear-gradient(135deg, #f8c032, #ffec7b 45%, #ee7b1f);
  box-shadow: 0 5px 12px rgba(0,0,0,0.36);
  font-size: 32px;
}

.avatar.opponent {
  border-color: #ffb2a9;
}

.avatar b {
  position: absolute;
  left: -2px;
  right: -2px;
  bottom: -2px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 0 0 4px 4px;
  background: linear-gradient(180deg, #ee4636, #b61117);
  color: #fff;
  font-size: 14px;
  line-height: 20px;
}

.avatar.teammate b {
  background: linear-gradient(180deg, #3c87f8, #245ec2);
}

.player-text {
  display: grid;
  gap: 2px;
  min-width: 120px;
  text-shadow: 0 1px 3px rgba(0,0,0,0.75);
}

.player-text strong {
  font-size: 16px;
  font-weight: 800;
}

.player-text small {
  color: rgba(255,255,255,0.82);
  font-size: 12px;
  font-weight: 700;
}

.player-text.compact {
  min-width: 92px;
}

.center-actions {
  position: absolute;
  left: 50%;
  top: 23.5%;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 26px;
  transform: translate(-50%, -50%);
}

.timer {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #bf3b28;
  font-size: 26px;
  font-weight: 800;
  background:
    radial-gradient(circle, #fff 0 49%, #f4d57b 52%, #b77a22 68%, #fff2ac 76%, #b86e19 100%);
  box-shadow: 0 5px 13px rgba(0,0,0,0.3);
}

.game-button {
  min-width: 128px;
  height: 56px;
  border-radius: 6px;
  font-size: 29px;
  font-weight: 900;
  letter-spacing: 10px;
  text-indent: 10px;
  box-shadow:
    inset 0 2px 1px rgba(255,255,255,0.6),
    inset 0 -4px 0 rgba(0,0,0,0.16),
    0 6px 14px rgba(0,0,0,0.32);
}

.game-button.hint {
  color: #174087;
  background: linear-gradient(180deg, #9bf6ff 0%, #1dccf1 58%, #0a8dcc 100%);
}

.game-button.play {
  color: rgba(44,44,44,0.62);
  background: linear-gradient(180deg, #fff 0%, #cfcfd4 60%, #92939b 100%);
}

.played-cards {
  position: absolute;
  left: 52%;
  top: 39.5%;
  z-index: 7;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 8px 10px rgba(0,0,0,0.35));
}

.played-cards .card {
  --rank-font: clamp(18px, 2.35vw, 24px);
  --suit-font: clamp(12px, 1.55vw, 16px);
  --big-suit-font: clamp(24px, 3.1vw, 32px);
  width: clamp(34px, 4.05vw, 43px);
  height: clamp(48px, 5.75vw, 61px);
  margin-left: -9px;
}

.played-cards .card:first-child {
  margin-left: 0;
}

.hand {
  position: absolute;
  left: 50%;
  bottom: 60px;
  z-index: 9;
  width: min(72vw, 900px);
  height: calc(var(--card-h) + 86px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: clamp(3px, 0.75vw, 8px);
  transform: translateX(-50%);
}

.hand-stack {
  position: relative;
  width: var(--card-w);
  height: calc(var(--card-h) + var(--stack-extra-height));
  flex: 0 0 var(--card-w);
}

.card.hand-card {
  position: absolute;
  left: 0;
  bottom: var(--card-bottom);
  z-index: calc(var(--card-index) + 1);
}

.card {
  --rank-font: clamp(27px, 3.55vw, 38px);
  --suit-font: clamp(18px, 2.55vw, 26px);
  --big-suit-font: clamp(36px, 5vw, 54px);
  position: relative;
  width: var(--card-w);
  height: var(--card-h);
  flex: 0 0 var(--card-w);
  overflow: hidden;
  border: 1px solid #c3b28d;
  border-radius: 7px;
  background:
    radial-gradient(circle at 25% 13%, rgba(255,255,255,0.96), transparent 26%),
    linear-gradient(180deg, #fffefa 0%, #f9f2e4 68%, #eadcc3 100%);
  color: #111;
  font-family: Georgia, "Times New Roman", serif;
  box-shadow:
    inset 0 0 0 2px rgba(255,255,255,0.88),
    inset 0 0 0 3px rgba(181,145,72,0.18),
    inset 0 -7px 13px rgba(95,63,21,0.06),
    0 5px 11px rgba(0,0,0,0.42);
}

.card::before {
  content: '';
  position: absolute;
  inset: 3px;
  z-index: 1;
  border: 1px solid rgba(190,158,88,0.48);
  border-radius: 4px;
  pointer-events: none;
}

.card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background:
    linear-gradient(115deg, rgba(255,255,255,0.36) 0%, transparent 25%),
    radial-gradient(circle at 76% 86%, rgba(151,104,34,0.05), transparent 32%);
  pointer-events: none;
}

.red-card {
  color: #c70f16;
}

.black-card {
  color: #151515;
}

.joker-card {
  border-color: #d4b25a;
  background:
    radial-gradient(circle at 28% 15%, rgba(255,255,255,0.96), transparent 26%),
    linear-gradient(145deg, #fff7d9 0%, #f5d676 52%, #dc9e2c 100%);
  color: #b3141a;
}

.corner {
  position: absolute;
  left: 5px;
  top: 5px;
  z-index: 4;
  display: flex;
  align-items: flex-start;
  line-height: 0.82;
}

.corner strong {
  font-size: var(--rank-font);
  font-weight: 900;
  line-height: 0.82;
  letter-spacing: 0;
  text-shadow: 0 1px 0 rgba(255,255,255,0.82), 0 0 1px currentColor;
}

.corner span {
  margin-left: 2px;
  margin-top: 3px;
  font-size: var(--suit-font);
  line-height: 0.8;
  text-shadow: 0 1px 0 rgba(255,255,255,0.7);
}

.center-suit {
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 3;
  font-size: var(--big-suit-font);
  line-height: 1;
  opacity: 0.96;
  filter:
    drop-shadow(0 1px 0 rgba(255,255,255,0.55))
    drop-shadow(0 1px 1px rgba(0,0,0,0.1));
}

.suit-spade .center-suit,
.suit-club .center-suit {
  color: #050505;
}

.suit-heart .center-suit,
.suit-diamond .center-suit {
  color: #cf1119;
}

.joker-mark {
  position: absolute;
  left: 7px;
  top: 7px;
  z-index: 4;
  color: #a40f17;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(12px, 1.55vw, 18px);
  font-weight: 900;
  line-height: 0.86;
  letter-spacing: -1px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.joker-image {
  position: absolute;
  left: 50%;
  top: 48%;
  z-index: 3;
  width: 92%;
  height: 92%;
  object-fit: contain;
  transform: translate(-42%, -50%);
  filter: drop-shadow(0 2px 2px rgba(90,39,16,0.26));
}

.bottom-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 5vw;
  border-top: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(23,23,30,0.34), rgba(9,9,13,0.82));
}

.self-player {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 240px;
}

.self-avatar {
  width: 57px;
  height: 57px;
  display: grid;
  place-items: center;
  border: 2px solid rgba(255,255,255,0.8);
  border-radius: 5px;
  background: linear-gradient(180deg, #e8f5ff, #b2d7f1);
  box-shadow: 0 4px 11px rgba(0,0,0,0.44);
  font-size: 35px;
}

.self-player strong {
  color: rgba(255,255,255,0.92);
  font-size: 20px;
}

.add-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffe95e, #ff9f08);
  color: #fff;
  font-size: 30px;
  line-height: 30px;
  font-weight: 900;
  box-shadow: 0 3px 8px rgba(0,0,0,0.3);
}

.suit-tabs {
  position: absolute;
  left: 50%;
  bottom: 10px;
  height: 51px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 12px;
  border-radius: 0 0 38px 38px;
  background: linear-gradient(180deg, rgba(31,33,45,0.2), rgba(12,13,20,0.75));
  transform: translateX(-50%);
}

.suit-tabs button {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: transparent;
  color: rgba(255,255,255,0.55);
  font-size: 34px;
  line-height: 1;
}

.suit-tabs .active {
  color: #fff;
  background: radial-gradient(circle, rgba(255,255,255,0.12), rgba(6,8,15,0.65));
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.45);
}

.bottom-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 330px;
}

.sort-button,
.auto-button {
  height: 42px;
  padding: 0 18px;
  border-radius: 22px;
  font-size: 20px;
  font-weight: 900;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), 0 4px 10px rgba(0,0,0,0.3);
}

.sort-button {
  color: #5d6470;
  background: linear-gradient(180deg, #f9fbff, #aab2bd);
}

.auto-button {
  color: #fff;
  background: linear-gradient(180deg, #67b7ff, #2f7fea);
}

.chat-button {
  width: 50px;
  height: 42px;
  border-radius: 22px;
  background: linear-gradient(180deg, #e6f8ff, #9fd7ff);
  color: #3981c8;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 1px;
}

@media (max-width: 860px), (max-height: 400px) {
  .table-preview {
    --card-w: 46px;
    --stack-rise: 17px;
  }

  .top-left {
    gap: 8px;
  }

  .menu-button {
    width: 48px;
    height: 48px;
  }

  .round-chip {
    min-width: 72px;
    height: 50px;
  }

  .round-chip small {
    height: 22px;
    line-height: 22px;
    font-size: 13px;
  }

  .round-chip strong {
    font-size: 24px;
    line-height: 28px;
  }

  .multiplier {
    min-width: 96px;
  }

  .system-strip {
    top: 66px;
    font-size: 13px;
  }

  .avatar {
    width: 52px;
    height: 52px;
    font-size: 25px;
  }

  .avatar b {
    height: 18px;
    font-size: 12px;
  }

  .player-text strong {
    font-size: 13px;
  }

  .player-text small {
    font-size: 10px;
  }

  .center-actions {
    top: 23.5%;
    gap: 16px;
  }

  .game-button {
    min-width: 104px;
    height: 46px;
    font-size: 23px;
  }

  .timer {
    width: 48px;
    height: 48px;
    font-size: 22px;
  }

  .played-cards {
    top: 39.5%;
  }

  .hand {
    bottom: 56px;
  }

  .card {
    --rank-font: 27px;
    --suit-font: 18px;
    --big-suit-font: 36px;
  }

  .played-cards .card {
    --rank-font: 18px;
    --suit-font: 12px;
    --big-suit-font: 24px;
    width: 32px;
    height: 46px;
    margin-left: -8px;
  }

  .bottom-bar {
    height: 60px;
    padding: 0 3vw;
  }

  .self-player {
    min-width: 190px;
    gap: 8px;
  }

  .self-avatar {
    width: 48px;
    height: 48px;
    font-size: 29px;
  }

  .self-player strong {
    font-size: 17px;
  }

  .suit-tabs {
    gap: 18px;
  }

  .suit-tabs button {
    width: 36px;
    height: 36px;
    font-size: 28px;
  }

  .bottom-actions {
    min-width: 260px;
  }

  .sort-button,
  .auto-button {
    height: 36px;
    padding: 0 13px;
    font-size: 16px;
  }
}
</style>
