# v2-ui-redesign Deliverable (2026-06-06)

参照用户提供的商业掼蛋 UI,重设计 GameView 牌面 + 桌面堆叠 + 顶部 HUD + 底部操作栏,新增 3 功能:`理牌` / `一键理` / 炸弹王炸特效。`npm test` 161/161 全过,`npm run build` 0 错误,Playwright 视觉验证通过。

详细 deliverable + 手动验证步骤 + 截图:
`/Users/yangyuanhao/.mavis/plans/plan_58f5d9a1/outputs/v2-ui-redesign/deliverable.md`

## 改动文件清单

### 新增
- `src/common/card-api.test.js` — sortHandGrouped + isLevelCard 19 个测试

### 修改
- `src/common/guandan-engine.js` — `sortHandGrouped(hand)` 同数字相邻 + `isLevelCard(c, levelRank)` 仅红色级牌
- `src/views/game/GameView.vue` — 整文件重设计牌面 / 堆叠 / HUD / 操作栏,新增理牌/一键理/花色 tab/记牌器/闹钟/炸弹特效/不出飘字
- `package.json` — test 链入 card-api.test.js

## 关键改进

1. **牌面设计**:左上小数字+小花色,中下方大花色,右下大数字+大花色;红色 2/3/4/.../K/A 红色,黑色黑色
2. **级牌标记**:红色 10(2)黄色背景 + 红色"级"字
3. **桌面堆叠**:多张错开 14px + 微旋转 3°
4. **顶部 HUD**:本局打 / 倍数 / 倒计时橙色闹钟(urgent 抖动)/ 记牌器 A/K/Q
5. **底部花色 tab**:♠♥♣♦ 4 个按钮快速选花色
6. **底部操作栏重构**:不出/提示/出牌 + 副:理牌/一键理/清空
7. **理牌**:按 sortHandGrouped 重排(同数字相邻,数字从大到小,同数字按花色)
8. **一键理**:AI 自动选 + 直接出
9. **炸弹/王炸特效**:屏幕中央大字 1.5s + 屏幕震动
10. **"不出"飘字**:过牌时在对应座位飘出 1.2s

## 验证

```
npm test  → 161/161
npm build → 0 错误
```

5 张关键截图在 `/Users/yangyuanhao/.mavis/plans/plan_58f5d9a1/outputs/v2-ui-redesign/screenshots/`:
- 01-game-board.png (新牌面布局)
- 02-hint-highlight.png (提示高亮 + 二级按提示出牌)
- 03-auto-play.png (一键理自动出)
- 04-clock-urgent.png (倒计时 0 秒 urgent 红闹钟)
- 05-game-full.png (理牌排序后完整游戏状态)
