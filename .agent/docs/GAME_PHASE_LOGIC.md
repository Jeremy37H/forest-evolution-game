# 遊戲階段流程與邏輯文件

> **版本**: v1.6.9  
> **最後更新**: 2026-01-31  
> **目的**: 記錄遊戲階段轉換的核心邏輯，避免未來開發者重複踩坑

---

## 📋 目錄

1. [遊戲階段概覽](#遊戲階段概覽)
2. [階段轉換流程圖](#階段轉換流程圖)
3. [關鍵函數說明](#關鍵函數說明)
4. [玩家狀態管理](#玩家狀態管理)
5. [常見陷阱與解決方案](#常見陷阱與解決方案)
6. [自動駕駛系統](#自動駕駛系統)
7. [競標系統特殊邏輯](#競標系統特殊邏輯)

---

## 🎮 遊戲階段概覽

### 階段列表

| 階段名稱 | gamePhase 值 | 說明 | 持續時間 |
|---------|-------------|------|---------|
| 等待開始 | `waiting` | 玩家加入階段 | 無限制 |
| 討論階段 | `discussion_round_N` | 玩家討論與準備 | 動態計算 |
| 攻擊階段 | `attack_round_N` | 玩家進行攻擊 | 動態計算 |
| 競標過渡 | `auction_transition` | 3秒過渡動畫 | 3秒 |
| 競標階段 | `auction_round_N` | 技能競標 | 每技能獨立計時 |
| 遊戲結束 | `finished` | 顯示最終排名 | 無限制 |

### 完整流程

```
waiting 
  ↓ (管理員點擊「開始遊戲」)
discussion_round_1
  ↓ (時間到或全員Ready)
attack_round_1
  ↓ (時間到或全員攻擊完畢)
auction_transition (3秒)
  ↓
auction_round_1 (多個技能依序競標)
  ↓ (所有技能競標完畢)
discussion_round_2
  ↓
... (重複 R2, R3)
  ↓
discussion_round_4 (決賽圈)
  ↓
attack_round_4
  ↓
finished
```

---

## 🔄 階段轉換流程圖

### 主要轉換函數: `transitionToNextPhase(gameCode, io)`

```javascript
// 位置: server/services/gameService.js

async function transitionToNextPhase(gameCode, io) {
    // 1. 讀取當前遊戲狀態
    let game = await Game.findOne({ gameCode }).populate('players');
    const currentPhase = game.gamePhase;

    // 2. 根據當前階段決定下一階段
    if (currentPhase.startsWith('discussion')) {
        game.gamePhase = `attack_round_${game.currentRound}`;
    } 
    else if (currentPhase.startsWith('attack')) {
        if (game.currentRound <= 3) {
            game.gamePhase = 'auction_transition';
        } else {
            game.gamePhase = 'finished';
        }
    } 
    else if (currentPhase === 'auction_transition') {
        game.gamePhase = `auction_round_${game.currentRound}`;
        // 初始化競標佇列
        game.auctionState.queue = Array.from(game.skillsForAuction.keys());
        await game.save();
        await startAuctionForSkill(gameCode, io);
        return; // 提前返回，不執行後續邏輯
    } 
    else if (currentPhase.startsWith('auction')) {
        await finalizeAuctionPhase(gameCode, io);
        return; // 提前返回
    }

    // 3. 計算新階段的結束時間
    const aliveCount = game.players.filter(p => p.status?.isAlive).length;
    const duration = calculatePhaseDuration(aliveCount, game.gamePhase);
    game.auctionState.endTime = new Date(Date.now() + duration * 1000);

    // 4. 重置玩家狀態 (關鍵邏輯！)
    // ⚠️ 注意：競標階段不需要重置，否則會誤觸快進
    if (game.gamePhase !== currentPhase && 
        !game.gamePhase.startsWith('auction') && 
        game.gamePhase !== 'auction_transition') {
        await Player.updateMany(
            { gameId: game._id },
            { $set: { "roundStats.isReady": false, "roundStats.hasAttacked": false } }
        );
    }

    // 5. 存檔並廣播
    await game.save();
    await broadcastGameState(gameCode, io, true);
}
```

---

## 🎯 關鍵函數說明

### 1. `broadcastGameState(gameCode, io, force)`

**功能**: 廣播遊戲狀態給所有玩家，並執行自動駕駛邏輯

**關鍵邏輯**:

```javascript
// 節流控制：100ms 內只廣播一次（除非 force=true）
if (!force && lastBroadcastTime[gameCode] && now - lastBroadcastTime[gameCode] < 100) {
    return;
}

// 自動駕駛系統
if (fullGame.isAutoPilot && fullGame.gamePhase !== 'waiting' && fullGame.gamePhase !== 'finished') {
    const phaseEndTime = fullGame.auctionState.endTime;
    
    // 非競標階段：檢查超時
    if (!fullGame.gamePhase.startsWith('auction') && now >= phaseEndTime) {
        await transitionToNextPhase(gameCode, io);
    }
    
    // 非競標階段：檢查快進條件
    else if (!fullGame.gamePhase.startsWith('auction')) {
        if (fullGame.gamePhase.startsWith('discussion')) {
            await checkReadyFastForward(fullGame, io);
        } 
        else if (fullGame.gamePhase.startsWith('attack')) {
            await checkAttackFastForward(fullGame, io);
        }
    }
}
```

**注意事項**:

- ⚠️ 競標階段有自己的計時器邏輯，不在此處理
- ⚠️ 必須排除 `auction` 相關階段，避免重複觸發

---

### 2. `checkReadyFastForward(game, io)`

**功能**: 檢查討論階段是否所有存活玩家都已 Ready，若是則提前進入攻擊階段

**關鍵邏輯**:

```javascript
async function checkReadyFastForward(game, io) {
    if (!game.isAutoPilot || !game.gamePhase.startsWith('discussion')) return;

    // 只計算存活玩家
    const alivePlayers = game.players.filter(p => p.status?.isAlive);
    const readyPlayers = alivePlayers.filter(p => p.roundStats?.isReady);

    // 全員 Ready
    if (readyPlayers.length === alivePlayers.length && alivePlayers.length > 0) {
        const now = Date.now();
        const currentEnd = new Date(game.auctionState.endTime).getTime();
        
        // ⚠️ 關鍵修正：避免重複觸發 3 秒倒數
        if (currentEnd > 0 && (currentEnd - now) < 5000) return;

        console.log(`[AutoPilot] Everyone alive is Ready! Fast-forwarding...`);
        game.auctionState.endTime = new Date(Date.now() + 3000); // 3秒後跳轉
        game.gameLog.push({ text: "存活玩家全員準備就緒！即將提前進入攻擊階段...", type: "system" });
        await game.save();
        await broadcastGameState(game.gameCode, io);
    }
}
```

**陷阱警告**:

- ❌ 如果沒有檢查「剩餘時間 < 5秒」，會導致計時器無限重設，永遠停在 3 秒
- ❌ 必須排除死亡玩家，否則死人會阻塞遊戲進度

---

### 3. `checkAttackFastForward(game, io)`

**功能**: 檢查攻擊階段是否所有存活且非冬眠玩家都已行動

**關鍵邏輯**:

```javascript
async function checkAttackFastForward(game, io) {
    if (!game.isAutoPilot || !game.gamePhase.startsWith('attack')) return;

    // 排除死亡和冬眠玩家
    const relevantPlayers = game.players.filter(p => 
        p.status?.isAlive && !p.roundStats?.isHibernating
    );
    const donePlayers = relevantPlayers.filter(p => 
        p.roundStats?.hasAttacked || p.roundStats?.isReady
    );

    if (donePlayers.length === relevantPlayers.length && relevantPlayers.length > 0) {
        const now = Date.now();
        const currentEnd = new Date(game.auctionState.endTime).getTime();

        // ⚠️ 避免重複觸發
        if (currentEnd > 0 && (currentEnd - now) < 5000) return;

        game.auctionState.endTime = new Date(Date.now() + 3000);
        game.gameLog.push({ text: "所有存活玩家行動完畢，即將提前進入結算階段...", type: "system" });
        await game.save();
        await broadcastGameState(game.gameCode, io);
    }
}
```

---

## 👥 玩家狀態管理

### 關鍵狀態欄位

| 欄位 | 類型 | 用途 | 重置時機 |
|-----|------|------|---------|
| `roundStats.isReady` | Boolean | 討論階段準備狀態 | 進入攻擊階段時 |
| `roundStats.hasAttacked` | Boolean | 攻擊階段行動狀態 | 進入討論階段時 |
| `roundStats.isHibernating` | Boolean | 冬眠狀態 | 回合結束時 |
| `status.isAlive` | Boolean | 存活狀態 | 死亡時設為 false |

### 狀態重置邏輯

```javascript
// ⚠️ 關鍵規則：只在「非競標階段」的轉換時重置

if (game.gamePhase !== currentPhase && 
    !game.gamePhase.startsWith('auction') && 
    game.gamePhase !== 'auction_transition') {
    
    await Player.updateMany(
        { gameId: game._id },
        { $set: { 
            "roundStats.isReady": false, 
            "roundStats.hasAttacked": false 
        }}
    );
}
```

**為什麼競標階段不重置？**

1. 競標階段不使用 `isReady` 和 `hasAttacked`
2. 如果重置，會導致系統誤判「所有人都沒準備」
3. 競標階段有自己的狀態管理（`auctionState`）

---

## ⚠️ 常見陷阱與解決方案

### 陷阱 1: 階段連續跳過

**症狀**: 遊戲從討論階段直接跳到競標階段，跳過攻擊階段

**原因**: 在判斷階段轉換**之前**就重置了玩家狀態

**錯誤寫法**:

```javascript
// ❌ 錯誤：先重置再判斷
await Player.updateMany({ ... }, { $set: { isReady: false } });
if (allReady) {
    transitionToNextPhase(); // 永遠不會觸發，因為已經重置了
}
```

**正確寫法**:

```javascript
// ✅ 正確：先判斷再重置
if (allReady) {
    transitionToNextPhase();
}
// 在 transitionToNextPhase 的最後才重置狀態
```

---

### 陷阱 2: 計時器無限重設

**症狀**: 全員 Ready 後，倒數一直停在 3 秒不動

**原因**: 每次廣播都重新設定 3 秒倒數，導致永遠倒不完

**解決方案**:

```javascript
// ✅ 檢查剩餘時間，避免重複重設
const remainingTime = currentEnd - now;
if (remainingTime < 5000) return; // 已經在倒數中，不要再重設

game.auctionState.endTime = new Date(Date.now() + 3000);
```

---

### 陷阱 3: 死亡玩家阻塞遊戲

**症狀**: 有玩家死亡後，遊戲卡住無法進入下一階段

**原因**: 快進邏輯計算「全員」時包含了死亡玩家

**解決方案**:

```javascript
// ✅ 只計算存活玩家
const alivePlayers = game.players.filter(p => p.status?.isAlive);
const readyPlayers = alivePlayers.filter(p => p.roundStats?.isReady);

if (readyPlayers.length === alivePlayers.length) {
    // 快進
}
```

---

### 陷阱 4: 競標階段被直接跳過

**症狀**: 攻擊階段結束後，競標階段一閃而過

**原因**: 進入競標時重置了玩家狀態，觸發了快進邏輯

**解決方案**:

```javascript
// ✅ 競標階段不重置玩家狀態
if (game.gamePhase !== currentPhase && 
    !game.gamePhase.startsWith('auction') && 
    game.gamePhase !== 'auction_transition') {
    // 只在非競標階段才重置
    await Player.updateMany(...);
}
```

---

## 🤖 自動駕駛系統

### 啟用條件

```javascript
game.isAutoPilot === true
```

### 運作原理

1. **每秒廣播時檢查**（透過 `broadcastGameState`）
2. **檢查項目**:
   - 階段是否超時？
   - 是否觸發快進條件？
3. **執行動作**:
   - 超時 → 呼叫 `transitionToNextPhase`
   - 快進 → 設定 3 秒倒數

### 管理員強制跳過

```javascript
// API: POST /api/game/admin/force-skip
game.auctionState.endTime = new Date(Date.now());
await transitionToNextPhase(gameCode, io);
```

---

## 🎰 競標系統特殊邏輯

### 競標階段結構

```
auction_round_N
  ├─ 技能 A (starting → active → finished)
  ├─ 技能 B (starting → active → finished)
  └─ 技能 C (starting → active → finished)
```

### 競標狀態機

| 狀態 | 說明 | 持續時間 |
|-----|------|---------|
| `none` | 尚未開始 | - |
| `starting` | 5秒倒數展示 | 5秒 |
| `active` | 正式競標 | 3分鐘 |
| `finished` | 單一技能結算完成 | - |
| `settled` | 整個競標階段結束 | - |

### 關鍵函數

#### `startAuctionForSkill(gameCode, io)`

- 從 `auctionState.queue` 取出下一個技能
- 設定狀態為 `starting`
- 5秒後自動轉為 `active`

#### `settleSkillAuction(gameCode, io)`

- 結算當前技能的最高出價
- 設定狀態為 `finished`
- 呼叫 `startAuctionForSkill` 開始下一個技能

#### `finalizeAuctionPhase(gameCode, io)`

- 所有技能競標完畢
- 回合數 +1
- 進入下一回合的 `discussion` 階段

### 競標計時器管理

```javascript
// 每個技能有獨立的計時器
const timerId = setTimeout(async () => {
    await settleSkillAuction(gameCode, io);
}, duration * 1000);

auctionTimers[gameCode] = timerId;
```

**注意事項**:

- ⚠️ 階段轉換時必須清除舊計時器
- ⚠️ 競標階段不受 `checkReadyFastForward` 影響

---

## 📊 時間計算邏輯

### `calculatePhaseDuration(aliveCount, gamePhase)`

```javascript
function calculatePhaseDuration(aliveCount, gamePhase) {
    if (gamePhase.startsWith('discussion')) {
        // 討論階段：基礎 60 秒 + 每人 30 秒
        return 60 + (aliveCount * 30);
    } 
    else if (gamePhase.startsWith('attack')) {
        // 攻擊階段：基礎 30 秒 + 每人 20 秒
        return 30 + (aliveCount * 20);
    } 
    else if (gamePhase === 'auction_transition') {
        return 3; // 固定 3 秒
    }
    return 60; // 預設
}
```

---

## 🔍 除錯建議

### 1. 啟用詳細日誌

```javascript
console.log(`[AutoPilot] Transitioning from ${currentPhase} to ${game.gamePhase}`);
console.log(`[AutoPilot] Alive players: ${alivePlayers.length}, Ready: ${readyPlayers.length}`);
```

### 2. 檢查清單

- [ ] 玩家狀態是否正確重置？
- [ ] 是否排除了死亡玩家？
- [ ] 計時器是否重複設定？
- [ ] 競標階段是否被誤判？
- [ ] `auctionState.endTime` 是否正確計算？

### 3. 常用查詢

```javascript
// 查看當前遊戲狀態
const game = await Game.findOne({ gameCode }).populate('players');
console.log('Phase:', game.gamePhase);
console.log('End Time:', game.auctionState.endTime);
console.log('Players:', game.players.map(p => ({
    name: p.name,
    isAlive: p.status?.isAlive,
    isReady: p.roundStats?.isReady,
    hasAttacked: p.roundStats?.hasAttacked
})));
```

---

## 📝 修改歷史

| 版本 | 日期 | 修改內容 |
|-----|------|---------|
| v1.6.9 | 2026-01-31 | 修正競標階段被跳過、計時器重複重設、死亡玩家阻塞等問題 |
| v1.6.8 | 2026-01-31 | 新增死亡玩家視覺指示、優化階段轉換邏輯 |
| v1.6.4 | 2026-01-31 | 修正屬性分配邏輯 |

---

## 🚨 重要提醒

### 修改階段邏輯前必讀

1. **永遠先判斷再重置**
   - 階段轉換判斷必須在狀態重置之前完成

2. **競標階段是特例**
   - 不使用 `isReady` / `hasAttacked`
   - 有自己的計時器系統
   - 必須在所有快進邏輯中排除

3. **死亡玩家必須排除**
   - 所有「全員」判斷都要過濾 `isAlive`

4. **避免計時器重複設定**
   - 檢查剩餘時間 < 5秒 時不要重設

5. **測試所有邊界情況**
   - 全員死亡
   - 單人遊戲
   - 中途加入/離開
   - 管理員強制跳過

---

## 📞 聯絡資訊

如有任何疑問或發現新的 bug，請聯絡開發團隊或在專案 Issue 中回報。

**文件維護者**: Antigravity AI  
**最後審核**: 2026-01-31
