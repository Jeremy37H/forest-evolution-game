<script setup>
defineProps({
  isOpen: Boolean
});

defineEmits(['close']);
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>📖 豬喵大亂鬥 - 遊戲規則 <small style="font-size: 0.6em; color: #999; margin-left: 8px;">v1.9.9</small></h2>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="scrollable-content">
        <section>
          <h3>🔥 屬性相剋</h3>
          <ul>
            <li><strong>木</strong> 🌳 剋 <strong>水</strong> 💧</li>
            <li><strong>水</strong> 💧 剋 <strong>火</strong> 🔥</li>
            <li><strong>火</strong> 🔥 剋 <strong>木</strong> 🌳</li>
            <li><strong>雷</strong> ⚡️ 規則：
              <ul>
                <li>打人/被打皆<strong>必中</strong>。</li>
                <li><strong>雷打雷</strong>：比等級，高等勝。</li>
                <li><strong>配比機制</strong>：雷佔約 20% 保底，其餘隨機擾動分配 (增加不確定性)。</li>
              </ul>
            </li>
          </ul>
        </section>

        <section>
          <h3>⚔️ 等級與數值</h3>
          <ul>
            <li><strong>Lv0</strong>: HP 28</li>
            <li><strong>Lv1</strong>: 攻 2 / 防 0 (需 2 HP 升級)</li>
            <li><strong>Lv2</strong>: 攻 4 / 防 2 (需 4 HP 升級)</li>
            <li><strong>Lv3</strong>: 攻 5 / 防 4 (需 6 HP 升級)</li>
            <li style="color: #ffda79;"><strong>限制：每回合最多升級一次。只要血量足以支付消耗即可升級，不再限制初始血量。</strong></li>
          </ul>
        </section>

        <section>
          <h3>🔄 遊戲流程</h3>
          <ol>
            <li><strong>自由討論</strong>：使用技能、談判、下毒。可花 1 HP 偵查屬性 (限2次/回)。</li>
            <li><strong>攻擊階段</strong>：每人攻擊一次。攻擊成功者可<strong>恢復 3 HP</strong>。前三回合限被攻擊一次。且無法反擊打你的人。</li>
            <li><strong>淘汰機制</strong>：HP 歸零即淘汰。死亡畫面提供重新進入按鈕。</li>
            <li><strong>補助功能</strong>：點擊對手名稱旁的 <strong>?</strong> 可紀錄屬性筆記。</li>
            <li><strong>操作回饋</strong>：所有操作（攻擊、升級、技能）成功或失敗皆有即時訊息提示。</li>
            <li><strong>競標階段</strong>：使用 HP 競標強力技能。</li>
            <li><strong>勝利條件</strong>：最後存活或血量最高者獲勝 (同血量並列名次)。</li>
          </ol>
        </section>

        <section>
          <h3>✨ 技能圖鑑</h3>
          <div class="skill-group">
            <h4>第一回合</h4>
            <p><strong>基因改造</strong>：升級消耗 -1 HP，且升級後額外 +1 防禦。</p>
            <p><strong>適者生存</strong>：攻擊成功後，永久 +2 攻擊。</p>
            <p><strong>尖刺</strong>：被攻擊時，反彈 50% 傷害給對方。</p>
            <p><strong>劇毒</strong>：討論階段指定一名玩家扣除 2 HP。</p>
            <p><strong>荷魯斯之眼</strong>：討論階段可查看一名玩家的當前 HP。</p>
            <p><strong>噴墨</strong>：(一次性) 被攻擊時閃避，並將傷害轉移給隨機玩家。</p>
          </div>
          <div class="skill-group">
            <h4>第二回合</h4>
            <p><strong>折翅</strong>：(一次性) 指定一名玩家，隨機移除其一個技能。</p>
            <p><strong>擬態</strong>：(一次性) 討論階段模仿一名玩家的屬性。</p>
            <p><strong>禿鷹</strong>：每當有玩家死亡，自身恢復 3 HP。</p>
            <p><strong>森林權杖</strong>：(一次性) 指定一屬性，該屬性玩家全體扣 2 HP。</p>
            <p><strong>嗜血</strong>：攻擊成功後，自身額外恢復 2 HP。</p>
            <p><strong>龜甲</strong>：獲得技能時，永久增加 3 防禦。</p>
            <p><strong>獠牙</strong>：攻擊時無視目標防禦力。</p>
          </div>
          <div class="skill-group">
            <h4>第三回合</h4>
            <p><strong>獅子王</strong>：指定一名手下共同發動攻擊，但無法攻擊手下。</p>
            <p><strong>瞪人</strong>：指定兩名玩家，使其本回合無法對你攻擊。</p>
            <p><strong>斷尾</strong>：被攻擊時僅扣 2 HP 並閃避原始傷害。</p>
            <p><strong>冬眠</strong>：本回合無法攻擊，但也不會被攻擊。</p>
            <p><strong>寄生</strong>：(一次性) 將自身 HP 同步為目標玩家的 HP。</p>
            <p><strong>腎上腺素</strong>：當 HP 低於 10 時，攻擊力額外 +3。</p>
            <p><strong>同病相憐</strong>：連結一名玩家，使其同步承受你受到的傷害。</p>
          </div>
        </section>
      </div>
      
      <div class="modal-footer">
        <button @click="$emit('close')">我懂了！</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0,0,0,0.6); z-index: 1000;
  display: flex; justify-content: center; align-items: center;
}
.modal-content {
  background: white; width: 90%; max-width: 600px; max-height: 85vh;
  border-radius: 12px; display: flex; flex-direction: column;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
}
.modal-header {
  padding: 15px; border-bottom: 1px solid #eee;
  display: flex; justify-content: space-between; align-items: center;
  background-color: #f8f9fa; border-radius: 12px 12px 0 0;
}
.modal-header h2 { margin: 0; font-size: 1.2em; color: #333; }
.close-btn {
  background: none; border: none; font-size: 1.5em; cursor: pointer; color: #666; width: auto; padding: 0 10px;
}
.scrollable-content {
  padding: 20px; overflow-y: auto; text-align: left; flex: 1;
}
section { margin-bottom: 20px; }
h3 { color: #007bff; border-bottom: 2px solid #e9ecef; padding-bottom: 5px; margin-bottom: 10px; }
h4 { color: #28a745; margin: 10px 0 5px; font-size: 1em; }
ul, ol { padding-left: 20px; margin: 0; }
li { margin-bottom: 5px; color: #444; }
.skill-group p { margin: 5px 0; font-size: 0.9em; border-bottom: 1px dashed #eee; padding-bottom: 3px; }
.modal-footer {
  padding: 15px; border-top: 1px solid #eee; text-align: center;
}
.modal-footer button {
  width: 100%; padding: 10px; background-color: #007bff; font-weight: bold; font-size: 1.1em;
}
</style>
