<script setup>
import { defineProps, computed } from 'vue';

const props = defineProps(['player', 'game', 'otherPlayers', 'isDiscussionPhase', 'isAttackPhase', 'attributeGuesses']);
const emit = defineEmits(['cycleGuess', 'handleSkillClick', 'confirmScout', 'attackPlayer']);

const getAttributeSlug = (attr) => {
    const map = { '木': 'wood', '水': 'water', '火': 'fire', '雷': 'thunder' };
    return map[attr] || 'unknown';
};

const getGuessLabel = (playerId) => {
    return props.attributeGuesses[playerId] || '?';
};
</script>

<template>
  <div class="player-list">
    <div v-for="p in otherPlayers" :key="p._id" class="player-card" :class="{ hibernating: p.roundStats && p.roundStats.isHibernating }">
      <div class="player-info-wrapper">
        <div class="player-info-line">
          <span class="player-level">等級: {{ p.level }}</span>
          <span class="player-name-text">{{ p.name }}</span>
          <div class="guess-badge" :class="`guess-${getAttributeSlug(attributeGuesses[p._id])}`" @click="emit('cycleGuess', p._id)" title="點擊切換屬性猜測筆記">
            {{ getGuessLabel(p._id) }}
          </div>
          <span v-if="p.effects && p.effects.isPoisoned" title="中毒中">🤢</span>
          <span v-if="game.players.some(lion => lion.roundStats.minionId === p._id)" title="獅子王的手下">🛡️</span>
          <!-- 狀態標籤顯示邏輯 (優先顯示死亡) -->
          <span v-if="p.status && !p.status.isAlive" class="mini-status-badge dead" title="已死亡">💀</span>
          <template v-else-if="isAttackPhase">
            <span v-if="p.roundStats && p.roundStats.hasAttacked" class="mini-status-badge acted">Acted</span>
          </template>
          <template v-else-if="isDiscussionPhase">
            <span v-if="p.roundStats && p.roundStats.isReady" class="mini-status-badge ready">Ready</span>
          </template>
        </div>
        <div v-if="p.skills && p.skills.length > 0" class="other-player-skills-tags">
          <span v-for="skill in p.skills" :key="skill" class="skill-tag-small">{{ skill }}</span>
        </div>
      </div>
      <div class="player-actions">
        <!-- 討論階段技能 -->
        <template v-if="isDiscussionPhase">
          <button v-if="player.skills.includes('劇毒') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('劇毒'))" 
                  @click="emit('handleSkillClick', '劇毒', p._id)" class="skill-button poison" title="使用劇毒">下毒</button>
          <button v-if="player.skills.includes('荷魯斯之眼') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼'))" 
                  @click="emit('handleSkillClick', '荷魯斯之眼', p._id)" class="skill-button eye" title="使用荷魯斯之眼">查看</button>
          <button class="skill-button scout" @click="emit('confirmScout', p)" 
                  :disabled="player.hp < 2 || (player.roundStats && player.roundStats.scoutUsageCount >= 2)" title="花費 1 HP 偵查屬性">
            🔍
          </button>
        </template>

        <!-- 攻擊階段技能與動作 -->
        <template v-if="isAttackPhase">
          <button v-if="player.skills.includes('荷魯斯之眼') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼'))" 
                  @click="emit('handleSkillClick', '荷魯斯之眼', p._id)" class="skill-button eye" title="使用荷魯斯之眼">查看</button>
          <button 
            @click="emit('attackPlayer', p._id)" 
            :disabled="(player.roundStats && player.roundStats.hasAttacked) || (game.currentRound <= 3 && p.roundStats && p.roundStats.timesBeenAttacked > 0) || (player.roundStats && player.roundStats.isHibernating) || (p.roundStats && p.roundStats.isHibernating)"
            class="attack-button">
            攻擊
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-list { list-style: none; padding: 0; }
.player-card {
  background-color: #f4f4f4; padding: 12px; margin-top: 10px; border-radius: 8px;
  display: flex; justify-content: space-between; align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.player-info-wrapper { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.player-info-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 24px; }
.player-name-text { font-weight: bold; font-size: 1.1em; color: #2c3e50; }
.player-level { font-size: 0.9em; color: #666; font-weight: 600; background: #eee; padding: 2px 6px; border-radius: 4px; }
.other-player-skills-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.skill-tag-small {
  display: inline-block; font-size: 0.75em; color: #555; padding: 1px 6px;
  background-color: #fff; border-radius: 12px; border: 1px solid #ddd;
}
.player-card.hibernating { background-color: #eceff1; opacity: 0.7; }
.player-card.hibernating .player-name-text::after {
  content: ' (💤)'; font-size: 0.8em; margin-left: 5px;
}
.player-actions { display: flex; gap: 10px; align-items: center; }
.attack-button { 
    width: auto; 
    margin: 0; 
    padding: 8px 18px; 
    background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%);
    color: white;
    border: none;
    border-radius: 20px;
    font-weight: 800;
    font-size: 0.9em;
    letter-spacing: 1px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    box-shadow: 0 4px 10px rgba(255, 65, 108, 0.3);
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    cursor: pointer;
}

.attack-button:hover:not(:disabled) {
    transform: scale(1.05) translateY(-2px);
    box-shadow: 0 6px 15px rgba(255, 65, 108, 0.4);
    filter: brightness(1.1);
}

.attack-button:active:not(:disabled) {
    transform: scale(0.95);
}

.attack-button:disabled { 
    background: #cfd8dc; 
    color: #90a4ae; 
    box-shadow: none;
    cursor: not-allowed; 
}

.skill-button { 
    padding: 6px 14px; 
    font-size: 0.85em; 
    width: auto; 
    margin: 0; 
    border-radius: 20px; 
    font-weight: bold; 
    color: white;
    border: none;
    transition: all 0.2s;
    cursor: pointer;
}

.skill-button:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.1);
}

.skill-button.poison { 
    background: linear-gradient(135deg, #a8c0ff 0%, #3f2b96 100%); /* Purple/Violet */
    background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);
    box-shadow: 0 4px 10px rgba(156, 39, 176, 0.3);
}

.skill-button.eye { 
    background: linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%);
    box-shadow: 0 4px 10px rgba(3, 169, 244, 0.3);
}

.skill-button.scout { 
  background: white; 
  color: #666; 
  border: 1px solid #ddd; 
  font-size: 1.1em; 
  padding: 4px 10px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}

.guess-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%; font-size: 0.8em; font-weight: bold;
  cursor: pointer; background: #fff; color: #999; border: 1px solid #ddd;
  transition: all 0.2s; user-select: none;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.guess-wood { background: #4caf50; color: white; border-color: #388e3c; }
.guess-water { background: #2196f3; color: white; border-color: #1976d2; }
.guess-fire { background: #f44336; color: white; border-color: #d32f2f; }
.guess-thunder { background: #ffeb3b; color: #333; border-color: #fbc02d; }

.mini-status-badge {
    font-size: 0.65em;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 800;
    text-transform: uppercase;
}
.mini-status-badge.ready {
    background-color: #d4edda;
    color: #28a745;
    border: 1px solid #c3e6cb;
}
.mini-status-badge.acted {
    background-color: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
}
.mini-status-badge.dead {
    background-color: #343a40;
    color: white;
    border: 1px solid #000;
    font-size: 0.9em;
    padding: 0 4px;
}
</style>
