# 遊戲開發修改紀錄 (Modification History)

## 版本 1.2.2-GlobalStyles：2026/01/30 (樣式全域化修復)

### 🎨 樣式架構重構 (Style Refactoring)

- **屬性背景樣式全域化 (Globalized Attribute Styles)**：
  - **問題**：`App.vue` 的 Scoped CSS 機制導致在某些情境下（如動態綁定或層級變更）雷屬性背景 (`.bg-thunder`) 無法正確套用。
  - **解決方案**：
    - 將所有屬性背景 (`.bg-wood`, `.bg-water`, `.bg-fire`, `.bg-thunder`)、動畫 keyframes 與相關元件樣式從 `client/src/App.vue` 移至全域樣式表 `client/src/style.css`。
    - 確保樣式不再受 Vue Component Scope 限制，保證所有玩家屬性背景皆能穩定顯示。
  - **驗證**：修復後應能解決雷屬性背景消失的頑固問題。

### 📂 修改檔案清單 (Modified Files)

- `client/src/App.vue` (移除 Scoped 屬性樣式)
- `client/src/style.css` (新增全域屬性樣式)
- `modification_history.md` (紀錄更新)

---

## 版本 1.2.1-VisualHotfix：2026/01/30 (視覺緊急修復)

### 🎨 視覺樣式修復 (Visual Hotfixes)

- **雷屬性樣式回歸 (Thunder Attribute Restoration)**：
  - **問題**：雷屬性玩家的專屬背景色與特效在之前的重構中遺失。
  - **解決方案**：
    - 在 `client/src/App.vue` 中重新補回 `.bg-thunder` CSS 類別。
    - 實作專屬視覺：採用黃色至淡紫色的漸層背景，搭配 `shock` 斷訊感微震動動畫，並將按鈕調整為對比強烈的紫色 (`#7b1fa2`)。
  - **驗證**：雷屬性玩家現在能正確顯示其專屬的視覺識別。

### 📜 開發規範更新 (Development Guidelines)

- **UI/視覺修改協議 (UI Protocol)**：
  - 更新 `.agentrules`，新增強制性的 UI 修改限制條款。
  - 明確規範 Agent 禁止在未獲授權的情況下更動既有 CSS、版面配置或進行非必要的樣式重構。

### 📂 修改檔案清單 (Modified Files)

- `client/src/App.vue` (補回雷屬性 CSS)
- `.agentrules` (新增 UI 修改協議)
- `modification_history.md` (紀錄更新)

---

## 版本 1.2.0-CustomCreation：2026/01/26 (管理員 UI 復原與自選技能同步)

### 🎨 UI/UX 視覺重塑 (Visual Restoration)

- **介面風格回歸**：全面移除了最近一次更新引入的粉紅色配色與多餘邊框，恢復為原本受好評的簡潔淺灰/白色風格。
- **佈局優化**：
  - 恢復「建立新房間」大型按鈕。
  - 將「⚙️ 自選技能設定」整合為建立按鈕上方的一個小型文字連結，保持介面清爽。
  - 修復「返回列表」按鈕的樣式與位置，確保其在控制面板頂部且不遮擋代碼。
- **版本資訊**：系統版本號移動至 Header 下方，以半透明小字顯示，兼顧資訊揭露與美觀。

### 🆕 新增功能 (New Features)

- **建立時自選技能 (Custom Skills Tracking)**：
  - 管理員在建立房間時可預先挑選第 1-3 回合的競標池。
  - **跨裝置支援**：採用純文字純選取（●/○）設計，確保手機操作依然流暢。

### 🛠️ 系統修復與後端強化 (System Fixes & Backend Enhancements)

- **管理員 API 全面修復**：修復了因模組化重構導致的管理員 API (list, delete, kick, start 等) 遺漏問題。
- **部署自動化**：更新版本號至 1.2.0 以確保 Render 觸發完整重新構建。

### 📂 修改檔案清單 (Modified Files)

- `client/src/components/AdminPanel.vue` (UI 恢復與功能整合)
- `server/routes/gameRoutes.js` (版本號更新與 API 修復)
- `package.json` (版本號同步)
- `modification_history.md` (紀錄更新)

---

## 版本 1.0.9：2026/01/25 16:00 (UI 精修 - 得標特效置中與空白消除)

### 🎨 UI 精修 (UI Refinements)

- **得標特效完美置中 (Winning Indicator Perfect Centering)**：
  - **問題**：「得標」文字在紅框容器內未完全垂直置中,且存在多餘空白行。
  - **解決方案**：
    - 將 `.status-deco` 的定位基準從內層元素改為外層 `.auction-bid-status` 容器。
    - 使用 `position: absolute` + `top: 50%` + `transform: translateY(-50%)` 實現精確垂直置中。
    - 調整 `line-height: normal` 與 `display: flex` + `align-items: center` 確保文字本身也垂直對齊。
    - 移除 `.bid-value-row` 的 `min-height` 屬性,並調整 `padding` 為 `5px 10px`,消除多餘空白。
  - **視覺效果**：「得標」文字現在完美置中於紅框內,且下方無多餘空白,整體視覺更加精緻。

- **版本號更新**：
  - 更新 `package.json` 版本號至 `1.0.9`。
  - 更新 `/api/game/version` API 回應版本號至 `1.0.9`。

### 📂 修改檔案清單 (Modified Files)

- `client/src/App.vue` (CSS 樣式調整：`.auction-bid-status`, `.bid-value-row`, `.status-deco`)
- `server/routes/gameRoutes.js` (版本號更新)
- `package.json` (版本號更新)

---

## 版本日期：2026/01/25 (昨日深夜開發項目彙整)

### 🚀 新增與強化功能 (Features & Enhancements)

- **競標系統全面升級 (Auction System Upgrade)**：
  - **時間與邏輯**：競標時間調整為 2 分鐘，實作循序競標與動態狀態同步。
  - **價格機制**：支援最低增量加價（Incremental Bidding），並即時顯示「領先中」狀態。
  - **HP 管理**：新增競標失敗後的 HP 自動退還機制，並在彈窗顯示雙重 HP（目前 HP 與得標後預計 HP）。
  - **競標介面視覺精進 (Auction UI Refinements)**：
  - **得標特效**：將「得」、「標」二字放大並往左右對齊，增加得標時的視覺辨識度。
  - **項目顯示**：移除多餘的「目前項目」標籤，顯著放大正在競標的技能名稱。
  - **狀態文字**：更新為「競標中 (本回剩 X 項)」，並在最高出價處以粗體顯示出價者名稱。
  - **介面去蕪存菁**：移除底部繁瑣的「※ 未得標之出價將在結標後立即返還」說明文字，簡化競標介面。
  - **文字格式微調**：將最高出價者名稱移除括號並改為粗體顯示。
- **屬性筆記功能 (Attribute Guessing)**：
  - **個人紀錄標記**：在玩家列表中新增「?」小標籤，點擊可快速標註對手可能的屬性（木、水、火、雷），方便玩家進行策略推演。
  - **持久化儲存**：筆記內容會儲存在 localStorage 中，重新整理頁面後標記依然會保留。
- **後端邏輯同步**：
  - 更新 `/api/games/admin/list` 與廣播邏輯，支援傳送最高出價者的名稱。
- **UI/UX 改進與精簡**：
  - **競標介面**：實作動態 HP 比例條（Allocation Bar），並優化手動輸入框，支援自動填入最低加價金額。
  - **主動技能區**：重新設計主動技能介面，調整為簡約純白背景、極窄垂直邊距（1px），提升視覺密度。
  - **互動細節**：新增「冬眠 (Hibernate)」專屬確認彈窗，避免誤觸；遊戲結束時會自動清除所有競標狀態與彈窗。

### 🔧 邏輯優化與修正 (Logic Refinement & Bug Fixes)

- **死亡保護與狀態檢查 (Death Protection & Logic)**：
  - **死亡判定強化**：實作 HP 歸零或死亡狀態玩家無法再被攻擊，也無法發動攻擊。
  - **劇毒機制補強**：在劇毒發作導致 HP 歸零時，即時更新死亡狀態並發送通知。
- **獅子王 (Lion King) 技能調整**：
  - **手下保護**：擁有技能者（主公）現在無法攻擊自己選定的手下，避免邏輯錯誤。
  - **終局限制**：當場上存活玩家僅剩兩人時，「指定手下」功能將失效，確保決賽圈的公平性。
- **系統穩定性**：
  - 修復 `App.vue` 中因變數重複宣告導致的編譯失敗。
  - 補足 `getAttributeSlug` 函式，解決偵查 (Scout) 功能選取特定玩家時的崩潰問題。
- **自動化顯示邏輯**：
  - 當目前階段無可用主動技能時，自動隱藏該區塊，保持畫面整潔。
  - 修正 HTML 巢狀結構，確保在不同螢幕尺寸下的佈局一致性。

### 📂 修改檔案清單 (Modified Files)

- `client/src/App.vue` (UI 介面、競標邏輯、狀態管理)
- `server/routes/gameRoutes.js` (競標後端 API、HP 退還邏輯)
- `server/models/gameModel.js` (儲存競標狀態)

---

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
- **死亡畫面改進**：
  - **離開按鈕統一**：將死亡畫面的按鈕文字改為「離開」，樣式調整為與遊戲主介面一致的紅色風格，確保操作體驗統一。
- **技能邏輯修正**：
  - **[適者生存]**：修正為攻擊成功後增加 2 攻擊（Atk+2），而非直接升級。
  - **[斷尾]**：修正為只有在「攻擊成功且造成傷害」時才會觸發逃避邏輯。
- **Bug 修正**：
  - **[獅子王]**：修復了因後端未正確連集玩家資料 (populate players) 導致「存活人數檢查」失效、進而無法指定手下的問題。
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
