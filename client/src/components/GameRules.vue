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
        <h2>📖 豬喵大亂鬥 - 遊戲規則</h2>
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
                <li>(人數無法整除時，名額配給雷)。</li>
              </ul>
            </li>
          </ul>
        </section>

        <section>
          <h3>⚔️ 等級與數值</h3>
          <ul>
            <li><strong>Lv0</strong>: HP 28 (8人↓) / 32 (9人↑)</li>
            <li><strong>Lv1</strong>: 攻 2 / 防 0 (需消耗 3 HP 升級)</li>
            <li><strong>Lv2</strong>: 攻 4 / 防 2 (需消耗 5 HP 升級)</li>
            <li><strong>Lv3</strong>: 攻 5 / 防 4 (需消耗 7 HP 升級)</li>
          </ul>
        </section>

        <section>
          <h3>🔄 遊戲流程</h3>
          <ol>
            <li><strong>自由討論</strong>：使用技能、談判、下毒。可花 1 HP 偵查屬性 (限2次/回)。</li>
            <li><strong>攻擊階段</strong>：每人攻擊一次。前三回合每人限被攻擊一次。且無法反擊打你的人。</li>
            <li><strong>競標階段</strong>：使用 HP 競標強力技能。</li>
            <li><strong>勝利條件</strong>：最後存活或血量最高者獲勝 (同血量並列名次)。</li>
          </ol>
        </section>

        <section>
          <h3>✨ 技能圖鑑</h3>
          <div class="skill-group">
            <h4>第一回合</h4>
            <p><strong>基因改造</strong>：升級所需 HP -1。</p>
            <p><strong>適者生存</strong>：(被動) 攻擊成功後，直接升一級。</p>
            <p><strong>尖刺</strong>：被打時反彈一半傷害。</p>
            <p><strong>劇毒</strong>：(主動) 讓目標扣 2 HP。</p>
            <p><strong>荷魯斯之眼</strong>：(主動) 查看他人血量。</p>
          </div>
          <div class="skill-group">
            <h4>第二回合</h4>
            <p><strong>兩棲</strong>：攻擊與自身不同的屬性都會勝利，反之。</p>
            <p><strong>擬態</strong>：一次將屬性變成跟目標一樣。</p>
            <p><strong>寄生</strong>：一次性將血量變成跟目標一樣。</p>
            <p><strong>森林權杖</strong>：一次指定屬性的所有玩家扣 2 HP。</p>
            <p><strong>嗜血</strong>：攻擊成功回 2 HP。</p>
            <p><strong>龜甲</strong>：防禦力永久 +3。</p>
          </div>
          <div class="skill-group">
            <h4>第三回合</h4>
            <p><strong>獅子王</strong>：指定一位手下幫你攻擊以及坦傷害。</p>
            <p><strong>瞪人</strong>：指定兩人本回合不能打你。</p>
            <p><strong>斷尾</strong>：被攻擊受傷時，扣 2 HP 躲避該次傷害 (無傷不觸發)。</p>
            <p><strong>冬眠</strong>：本回合無敵 (也不能打人)。</p>
            <p><strong>禿鷹</strong>：有人死掉時回 3 HP。</p>
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
