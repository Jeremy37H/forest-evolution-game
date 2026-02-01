<script setup>
import { defineProps } from 'vue';

const props = defineProps(['logMessages', 'logContainer']);
</script>

<template>
  <div v-if="logMessages.length > 0" class="log-container" ref="logContainer">
    <div v-for="log in [...logMessages].reverse()" :key="log.id" :class="`log-message log-${log.type}`">
      {{ log.text }}
    </div>
  </div>
</template>

<style scoped>
.log-container {
  margin-top: 15px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
  text-align: left;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
  backdrop-filter: blur(4px);
}

.log-message {
  padding: 6px 10px;
  margin-bottom: 6px;
  border-radius: 6px;
  font-size: 0.9em;
  border-left: 4px solid transparent;
  animation: slide-in 0.3s ease-out;
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}

.log-message:last-child { margin-bottom: 0; }
.log-info { border-left-color: #007bff; background: #eef7ff; color: #0056b3; }
.log-success { border-left-color: #28a745; background: #f1fef4; color: #1e7e34; }
.log-error { border-left-color: #dc3545; background: #fff1f2; color: #a21b24; }
.log-battle { border-left-color: #ffc107; background: #fffbeb; color: #856404; font-weight: bold; }
.log-system { border-left-color: #6c757d; background: #f8f9fa; color: #495057; font-style: italic; }
</style>
