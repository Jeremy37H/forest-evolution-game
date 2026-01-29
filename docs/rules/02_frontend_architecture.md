# 前端開發架構規範 (Always On)

## 1. 檔案權責分配

- **主元件控制**：`#client/src/App.vue` 目前處於**新功能凍結狀態**。**禁止直接在 `App.vue` 中撰寫新的業務邏輯**。
- **邏輯抽離**：所有**新功能**（如：新的卡片效果、新的介面區塊）必須強制封裝於 `#client/src/composables/` 或 `#client/src/components/` 中，僅在 `App.vue` 進行引用。
- **組件化**：新的 UI 區塊應獨立為 `.vue` 組件，存放於 `components/`。

## 2. 狀態同步

- **Socket 事件一致性**：禁止修改現有的 Socket 事件名稱（如 `gameStateUpdate`, `bid`），確保與後端 API 匹配。
- **持久化儲存**：『屬性猜測筆記』必須維持讀寫 `localStorage` 的機制，不得更動 Key 值。
