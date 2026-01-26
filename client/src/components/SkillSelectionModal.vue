<template>
  <div v-if="active" class="modal-overlay" @click="$emit('cancel')">
    <div class="modal-content" @click.stop>
      <h3>選擇 [{{ skill }}] 的目標</h3>
      <p v-if="!needsAttribute">最多可選擇 {{ maxTargets }} 位玩家。</p>
      <p v-if="oneTime" class="code-warning">此為一次性技能，使用後無法再次使用。</p>
      
      <div v-if="needsAttribute" class="target-list attribute-list">
        <div v-for="attr in ['木', '水', '火', '雷']" :key="attr" 
             class="target-item" :class="{ selected: targetAttribute === attr }" 
             @click="targetAttribute = attr">
          {{ attr }}
        </div>
      </div>
      
      <div v-else class="target-list">
        <div v-for="p in otherPlayers" :key="p._id" 
             class="target-item" :class="{ selected: targets.includes(p._id) }" 
             @click="toggleTarget(p._id)">
          {{ p.name }}
        </div>
      </div>

      <div class="modal-actions">
        <button @click="$emit('cancel')" class="cancel-button">取消</button>
        <button @click="confirm" :disabled="!isReady">確定</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  active: Boolean,
  skill: String,
  maxTargets: Number,
  oneTime: Boolean,
  needsAttribute: Boolean,
  otherPlayers: Array
});

const emit = defineEmits(['cancel', 'confirm']);

const targets = ref([]);
const targetAttribute = ref(null);

const isReady = computed(() => {
  if (props.needsAttribute) return !!targetAttribute.value;
  return targets.value.length > 0;
});

const toggleTarget = (id) => {
  const index = targets.value.indexOf(id);
  if (index > -1) {
    targets.value.splice(index, 1);
  } else if (targets.value.length < props.maxTargets) {
    targets.value.push(id);
  }
};

const confirm = () => {
  emit('confirm', {
    targets: props.needsAttribute ? [targetAttribute.value] : targets.value,
    targetAttribute: props.needsAttribute ? targetAttribute.value : null
  });
  // Reset local state
  targets.value = [];
  targetAttribute.value = null;
};
</script>

<style scoped>
.target-list { max-height: 200px; overflow-y: auto; margin: 15px 0; }
.target-item { padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 5px; cursor: pointer; }
.target-item.selected { background-color: #007bff; color: white; }
.attribute-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.code-warning { color: #dc3545; font-size: 0.85em; font-weight: bold; }
</style>
