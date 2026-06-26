# UI 重做 v3 规格 (UI-REDESIGN-V3)

> 来源:第三方代码审查报告 + 用户提供的 4 张美化效果图
> 状态:**SPEC 阶段**(尚未开工,等下一个 session 实施)
> 前置:Phase 1 P0 致命 bug 修完 (commit `ea634a6`)
> 前置:Phase 3 P1 快修 (commit `fb6bad0`)
> 前置:Phase 4 P2/P3 清理 (commit `7e808ff`)

---

## 0. 设计原则(全局)

| 维度 | 决策 |
|---|---|
| 主题色 | 翡翠绿(深)+ 金(强调)+ 暖白(牌面)+ 暗蓝(房间) |
| 字体 | 中文用系统字体栈,标题加粗 + 字号放大(20→28px) |
| 视觉风格 | 高端棋牌游戏质感(参考欢乐斗地主、JJ 比赛、腾讯掼蛋) |
| 关键效果 | 玻璃拟态按钮 / 3D 透视卡牌 / 渐变金属边 / 径向聚光 / 脉冲动画 |
| 响应式 | 桌面端(GameViewDesktop) / 移动端(GameViewMobile) 各一套 |

**绝对禁止**:
- ❌ 引用任何 CDN/外网字体(破坏离线原则)
- ❌ 引入新依赖包
- ❌ 改动 `src/common/*` 任何文件(本次纯 UX,不改游戏逻辑)
- ❌ 删测试 (`tests/`)
- ❌ 改 token 变量名(只加,不删不改)

---

## 1. 设计 Token 扩展

**文件**:`src/styles/tokens.css`(127 行,只追加不删除)

### 1.1 新增色板

```css
/* ----- v3.x 重做新增 ----- */
/* 翡翠绿主调(深) */
--emerald-deep: #0a3d2c;        /* 最深 */
--emerald-base: #14533b;        /* 主背景 */
--emerald-bright: #1f7a55;      /* 卡片底/高光 */
--emerald-soft: rgba(31, 122, 85, 0.6);

/* 金色装饰 */
--gold-primary: #d4af37;         /* 主金 */
--gold-bright: #ffd700;          /* 高光金 */
--gold-dark: #a8862a;            /* 暗金 */
--gold-soft: rgba(212, 175, 55, 0.3);
--gold-metallic: linear-gradient(135deg, #ffd700 0%, #d4af37 50%, #a8862a 100%);

/* 牌面奶油白 */
--card-cream: #faf6e9;           /* 牌面底色 */
--card-cream-shadow: #e6dcc0;
--card-border-gold: #c9a847;     /* 牌面金边 */

/* 大小王特殊色 */
--small-joker-bg: linear-gradient(135deg, #c0c0c0, #e8e8e8);
--big-joker-bg: linear-gradient(135deg, #ffd700, #d4af37);

/* 房间深蓝星空 */
--room-bg-deep: #0a1d3a;
--room-bg-mid: #1a3a6e;
--room-star: rgba(255, 255, 255, 0.6);
```

### 1.2 字体层级(强制约束)

```css
/* v3.x 字体层级 — 4 屏统一引用 */
--font-display: bold 32px/1.2 system-ui, -apple-system, "PingFang SC", sans-serif;
--font-title: bold 24px/1.3 system-ui, -apple-system, "PingFang SC", sans-serif;
--font-subtitle: 18px/1.4 system-ui, -apple-system, "PingFang SC", sans-serif;
--font-body: 16px/1.5 system-ui, -apple-system, "PingFang SC", sans-serif;
--font-button: bold 20px/1.2 system-ui, -apple-system, "PingFang SC", sans-serif;
```

### 1.3 通用效果类

```css
/* 玻璃拟态 */
--glass-bg: rgba(255, 255, 255, 0.08);
--glass-border: rgba(255, 255, 255, 0.18);
--glass-blur: blur(12px);
--glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);

/* 椭圆 felt 牌桌 */
--felt-base: radial-gradient(ellipse at center, #1f7a55 0%, #14533b 60%, #0a3d2c 100%);
--felt-inner-shadow: inset 0 0 80px rgba(0, 0, 0, 0.4);

/* 玩家头像光环 */
--avatar-halo-gold: 0 0 16px 4px rgba(255, 215, 0, 0.6);
--avatar-halo-active: 0 0 24px 6px rgba(255, 215, 0, 0.8);

/* 脉冲动画 */
@keyframes pulse-glow {
  0%, 100% { box-shadow: var(--avatar-halo-gold); }
  50% { box-shadow: var(--avatar-halo-active); }
}
```

---

## 2. 屏 1 — 首页重做(翡翠绿+金+玻璃)

**文件**:`src/views/index/HomeView.vue`(381 行 → 估计 ~450 行)

**参考图**:`/Users/yangyuanhao/.mavis/uploads/1782487647743-image.png`

### 2.1 整体布局

```
[背景] 深翡翠绿径向渐变 + 中央菱形金色装饰纹样(浅 opacity ~12%)
[顶部] Logo(扑克牌叠 + 毛笔字"掼蛋")— 已有,可保留
[中部] 4 个玻璃拟态按钮,垂直堆叠,间距 16px
  - 开始游戏(▶ 黄色玻璃)
  - 加入房间(📱 青色玻璃)
  - AI 对战(🤖 紫色玻璃)
  - 游戏规则(📖 绿色玻璃)
[底部] 左下齿轮设置 + 右下头像 + 昵称
```

### 2.2 按钮规格

每个按钮:
- 高度 64px(原 ~52px,放大)
- 圆角 32px(胶囊)
- 背景:玻璃拟态(`--glass-bg` + `backdrop-filter: var(--glass-blur)`)
- 边框:1.5px 金色 (`--gold-primary`),半透明
- 文字:金色,`--font-button` (20px bold)
- 图标:圆形 36px 金边 + 内嵌 emoji/字符
- hover:边框亮度 +30%,阴影增强,过渡 200ms ease-out
- active:按下缩小 0.98 + 阴影减弱

### 2.3 Logo 区域

原 `HomeView.vue` 已有 `<div class="logo">` + emoji 牌 + "掼蛋" 字样,保留但:
- 牌叠效果加强(3 张牌错位 8px,旋转 ±5°)
- 牌面用金色边框
- "掼蛋" 文字加金色金属渐变(`--gold-metallic`)

### 2.4 装饰纹样

CSS 伪元素或 SVG:
- 中央菱形花纹(用 inline SVG `<pattern>` 或 `mask`)
- 透明度 8-12%,不抢戏
- 仅在背景层,不影响点击

### 2.5 现有硬编码色替换

grep 检查所有 `#fff / #000 / rgba(...)` 硬编码 → 替换为 token 变量

---

## 3. 屏 2 — 游戏桌面(椭圆 felt + 卡牌透视 + 头像光环)

**文件**:
- `src/views/game/GameViewDesktop.vue`(900 行 → 估计 ~1050)
- `src/views/game/GameViewMobile.vue`(1251 行 → 估计 ~1400)

**参考图**:`/Users/yangyuanhao/.mavis/uploads/1782487647744-image.png`

### 3.1 桌面背景

- 椭圆牌桌区域:`--felt-base` 渐变 + `inset box-shadow` 内阴影
- 桌面边缘:木纹棕色渐变(`--wood-edge` → `--wood-edge-light`),8-12px 厚边框
- 桌面外圈:深绿径向渐变到 `--bg-deep`

### 3.2 卡牌设计(屏 4 通用规格 — 见 §5)

桌面中央出牌区:3D 透视倾斜(`transform: rotate(-3deg) perspective(800px)`)
- 主牌(中间):scale(1.05),在顶部
- 副牌(两侧):scale(0.95),略向下沉
- hover 时浮起 + 阴影增强

### 3.3 玩家头像

每个 `PlayerSeat`:
- 头像圆形 64px(桌面端)/ 48px(移动端)
- 金色 2px 边框
- **当前回合**:金色光环脉冲动画(`pulse-glow` keyframe,1.5s 周期)
- **已准备**:右上角绿色 ✓ 角标(玻璃拟态圆)
- **已出完牌**:头像 grayscale + opacity 0.6

### 3.4 HUD 顶部

`src/components/HudTop.vue`:
- 级别徽章:金色金属渐变背景 + 黑色"打 X" 文字
- 计时器:暖橙渐变 + 数字白
- 房间号:`A3K7` 字号 20px,等宽字体

### 3.5 出牌区光效

- 中央牌组上:径向白光聚光(`radial-gradient(ellipse at center, rgba(255,255,255,0.15), transparent 70%)`)
- 桌面上方:`backdrop-filter: blur(2px)` 微模糊

### 3.6 移动端适配

移动端 4 座位改为上(对手)+ 左右(队友)+ 下(自己):
- 字号 / 头像 / 按钮尺寸按 token 缩放
- 触摸目标 ≥ 48px(iOS HIG) — 现在 `MainActions` 按钮 48px,加到 52px
- 横屏布局沿用 RoomView 的 landscape media query

---

## 4. 屏 3 — 房间大厅(深蓝星空 + 玻璃卡片 + 钻石座位)

**文件**:`src/views/room/RoomView.vue`(739 行 → 估计 ~880)

**参考图**:`/Users/yangyuanhao/.mavis/uploads/1782487647745-image.png`

### 4.1 整体布局

```
[背景] 深蓝星空:--room-bg-deep → --room-bg-mid 径向渐变
       + 散落白色小点(star,8-20 个不同 size / opacity)
[顶部] 房间信息卡片(玻璃拟态):房间号 + 主机 IP(等宽字体)+ 复制按钮
[中部] 4 个玩家座位,菱形布局(1 上 / 左右 / 1 下)
       每个座位:圆形头像 + 编号 + "准备就绪"/"等待加入" 状态条
[底部] "开始游戏" + "邀请好友" 两个金色按钮
[右上角] 二维码(QR)
```

### 4.2 房间信息卡片

- 玻璃面板:`--glass-bg` + `--glass-blur` + `--glass-border`
- 房间号:金色 `font-display` (32px bold)
- 副信息(主机 IP):等宽字体 + 半透明
- 右上角 📋 复制按钮:玻璃小圆按钮

### 4.3 4 座位菱形布局

CSS Grid `grid-template-areas`:
```
" .    seat1    . "
" seat2  .   seat3 "
" .    seat4    . "
```
- 房主座位(seat 1,顶部):金色皇冠徽章 + 金色光环
- 等待加入座位(虚位):dashed 金色边框 + 脉冲动画
- 已就绪座位:头像 + 绿色 ✓ 角标 + "准备就绪" 文字
- 当前自己座位:亮蓝色光环(跟 token `--color-self-glow` 一致)

### 4.4 按钮

- "开始游戏"(主):金色金属渐变背景,白字,圆角胶囊,高度 56px
- "邀请好友"(副):玻璃面板,金边,白字

### 4.5 二维码

- 玻璃卡片右上角嵌入 `<QrFallbackCard />`
- 保留现有 fallback 逻辑(已有 QrFallbackCard.vue)

---

## 5. 屏 4 — 扑克牌设计(奶油白 + 金边 + 传统纹样)

**文件**:`src/components/CardPlay.vue`(330 行 → 估计 ~430)

**参考图**:`/Users/yangyuanhao/.mavis/uploads/1782487647746-image.png`

### 5.1 牌面规格

- 尺寸:60×84(桌面端)/ 48×68(移动端) — 已基本符合
- 底色:`--card-cream` (奶油白)
- 边框:1.5px solid `--card-border-gold`
- 圆角:8px
- 阴影:`0 4px 12px rgba(0,0,0,0.18)`
- 牌面花纹:浅 opacity 金色中国传统卷草纹(SVG `<pattern>`)
  - 实现:内联 SVG `<defs><pattern id="card-pattern">...</pattern></defs>`,`background-image: url("data:image/svg+xml,...")`
  - 透明度 6-10%

### 5.2 数字 / 花色

- 大字(左上 + 右下):衬线字体或粗 sans-serif,字号 ~22px
- 红色数字:黑红双套,红桃/方块用 `--red-card`,梅花/黑桃用 `--black-card`
- 右上小数字:14px,半透明(40%)
- 中央花纹牌(如 A / J / Q / K):中央放置小型装饰花纹(可选 v3.1)

### 5.3 牌背

- 底色:深红 `#8B1A1A` → `#5C0E0E` 渐变
- 花纹:金色中国传统纹样(SVG 卷草纹 + 龙鳞? 简化)
- 中央徽章:圆形金色边框 + "掼" 字或品牌 logo

### 5.4 大小王特别设计

- **小王**:银灰色金属渐变 `--small-joker-bg` + "小王" 金色字 + 王冠装饰
- **大王**:金色金属渐变 `--big-joker-bg` + "大王" 黑字 + 双龙/双凤装饰(简化:金边王冠 + 星辰)

### 5.5 选中状态(桌面端)

- 选中:translateY(-12px) + 阴影增强 + 顶部金色亮线
- 可打出:边框闪金光(1.5s 周期)
- 不可打出:opacity 0.6 + 灰色

---

## 6. 文件影响清单

| 文件 | 预计改动 | 说明 |
|---|---|---|
| `src/styles/tokens.css` | +80 行 | 新增 v3.x token 段(§1) |
| `src/views/index/HomeView.vue` | 重构 ~70% | 玻璃按钮 / logo 加强 / 装饰纹 |
| `src/views/room/RoomView.vue` | 重构 ~60% | 星空背景 / 菱形座位 / 玻璃卡片 |
| `src/views/game/GameViewDesktop.vue` | 调整 ~40% | 椭圆 felt / 头像光环 / 卡牌透视 |
| `src/views/game/GameViewMobile.vue` | 调整 ~40% | 同上,移动端缩放版 |
| `src/components/CardPlay.vue` | 重构 ~50% | 奶油白底 / 金边 / 传统纹 / 大小王 |
| `src/components/PlayerSeat.vue` | 调整 ~30% | 头像光环 / 准备角标 / grayscale |
| `src/components/MainActions.vue` | 微调 | 按钮高度 48→52px,字号统一 |
| `src/components/HudTop.vue` | 微调 | 级别徽章金属渐变 / 字号 |
| `src/views/game/useGameLogic.js` | 不改 | 业务逻辑不动 |
| `src/common/*` | 不改 | 引擎不动 |
| `src/views/room/RoomView.test.js` | 可能要更新断言 | 模板结构变了 |
| `src/views/game/GameView.test.js` | 不动 | 测的是 rotation,不动 |

**估算**:4506 → 约 5500 行(+22%),核心是 CSS 和 template

---

## 7. 实施顺序(建议)

按依赖关系:
1. **Day 1**(建议先做,小但立竿见影):
   - `tokens.css` 加新 token
   - `CardPlay.vue` 重做(屏 4)— 所有屏都用
   
2. **Day 2**:
   - `HomeView.vue` 重做(屏 1)
   - `PlayerSeat.vue` 头像光环 + 角标
   
3. **Day 3**:
   - `RoomView.vue` 重做(屏 3)
   - 测试 RoomView.test.js 看是否要更新

4. **Day 4**:
   - `GameViewDesktop.vue` + `GameViewMobile.vue` 重做(屏 2)
   - `MainActions.vue` / `HudTop.vue` 调整

5. **Day 5**:
   - 全套 npm test + npm run build
   - 视觉回归对比 4 张参考图
   - 写 CHANGELOG.md + commit + push

---

## 8. 测试影响

| 测试 | 影响 | 处理 |
|---|---|---|
| `npm run test:engine` | 0 | 引擎不动 |
| `npm run test:ai` | 0 | AI 不动 |
| `npm run test:game` | 0 | 状态机不动 |
| `npm run test:anim` | 可能要更新 | 发牌动画视觉可能变 |
| `npm run test:ws` | 0 | 网络不动 |
| `npm run test:rotation` | 0 | rotation 不动 |
| `npm run test:room` | **可能要更新** | 模板结构变化,字符串断言可能失效 |
| `npm run test:kick` | 0 | 踢人不变 |

**关键**:`npm run test:room` 的字符串断言(找 template 里的 class / 文字)可能因为模板重构而失效。修复策略:
- 保留所有 `data-testid="..."` 属性
- 测试断言用 `data-testid` 而不是 class 名字

---

## 9. 跟现有设计规范的对齐

`docs/UI.md` 有完整 UI 目录结构 + 设计 token 说明。重做前:
1. 通读 `docs/UI.md`(443 行)
2. 通读 `docs/STYLE.md`(若有)
3. 现有 `tokens.css` 不删除任何变量,只追加

---

## 10. 风险与注意事项

- **不要破坏移动端适配**:GameViewMobile 1251 行,已有 portrait + landscape 双布局。改完后实测 360px / 414px / 768px / 1024px 4 个尺寸。
- **不要破坏 4-tab P2P 联机**:GameView 的 emit / on 事件全保留,只动视觉。
- **不要破坏 Capacitor APK 构建**:capacitor.config.json 不动,`android/` 工程不动。
- **SVG 内联 vs 文件**:花纹建议内联 SVG(`data:image/svg+xml,...`)避免增加资源文件。
- **避免引入新依赖**:用纯 CSS + 内联 SVG 实现所有效果。

---

## 11. 完成标准(DoD)

- [ ] 所有 16 个 npm test 套件 0 fail
- [ ] npm run build 成功
- [ ] 4 张参考图的关键元素都对得上:
  - 首页:翡翠绿背景 + 金色按钮 + 玻璃效果
  - 桌面:椭圆 felt + 卡牌透视 + 金色光环
  - 房间:深蓝星空 + 菱形座位 + 玻璃卡片
  - 牌面:奶油白 + 金边 + 传统纹 + 大小王金银
- [ ] CHANGELOG.md 记录这次重做
- [ ] 移动端 4 个尺寸都过(360 / 414 / 768 / 1024)
- [ ] Capacitor APK 仍能成功构建
- [ ] 不引入新 npm 依赖
- [ ] 不删任何已有 token / 测试

---

## 12. 审计报告里提到的 UI 问题(本文档 §6 的对照)

| 报告问题 | 本 spec 哪里覆盖 |
|---|---|
| 大量硬编码色值 | §1 新增 token,§6 强制替换 |
| 按钮字号不统一 | §1.2 字体层级,§2.2 / §4.4 按钮规格 |
| 6 个组件无 disabled 状态 | 加 `&:disabled` 样式(玻璃按钮 +50% 透明) |
| GameViewMobile 触摸区域小 | §3.6 提到 48→52px |
| RoomView 739 行单文件 | 不强行拆分(避免引入新文件),但在 §7 留位置后续重构 |
| 4 个导航按钮 emoji 缺品牌感 | §2 玻璃按钮 + 金边 |
| HistoryChart 无 tooltip / 渐变 | 不在本次范围(UI 美化图没覆盖) |
| NicknameEditor emoji 选择器 28px 偏小 | 不在本次范围(UI 美化图没覆盖) |
| JoinView 无进度指示器 | 不在本次范围(UI 美化图没覆盖) |
| EffectLayer 粒子效果简单 | 不在本次范围(UI 美化图没覆盖) |
| TableCenter 脉冲动画偏机械 | §3.5 提到用弹性 cubic-bezier |

---

## 13. 后续 session 启动指令

新开 OpenCode session,粘贴这段:

```
我需要你按 /Users/yangyuanhao/Downloads/guandan-p2p-vue3/docs/UI-REDESIGN-V3-SPEC.md 
的规格,完成掼蛋 P2P v3.x UI 重做。

约束:
- 不引入新 npm 依赖
- 不改 src/common/* 任何文件
- 不改 src/views/game/useGameLogic.js
- 现有 16 个测试套件全 0 fail 是硬约束
- 数据驱动的(data-testid 等测试 hook 不能删)
- 按 §7 实施顺序,从 token.css 开始

参考图(已上传):
1. 首页: /Users/yangyuanhao/.mavis/uploads/1782487647743-image.png
2. 桌面: /Users/yangyuanhao/.mavis/uploads/1782487647744-image.png
3. 房间: /Users/yangyuanhao/.mavis/uploads/1782487647745-image.png
4. 牌面: /Users/yangyuanhao/.mavis/uploads/1782487647746-image.png

完成后 npm test + npm run build 都通过,再 commit。
```