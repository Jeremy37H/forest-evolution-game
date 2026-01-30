<script setup>
import { defineProps } from 'vue';

const props = defineProps(['game']);
</script>

<template>
  <div class="game-lobby">
    <h2>遊戲代碼: {{ game.gameCode }}</h2>
    <h3>已加入的玩家 ({{ game.players.length }}/{{ game.playerCount }})</h3>
    <ul>
      <li v-for="p in game.players" :key="p._id">{{ p.name }}</li>
    </ul>
  </div>
</template>

<style scoped>
.game-lobby h2 { margin-bottom: 20px; color: #333; }
.game-lobby h3 { font-size: 1.1em; color: #666; margin-bottom: 10px; }
.game-lobby ul { list-style: none; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.game-lobby li { 
    background: white; padding: 10px; border-radius: 8px; 
    box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #eee;
    font-weight: bold; color: #2c3e50;
}
</style>
