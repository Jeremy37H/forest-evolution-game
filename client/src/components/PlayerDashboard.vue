<script setup>
import { defineProps } from 'vue';

const props = defineProps(['player', 'attributeEmoji', 'playerAttributeClass', 'levelUpInfo']);
const emit = defineEmits(['handleSkillClick', 'levelUp']);

const isOneTimeSkillUsed = (skill) => {
    if (!props.player || !props.player.oneTimeSkillsUsed) return false;
    return props.player.oneTimeSkillsUsed.includes(skill);
};

const isSkillAvailable = (skill) => {
    if (!props.player || !props.player.roundStats) return false;
    const { usedSkillsThisRound, isHibernating } = props.player.roundStats;

    if (skill === '冬眠') return !isHibernating;
    if (['劇毒', '荷魯斯之眼', '瞪人'].includes(skill)) return !usedSkillsThisRound.includes(skill);
    if (['擬態', '寄生', '森林權杖'].includes(skill)) return !isOneTimeSkillUsed(skill);
    if (skill === '獅子王') return !props.player.roundStats.minionId;

    return true;
};
</script>

<template>
  <div class="player-dashboard">
    <div class="player-main-info">
      <h3>
        <span class="attribute-icon" :class="playerAttributeClass">{{ attributeEmoji }}</span> 
        {{ player.name }}
      </h3>
      <p class="player-code-info">專屬代碼: {{ player.playerCode }}</p>
    </div>
    <div class="player-stats-grid">
      <div><span>等級</span><strong>{{ player.level }}</strong></div>
      <div><span>HP</span><strong>{{ Math.max(0, player.hp) }}</strong></div>
      <div><span>攻擊</span><strong>{{ player.attack }}</strong></div>
      <div><span>防禦</span><strong>{{ player.defense }}</strong></div>
    </div>
    <div class="player-skills" v-if="player.skills && player.skills.length > 0">
      <strong>持有技能:</strong>
      <div class="skills-tags">
        <span v-for="skill in player.skills" :key="skill" 
              class="skill-tag" 
              :class="{ 'used-skill': isOneTimeSkillUsed(skill), 'blink-available': isSkillAvailable(skill) }" 
              @click="emit('handleSkillClick', skill)">
          {{ skill }}
        </span>
      </div>
    </div>
    <div class="levelup-section">
      <button @click="emit('levelUp')" :disabled="!levelUpInfo.possible" class="levelup-button">
        {{ levelUpInfo.message }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.player-dashboard {
  background: white; border-radius: 12px; padding: 20px;
  margin-bottom: 20px; border: 1px solid #eee; text-align: left;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}
.player-main-info h3 { margin: 0 0 5px 0; font-size: 1.6em; display: flex; align-items: center; justify-content: center; color: #2c3e50; }
.player-code-info { font-size: 0.85em; color: #95a5a6; text-align: center; margin-bottom: 15px; }
.player-stats-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
  text-align: center; margin-bottom: 20px;
}
.player-stats-grid div { background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee; }
.player-stats-grid span { display: block; font-size: 0.75em; color: #7f8c8d; text-transform: uppercase; margin-bottom: 4px; }
.player-stats-grid strong { font-size: 1.3em; color: #3498db; }
.player-skills {
  font-size: 0.95em; color: #2c3e50; margin-top: 15px;
  padding-top: 15px; border-top: 1px dotted #eee;
}
.player-skills strong { display: block; margin-bottom: 8px; color: #7f8c8d; }
.skills-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.skill-tag {
  background-color: #f1f3f5; color: #495057; padding: 4px 12px;
  border-radius: 20px; font-size: 0.85em; cursor: pointer;
  border: 1px solid #dee2e6; transition: all 0.2s;
}
.skill-tag:hover { background-color: #e9ecef; transform: translateY(-1px); }
.skill-tag.used-skill {
    opacity: 0.5; text-decoration: line-through; cursor: not-allowed; background-color: #f8f9fa;
}

.skill-tag.blink-available {
  animation: skill-blink 2s ease-in-out infinite;
  border-color: #2ecc71;
}

@keyframes skill-blink {
  0%, 100% { background-color: #f1f3f5; transform: scale(1); }
  50% { background-color: #e8f5e9; transform: scale(1.05); box-shadow: 0 0 8px rgba(46, 204, 113, 0.3); }
}

.levelup-section { margin-top: 20px; }
.levelup-button {
  width: 100%; margin: 0; background-color: #f1c40f; color: #fff;
  font-weight: bold; border-radius: 8px; transition: all 0.2s;
}
.levelup-button:disabled { background-color: #ecf0f1; color: #bdc3c7; cursor: not-allowed; }
.levelup-button:not(:disabled):hover { background-color: #f39c12; transform: translateY(-1px); }

.attribute-icon {
  margin-right: 8px; font-size: 1.2em;
}
</style>
