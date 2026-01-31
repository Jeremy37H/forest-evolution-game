# 遊戲開發修改紀錄 (Modification History)

## [1.4.25] - 2026-01-31

### Added

- **首頁可加入遊戲列表 (Joinable Games List)**：
  - **新功能**：在玩家登入頁面下方新增「今日開放中的房間」列表。
  - **機制**：自動篩選出今天建立且處於「等待中 (waiting)」狀態的遊戲。
  - **便利性**：玩家點擊列表中的房間即可自動帶入遊戲代碼，無需手動輸入。
  - **同步**：列表每 10 秒自動更新一次，並提供手動重新整理按鈕。

---

## [1.4.24] - 2026-01-31

### Fixed

- **管理員控制台狀態持久化 (Admin Panel State Persistence)**：
  - **問題**：管理員在進入特定遊戲控制頁面時，若按下 F5 重新整理，頁面會跳回遊戲列表（Dashboard）甚至登入首頁。
  - **修復**：利用 `sessionStorage` 儲存管理員狀態（`forestIsAdmin`）、目前管理的遊戲代碼（`adminGameCode`）與視圖模式（`adminViewMode`）。
  - **效果**：重新整理後，管理員能自動回到原本管理的對戰控制頁面，大幅提升管理體驗。

---

## [1.4.23] - 2026-01-31 (測試完成、部屬版本)

### Changed

- **專案全流程測試 (Full Process Testing)**：
  - **單元測試**：完成戰鬥傷害邏輯 (`test_battle_logic_standalone.js`) 與屬性分配算法 (`test_distribution_logic.js`) 的校驗，全部通過。
  - **模擬測試**：執行 8 人對戰全流程模擬 (`full_game_simulation_8p.js`)，確認討論、攻擊、競標、結算流程在多玩家併發下穩定運作。
  - **視覺驗證**：透過 Puppeteer 進行前端控制台視覺檢查，確認 Admin UI 樣式恢復與功能正常。
- **部屬準備**：
  - 更新版本號至 `1.4.23`。
  - 同步推送至 `master` 分支觸發 Render 自動部屬。

---

## [1.4.22-Doc-SkillDescRefine] - 2026-01-31

### Changed

- **技能說明簡量化 (Skill Description Refinement)**：
  - **優化**：將所有競標技能的說明文字修改為更簡短、易懂的版本，移除冗贅描述，並將重點數值標註。
  - **特別修正**：將「獅子王」的說明修正為「指定一名手下共同發動攻擊，並分擔傷害」，以更精確描述遊戲機制。

## [1.4.21-UI-AdminStyleRestore] - 2026-01-31

### Changed

- **管理員 UI 視覺特效恢復 (Admin UI Visual Effects Restoration)**：
  - **返回鍵**：維持 `⬅` 圖示，但恢復了懸浮變色與旋轉 90 度的動態效果。
  - **訊息框**：恢復了進入時的 slideDown 滑入動畫。
  - **遊戲 ID 區塊**：恢復了懸浮背景變色與邊框加深的效果。

## [1.4.20-UI-AdminCleanup] - 2026-01-31

### Changed

- **管理員 UI 樣式收斂 (Admin UI Style Convergence)**：
  - **返回鍵修正**：圖示回復為 `⬅`，移除滑動旋轉等特效（後於 1.4.21 恢復部分）。
  - **清理**：移除訊息框動畫（後於 1.4.21 恢復）與 ID 區域特定字型。

## [1.4.19-UI-AdminPlayerSkillTagRefine] - 2026-01-31

### Changed

- **管理員控制台玩家列表技能顯示優化 (Admin Player Skill Display Refinement)**：
  - **顯示變更**：將原本僅顯示縮寫的方式改為顯示完整技能名稱。
  - **視覺設計**：為每個技能添加了淺灰色透明背景標籤樣式。

## [1.4.18-UI-AdminPlayerCodeBracketsRemove] - 2026-01-31

### Changed

- **管理員控制台玩家列表調整 (Admin Player List UI Adjustment)**：
  - **修改**：移除了玩家列表顯示的玩家代碼（例如 `P-XXXX`）兩側的圓括弧。

## [1.4.17-UI-AdminPlayerSkillHide] - 2026-01-31

### Changed

- **管理員控制台玩家列表調整 (Admin Player List UI Adjustment)**：
  - **修改**：在玩家管理列表中，當玩家尚未獲得任何技能時，不再顯示「(無技能)」文字。

## [1.4.16-BugFix-AdminEnterControl] - 2026-01-31

### Fixed

- **修復管理員進入控制台失效問題 (Fixed Admin Control Entry Failure)**：
  - **原因**：誤用了不存在的變數與函數名稱導致 Vue 渲染錯誤。
  - **解決方案**：修正返回鍵邏輯與狀態顯示函數。

## [1.4.15-UI-AdminBackBtnMove] - 2026-01-31

### Fixed

- **管理員控制台返回鍵位置調整 (Admin Back Button Move)**：
  - **位置**：將返回列表按鈕移至 Header 最右側。
  - **樣式**：改為圓形懸浮按鈕樣式。

## [1.4.14-UI-AdminHeaderCleanUp] - 2026-01-31

### Changed

- **管理員控制台 Header 簡化 (Admin Header Simplification)**：
  - **移除**：刪除了「實時對戰控制台」文字標題，讓介面更簡潔。
  - **優化**：放大了遊戲 ID 的顯示字體 (`1.5rem`)，並移除原本的複製圖示（按鈕功能保留在 ID 文字上）。
  - **調整**：優化了 `.game-id-badge` 的間距與背景質感，使其成為 Header 的視覺重點。

## [1.4.13-UI-AdminActionCardSquare] - 2026-01-31

### Changed

- **管理員控制台區塊樣式調整 (Admin Action Card Style Adjustment)**：
  - **修改**：將管理員控制台動作按鈕區域（`.action-card`）的最外層邊框圓角取消，改為直角風格。
  - **範疇**：此變更會影響「開放並加入討論階段」按鈕與「強制終止遊戲」按鈕所在的白色背景容器，使其整體視覺更加硬朗、簡約。

## [1.4.12-UI-AdminMessageRefine] - 2026-01-31

### Changed

- **管理員控制台訊息提示框調整 (Admin Message Box UI Refinement)**：
  - **修改**：根據使用者提供的截圖，調整管理員控制台最上方顯示「代碼已複製！」或目前系統動作的訊息框 (`.message`)。
  - **視覺優化**：將原本的藍色背景改為 **白色背景**，並加上 **2px 黑框 (`#333`)** 與內部的深色文字。同時移除藍色陰影，改為細微的灰色陰影，提升視覺的一致性。

## [1.4.11-UI-AuctionTimerHide] - 2026-01-31

### Changed

- **優化競標結算視覺 (Auction Settlement UI Optimization)**：
  - **問題**：競標結算時顯示倒數計時器（凍結在 0 秒或之前的時間），容易讓玩家誤以為還能出價或是系統卡住。
  - **解決方案**：在 `AuctionModal.vue` 的 `.auction-timer-box` 增加 `v-if="game.auctionState.status !== 'finished'"` 判斷，在結算階段自動隱藏計時器。
  - **效果**：介面在結算時更加簡潔，專注於顯示結算結果，減少操作誤導。

## [1.4.18-UI-AdminPlayerCodeBracketsRemove] - 2026-01-31

### Changed

- **管理員控制台玩家列表調整 (Admin Player List UI Adjustment)**：
  - **修改**：移除了玩家列表顯示的玩家代碼（例如 `P-XXXX`）兩側的圓括弧，使視覺呈現更直接且不凌亂。

## [1.4.17-UI-AdminPlayerSkillHide] - 2026-01-31

### Changed

- **管理員控制台玩家列表調整 (Admin Player List UI Adjustment)**：
  - **修改**：在玩家管理列表中，當玩家尚未獲得任何技能時，不再顯示「(無技能)」文字，使介面更加簡潔。
  - **優化**：僅在玩家擁有技能時才顯示技能圖示與相關資訊。

## [1.4.16-BugFix-AdminEnterControl] - 2026-01-31

### Fixed

- **修復管理員進入控制台失效問題 (Fixed Admin Control Entry Failure)**：
  - **原因分析**：前次修改誤用了不存在的 `controlMode` 變數與 `getPhaseName` 函數，導致 Vue 渲染錯誤。
  - **解決方案**：
    - 將返回鍵的點擊事件恢復為切換 `viewMode = 'dashboard'`。
    - 將回合狀態顯示修正為使用現有的 `formatPhase(game.gamePhase)` 函數。

## [1.4.15-UI-AdminBackBtnMove] - 2026-01-31

### Fixed

- **管理員控制台返回按鈕位置調整 (Admin Back Button Repositioning)**：
  - **問題**：管理員控制台的返回按鈕在某些情況下會與其他元素重疊，影響操作。
  - **解決方案**：將返回按鈕從 Header 區域移至主內容區塊的左上角，確保其獨立性與易用性。
  - **視覺優化**：調整按鈕樣式，使其與整體介面風格更協調。

## [1.4.10-UI-AdminLayoutFix] - 2026-01-31

### Fixed

- **管理員介面排版修復 (Admin UI Layout Restore)**：
  - **問題**：玩家管理卡片因樣式遺失導致內容堆疊成四行，影響閱讀效率。
  - **解決方案**：
    - 重新定義 `.p-row-1` 與 `.p-row-2` 的 Flex 佈局樣式，確保「身分資訊」與「操作按鈕」並排顯示。
    - 恢復原本的兩行式緊湊設計，提升管理員操作流暢度。

## [1.4.9-AuctionFix] - 2026-01-31

### Fixed

- **競標計時器深度修復**：針對用戶回報的「競標結束卡在0秒」問題進行深度修復。
- **安全網機制 (Safety Net)**：在 `broadcastGameState` 中增加對 `finished` 狀態的自動偵測與救援，若系統卡在過渡狀態超過 2 秒，將強制跳轉至下一個技能。
- **錯誤處理 (Error Handling)**：為 `settleSkillAuction` 增加 `try-catch` 保護，確保即使結算邏輯（如資料庫寫入）發生異常，仍能強制更新狀態為 `finished` 並推動遊戲進程。
- **狀態時間標記**：確保結算階段也會寫入 `endTime`，讓後端安全網能正確判斷是否逾時。

## [1.4.8-Bugfix-AuctionTimer] - 2026-01-31

### Fixed

- **修正競標計時器卡死**：修復競標計時器在到達 0 秒後不自動跳轉至結算階段的問題。
- **防止競態條件**：優化 `broadcastGameState` 與 `setInterval` 的並行執行邏輯，確保只有一個機制能觸發結算。
- **計時器清理**：確保在狀態轉換期間正確清除並重建計時器，避免多重計時器導致的狀態異常。
- **狀態判定強化**：在結算過程中增加 `settled` 暫存狀態判定，防止自動修正機制誤觸。

## [1.4.8-Bugfix-ScoutFunction] - 2026-01-31

### Fixed

- **修正偵查功能崩潰**：修復 `App.vue` 中缺少 `getAttributeSlug` 匯入導致偵查結果無法跳出的問題。
- **穩定性優化**：確保玩家在偵查成功後能正確接收並顯示目標屬性。

## [1.4.7-UI-SpacingOptimization] - 2026-01-30

### Fixed

- **玩家資訊排版優化**：為 AdminPanel.vue 的玩家列表加入彈性的 Flex 間距，解決名字、編號與等級資訊過於擁擠的問題。
- **視覺層次提升**：透過增加 margin 與 gap，使管理員能更直覺地分辨不同玩家的身分與數值。

## [1.4.6-UI-PhaseControlCleanup] - 2026-01-30

### Changed

- **精確視覺優化**：移除 AdminPanel.vue 中「遊戲階段控制按鈕」文字前的 Emoji 圖示（如 🚀、⚔️、💎、🏁），提升操作區塊的專業感。
- **保留輔助圖示**：維持複製、踢除、重新整理等功能性小圖示不變，兼顧極簡設計與操作便捷性。

## [1.4.5-Hotfix-UI-Restoration] - 2026-01-30

### Fixed

- **視覺全面還原**：應介面設計師要求，將 `AdminPanel.vue` 樣式恢復至原始版本，確保視覺風格不變。
- **彈窗定位修復**：保留 `.modal-overlay` 的 fixed 定位邏輯，解決「確認刪除彈窗」位置偏移導致使用者找不到按鈕的問題。

### 📜 規範聲明

- 已建立「邏輯/視覺分工協議」：除非功能受損，否則代理人禁止擅自更動設計師定案之 UI/UX 規範。

## [1.4.4-AuctionFix] - 2026-01-30

### Fixed

- 修正後端路由 `/action/bid` 路徑不匹配問題，恢復競標功能。
- 修正 `useAuction.js` 中 `isMyBidHighest` 的 ID 比對邏輯。

### Added

- 優化競標 UI：投標成功後自動清空輸入框。
- 新增競標自動填充：切換技能時自動帶入「目前最高價 + 1」。

## [1.4.3-VisualHotfix] - 2026-01-30 (玩家介面視覺體感優化)

### 🎨 玩家戰鬥介面美化 (Battle UI Aesthetics)

- **攻擊按鈕重塑 (Attack Button Redesign)**：
  - 徹底移除原本生硬的純紅色 (#e53935)，改用 **漸層紅 (Sunset Gradient)**。
  - 引入 `box-shadow` 與微小的 `scale` 懸浮動畫，增加點擊的厚實感與視覺回饋。
  - 調整為更圓潤的 `pill-style` 形狀，符合現代清新美學。
- **技能按鈕同步升級 (Skill Buttons Polish)**：
  - 為「下毒」與「查看」按鈕套用專屬的漸層色調（紫色與天藍色），並加入陰影層次。
  - 優化「偵查」按鈕的白色極簡外觀。
- **屬性筆記優化**：
  - 將猜測筆記的形狀調整為圓形（Circle），提升視覺上的韻律感。

### 📂 修改檔案清單 (Modified Files)

- `client/src/components/PlayerList.vue` (更新按鈕樣式)
- `modification_history.md` (紀錄更新)

---

## 版本 1.4.2-AdminPolish：2026/01/30 (管理員介面簡構)

### 🎨 管理員介面精簡 (Admin UI Simplification)

- **移除冗餘標題 (Redundant Header Removal)**：
  - 移除了管理員面板中「建立新戰局」的重複標題行，讓介面更加簡潔。
- **佈局優化**：
  - 減少了控制台頂部的垂直空間佔用。

### 📂 修改檔案清單 (Modified Files)

- `client/src/components/AdminPanel.vue` (移除標題行)
- `modification_history.md` (紀錄更新)

---

## 版本 1.4.1-AdminDesign：2026/01/30 (管理員面板視覺精進)

### 🎨 管理員面板視覺精進 (Admin Panel UI Refinement)

- **介面風格現代化 (Modern UI Styles)**：
  - 徹底移除粉紅色調，改用專業的 **靛藍 (Indigo) 與灰冷色調**。
  - 導入 **卡片式佈局 (Card-based Layout)** 與柔和陰影，增進層次感。
- **佈局與易用性優化 (Layout & Usability)**：
  - **結構化 Header**：在控制模式新增頂部導覽列，整合「返回」與「對戰資訊」。
  - **建立流程重塑**：將玩家人數與技能配置圖示整合進「建立新戰局」區塊，視覺更統一。
  - **按鈕視覺升級**：採用漸層漸層按鈕並加入懸浮與點擊回饋特效。
- **列表視覺對齊 (Alignment & Spacing)**：
  - 統一遊戲列表的標籤化顯示。
  - **按鈕風格回歸**：依據使用者回饋，將遊戲列表的「進入」與「刪除」按鈕恢復為經典的高對比藍/紅色調，並調整為簡潔文字而不使用圖示，確保操作直覺。
  - 修正對戰 ID 顯示區域，支援點擊自動複製。
  - 改善日誌顯示區域，採用深色調設計提升閱讀舒適度。

### 📂 修改檔案清單 (Modified Files)

- `client/src/components/AdminPanel.vue` (樣式、結構與佈局全面重塑)
- `modification_history.md` (紀錄更新)

---

## 版本 1.4.0-CoreOptimization：2026/01/30 (後端效能與結構優化)

### 🚀 後端效能與結構優化 (Backend Performance & Structure)

- **資料庫索引優化 (DB Indexing)**：
  - 為 `Player` Model 的 `gameId` 欄位新增索引，顯著提升頻繁的「遊戲-玩家」查詢效能。
- **廣播節流機制 (Socket Throttling)**：
  - 在 `broadcastGameState` 中引入 100ms 的節流鎖，防止在連鎖反應時產生重複廣播，降低伺服器與客戶端負擔。
- **重複查詢消除 (Query Optimization)**：
  - 重構 `handleAttackFlow` 與相關邏輯，直接利用已獲取的物件，減少不必要的 `findById` 呼叫。
- **核心邏輯重構 (Strategy Pattern)**：
  - 將巨大的 `useSkill` switch-case 結構重構為 `SKILL_HANDLERS` 對照表，提升程式碼可讀性與擴充性。
- **常數統一管理 (Constants Centralization)**：
  - 將分散在程式碼中的傷害數值、競標時間等 Hardcoded 常數統一抽離至 `gameConstants.js`。

### 📂 修改檔案清單 (Modified Files)

- `server/models/playerModel.js` (新增索引)
- `server/services/gameService.js` (廣播節流、邏輯重構、常數引用)
- `server/config/gameConstants.js` (新增遊戲常數)
- `modification_history.md` (紀錄更新)

---

## 版本 1.3.0-RankingMaster：2026/01/30 (結算系統與排名視覺強化)

### 🏆 結算系統修復 (Game End & Rankings)

- **結算畫面失蹤修復 (End-of-Game UI Fix)**：
  - **問題**：遊戲結束時未正確顯示排行榜，且陣亡玩家會被「死亡遮罩」卡住，無法看到最終結果。
  - **解決方案**：
    - 正式實作 `isFinishedPhase` 判定邏輯。
    - 調整層級：遊戲結束時強制移除死亡遮罩，確保所有玩家都能參與結算。
- **排名視覺強化 (Ranking UI/UX)**：
  - **個人榮耀區**：新增顯眼的「最終排名」展示，針對冠軍給予專屬的 **「森林霸主」** 祝賀詞。
  - **高亮對比標註**：排行榜中會以藍底顯眼標註 **「你 (YOU)」** 的位置。
  - **金銀銅配色**：前三名採用不同風格的色調，提升成就感。
- **返回機制**：新增「返回大廳」按鈕，取代原本僵硬的登出功能，讓流程更順暢。

### 🎨 屬性背景特效精修 (Attribute Visual Polish)

- **火屬性 (Fire)**：
  - 升級為 **「透明燃燒 (Transparent Burning)」**。
  - 採用 `0deg` 重直向上的 `fire-rise` 漸層動畫，模擬火焰升騰效果。
  - 調整為半透明 `rgba` 漸層，增加畫面細節層次。
- **木屬性 (Wood)**：
  - 加速搖曳特效：將擺動週期縮短至 **4s**，讓森林更有動感。
  - 實作對角線流動：`background-size` 提升至 400%，搭配 `sway-diagonal` 動畫，解決特效不明顯的問題。
- **雷屬性 (Thunder)**：
  - 移除多餘邊框：刪除除錯用的紫色邊框。
  - 配色優化：改用高亮粉紫與金黃的半透明漸層，營造高張力的電漿感。

### 📂 修改檔案清單 (Modified Files)

- `client/src/App.vue` (實作排名 UI、判定邏輯與關鍵樣式)
- `client/src/style.css` (全屬性背景特效調優與語法修復)
- `modification_history.md` (紀錄更新)

---

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
