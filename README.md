# 🌲 豬喵大亂鬥 (Forest Evolution Game)

[![Deploy Status](https://render.com/images/server-anchor-image.png)](https://render.com)

一款基於網頁的即時多人戰略生存遊戲。玩家將扮演森林中的不同屬性生物，透過競標技能、結盟、背叛與屬性相剋機制，在殘酷的森林中努力生存到最後。

🔗 **線上遊玩連結**: [https://forest-evolution-game.onrender.com](https://forest-evolution-game.onrender.com)
*(若連結無法開啟，請確認 Render 服務狀態)*

---

## 🎮 遊戲特色

- **多人即時對戰**：支援 8 人以上同時連線，即時同步遊戲狀態。
- **屬性相剋系統**：木 🌳、水 💧、火 🔥、雷 ⚡ 四大屬性相生相剋。
- **動態競標機制**：每回合透過 HP 競標強力技能，策略性分配資源。
- **豐富技能池**：包含「冬眠」、「劇毒」、「獅子王」、「擬態」等多樣化技能。
- **視覺化互動**：針對不同屬性設計專屬動態背景與攻擊特效。

---

## 🚀 技術棧 (Tech Stack)

- **Frontend**: Vue 3 (Vite), Socket.io-client
- **Backend**: Node.js, Express, Socket.io
- **Database**: MongoDB (Atlas)
- **Deployment**: Render (Web Service)

## 🛠️ 本地開發 (Local Development)

1. **Clone 專案**

   ```bash
   git clone https://github.com/Jeremy37H/forest-evolution-game.git
   cd forest-evolution-game
   ```

2. **安裝依賴**

   ```bash
   npm install
   ```

3. **設定環境變數**
   在根目錄建立 `.env` 檔案，填入 MongoDB 連線資訊：

   ```env
   MONGODB_URI=your_mongodb_connection_string
   PORT=3001
   ```

4. **啟動開發伺服器**

   ```bash
   npm run dev
   ```

   伺服器將運行於 `http://localhost:3001`，前端頁面可透過 `http://localhost:5173` 訪問。

## 📜 版本紀錄

詳見 [modification_history.md](./modification_history.md)

---
*Created by Antigravity & User*
