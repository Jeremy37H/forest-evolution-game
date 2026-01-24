# 遊戲開發修改紀錄 (Modification History)

## 版本日期：2026/01/23

### 🚀 新增功能 (New Features)

- **管理員後台功能強化**：
  - 新增 `GET /api/games/admin/list`：列出伺服器上所有進行中的遊戲與玩家人數。
  - 新增 `DELETE /api/games/admin/delete/:gameCode`：手動刪除遊戲及其關聯玩家。
  - 新增 `POST /api/games/admin/kick-player`：支援將特定玩家踢出遊戲。
  - 以及管理員直接調整玩家 HP 的功能。
- **UI 優化**：
  - 新增「技能歷史紀錄」按鈕與彈窗，讓玩家可隨時查看前幾個回合已競標的技能。
  - 調整 `App.vue` 中的按鈕文字（如：📜 技能歷史 -> 📜 技能）。
  - **[NEW] 玩家列表技能清單美化**：將原本的 `[技能A, 技能B]` 純文字格式改為獨立的橢圓標籤（Pill style），移除多餘的括號與逗號。
- **屬性分配平衡**：
  - 建立遊戲時，系統會自動預生成屬性池，確保「木、水、火」三種屬性數量平均分配，多餘的名額則填入「雷」屬性，並在玩家加入時隨機取出。

### 🔧 邏輯優化與修正 (Logic Refinement & Bug Fixes)

- **戰鬥規則調整 (反擊限制)**：
  - 實作「同一回合不能攻擊先攻擊自己的人」規則。透過在玩家 `roundStats` 中新增 `attackedBy` 列表，檢查攻擊者是否在目標的回合受攻擊清單中。
- **技能邏輯修正**：
  - **[適者生存]**：修正為攻擊成功後直接提升一級（LV+1），不再是額外的攻防加成。
  - **[斷尾]**：修正為只有在「攻擊成功且造成傷害」時才會觸發逃避邏輯。
- **HP 與狀態重置**：
  - 修復了開始遊戲或下一回合時，`hasAttacked`、`attackedBy` 等回合狀態未正確重置的問題。
  - 暫時移除動態 HP 調整（統一維持 28 HP）。

### 📂 修改檔案清單 (Modified Files)

- `server/routes/gameRoutes.js` (核心邏輯、API 實作)
- `server/models/gameModel.js` (Schema 更新)
- `server/models/playerModel.js` (Schema 更新)
- `client/src/App.vue` (UI、按鈕與彈窗邏輯)

---
*本紀錄由 Antigravity 自動彙整儲存。*
