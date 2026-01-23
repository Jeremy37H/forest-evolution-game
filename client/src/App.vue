<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import axios from 'axios';
import socketService from './socketService.js';

import AdminPanel from './components/AdminPanel.vue';
import GameRules from './components/GameRules.vue';

// --- 變數定義 ---
const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

// UI 狀態控制
const uiState = ref('login'); // 'login', 'rejoin', 'showCode', 'inGame'
const showRules = ref(false);
const newPlayerName = ref('');
const gameCodeInput = ref('');
const playerCodeInput = ref('');
const skillTargetSelection = ref({ active: false, skill: '', maxTargets: 0, targets: [], targetAttribute: null, oneTime: false, needsAttribute: false });

// 遊戲狀態
const player = ref(null);
const game = ref(null);
const bids = ref({});
const logMessages = ref([]);
const logContainer = ref(null);
const isHit = ref(false); // For attack animation
const socketStatus = ref('Disconnected'); // Debug status

// --- Computed Properties ---
const attributeEmoji = computed(() => {
  if (!player.value) return '';
  const map = { '木': '🌳', '水': '💧', '火': '🔥', '雷': '⚡️' };
  return map[player.value.attribute] || '';
});

const isDiscussionPhase = computed(() => game.value && game.value.gamePhase.startsWith('discussion'));
const isAttackPhase = computed(() => game.value && game.value.gamePhase.startsWith('attack'));
const isAuctionPhase = computed(() => game.value && game.value.gamePhase.startsWith('auction'));
const isFinishedPhase = computed(() => game.value && game.value.gamePhase === 'finished');
const isDead = computed(() => player.value && player.value.hp <= 0);

const auctionableSkills = computed(() => {
  if (!game.value || !game.value.skillsForAuction) return {};
  if (typeof game.value.skillsForAuction.entries === 'function') {
    return Object.fromEntries(game.value.skillsForAuction.entries());
  }
  return game.value.skillsForAuction;
});

const playerAttributeClass = computed(() => {
    if (!player.value) return '';
    const map = { '木': 'bg-wood', '水': 'bg-water', '火': 'bg-fire', '雷': 'bg-thunder' };
    return map[player.value.attribute] || '';
});

const levelUpInfo = computed(() => {
  if (!player.value || player.value.level >= 3) {
    return { possible: false, message: '已達最高等級' };
  }
  const costs = { 0: 3, 1: 5, 2: 7 };
  let cost = costs[player.value.level];
  if (player.value.skills.includes('基因改造')) {
    cost -= 1;
  }
  const requiredHp = 28 + cost;
  const possible = player.value.hp >= requiredHp;
  return {
    possible,
    message: `升級 LV${player.value.level + 1} (需 ${requiredHp} HP)`,
  };
});

const otherPlayers = computed(() => {
  if (!game.value || !game.value.players || !player.value) return [];
  return game.value.players.filter(p => p && p._id !== player.value._id);
});

const myConfirmedBidsSum = computed(() => {
    if (!game.value || !game.value.bids || !player.value) return 0;
    return game.value.bids
        .filter(b => b.playerId === player.value._id || (b.playerId && b.playerId._id === player.value._id))
        .reduce((sum, b) => sum + b.amount, 0);
});

const remainingHpBase = computed(() => {
    if (!player.value) return 0;
    // Base biddable HP is current HP minus minimum reserve (5) minus ALL confirmed bids
    // However, when re-bidding on a skill, we can "reuse" the HP we already bid on that skill.
    // So the "global" remaining pool is calculated here, and individual validations add back their specific bid.
    return Math.max(0, player.value.hp - 5 - myConfirmedBidsSum.value);
});

const getMyBidOnSkill = (skill) => {
    if (!game.value || !game.value.bids || !player.value) return 0;
    const bid = game.value.bids.find(b => (b.playerId === player.value._id || (b.playerId && b.playerId._id === player.value._id)) && b.skill === skill);
    return bid ? bid.amount : 0;
};

const attributesList = ['木', '水', '火', '雷'];

const isOneTimeSkillUsed = (skill) => {
    return player.value && player.value.usedOneTimeSkills && player.value.usedOneTimeSkills.includes(skill);
};

// --- 核心功能函式 ---
const lastServerLogLength = ref(0);

const addLogMessage = (text, type = 'info') => {
  // Simple deduplication: don't add if identical to the very last message
  if (logMessages.value.length > 0) {
      const lastMsg = logMessages.value[logMessages.value.length - 1];
      if (lastMsg.text === text) return;
  }
  logMessages.value.push({ id: Date.now(), text, type });
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
};

watch(logMessages, () => {
  if (logMessages.value.length > 50) {
    logMessages.value.splice(0, logMessages.value.length - 50);
  }
});

const rejoinWithCode = async () => {
  if (!playerCodeInput.value) return addLogMessage('請輸入您的專屬玩家代碼', 'error');
  try {
    const response = await axios.post(`${API_URL}/api/game/rejoin`, { playerCode: playerCodeInput.value.toUpperCase() });
    player.value = response.data.player;
    game.value = response.data.game;
    localStorage.setItem('forestPlayerCode', player.value.playerCode);
    socketService.connect(API_URL);
    socketService.emit('joinGame', game.value.gameCode);
    uiState.value = 'inGame';
    addLogMessage(`歡迎回來, ${player.value.name}!`, 'success');
  } catch (error) {
    addLogMessage(error.response.data.message, 'error');
  }
};

const joinGame = async () => {
  if (!newPlayerName.value || !gameCodeInput.value) return addLogMessage('請輸入名字和遊戲代碼', 'error');
  try {
    const response = await axios.post(`${API_URL}/api/game/join`, {
      gameCode: gameCodeInput.value.toUpperCase(),
      name: newPlayerName.value,
    });
    player.value = response.data.player;
    game.value = response.data.game;
    localStorage.setItem('forestPlayerCode', player.value.playerCode);
    socketService.connect(API_URL);
    socketService.emit('joinGame', game.value.gameCode);
    uiState.value = 'showCode';
  } catch (error) {
    addLogMessage(error.response.data.message, 'error');
  }
};

const logout = () => {
  localStorage.removeItem('forestPlayerCode');
  player.value = null;
  game.value = null;
  window.location.reload();
};

const attackPlayer = async (targetId) => {
  if (!game.value || !player.value) return;
  try {
    await axios.post(`${API_URL}/api/game/action/attack`, {
      gameCode: game.value.gameCode,
      attackerId: player.value._id,
      targetId: targetId,
    });
  } catch (error) {
    addLogMessage(error.response.data.message, 'error');
  }
};

const placeBid = async (skill) => {
  const amount = bids.value[skill];
  if (!amount || amount <= 0) return addLogMessage('請輸入有效的出價金額！', 'error');
  
  // When placing a new bid, the "cost" is the difference between new amount and old amount.
  // Effectively, we need to check if (remainingHpBase + currentBid) >= newAmount
  const maxAffordableBid = remainingHpBase.value + getMyBidOnSkill(skill);

  if (amount > maxAffordableBid) {
      return addLogMessage(`出價失敗！您的剩餘可用血量不足 (上限 ${maxAffordableBid})`, 'error');
  }

  try {
    const response = await axios.post(`${API_URL}/api/game/action/bid`, {
      gameCode: game.value.gameCode,
      playerId: player.value._id,
      skill: skill,
      amount: amount
    });
    addLogMessage(response.data.message, 'success');
  } catch (error) {
    addLogMessage(error.response.data.message, 'error');
  }
};

const levelUp = async () => {
  if (!player.value) return;
  try {
    const response = await axios.post(`${API_URL}/api/game/action/levelup`, {
      playerId: player.value._id
    });
    addLogMessage(response.data.message, 'success');
  } catch (error) {
    addLogMessage(error.response.data.message, 'error');
  }
};

const useSkill = async (skill, targets = [], targetAttribute = null) => {
  if (!player.value) return;
  try {
    const response = await axios.post(`${API_URL}/api/game/action/use-skill`, {
      playerId: player.value._id,
      skill: skill,
      targets: targets,
      targetAttribute: targetAttribute,
    });
    addLogMessage(response.data.message, 'system');
  } catch (error) {
    if (error.response?.data?.message) {
      addLogMessage(error.response.data.message, 'error');
    } else {
      addLogMessage('使用技能時發生未知錯誤', 'error');
    }
  }
};

const handleSkillClick = (skill, targetId = null) => {
  const targetSelectionSkills = ['瞪人', '寄生', '森林權杖', '獅子王'];
  const directTargetSkills = ['劇毒', '荷魯斯之眼'];
  const oneTimeSkills = ['寄生', '森林權杖'];
  
  if (oneTimeSkills.includes(skill) && isOneTimeSkillUsed(skill)) {
      return addLogMessage(`[${skill}] 技能只能使用一次`, 'error');
  }

  if (directTargetSkills.includes(skill) && targetId) {
    useSkill(skill, [targetId]); 
    return;
  }
  
  if (targetSelectionSkills.includes(skill) && !targetId) {
      let maxTargets = 1;
      let needsAttribute = false;
      if (skill === '瞪人') maxTargets = 2;
      if (skill === '森林權杖') needsAttribute = true;
      if (skill === '寄生' || skill === '獅子王') maxTargets = 1;

      skillTargetSelection.value = { 
          active: true, 
          skill, 
          maxTargets, 
          targets: [], 
          needsAttribute,
          targetAttribute: null,
          oneTime: oneTimeSkills.includes(skill) 
      };
      return;
  }
  
  if (skill === '冬眠') {
    if (confirm('您確定要使用 [冬眠] 嗎？')) {
      useSkill(skill);
    }
    return;
  }
};

const confirmSkillTargets = () => {
  if (skillTargetSelection.value.needsAttribute && !skillTargetSelection.value.targetAttribute) return addLogMessage('請選擇一個目標屬性！', 'error');
  if (!skillTargetSelection.value.needsAttribute && skillTargetSelection.value.targets.length === 0) return addLogMessage('請至少選擇一位目標！', 'error');
  const targets = skillTargetSelection.value.needsAttribute ? [skillTargetSelection.value.targetAttribute] : skillTargetSelection.value.targets;
  const targetAttribute = skillTargetSelection.value.needsAttribute ? skillTargetSelection.value.targetAttribute : null;
  useSkill(skillTargetSelection.value.skill, targets, targetAttribute);
  cancelSkillSelection();
};

const cancelSkillSelection = () => {
  skillTargetSelection.value = { active: false, skill: '', maxTargets: 0, targets: [], targetAttribute: null };
};

const toggleSkillTarget = (targetId) => {
  const index = skillTargetSelection.value.targets.indexOf(targetId);
  if (index > -1) {
    skillTargetSelection.value.targets.splice(index, 1);
  } else {
    if (skillTargetSelection.value.targets.length < skillTargetSelection.value.maxTargets) {
      skillTargetSelection.value.targets.push(targetId);
    } else {
      addLogMessage(`最多只能選擇 ${skillTargetSelection.value.maxTargets} 個目標`, 'error');
    }
  }
};


// Scout feature state
const scoutResult = ref(null);
const scoutPlayer = async (target) => {
    if (!confirm(`確定要花費 1 HP 偵查 ${target.name} 的屬性嗎？(每回合限 2 次)`)) return;
    try {
        const res = await axios.post(`${API_URL}/action/scout`, {
            gameCode: gameCodeInput.value,
            playerId: player.value._id,
            targetId: target._id
        });
        // Show result
        scoutResult.value = res.data.scoutResult;
        addLogMessage(res.data.message, 'success');
    } catch (err) {
        addLogMessage(err.response?.data?.message || err.message, 'error');
    }
};

// --- Vue 生命週期掛鉤 ---
onMounted(async () => {
  const savedPlayerCode = localStorage.getItem('forestPlayerCode');
  if (savedPlayerCode) {
    playerCodeInput.value = savedPlayerCode;
    await rejoinWithCode();
  }

  socketService.connect(API_URL);
  
  // Socket Debug Listeners
  if (socketService.socket) {
      socketService.socket.on('connect', () => {
          console.log('[App] Socket connected:', socketService.socket.id);
          socketStatus.value = `Connected (${socketService.socket.id})`;
          addLogMessage('伺服器連線成功！', 'system');
          
          if (game.value && game.value.gameCode) {
            console.log(`[App] Auto-rejoining room: ${game.value.gameCode}`);
            socketService.emit('joinGame', game.value.gameCode);
          }
      });
      socketService.socket.on('joinedRoom', (code) => {
          console.log(`[App] Successfully joined room: ${code}`);
          socketStatus.value = `Connected (${socketService.socket.id}) | Room: ${code}`;
      });
      socketService.socket.on('disconnect', (reason) => {
          console.log('[App] Socket disconnected:', reason);
          socketStatus.value = 'Disconnected';
          addLogMessage(`伺服器連線中斷 (${reason})`, 'error');
      });
      socketService.socket.on('connect_error', (err) => {
          console.error('[App] Socket connection error:', err);
          socketStatus.value = `Error: ${err.message}`;
      });
  }

  socketService.on('gameStateUpdate', (updatedGame) => {
    const wasAuction = isAuctionPhase.value;
    if (updatedGame && (game.value?.gameCode === updatedGame.gameCode || uiState.value === 'showCode')) {
      game.value = updatedGame;
      if (updatedGame.gameLog) {
          if (updatedGame.gameLog.length < lastServerLogLength.value) {
              lastServerLogLength.value = 0; // Reset if new game or array cleared
          }
          const newLogs = updatedGame.gameLog.slice(lastServerLogLength.value);
          newLogs.forEach(log => {
              addLogMessage(log.text, log.type);
          });
          lastServerLogLength.value = updatedGame.gameLog.length;
      }

      if (player.value) {
        const self = updatedGame.players.find(p => p._id === player.value._id);
        if (self) player.value = self;
      }
      if (wasAuction && updatedGame.gamePhase.startsWith('discussion')) uiState.value = 'inGame';
    }
  });

  socketService.on('attackResult', (result) => { 
      console.log(`[Battle] Attack Result:`, result);
      console.log(`[Battle] My ID: ${player.value?._id} | Target ID: ${result.targetId}`);
      if (player.value && result.targetId && String(result.targetId) === String(player.value._id) && result.type === 'damage') {
          console.log('[Battle] HIT! Triggering animation.');
          isHit.value = true;
          setTimeout(() => isHit.value = false, 500);
      }
      addLogMessage(result.message, 'battle');
  });
  // Auction results are now handled via gameLog sync, so we don't need a separate listener for logging.
});

onUnmounted(() => {
  socketService.disconnect();
});
</script>

<template>
  <div id="game-container">
    <GameRules :is-open="showRules" @close="showRules = false" />
    
    <!-- 登入/重新加入 -->
    <div v-if="uiState === 'login' || uiState === 'rejoin'">
      <button class="admin-btn" @click="uiState = 'admin'" title="管理員登入">⚙️</button>
      <h1>豬喵大亂鬥</h1>
      <button class="rules-btn" @click="showRules = true">📖 遊戲說明</button>
      <div class="login-tabs">
        <button :class="{ active: uiState === 'login' }" @click="uiState = 'login'">建立新角色</button>
        <button :class="{ active: uiState === 'rejoin' }" @click="uiState = 'rejoin'">用代碼重返</button>
      </div>
      <div v-if="uiState === 'login'" class="login-box">
        <input v-model="gameCodeInput" placeholder="輸入遊戲代碼" id="new-game-code" />
        <input v-model="newPlayerName" placeholder="為你的角色命名" id="new-player-name" />
        <button @click="joinGame">加入戰局</button>
      </div>
      <div v-if="uiState === 'rejoin'" class="login-box">
        <input v-model="playerCodeInput" placeholder="輸入你的專屬玩家代碼" id="rejoin-player-code" />
        <button @click="rejoinWithCode">重返戰局</button>
      </div>
    </div>

    <!-- 管理員介面 -->
    <AdminPanel v-else-if="uiState === 'admin'" :api-url="API_URL" @back="uiState = 'login'" />

    <!-- 顯示專屬代碼 -->
    <div v-else-if="uiState === 'showCode'" class="show-code-box">
      <h2>歡迎加入！</h2>
      <p>這是您的專屬重返代碼，請務必截圖或抄寫下來！</p>
      <div class="player-code-display">{{ player.playerCode }}</div>
      <p class="code-warning">關閉或離開此頁面後，您需要此代碼才能回來！</p>
      <button @click="uiState = 'inGame'">我記下了，進入遊戲</button>
    </div>

    <!-- 遊戲主畫面 -->
    <div v-else-if="uiState === 'inGame' && game && player" class="game-wrapper" :class="[playerAttributeClass, { 'hit-animation': isHit }]">
      <!-- 死亡畫面覆蓋層 -->
      <div v-if="isDead" class="death-overlay">
        <div class="death-content">
          <h1>☠️ 你已經死亡 ☠️</h1>
          <p>很遺憾，你在這場殘酷的生存戰中倒下了...</p>
          <div class="death-stats">
              <p>最終等級: {{ player.level }}</p>
              <p>生存回合: {{ game.currentRound }}</p>
          </div>
        </div>
      </div>

      <!-- Scout Result Modal -->
      <div v-if="scoutResult" class="modal-overlay" @click="scoutResult = null">
        <div class="modal-content" @click.stop>
            <h3>🔍 偵查結果</h3>
            <p>玩家 <strong>{{ scoutResult.name }}</strong> 的屬性是：</p>
            <div class="scout-attribute" :class="`bg-${getAttributeSlug(scoutResult.attribute)}`">
                {{ scoutResult.attribute }}
            </div>
            <button @click="scoutResult = null">好的</button>
        </div>
      </div>
      
      <div class="top-bar">
         <button class="rules-btn-small" @click="showRules = true">📖</button>
         <button @click="logout" class="logout-button">離開</button>
      </div>
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
            <span v-for="skill in player.skills" :key="skill" class="skill-tag" :class="{ 'used-skill': isOneTimeSkillUsed(skill) }" @click="handleSkillClick(skill)">{{ skill }}</span>
          </div>
        </div>
        <div class="levelup-section">
          <button @click="levelUp" :disabled="!levelUpInfo.possible" class="levelup-button">{{ levelUpInfo.message }}</button>
        </div>
        
      </div>
      <hr>
      <div v-if="game.gamePhase === 'waiting'" class="game-lobby">
        <h2>遊戲代碼: {{ game.gameCode }}</h2>
        <h3>已加入的玩家 ({{ game.players.length }}/{{ game.playerCount }})</h3>
        <ul>
          <li v-for="p in game.players" :key="p._id">{{ p.name }}</li>
        </ul>
      </div>
      <div v-else-if="isDiscussionPhase" class="discussion-phase">
        <h2>第 {{ game.currentRound }} 回合 - 自由討論</h2>
        <p class="phase-description">等待管理員開始攻擊階段...</p>
        <div class="player-list">
            <div v-for="p in otherPlayers" :key="p._id" class="player-card">
                <span class="player-name">
                  {{ p.name }}
                  <span v-if="p.effects && p.effects.isPoisoned" title="中毒中">🤢</span>
                  <span v-if="game.players.some(lion => lion.roundStats.minionId === p._id)" title="獅子王的手下">🛡️</span>
                </span>
                <div class="player-actions">
                    <button v-if="player.skills.includes('劇毒') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('劇毒'))" @click="handleSkillClick('劇毒', p._id)" class="skill-button poison" title="使用劇毒">下毒</button>
                    <button v-if="player.skills.includes('荷魯斯之眼') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼'))" @click="handleSkillClick('荷魯斯之眼', p._id)" class="skill-button eye" title="使用荷魯斯之眼">查看</button>
                    <button class="skill-button scout" @click="scoutPlayer(p)" :disabled="player.hp < 2 || (player.roundStats && player.roundStats.scoutUsageCount >= 2)" title="花費 1 HP 偵查屬性">
                        🔍 偵查
                    </button>
                </div>
            </div>
        </div>
        <div class="active-skill-section">
            <button v-if="player.skills.includes('冬眠')" @click="handleSkillClick('冬眠')" :disabled="player.roundStats && player.roundStats.isHibernating" class="active-skill-button hibernate">冬眠</button>
            <button v-if="player.skills.includes('瞪人')" @click="handleSkillClick('瞪人')" :disabled="player.roundStats && player.roundStats.usedSkillsThisRound.includes('瞪人')" class="active-skill-button stare">瞪人</button>
            <button v-if="player.skills.includes('寄生')" @click="handleSkillClick('寄生')" :disabled="isOneTimeSkillUsed('寄生')" class="active-skill-button parasite">寄生</button>
            <button v-if="player.skills.includes('森林權杖')" @click="handleSkillClick('森林權杖')" :disabled="isOneTimeSkillUsed('森林權杖')" class="active-skill-button scepter">森林權杖</button>
            <button v-if="player.skills.includes('獅子王')" @click="handleSkillClick('獅子王')" :disabled="player.roundStats && player.roundStats.minionId" class="active-skill-button lion">指定手下</button>
        </div>
      </div>
      <div v-else-if="isAttackPhase" class="game-main-content">
        <h2>第 {{ game.currentRound }} 回合 - 攻擊階段</h2>
        <p class="phase-description">等待管理員結束攻擊階段...</p>
        <div class="player-list">
          <div v-for="p in otherPlayers" :key="p._id" class="player-card" :class="{ hibernating: p.roundStats && p.roundStats.isHibernating }">
            <span class="player-name">
              {{ p.name }}
              <span v-if="p.effects && p.effects.isPoisoned" title="中毒中">🤢</span>
              <span v-if="game.players.some(lion => lion.roundStats.minionId === p._id)" title="獅子王的手下">🛡️</span>
            </span>
            <span class="player-stats">等級: {{ p.level }}</span>
            <div class="player-actions">
                <button v-if="player.skills.includes('荷魯斯之眼') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼'))" @click="handleSkillClick('荷魯斯之眼', p._id)" class="skill-button eye" title="使用荷魯斯之眼">查看</button>
                <button 
                @click="attackPlayer(p._id)" 
                :disabled="(player.roundStats && player.roundStats.hasAttacked) || (game.currentRound <= 3 && p.roundStats && p.roundStats.timesBeenAttacked > 0) || (player.roundStats && player.roundStats.isHibernating) || (p.roundStats && p.roundStats.isHibernating)"
                class="attack-button">
                攻擊
                </button>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="isAuctionPhase" class="auction-phase">
        <h2>第 {{ game.currentRound }} 回合 - 競標階段</h2>
        <p class="phase-description">
            等待管理員結算競標... <br>
            <span class="hp-info">當前可用血量: <strong>{{ remainingHpBase }}</strong> (已扣除現有出價)</span>
        </p>
        <div class="skills-list">
          <div v-for="(description, skill) in auctionableSkills" :key="skill" class="skill-card">
            <div class="skill-header">
                <h3>{{ skill }}</h3>
                <span v-if="game.highestBids && game.highestBids[skill]" class="highest-bid-badge">
                    最高: {{ game.highestBids[skill] }} HP
                </span>
            </div>
            <p class="skill-description">{{ description }}</p>
            <div class="bid-action">
              <input type="number" v-model="bids[skill]" placeholder="出價 (HP)" class="bid-input" :id="`bid-input-${skill}`" />
              <button @click="placeBid(skill)" class="bid-button" :disabled="remainingHpBase + getMyBidOnSkill(skill) < 1">競標</button>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="isFinishedPhase" class="finished-phase">
        <h2>遊戲結束！</h2>
        <p class="phase-description">
            <span v-if="player">
                恭喜你獲得第 <strong style="font-size: 1.5em; color: #d9534f;">{{ game.players.filter(p => p.hp > player.hp).length + 1 }}</strong> 名!!
            </span>
            <span v-else>最終血量排名</span>
        </p>
        <ul class="player-status-list">
          <li v-for="(p, index) in game.players.slice().sort((a, b) => b.hp - a.hp)" :key="p._id" :class="{ 'winner': p.hp === Math.max(...game.players.map(pl => pl.hp)) }">
            <span>{{ game.players.filter(other => other.hp > p.hp).length + 1 }}. {{ p.name }}</span>
            <span class="final-hp">HP: {{ Math.max(0, p.hp) }}</span>
          </li>
        </ul>
      </div>
      <div v-if="logMessages.length > 0" class="log-container" ref="logContainer">
        <div v-for="log in logMessages" :key="log.id" :class="`log-message log-${log.type}`">{{ log.text }}</div>
      </div>
      <div v-if="skillTargetSelection.active" class="modal-overlay">
        <div class="modal-content">
          <h3>選擇 [{{ skillTargetSelection.skill }}] 的目標</h3>
          <p v-if="!skillTargetSelection.needsAttribute">最多可選擇 {{ skillTargetSelection.maxTargets }} 位玩家。</p>
          <p v-if="skillTargetSelection.oneTime" class="code-warning">此為一次性技能，使用後無法再次使用。</p>
          <div v-if="skillTargetSelection.needsAttribute" class="target-list attribute-list">
              <div v-for="attr in attributesList" :key="attr" class="target-item" :class="{ selected: skillTargetSelection.targetAttribute === attr }" @click="skillTargetSelection.targetAttribute = attr">{{ attr }}</div>
          </div>
          <div v-else class="target-list">
            <div v-for="p in otherPlayers" :key="p._id" class="target-item" :class="{ selected: skillTargetSelection.targets.includes(p._id) }" @click="toggleSkillTarget(p._id)">
              {{ p.name }}
            </div>
          </div>
          <div class="modal-actions">
            <button @click="cancelSkillSelection" class="cancel-button">取消</button>
            <button @click="confirmSkillTargets" :disabled="skillTargetSelection.targets.length === 0 && !skillTargetSelection.targetAttribute">確定</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- 整體樣式 --- */
#game-container {
  font-family: Arial, sans-serif; max-width: 400px; margin: 20px auto;
  padding: 20px; border: 1px solid #ccc; border-radius: 8px;
  text-align: center; position: relative; display: flex; flex-direction: column;
  transition: background 0.5s ease; /* For smooth transitions */
}

.game-wrapper {
  /* To ensure background covers the area effectively if needed, though applied to container usually */
  border-radius: 8px;
  padding: 10px;
  transition: all 0.3s;
}

/* Attribute Backgrounds */
.bg-wood {
    background: linear-gradient(135deg, #e8f5e9 0%, #a5d6a7 50%, #e8f5e9 100%);
    background-size: 200% 200%;
    animation: sway 8s ease-in-out infinite;
    box-shadow: inset 0 0 20px #81c784;
}
.bg-water {
    background: linear-gradient(135deg, #e3f2fd 0%, #90caf9 50%, #e3f2fd 100%);
    background-size: 200% 200%;
    animation: flow 10s linear infinite;
    box-shadow: inset 0 0 20px #64b5f6;
}
.bg-fire {
    /* Stronger contrast but still pastel: Pale Yellow -> Salmon -> Light Orange */
    background: linear-gradient(45deg, #fff59d, #ffab91, #ffcc80);
    background-size: 200% 200%;
    animation: fire-pulse 2s ease-in-out infinite;
    box-shadow: inset 0 0 30px #ff8a65; /* Deeper orange glow */
}
/* Ensure inner white boxes stay white and readable */
.bg-fire .player-dashboard, 
.bg-fire .game-lobby li, 
.bg-fire .player-card,
.bg-fire .skill-card,
.bg-fire .log-message {
    background-color: rgba(255, 255, 255, 0.95);
    color: #333; /* Enforce dark text */
}
.bg-fire input, .bg-fire button {
    z-index: 2; /* Ensure inputs are above background */
    position: relative;
    background-color: #fff; /* Force white background for inputs */
    color: #333;
}
.bg-fire button {
    background-color: #ffb74d; /* Use orange for buttons in fire mode for visibility */
    color: white;
}
.bg-thunder {
    background: linear-gradient(135deg, #ffee58 0%, #fdd835 50%, #fbc02d 100%);
    background-size: 200% 200%;
    animation: shock 3s steps(5) infinite;
    box-shadow: inset 0 0 20px #f9a825;
}

/* Animations */
@keyframes sway {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
@keyframes flow {
    0% { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
}
@keyframes fire-pulse {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
@keyframes shock {
    0% { background-position: 0% 0%; }
    20% { background-position: 100% 0%; }
    40% { background-position: 0% 100%; }
    60% { background-position: 100% 100%; }
    80% { background-position: 50% 50%; }
    100% { background-position: 0% 0%; }
}

/* Icon Animations */
.attribute-icon {
    display: inline-block;
    font-size: 1.2em;
    margin-right: 5px;
    transition: all 0.3s;
}
.attribute-icon.bg-wood { animation: sway-icon 3s ease-in-out infinite; background: none; box-shadow: none; }
.attribute-icon.bg-water { animation: bounce-icon 2s ease-in-out infinite; background: none; box-shadow: none; }
.attribute-icon.bg-fire { animation: pulse-icon 1.5s ease-in-out infinite; background: none; box-shadow: none; }
.attribute-icon.bg-thunder { animation: shake-icon 0.5s linear infinite; background: none; box-shadow: none; }

@keyframes sway-icon { 0%, 100% { transform: rotate(-10deg); } 50% { transform: rotate(10deg); } }
@keyframes bounce-icon { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes pulse-icon { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.8; } }
@keyframes shake-icon { 0% { transform: translate(1px, 1px) rotate(0deg); } 20% { transform: translate(-1px, -1px) rotate(10deg); } 40% { transform: translate(1px, -1px) rotate(-10deg); } 60% { transform: translate(-1px, 1px) rotate(0deg); } 100% { transform: translate(0, 0); } }

/* Attack Animation */
.hit-animation {
    animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
    background-color: #ffcdd2 !important; /* Flash red override */
    border: 2px solid red;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-4px, 0, 0); }
  20%, 80% { transform: translate3d(6px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-8px, 0, 0); }
  40%, 60% { transform: translate3d(8px, 0, 0); }
}

input, button {
  display: block; width: 80%; padding: 10px; margin: 10px auto;
  border: 1px solid #ccc; border-radius: 4px; font-size: 1em;
}
button { background-color: #28a745; color: white; border: none; cursor: pointer; }
button:hover { background-color: #218838; }
hr { margin: 15px 0; border: 0; border-top: 1px solid #eee; }

/* --- 登入介面 --- */
.login-tabs { display: flex; margin-bottom: 20px; }
.login-tabs button { flex: 1; margin: 0; border-radius: 0; background-color: #f0f0f0; color: #333; }
.login-tabs button.active { background-color: #007bff; color: white; }

/* --- 顯示代碼畫面 --- */
.show-code-box .player-code-display {
  font-size: 2.5em; font-weight: bold; letter-spacing: 5px; background-color: #eee;
  padding: 20px; margin: 20px 0; border-radius: 8px; border: 2px dashed #ccc;
}
.show-code-box .code-warning { color: #dc3545; font-weight: bold; }

/* --- 個人儀表板樣式 --- */
.player-dashboard {
  background: #f8f9fa; border-radius: 8px; padding: 15px;
  margin-bottom: 15px; border: 1px solid #dee2e6; text-align: left;
}
.player-main-info h3 { margin: 0 0 5px 0; font-size: 1.5em; display: flex; align-items: center; justify-content: center; }
.player-code-info { font-size: 0.8em; color: #6c757d; margin-top: -5px; }
.socket-status-debug { font-size: 0.7em; color: #999; margin-top: 2px; }
.player-stats-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
  text-align: center; margin: 15px 0;
}
.player-stats-grid div { background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #eee; }
.player-stats-grid span { display: block; font-size: 0.8em; color: #6c757d; }
.player-stats-grid strong { font-size: 1.2em; color: #007bff; }
.player-skills {
  font-size: 0.9em; color: #333; margin-top: 10px;
  padding-top: 10px; border-top: 1px solid #eee; word-wrap: break-word;
}
.player-skills strong { margin-right: 8px; }
.skills-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.skill-tag {
  background-color: #e9ecef; color: #495057; padding: 3px 8px;
  border-radius: 10px; font-size: 0.8em; cursor: pointer;
}
.skill-tag:hover { background-color: #ced4da; }
.skill-tag.used-skill {
    opacity: 0.5;
    text-decoration: line-through;
    cursor: not-allowed;
}

.levelup-button {
  width: 100%; margin: 10px auto 0; background-color: #ffc107; color: #212529;
}
.levelup-button:disabled { background-color: #e9ecef; color: #6c757d; cursor: not-allowed; }
.levelup-button:not(:disabled):hover { background-color: #e0a800; }

/* --- 遊戲內通用樣式 --- */
/* --- Top Bar & Game Buttons --- */
.top-bar {
  display: flex; justify-content: flex-end; align-items: center; margin-bottom: 10px; gap: 10px;
}
.logout-button {
  background-color: #dc3545;
  font-size: 0.8em; padding: 5px 10px; width: auto; margin: 0;
}
.rules-btn {
  background-color: #17a2b8; color: white; width: 60%; margin: 0 auto 15px; display: block;
}
.rules-btn:hover { background-color: #138496; }
.rules-btn-small {
  background-color: #17a2b8; width: auto; margin: 0; padding: 5px 10px; font-size: 0.8em;
}
.logout-button:hover { background-color: #c82333; }
.game-lobby ul, .player-list, .player-status-list { list-style: none; padding: 0; }
.game-lobby li, .player-card, .player-status-list li {
  background-color: #f4f4f4; padding: 10px; margin-top: 8px; border-radius: 4px;
  display: flex; justify-content: space-between; align-items: center;
}
.player-card.hibernating { background-color: #e9ecef; opacity: 0.6; }
.player-card.hibernating .player-name::after {
  content: ' (冬眠中)'; color: #6c757d; font-style: italic; font-size: 0.9em; margin-left: 5px;
}
.player-actions { display: flex; gap: 5px; }
.attack-button { width: auto; margin: 0; }
.attack-button:disabled { background-color: #cccccc; color: #666666; cursor: not-allowed; }
.admin-corner { margin-top: 20px; }
.phase-description { color: #6c757d; margin-bottom: 15px; }

.skill-button {
  padding: 3px 8px; font-size: 0.8em; width: auto; margin: 0;
}
.skill-button.poison { background-color: #9c27b0; }
.skill-button.poison:hover { background-color: #7b1fa2; }
.skill-button.eye { background-color: #03a9f4; }
.skill-button.eye:hover { background-color: #0288d1; }
.active-skill-button {
    width: auto;
    padding: 8px 12px;
    margin: 0;
    font-size: 0.9em;
    background-color: #007bff;
    color: white;
}
.active-skill-button.hibernate { background-color: #6c757d; }
.active-skill-button.stare { background-color: #ffc107; color: #212529; }
.active-skill-button.parasite { background-color: #20c997; }
.active-skill-button.scepter { background-color: #dc3545; }
.active-skill-button.lion { background-color: #fd7e14; }
.active-skill-button.lion:hover { background-color: #e36802; }
.skill-button.scout { background-color: #6c757d; font-size: 0.9em; padding: 2px 8px; margin-left: 5px; }
.skill-button.scout:hover { background-color: #5a6268; }

/* --- 競標畫面 --- */
.auction-phase h2 { margin-bottom: 10px; }
.skills-list { display: flex; flex-direction: column; gap: 15px; }
.skill-card {
  background-color: #f8f9fa; border: 1px solid #dee2e6;
  border-radius: 8px; padding: 15px; text-align: left;
}
.skill-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
}
.skill-card h3 { margin: 0; }
.highest-bid-badge {
    font-size: 0.9em;
    font-weight: bold;
    color: #28a745;
    background-color: #e8f5e9;
    padding: 2px 8px;
    border-radius: 12px;
}
.skill-description { min-height: 40px; margin: 5px 0 10px; }
.bid-action { display: flex; margin-top: 10px; }
.bid-input { width: 60%; margin: 0; text-align: center; }
.bid-button { width: 40%; margin: 0 0 0 10px; background-color: #ffc107; color: #212529; }
.bid-button:hover { background-color: #e0a800; }
.end-auction-button { background-color: #007bff; }
.end-auction-button:hover { background-color: #0069d9; }
.end-game-button { background-color: #17a2b8; }
.end-game-button:hover { background-color: #138496; }

/* --- 結束畫面 --- */
.finished-phase .winner { background-color: #fff3cd; border: 2px solid #ffc107; }
.finished-phase .winner .final-hp { font-weight: bold; color: #856404; }

/* --- 訊息紀錄 --- */
.log-container {
  margin-top: 20px; border-top: 2px solid #eee; padding-top: 10px;
  max-height: 150px; overflow-y: auto; text-align: left;
  display: flex; flex-direction: column;
}
.log-message {
  background-color: #f8f9fa; padding: 5px 10px; margin-bottom: 5px;
  border-radius: 4px; font-size: 0.9em; animation: fade-in 0.3s ease;
}
.log-message.log-success { color: #155724; background-color: #d4edda; }
.log-message.log-error { color: #721c24; background-color: #f8d7da; }
.log-message.log-battle { color: #856404; background-color: #fff3cd; }
.log-message.log-system { color: #0c5460; background-color: #d1ecf1; font-weight: bold; }
@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* --- 技能目標選擇彈窗 --- */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0,0,0,0.5); display: flex;
  justify-content: center; align-items: center; z-index: 100;
}
.modal-content {
  background-color: white; padding: 20px; border-radius: 8px;
  width: 90%; max-width: 350px;
}
.target-list { max-height: 200px; overflow-y: auto; margin: 15px 0; }
.target-item {
  padding: 10px; border: 1px solid #ddd; border-radius: 4px;
  margin-bottom: 5px; cursor: pointer;
}
.target-item.selected {
  background-color: #007bff; color: white; border-color: #007bff;
}
.modal-actions {
  display: flex; justify-content: space-between; margin-top: 20px;
}
.modal-actions button { width: 48%; margin: 0; }
.modal-actions .cancel-button { background-color: #6c757d; }
.modal-actions .cancel-button:hover { background-color: #5a6268; }
.admin-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: transparent;
  color: #333;
  width: auto;
  margin: 0;
  padding: 5px;
  font-size: 1.5em;
  border: none;
  z-index: 10;
}
.admin-btn:hover {
  background-color: transparent;
  transform: scale(1.2);
}

/* --- 技能歷史列表 --- */
.history-list {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.history-item {
  background: #f8f9fa;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #dee2e6;
}
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
  border-bottom: 1px solid #eee;
  padding-bottom: 5px;
}
.history-header strong {
  font-size: 1.1em;
  color: #007bff;
}
.round-badge {
  background-color: #6c757d;
  color: white;
  font-size: 0.8em;
  padding: 2px 6px;
  border-radius: 10px;
}
.history-item p {
  margin: 5px 0 0;
  font-size: 0.95em;
  color: #333;
}

/* --- 死亡畫面 --- */
.death-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.85);
  z-index: 50; /* 高於一般介面，但低於 Modal Overlay (100) */
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  color: white;
}
.death-content {
  text-align: center;
  padding: 20px;
}
.death-content h1 {
  color: #dc3545;
  font-size: 2em;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px #000;
}
.death-stats {
  margin: 20px 0;
  padding: 10px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}
.spectator-hint {
  font-size: 0.9em;
  color: #ccc;
  font-style: italic;
  margin-top: 20px;
}
</style>