<script setup>
import { ref, onMounted, computed, nextTick, watch } from 'vue';
import axios from 'axios';
import socketService from './socketService.js';

import AdminPanel from './components/AdminPanel.vue';
import GameRules from './components/GameRules.vue';
import AuctionModal from './components/AuctionModal.vue';
import PlayerDashboard from './components/PlayerDashboard.vue';
import SkillSelectionModal from './components/SkillSelectionModal.vue';
import { attributeEmojiMap, getAttributeSlug, isSkillAvailable, calculateHpBreakdown } from './utils/gameHelpers';

const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

// --- UI & Game State ---
const uiState = ref('login'); // 'login', 'rejoin', 'showCode', 'inGame', 'admin'
const showRules = ref(false);
const player = ref(null);
const game = ref(null);
const logMessages = ref([]);
const logContainer = ref(null);
const isHit = ref(false);
const attributeGuesses = ref({});
const auctionTimeLeft = ref(0);
const auctionTimer = ref(null);

// Modal States
const skillTargetSelection = ref({ active: false, skill: '', maxTargets: 1, oneTime: false, needsAttribute: false });
const scoutConfirm = ref({ active: false, target: null });
const hibernateConfirm = ref({ active: false });
const scoutResult = ref(null);

// --- Computed ---
const isDiscussion = computed(() => game.value && game.value.gamePhase.startsWith('discussion'));
const isAttack = computed(() => game.value && game.value.gamePhase.startsWith('attack'));
const isAuction = computed(() => game.value && game.value.gamePhase.startsWith('auction'));
const isFinished = computed(() => game.value && game.value.gamePhase === 'finished');
const isDead = computed(() => player.value && player.value.hp <= 0);

const otherPlayers = computed(() => {
  if (!game.value || !player.value) return [];
  return game.value.players.filter(p => p && p._id !== player.value._id);
});

const hpBreakdown = computed(() => calculateHpBreakdown(player.value, game.value));

const auctionTimeDisplay = computed(() => {
    if (game.value?.auctionState?.status === 'starting') return `${auctionTimeLeft.value}s`;
    const mins = Math.floor(auctionTimeLeft.value / 60);
    const secs = auctionTimeLeft.value % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
});

// --- Methods ---
const addLogMessage = (text, type = 'info') => {
  logMessages.value.push({ id: Date.now(), text, type });
  if (logMessages.value.length > 50) logMessages.value.shift();
  nextTick(() => { if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight; });
};

const handleApiError = (err) => {
  const msg = err.response?.data?.message || err.message || '發生錯誤';
  addLogMessage(msg, 'error');
};

const joinGame = async () => {
  try {
    const res = await axios.post(`${API_URL}/api/game/join`, { gameCode: gameCodeInput.value.toUpperCase(), name: newPlayerName.value });
    player.value = res.data.player;
    game.value = res.data.game;
    localStorage.setItem('forestPlayerCode', player.value.playerCode);
    initSocket();
    uiState.value = 'showCode';
  } catch (err) { handleApiError(err); }
};

const rejoinWithCode = async () => {
  try {
    const res = await axios.post(`${API_URL}/api/game/rejoin`, { playerCode: playerCodeInput.value.toUpperCase() });
    player.value = res.data.player;
    game.value = res.data.game;
    localStorage.setItem('forestPlayerCode', player.value.playerCode);
    initSocket();
    uiState.value = 'inGame';
  } catch (err) { handleApiError(err); }
};

const initSocket = () => {
  socketService.connect(API_URL);
  socketService.emit('joinGame', game.value.gameCode);
};

const levelUp = async () => {
  try {
    const res = await axios.post(`${API_URL}/api/game/action/levelup`, { playerId: player.value._id });
    addLogMessage(res.data.message, 'success');
  } catch (err) { handleApiError(err); }
};

const attackPlayer = async (targetId) => {
  try {
    await axios.post(`${API_URL}/api/game/action/attack`, { gameCode: game.value.gameCode, attackerId: player.value._id, targetId });
  } catch (err) { handleApiError(err); }
};

const handleSkillClick = (skill, targetId = null) => {
  if (skill === '冬眠') return hibernateConfirm.value.active = true;
  if (['劇毒', '荷魯斯之眼'].includes(skill) && targetId) return executeSkill(skill, [targetId]);
  
  // Set up modal for complex skills
  const config = {
    '瞪人': { maxTargets: 2 },
    '森林權杖': { needsAttribute: true },
    '獅子王': { maxTargets: 1 },
    '折翅': { maxTargets: 1, oneTime: true },
    '同病相憐': { maxTargets: 1 },
    '擬態': { maxTargets: 1, oneTime: true },
    '寄生': { maxTargets: 1, oneTime: true }
  }[skill];
  
  if (config) {
    skillTargetSelection.value = { active: true, skill, ...config };
  }
};

const executeSkill = async (skill, targets, targetAttribute = null) => {
  try {
    const res = await axios.post(`${API_URL}/api/game/action/use-skill`, { playerId: player.value._id, skill, targets, targetAttribute });
    addLogMessage(res.data.message, 'system');
  } catch (err) { handleApiError(err); }
};

const scoutPlayer = async (targetId) => {
  try {
    const res = await axios.post(`${API_URL}/api/game/action/scout`, { gameCode: game.value.gameCode, playerId: player.value._id, targetId });
    scoutResult.value = res.data.scoutResult;
    addLogMessage(res.data.message, 'success');
  } catch (err) { handleApiError(err); }
  scoutConfirm.value.active = false;
};

// --- Lifecycle & Watchers ---
const lastLogLen = ref(0);
onMounted(() => {
  const code = localStorage.getItem('forestPlayerCode');
  if (code) { playerCodeInput.value = code; rejoinWithCode(); }

  socketService.on('gameStateUpdate', (updated) => {
    game.value = updated;
    if (updated.gameLog && updated.gameLog.length > lastLogLen.value) {
      updated.gameLog.slice(lastLogLen.value).forEach(log => addLogMessage(log.text, log.type));
      lastLogLen.value = updated.gameLog.length;
    }
    if (player.value) player.value = updated.players.find(p => p._id === player.value._id) || player.value;
  });

  socketService.on('attackResult', (res) => {
    if (player.value && res.targetId === player.value._id && res.type === 'damage') {
      isHit.value = true;
      setTimeout(() => isHit.value = false, 500);
    }
    addLogMessage(res.message, 'battle');
  });
});

watch(() => game.value?.auctionState?.endTime, (newVal) => {
    if (auctionTimer.value) clearInterval(auctionTimer.value);
    if (!newVal) return;
    auctionTimer.value = setInterval(() => {
        const diff = Math.max(0, Math.floor((new Date(newVal).getTime() - Date.now()) / 1000));
        auctionTimeLeft.value = diff;
    }, 500);
});

// UI Inputs
const newPlayerName = ref('');
const gameCodeInput = ref('');
</script>

<template>
  <div id="game-container">
    <GameRules :is-open="showRules" @close="showRules = false" />
    
    <!-- Login / Rejoin -->
    <div v-if="['login', 'rejoin'].includes(uiState)" class="login-screen">
      <button class="admin-top-btn" @click="uiState = 'admin'">⚙️</button>
      <h1>🌱 森林進化論 🔬</h1>
      <div class="login-tabs">
        <button :class="{ active: uiState === 'login' }" @click="uiState = 'login'">建立角色</button>
        <button :class="{ active: uiState === 'rejoin' }" @click="uiState = 'rejoin'">重返大賽</button>
      </div>
      <div class="login-form">
        <input v-if="uiState === 'login'" v-model="gameCodeInput" placeholder="輸入遊戲房號" />
        <input v-if="uiState === 'login'" v-model="newPlayerName" placeholder="你的冒險者稱號" />
        <input v-if="uiState === 'rejoin'" v-model="playerCodeInput" placeholder="輸入專屬重返代碼" />
        <button class="primary-btn" @click="uiState === 'login' ? joinGame() : rejoinWithCode()">進入遊戲</button>
      </div>
      <button class="rules-btn" @click="showRules = true">📖 遊戲規則</button>
    </div>

    <!-- Admin Panel -->
    <AdminPanel v-else-if="uiState === 'admin'" :api-url="API_URL" @back="uiState = 'login'" />

    <!-- Show Code Selection -->
    <div v-else-if="uiState === 'showCode'" class="show-code-box">
      <h2>🎉 報名成功！</h2>
      <p>這是您的專屬代碼。若遊戲意外中斷，請用此代碼重返：</p>
      <div class="code-display">{{ player?.playerCode }}</div>
      <button class="primary-btn" @click="uiState = 'inGame'">我記下了，開打吧！</button>
    </div>

    <!-- Main Game UI -->
    <div v-else-if="game && player" class="game-wrapper" :class="[getAttributeSlug(player.attribute), { 'hit-anim': isHit }]">
      <div v-if="isDead" class="death-overlay">
        <div class="death-content">
          <h1>☠️ 你已經倒下 ☠️</h1>
          <p>很遺憾，競爭是非常殘酷的...</p>
          <button @click="player = null; uiState = 'login'">離開大賽</button>
        </div>
      </div>

      <div class="top-row">
        <h3>回合 {{ game.currentRound }}</h3>
        <div class="top-btns">
            <button class="mini-btn info" @click="showRules = true">❓</button>
            <button class="mini-btn danger" @click="player = null; uiState = 'login'">🚪</button>
        </div>
      </div>

      <PlayerDashboard :player="player" :game="game" @levelUp="levelUp" />

      <!-- Phase Contents -->
      <div class="phase-container">
        <!-- Discussion / Attack List -->
        <div v-if="isDiscussion || isAttack" class="player-list">
          <div v-for="p in otherPlayers" :key="p._id" class="p-card" :class="{ dead: p.hp <= 0 }">
            <div class="p-header">
                <span class="p-n">LV{{ p.level }} <strong>{{ p.name }}</strong></span>
                <span class="p-hp">{{ Math.max(0, p.hp) }} HP</span>
            </div>
            <div class="p-actions">
                <button v-if="isDiscussion && isSkillAvailable('劇毒', player, game.gamePhase)" class="skill-i poison" @click="handleSkillClick('劇毒', p._id)">🧪</button>
                <button v-if="isSkillAvailable('荷魯斯之眼', player, game.gamePhase)" class="skill-i eye" @click="handleSkillClick('荷魯斯之眼', p._id)">👁️</button>
                <button v-if="isDiscussion" class="skill-i scout" @click="scoutConfirm = { active: true, target: p }">🔍</button>
                <button v-if="isAttack" class="attack-btn" :disabled="player.roundStats.hasAttacked || p.hp <= 0" @click="attackPlayer(p._id)">攻擊</button>
            </div>
          </div>
        </div>

        <!-- Quick Skills (Footer style) -->
        <div v-if="(isDiscussion || isAttack) && player.skills.length > 0" class="quick-skills">
            <button v-for="s in player.skills" :key="s" 
                    v-show="isSkillAvailable(s, player, game.gamePhase) && !['劇毒','荷魯斯之眼'].includes(s)"
                    class="q-btn" @click="handleSkillClick(s)">
                {{ s }}
            </button>
        </div>

        <div v-if="isFinished" class="ranking-list">
            <h2>🏆 最終排名</h2>
            <div v-for="(p, i) in [...game.players].sort((a,b) => b.hp - a.hp)" :key="p._id" class="rank-item">
                #{{ i+1 }} {{ p.name }} - {{ Math.max(0, p.hp) }} HP
            </div>
        </div>
      </div>

      <!-- Log Dashboard -->
      <div class="log-view" ref="logContainer">
        <div v-for="l in logMessages" :key="l.id" :class="['l-m', l.type]">{{ l.text }}</div>
      </div>

      <!-- Modals -->
      <AuctionModal v-if="isAuction" :game="game" :player="player" :auction-time-left="auctionTimeLeft" 
                    :auction-time-display="auctionTimeDisplay" :hp-breakdown="hpBreakdown" 
                    :initial-bid-amount="(game.highestBids[game.auctionState?.currentSkill]?.amount || 0) + 1"
                    @placeBid="handlePlaceBid" />

      <SkillSelectionModal :active="skillTargetSelection.active" :skill="skillTargetSelection.skill"
                           :max-targets="skillTargetSelection.maxTargets" :one-time="skillTargetSelection.oneTime"
                           :needs-attribute="skillTargetSelection.needsAttribute" :other-players="otherPlayers"
                           @cancel="skillTargetSelection.active = false" 
                           @confirm="(res) => { executeSkill(skillTargetSelection.skill, res.targets, res.targetAttribute); skillTargetSelection.active = false; }" />

       <!-- Confirm Scout Modal -->
       <div v-if="scoutConfirm.active" class="modal-overlay" @click="scoutConfirm.active = false">
           <div class="modal-content">
               <h3>🔍 確定偵查 {{ scoutConfirm.target?.name }}？</h3>
               <p>將花費 1 HP 取得其屬性筆記。</p>
               <div class="modal-actions">
                   <button @click="scoutConfirm.active = false">取消</button>
                   <button @click="scoutPlayer(scoutConfirm.target._id)">確定</button>
               </div>
           </div>
       </div>

       <!-- Scout Result Modal -->
       <div v-if="scoutResult" class="modal-overlay" @click="scoutResult = null">
           <div class="modal-content">
               <h3>結果：{{ scoutResult.name }}</h3>
               <div class="scout-badge" :class="getAttributeSlug(scoutResult.attribute)">{{ scoutResult.attribute }} {{ attributeEmojiMap[scoutResult.attribute] }}</div>
               <button @click="scoutResult = null" style="margin-top:15px">關閉</button>
           </div>
       </div>
    </div>
  </div>
</template>

<style scoped>
/* Scoped layout only */
#game-container { font-family: 'Inter', sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: #fafafa; }
.login-screen { padding: 40px 20px; text-align: center; }
.login-tabs { display: flex; margin: 20px 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
.login-tabs button { flex: 1; padding: 10px; border-radius: 0; background: #eee; color: #666; }
.login-tabs button.active { background: #007bff; color: white; }
.game-wrapper { flex: 1; display: flex; flex-direction: column; padding: 15px; position: relative; }
.top-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; color: #333; }
.top-btns { display: flex; gap: 8px; }
.mini-btn { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; }
.phase-container { flex: 1; overflow-y: auto; padding-bottom: 80px; }
.p-card { background: rgba(255,255,255,0.9); border-radius: 8px; padding: 12px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.p-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
.p-actions { display: flex; gap: 8px; justify-content: flex-end; }
.skill-i { width: 36px; height: 36px; padding: 0; background: #f0f0f0; border: 1px solid #ccc; font-size: 1.2em; }
.attack-btn { background: #dc3545; color: white; padding: 5px 15px; border-radius: 4px; }
.quick-skills { position: absolute; bottom: 100px; left: 15px; right: 15px; display: flex; gap: 8px; overflow-x: auto; padding: 5px 0; }
.q-btn { background: #fff; border: 1px solid #007bff; color: #007bff; border-radius: 20px; white-space: nowrap; padding: 5px 15px; box-shadow: 0 2px 8px rgba(0,123,255,0.2); }
.log-view { height: 80px; background: rgba(0,0,0,0.05); border-radius: 8px; padding: 10px; overflow-y: auto; font-size: 0.85em; }
.l-m { margin-bottom: 4px; }
.l-m.battle { color: #856404; }
.l-m.error { color: #dc3545; }
.l-m.success { color: #28a745; }
.death-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 500; border-radius: 12px; text-align: center; color: white; }
.code-display { font-size: 2.5em; font-weight: bold; background: #eee; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px dashed #007bff; }
.scout-badge { padding: 10px 20px; border-radius: 20px; font-weight: bold; display: inline-block; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
.scout-badge.wood { background: #4caf50; color: white; }
.scout-badge.water { background: #2196f3; color: white; }
.scout-badge.fire { background: #f44336; color: white; }
.scout-badge.thunder { background: #ffeb3b; color: #333; }
</style>