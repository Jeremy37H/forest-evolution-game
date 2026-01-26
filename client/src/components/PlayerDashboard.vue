<template>
  <div v-if="player" class="player-dashboard" :class="attributeClass">
    <div class="player-main-info">
      <h3>
        <span class="attribute-icon" :class="attributeClass">{{ attributeEmoji }}</span>
        {{ player.name }}
      </h3>
      <div class="player-code-info">遊戲代碼: {{ game.gameCode }}</div>
    </div>

    <div class="player-stats-grid">
      <div><span>屬性</span><strong>{{ player.attribute }}</strong></div>
      <div><span>等級</span><strong>LV {{ player.level }}</strong></div>
      <div><span>血量</span><strong>{{ Math.max(0, player.hp) }}</strong></div>
      <div><span>攻/防</span><strong>{{ player.attack }}/{{ player.defense }}</strong></div>
    </div>

    <div class="player-skills">
      <strong>已獲得技能:</strong>
      <div v-if="player.skills && player.skills.length > 0" class="skills-tags">
        <span v-for="skill in player.skills" :key="skill" class="skill-tag" 
              :class="{ 'used-skill': player.usedOneTimeSkills?.includes(skill) }">
          {{ skill }}
        </span>
      </div>
      <span v-else class="no-skills-text">尚未獲得技能</span>
      
      <button v-if="canLevelUp" @click="$emit('levelUp')" class="levelup-button">
        ⚡ 進化升級 (需 {{ levelUpCost }} HP)
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { attributeEmojiMap, getAttributeSlug } from '../utils/gameHelpers';

const props = defineProps({
  player: Object,
  game: Object
});

const emit = defineEmits(['levelUp']);

const attributeEmoji = computed(() => attributeEmojiMap[props.player?.attribute] || '❓');
const attributeClass = computed(() => `bg-${getAttributeSlug(props.player?.attribute)}`);

const levelUpCost = computed(() => {
  if (!props.player) return 0;
  const costs = { 0: 3, 1: 5, 2: 7 };
  let cost = costs[props.player.level] || 0;
  if (props.player.skills.includes('基因改造')) cost -= 1;
  return cost;
});

const canLevelUp = computed(() => {
  if (!props.player || props.player.level >= 3) return false;
  return props.player.hp >= (28 + levelUpCost.value);
});
</script>

<style scoped>
.player-dashboard {
  background: #f8f9fa; border-radius: 8px; padding: 15px;
  margin-bottom: 15px; border: 1px solid #dee2e6; text-align: left;
  transition: all 0.5s ease;
}
/* ... ( styles will be managed in App.vue or passed down via global CSS for consistency) */
</style>
