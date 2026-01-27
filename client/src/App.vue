<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import axios from 'axios';
import socketService from './socketService.js';

import AdminPanel from './components/AdminPanel.vue';
import GameRules from './components/GameRules.vue';

// --- 霈摰儔 ---
const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

// UI ????
const uiState = ref('login'); // 'login', 'rejoin', 'showCode', 'inGame'
const showRules = ref(false);
const newPlayerName = ref('');
const gameCodeInput = ref('');
const playerCodeInput = ref('');
const skillTargetSelection = ref({ active: false, skill: '', maxTargets: 0, targets: [], targetAttribute: null, oneTime: false, needsAttribute: false });

// ????
const player = ref(null);
const game = ref(null);
const bids = ref({});
const logMessages = ref([]);
const logContainer = ref(null);
const isHit = ref(false); // For attack animation
const socketStatus = ref('Disconnected'); // Debug status
const scoutResult = ref(null);
const scoutConfirm = ref({ active: false, target: null });
const hibernateConfirm = ref({ active: false });
const attributeGuesses = ref({}); // { playerId: '撅祆? }

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
    const activeSkill = game.value.auctionState?.currentSkill;
    const queue = game.value.auctionState?.queue || [];
    
    return game.value.bids
        .filter(b => {
            const isMe = b.playerId === player.value._id || (b.playerId && b.playerId._id === player.value._id);
            // ?芾?蝞?迤?函奎璅???踝????其??葉嚗靘?賡??暸?璅?????
            // 撌脩?蝯????賭????乓??刻????韐振撌脫?文祕??HP嚗撓摰嗅?餈??舐憿漲??
            const isRelevant = (b.skill === activeSkill) || queue.includes(b.skill);
            return isMe && isRelevant;
        })
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

// Helper function to convert attribute to CSS class slug
const getAttributeSlug = (attribute) => {
    const slugMap = {
        '木': 'wood',
        '水': 'water',
        '火': 'fire',
        '雷': 'thunder'
    };
    return slugMap[attribute] || 'default';
};

// 檢查技能是否可用（處於正確階段）
const isSkillAvailable = (skill) => {
    if (!player.value || !game.value) return false;
    
    // 被動技能不需要顯示
    const passiveSkills = ['基因改造', '適者生存', '尖刺', '噴墨', '禿鷹', '嗜血', '龜甲', '獠牙', '斷尾', '腎上腺素'];
    if (passiveSkills.includes(skill)) return false;
    
    // 討論階段一次性技能
    const discussionOneTimeSkills = ['折翅', '擬態', '寄生', '森林權杖'];
    if (discussionOneTimeSkills.includes(skill)) {
        if (isOneTimeSkillUsed(skill)) return false;
        return game.value.gamePhase?.startsWith('discussion');
    }
    
    // 討論階段技能
    const discussionSkills = ['劇毒', '荷魯斯之眼', '冬眠', '瞪人', '獅子王', '同病相憐'];
    if (discussionSkills.includes(skill)) {
        if (!game.value.gamePhase?.startsWith('discussion')) return false;
        
        // 檢查狀態是否已使用
        if (skill === '冬眠') {
            return !(player.value.roundStats?.isHibernating);
        }
        if (skill === '獅子王') {
            return !player.value.roundStats?.minionId;
        }
        // 其他技能檢查 usedSkillsThisRound
        return !player.value.roundStats?.usedSkillsThisRound?.includes(skill);
    }
    
    return false;
};

const hasActiveSkills = computed(() => {
    if (!player.value) return false;
    const activeSkills = ['冬眠', '瞪人', '擬態', '寄生', '森林權杖', '獅子王', '同病相憐'];
    return player.value.skills.some(s => activeSkills.includes(s) && isSkillAvailable(s));
});

// ---- ?啣?嚗奎璅????閮???----
const auctionTimeLeft = ref(0);
const auctionTimer = ref(null);

watch(() => game.value?.auctionState?.endTime, (newVal) => {
    if (newVal) {
        startLocalAuctionTimer();
    }
}, { immediate: true });

function startLocalAuctionTimer() {
    if (auctionTimer.value) clearInterval(auctionTimer.value);
    
    auctionTimer.value = setInterval(() => {
        if (!game.value?.auctionState?.endTime) {
            clearInterval(auctionTimer.value);
            return;
        }
        
        const end = new Date(game.value.auctionState.endTime).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((end - now) / 1000));
        auctionTimeLeft.value = diff;
        
        if (diff <= 0) {
             // 倒數結束，但通常由後端狀態切換
        }
    }, 500);
}

const auctionStatusText = computed(() => {
    if (!game.value?.auctionState) return '';
    const s = game.value.auctionState.status;
    if (s === 'starting') return '拍賣即將開始... 下一輪競標即將進行！';
    if (s === 'active') return '拍賣進行中！玩家正在出價...';
    if (s === 'finished') return '拍賣已結束！正在計算結果...';
    return '';
});

const auctionTimeDisplay = computed(() => {
    if (!game.value?.auctionState) return '0:00';
    if (game.value.auctionState.status === 'starting') return `${auctionTimeLeft.value}s`;
    
    const mins = Math.floor(auctionTimeLeft.value / 60);
    const secs = auctionTimeLeft.value % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
});

const isMyBidHighest = computed(() => {
    if (!game.value?.auctionState?.currentSkill || !player.value) return false;
    const skill = game.value.auctionState.currentSkill;
    const highestAmount = game.value.highestBids?.[skill]?.amount || 0;
    if (highestAmount === 0) return false;
    
    // 檢查最高出價是否由本人發出
    return game.value.bids.some(b => 
        b.skill === skill && 
        b.amount === highestAmount && 
        (b.playerId === player.value._id || b.playerId?._id === player.value._id)
    );
});

const currentHighestBidder = computed(() => {
    if (!game.value?.auctionState?.currentSkill) return '';
    const bidInfo = game.value.highestBids?.[game.value.auctionState.currentSkill];
    return bidInfo ? bidInfo.playerName : '';
});

const hpBreakdown = computed(() => {
    if (!player.value || !game.value?.auctionState?.currentSkill) return null;
    const skill = game.value.auctionState.currentSkill;
    const total = player.value.hp;
    const reserved = 5;
    const activeBid = getMyBidOnSkill(skill);
    const otherBids = Math.max(0, myConfirmedBidsSum.value - activeBid);
    const biddable = Math.max(0, total - reserved - (activeBid + otherBids));
    
    const getPercent = (val) => (val / total) * 100;
    
    return {
        total,
        reserved: { val: reserved, pct: getPercent(reserved) },
        active: { val: activeBid, pct: getPercent(activeBid) },
        other: { val: otherBids, pct: getPercent(otherBids) },
        biddable: { val: biddable, pct: getPercent(biddable) }
    };
});

// ?芸??‵蝡嗆????箸?擃 + 1
watch(() => game.value?.highestBids?.[game.value?.auctionState?.currentSkill], (newVal) => {
    if (game.value?.auctionState?.status === 'active') {
        const skill = game.value.auctionState.currentSkill;
        if (skill) {
            // newVal ?曉??{ amount, playerName } ?拐辣
            bids.value[skill] = (newVal?.amount || 0) + 1;
        }
    }
}, { immediate: true });

// --- ?詨???賢? ---
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
  if (!playerCodeInput.value) return addLogMessage('請輸入您的玩家代碼以恢復連線', 'error');
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
  if (!newPlayerName.value || !gameCodeInput.value) return addLogMessage('請輸入名稱和遊戲代碼', 'error');
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
  try {
    const amount = bids.value[skill];
    
    if (!amount || amount <= 0) return addLogMessage('請輸入有效的投標金額', 'error');

    const res = await axios.post(`${API_URL}/api/game/action/bid`, {
      gameCode: game.value.gameCode,
      playerId: player.value._id,
      skill,
      amount
    });
    addLogMessage(res.data.message, 'success');
  } catch (err) {
    addLogMessage(err.response?.data?.message || err.message, 'error');
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
  const targetSelectionSkills = ['瞪人', '寄生', '森林權杖', '獅子王', '擬態'];
  const directTargetSkills = ['劇毒', '荷魯斯之眼'];
  const oneTimeSkills = ['寄生', '森林權杖', '擬態'];
  
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
      if (skill === '寄生' || skill === '獅子王' || skill === '擬態') maxTargets = 1;

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
    confirmHibernate();
    return;
  }
};

const confirmSkillTargets = () => {
  if (skillTargetSelection.value.needsAttribute && !skillTargetSelection.value.targetAttribute) return addLogMessage('請選擇一個目標屬性', 'error');
  if (!skillTargetSelection.value.needsAttribute && skillTargetSelection.value.targets.length === 0) return addLogMessage('請至少選擇一個目標', 'error');
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


// Scout feature functions
const confirmScout = (target) => {
    scoutConfirm.value = { active: true, target };
};
const cancelScout = () => {
    scoutConfirm.value = { active: false, target: null };
};
const scoutPlayer = async (target) => {
    try {
        const res = await axios.post(`${API_URL}/api/game/action/scout`, {
            gameCode: game.value.gameCode,
            playerId: player.value._id,
            targetId: target._id
        });
        // Show result
        scoutResult.value = res.data.scoutResult;
        addLogMessage(res.data.message, 'success');
    } catch (err) {
        addLogMessage(err.response?.data?.message || err.message, 'error');
    }
    cancelScout();
};

// Hibernate confirmation functions
const confirmHibernate = () => {
    hibernateConfirm.value = { active: true };
};
const cancelHibernate = () => {
    hibernateConfirm.value = { active: false };
};
const executeHibernate = async () => {
    await useSkill('冬眠');
    cancelHibernate();
};

// Attribute Guessing Logic
const cycleGuess = (playerId) => {
    const sequence = [null, '木', '水', '火', '雷'];
    const current = attributeGuesses.value[playerId] || null;
    const currentIndex = sequence.indexOf(current);
    const nextIndex = (currentIndex + 1) % sequence.length;
    attributeGuesses.value[playerId] = sequence[nextIndex];
    
    // Save to localStorage
    localStorage.setItem('attributeGuesses', JSON.stringify(attributeGuesses.value));
};

const getGuessLabel = (playerId) => {
    return attributeGuesses.value[playerId] || '?';
};

// --- Vue ??望?? ---
onMounted(async () => {
  const savedPlayerCode = localStorage.getItem('forestPlayerCode');
  if (savedPlayerCode) {
    playerCodeInput.value = savedPlayerCode;
    await rejoinWithCode();
  }

  const savedGuesses = localStorage.getItem('attributeGuesses');
  if (savedGuesses) {
    try {
        attributeGuesses.value = JSON.parse(savedGuesses);
    } catch (e) {
        console.error('Failed to load guesses', e);
    }
  }

  socketService.connect(API_URL);
  
  // Socket Debug Listeners
  if (socketService.socket) {
      socketService.socket.on('connect', () => {
          console.log('[App] Socket connected:', socketService.socket.id);
          socketStatus.value = `Connected (${socketService.socket.id})`;
          addLogMessage('伺服器連線成功', 'system');
          
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
    
    <!-- ?餃/?? -->
    <!-- ?餃/?? -->
    <div v-if="uiState === 'login' || uiState === 'rejoin'" class="login-container">
      <button class="admin-btn" @click="uiState = 'admin'" title="管理員面板">⚙️</button>
      <h1 class="main-title">豬喵大亂鬥</h1>
      <div class="version-tag">v1.2.2 (Fix)</div>
      
      <button class="rules-btn" @click="showRules = true">📖 遊戲規則</button>
      
      <div class="login-tabs">
        <button :class="{ active: uiState === 'login' }" @click="uiState = 'login'">一般登入</button>
        <button :class="{ active: uiState === 'rejoin' }" @click="uiState = 'rejoin'">重新連線</button>
      </div>
      
      <div v-if="uiState === 'login'" class="login-box animate-fade">
        <input v-model="gameCodeInput" placeholder="輸入遊戲代碼" id="new-game-code" />
        <input v-model="newPlayerName" placeholder="您的角色名稱" id="new-player-name" />
        <button class="action-btn" @click="joinGame">加入遊戲</button>
      </div>
      
      <div v-if="uiState === 'rejoin'" class="login-box animate-fade">
        <input v-model="playerCodeInput" placeholder="輸入您的專屬玩家代碼" id="rejoin-player-code" />
        <button class="action-btn" @click="rejoinWithCode">恢復連線</button>
      </div>
    </div>

    <!-- 蝞∠??∩???-->
    <AdminPanel v-else-if="uiState === 'admin'" :api-url="API_URL" @back="uiState = 'login'" />

    <!-- 顯示玩家代碼 -->
    <div v-else-if="uiState === 'showCode'" class="show-code-box animate-scale">
      <h2>成功加入！</h2>
      <p>這是您的專屬玩家代碼，請截圖或複製保存！</p>
      <div class="player-code-display">{{ player.playerCode }}</div>
      <p class="code-warning">若不慎斷線或重整，需要此代碼才能回來。</p>
      <button class="action-btn" @click="uiState = 'inGame'">我記下來了，進入遊戲</button>
    </div>

    <!-- 遊戲進行中 -->
    <div v-else-if="uiState === 'inGame' && game && player" class="game-wrapper" :class="[playerAttributeClass, { 'hit-animation': isHit }]">
      <!-- 死亡畫面遮罩層 -->
      <div v-if="isDead" class="death-overlay">
        <div class="death-content">
          <h1>💀 你已經死亡了 💀</h1>
          <p>很遺憾，你在這場殘酷的演化中走到了盡頭...</p>
          <div class="death-stats">
              <p>最終等級: {{ player.level }}</p>
              <p>存活輪數: {{ game.currentRound }}</p>
          </div>
          <button @click="logout" class="logout-button death-logout-btn">登出</button>
        </div>
      </div>

      <!-- Hibernate Confirmation Modal -->
      <!-- Hibernate Confirmation Modal -->
      <div v-if="hibernateConfirm.active" class="modal-overlay" @click="cancelHibernate">
        <div class="modal-content" @click.stop>
            <h3>💤 休眠確認</h3>
            <p>您確定要使用 <strong>[休眠]</strong> 嗎？</p>
            <p class="modal-hint">使用後本回合將無法攻擊，無法被攻擊也無法被施放技能。</p>
            <div class="modal-actions">
                <button @click="executeHibernate" class="confirm-button">確定</button>
                <button @click="cancelHibernate" class="cancel-button">取消</button>
            </div>
        </div>
      </div>
      <!-- Scout Result Modal -->
      <div v-if="scoutResult" class="modal-overlay" @click="scoutResult = null">
        <div class="modal-content" @click.stop>
            <h3>🔍 偵察結果</h3>
            <p>玩家 <strong>{{ scoutResult.name }}</strong> 的屬性是：</p>
            <div class="scout-attribute" :class="`bg-${getAttributeSlug(scoutResult.attribute)}`">
                {{ scoutResult.attribute }}
            </div>
            <button @click="scoutResult = null">知道了</button>
        </div>
      </div>
      
      <!-- Scout Confirmation Modal -->
      <div v-if="scoutConfirm.active" class="modal-overlay" @click="cancelScout">
        <div class="modal-content" @click.stop>
            <h3>🔍 偵察確認</h3>
            <p>確定要花費 <strong>1 HP</strong> 偵察 <strong>{{ scoutConfirm.target?.name }}</strong> 的屬性嗎？</p>
            <div class="modal-actions">
                <button @click="cancelScout" class="cancel-button">取消</button>
                <button @click="scoutPlayer(scoutConfirm.target)">確定</button>
            </div>
        </div>
      </div>
      
      <div class="top-bar">
         <button class="rules-btn-small" @click="showRules = true">📖</button>
         <button @click="logout" class="logout-button">登出</button>
      </div>
      <div class="player-dashboard">
        <div class="player-main-info">
          <h3>
            <span class="attribute-icon" :class="playerAttributeClass">{{ attributeEmoji }}</span> 
            {{ player.name }}
          </h3>
          <p class="player-code-info">玩家代碼: {{ player.playerCode }}</p>
        </div>
        <div class="player-stats-grid">
          <div><span>等級</span><strong>{{ player.level }}</strong></div>
          <div><span>HP</span><strong>{{ Math.max(0, player.hp) }}</strong></div>
          <div><span>攻擊</span><strong>{{ player.attack }}</strong></div>
          <div><span>防禦</span><strong>{{ player.defense }}</strong></div>
        </div>
        <div class="player-skills" v-if="player.skills && player.skills.length > 0">
          <strong>技能欄位</strong>
          <div class="skills-tags">
            <span v-for="skill in player.skills" :key="skill" class="skill-tag" :class="{ 'used-skill': isOneTimeSkillUsed(skill), 'blink-available': isSkillAvailable(skill) }" @click="handleSkillClick(skill)">{{ skill }}</span>
          </div>
        </div>
        <div class="levelup-section">
          <button @click="levelUp" :disabled="!levelUpInfo.possible" class="levelup-button">{{ levelUpInfo.message }}</button>
        </div>
        
      </div>
      <hr>
      <div v-if="game.gamePhase === 'waiting'" class="game-lobby">
        <h2>遊戲代碼: {{ game.gameCode }}</h2>
        <h3>已加入玩家 ({{ game.players.length }}/{{ game.playerCount }})</h3>
        <ul>
          <li v-for="p in game.players" :key="p._id">{{ p.name }}</li>
        </ul>
      </div>
      <div v-else-if="isDiscussionPhase" class="discussion-phase">
        <h2>第 {{ game.currentRound }} 回合 - 自由討論</h2>
        <p class="phase-description">等待管理員開始戰鬥階段...</p>
        <div class="player-list">
            <div v-for="p in otherPlayers" :key="p._id" class="player-card">
                <div class="player-info-wrapper">
                  <div class="player-info-line">
                    <span class="player-level">等級: {{ p.level }}</span>
                    <span class="player-name-text">{{ p.name }}</span>
                    <div class="guess-badge" :class="`guess-${getAttributeSlug(attributeGuesses[p._id])}`" @click="cycleGuess(p._id)" title="點擊切換猜測屬性標記">
                        {{ getGuessLabel(p._id) }}
                    </div>
                    <span v-if="p.effects && p.effects.isPoisoned" title="中毒狀態">☠️</span>
                    <span v-if="game.players.some(lion => lion.roundStats.minionId === p._id)" title="被獅子鎖定">🦁</span>
                  </div>
                  <div v-if="p.skills && p.skills.length > 0" class="other-player-skills-tags">
                    <span v-for="skill in p.skills" :key="skill" class="skill-tag-small">{{ skill }}</span>
                  </div>
                </div>
                <div class="player-actions">
                    <button v-if="player.skills.includes('劇毒') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('劇毒'))" @click="handleSkillClick('劇毒', p._id)" class="skill-button poison" title="使用劇毒">中毒</button>
                    <button v-if="player.skills.includes('荷魯斯之眼') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼'))" @click="handleSkillClick('荷魯斯之眼', p._id)" class="skill-button eye" title="使用荷魯斯之眼">偵查</button>
                    <button class="skill-button scout" @click="confirmScout(p)" :disabled="player.hp < 2 || (player.roundStats && player.roundStats.scoutUsageCount >= 2)" title="花費 1 HP 偵察玩家">
                        偵察
                    </button>
                </div>
            </div>
        </div>
        <div v-if="hasActiveSkills" class="active-skill-section">
            <span class="active-skill-label">主動技能</span>
            <div class="active-skill-list">
                <button v-if="player.skills.includes('冬眠')" @click="handleSkillClick('冬眠')" :disabled="player.roundStats && player.roundStats.isHibernating" class="active-skill-button hibernate">冬眠</button>
                <button v-if="player.skills.includes('瞪人')" @click="handleSkillClick('瞪人')" :disabled="player.roundStats && player.roundStats.usedSkillsThisRound.includes('瞪人')" class="active-skill-button stare">瞪人</button>
                <button v-if="player.skills.includes('擬態')" @click="handleSkillClick('擬態')" :disabled="isOneTimeSkillUsed('擬態')" class="active-skill-button mimicry">擬態</button>
                <button v-if="player.skills.includes('寄生')" @click="handleSkillClick('寄生')" :disabled="isOneTimeSkillUsed('寄生')" class="active-skill-button parasite">寄生</button>
                <button v-if="player.skills.includes('森林權杖')" @click="handleSkillClick('森林權杖')" :disabled="isOneTimeSkillUsed('森林權杖')" class="active-skill-button scepter">森林權杖</button>
                <button v-if="player.skills.includes('獅子王')" @click="handleSkillClick('獅子王')" :disabled="player.roundStats && player.roundStats.minionId" class="active-skill-button lion">獅子王</button>
            </div>
        </div>
      </div>
      <div v-else-if="isAttackPhase" class="game-main-content">
        <h2>第 {{ game.currentRound }} 回合 - 攻擊階段</h2>
        <p class="phase-description">選擇一個目標進行攻擊...</p>
        <div class="player-list">
          <div v-for="p in otherPlayers" :key="p._id" class="player-card" :class="{ hibernating: p.roundStats && p.roundStats.isHibernating }">
            <div class="player-info-wrapper">
              <div class="player-info-line">
                <span class="player-level">等級: {{ p.level }}</span>
                <span class="player-name-text">{{ p.name }}</span>
                <div class="guess-badge" :class="`guess-${getAttributeSlug(attributeGuesses[p._id])}`" @click="cycleGuess(p._id)" title="點擊切換猜測屬性標記">
                    {{ getGuessLabel(p._id) }}
                </div>
                <span v-if="p.effects && p.effects.isPoisoned" title="中毒狀態">☠️</span>
                <span v-if="game.players.some(lion => lion.roundStats.minionId === p._id)" title="被獅子鎖定">🦁</span>
              </div>
              <div v-if="p.skills && p.skills.length > 0" class="other-player-skills-tags">
                <span v-for="skill in p.skills" :key="skill" class="skill-tag-small">{{ skill }}</span>
              </div>
            </div>
            <div class="player-actions">
                <button v-if="player.skills.includes('荷魯斯之眼') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼'))" @click="handleSkillClick('荷魯斯之眼', p._id)" class="skill-button eye" title="使用荷魯斯之眼">偵查</button>
                <button 
                @click="attackPlayer(p._id)" 
                :disabled="(player.roundStats && player.roundStats.hasAttacked) || (game.currentRound <= 3 && p.roundStats && p.roundStats.timesBeenAttacked > 0) || (player.roundStats && player.roundStats.isHibernating) || (p.roundStats && p.roundStats.isHibernating)"
                class="attack-button">
                攻擊
                </button>
            </div>
          </div>
        </div>
        <div v-if="hasActiveSkills" class="active-skill-section">
            <span class="active-skill-label">主動技能</span>
            <div class="active-skill-list">
                <button v-if="player.skills.includes('冬眠')" @click="handleSkillClick('冬眠')" :disabled="player.roundStats && player.roundStats.isHibernating" class="active-skill-button hibernate">冬眠</button>
                <button v-if="player.skills.includes('瞪人')" @click="handleSkillClick('瞪人')" :disabled="player.roundStats && player.roundStats.usedSkillsThisRound.includes('瞪人')" class="active-skill-button stare">瞪人</button>
                <button v-if="player.skills.includes('擬態')" @click="handleSkillClick('擬態')" :disabled="isOneTimeSkillUsed('擬態')" class="active-skill-button mimicry">擬態</button>
                <button v-if="player.skills.includes('寄生')" @click="handleSkillClick('寄生')" :disabled="isOneTimeSkillUsed('寄生')" class="active-skill-button parasite">寄生</button>
                <button v-if="player.skills.includes('森林權杖')" @click="handleSkillClick('森林權杖')" :disabled="isOneTimeSkillUsed('森林權杖')" class="active-skill-button scepter">森林權杖</button>
                <button v-if="player.skills.includes('獅子王')" @click="handleSkillClick('獅子王')" :disabled="player.roundStats && player.roundStats.minionId" class="active-skill-button lion">獅子王</button>
            </div>
        </div>
      </div>
      <div v-else-if="isAuctionPhase" class="auction-phase">
        <h2>第 {{ game.currentRound }} 回合 - 競標階段</h2>
        <p class="phase-description">
            所有玩家均可參與技能競標，高價者得：<br>
            <span class="hp-info">您當前可用血量 <strong>{{ remainingHpBase }}</strong> HP</span>
        </p>
        
        <div class="skills-grid-overview">
          <div v-for="(description, skill) in auctionableSkills" :key="skill" 
               class="skill-card-mini" 
               :class="{ 
                 'active': game.auctionState.currentSkill === skill, 
                 'completed': !game.auctionState.queue.includes(skill) && game.auctionState.currentSkill !== skill 
               }">
            <div class="skill-mini-header">
                <h3>{{ skill }}</h3>
                <span v-if="!game.auctionState.queue.includes(skill) && game.auctionState.currentSkill !== skill" class="status-badge-done">已結標</span>
                <span v-else-if="game.auctionState.currentSkill === skill" class="status-badge-live">競標中</span>
                <span v-else class="status-badge-wait">等待中</span>
            </div>
            <p class="skill-mini-desc">{{ description }}</p>
            <div v-if="game.highestBids && game.highestBids[skill]" class="mini-bid-info">
                目前最高 {{ game.highestBids[skill].amount }} HP
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="isFinishedPhase" class="finished-phase">
        <h2>遊戲結束！</h2>
        <p class="phase-description">
            <span v-if="player">
                恭喜您獲得第 <strong style="font-size: 1.5em; color: #d9534f;">{{ game.players.filter(p => p.hp > player.hp).length + 1 }}</strong> 名!
            </span>
            <span v-else>最終排名</span>
        </p>
        <ul class="player-status-list">
          <li v-for="(p, index) in game.players.slice().sort((a, b) => b.hp - a.hp)" :key="p._id" :class="{ 'winner': p.hp === Math.max(...game.players.map(pl => pl.hp)) }">
            <span>{{ game.players.filter(other => other.hp > p.hp).length + 1 }}. {{ p.name }}</span>
            <span class="final-hp">HP: {{ Math.max(0, p.hp) }}</span>
          </li>
        </ul>
      </div>

      <!-- 競標技能模組 -->
      <div v-if="game.auctionState && game.auctionState.status !== 'none'" class="modal-overlay auction-overlay">
        <div class="modal-content auction-modal" :class="{ 'starting-bg': game.auctionState.status === 'starting' }">
          <div class="auction-phase-indicator">
            <span class="pulse-dot" v-if="game.auctionState.status === 'active'"></span>
            競標中 (剩餘 {{ game.auctionState.queue.length + (game.auctionState.status !== 'none' && game.auctionState.status !== 'starting' ? 0 : 0) }} 個)
          </div>
          
          <div class="auction-timer-box" :class="{ 'timer-urgent': auctionTimeLeft < 15 && game.auctionState.status === 'active', 'timer-starting': game.auctionState.status === 'starting' }">
            <span class="timer-label">{{ game.auctionState.status === 'starting' ? '準備開始' : '競標時間' }}</span>
            <div class="timer-value">{{ auctionTimeDisplay }}</div>
          </div>

          <div class="auction-skill-main">
            <div class="skill-title-row">
              <h2>{{ game.auctionState.currentSkill }}</h2>
            </div>
            <p class="auction-skill-description">{{ game.skillsForAuction[game.auctionState.currentSkill] }}</p>
          </div>

          <div class="auction-bid-status" :class="{ 'is-leading-status': isMyBidHighest }">
            <!-- ?湔?曉憭?銝?蝣箔?蝯??瘞游像蝵桐葉 -->
            <span v-if="isMyBidHighest" class="status-deco deco-left">領</span>
            <span v-if="isMyBidHighest" class="status-deco deco-right">先</span>

            <div v-if="game.highestBids && game.highestBids[game.auctionState.currentSkill]" class="highest-bidder">
              <span class="bid-label">目前最高出價者為 <strong>{{ currentHighestBidder }}</strong></span>
              <div class="bid-value-row">
                <div class="bid-value">{{ game.highestBids[game.auctionState.currentSkill].amount }} <span class="hp-unit">HP</span></div>
              </div>
            </div>
            <div v-else class="no-bids-yet">目前尚無人出價</div>
          </div>

          <div class="auction-hp-visual" v-if="hpBreakdown">
            <div class="hp-bar-container">
              <div class="hp-bar-segment reserved" :style="{ width: hpBreakdown.reserved.pct + '%' }" title="保留血量 (5 HP)"></div>
              <div class="hp-bar-segment other" :style="{ width: hpBreakdown.other.pct + '%' }" title="其他技能已投入的血量"></div>
              <div class="hp-bar-segment active" :style="{ width: hpBreakdown.active.pct + '%' }" title="此技能目前出價"></div>
              <div class="hp-bar-segment biddable" :style="{ width: hpBreakdown.biddable.pct + '%' }" title="此技能可加價空間"></div>
            </div>
            <div class="hp-bar-legend">
              <span class="legend-item"><i class="dot reserved"></i> 保留:{{ hpBreakdown.reserved.val }}</span>
              <span class="legend-item" v-if="hpBreakdown.other.val > 0"><i class="dot other"></i> 其他:{{ hpBreakdown.other.val }}</span>
              <span class="legend-item"><i class="dot active"></i> 此標:{{ hpBreakdown.active.val }}</span>
              <span class="legend-item"><i class="dot biddable"></i> 可用:{{ hpBreakdown.biddable.val }}</span>
            </div>
            <div class="hp-visual-footer">
              <span class="hp-total-label">總生命 {{ player.hp }} HP</span>
            </div>
          </div>

          <div class="auction-actions" v-if="game.auctionState.status === 'active'">
            <div class="bid-controls-centered">
              <input type="number" 
                     v-model="bids[game.auctionState.currentSkill]" 
                     :min="(game.highestBids[game.auctionState.currentSkill]?.amount || 0) + 1" 
                     class="auction-bid-input-large" />
              <button @click="placeBid(game.auctionState.currentSkill)" 
                      class="auction-bid-btn-primary" 
                      :disabled="remainingHpBase < 1 && !isMyBidHighest">
                出價
              </button>
            </div>
          </div>
          
          <div class="auction-starting-notice" v-if="game.auctionState.status === 'starting'">
            倒數結束後將開始第一項技能，請準備！
          </div>

          <div class="auction-finished-notice" v-if="game.auctionState.status === 'finished'">
            競標已結束，正在結算成績...
          </div>
        </div>
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
/* --- Global Container --- */
#game-container {
  font-family: 'Outfit', sans-serif;
  width: 95%;
  max-width: 450px; /* Reduced for mobile-first feel on desktop */
  margin: 0;        /* Centered by #app flex */
  padding: 20px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.1);
  border: 1px solid rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  min-height: auto; /* Let content dictate height */
}

/* --- Mobile Responsiveness --- */
@media (max-width: 480px) {
    #game-container {
        width: 100%;
        max-width: 100%;
        border-radius: 0;
        min-height: 100vh;
        border: none;
        padding: 15px;
        margin: 0;
    }
    
    .main-title {
        font-size: 2.2rem !important;
    }
    
    .player-stats-grid {
        grid-template-columns: repeat(2, 1fr) !important;
    }
}

/* --- Login Screen Aesthetics --- */
.main-title {
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
  text-align: center;
  /* Lively Gradient Text */
  background: linear-gradient(to right, #ff416c, #ff4b2b);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: popIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.version-tag {
  text-align: center;
  color: #adb5bd;
  font-size: 0.8rem;
  margin-bottom: 2rem;
  font-weight: 500;
}

.login-box {
  background: transparent;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  animation: slideUp 0.5s ease-out;
}

.login-tabs {
  display: flex;
  background: #f1f3f5;
  padding: 5px;
  border-radius: 16px;
  margin-bottom: 20px;
}

.login-tabs button {
  flex: 1;
  background: transparent;
  color: #868e96;
  padding: 10px;
  font-size: 1rem;
  border-radius: 12px;
  transition: all 0.3s;
}

.login-tabs button.active {
  background: white;
  color: #e91e63;
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
  font-weight: bold;
}

input {
  width: 100%;
  padding: 15px;
  border: 2px solid #f1f3f5;
  border-radius: 16px;
  font-size: 1rem;
  background: #f8f9fa;
  transition: border-color 0.3s, background 0.3s;
  box-sizing: border-box; /* Fix width overflow */
}

input:focus {
  outline: none;
  border-color: #ff4b2b;
  background: white;
}

.action-btn {
  width: 100%;
  padding: 15px;
  background: linear-gradient(45deg, #ff416c, #ff4b2b);
  color: white;
  border: none;
  border-radius: 16px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 5px 15px rgba(255, 75, 43, 0.4);
  box-sizing: border-box;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 75, 43, 0.5);
}

.admin-btn {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 1.5rem;
  opacity: 0.2;
  transition: opacity 0.3s;
}
.admin-btn:hover { opacity: 1; }

.rules-btn {
  width: 100%;
  background: white;
  color: #495057;
  border: 1px solid #dee2e6;
  padding: 10px;
  border-radius: 12px;
  font-weight: 600;
  margin-bottom: 20px;
  transition: all 0.2s;
}
.rules-btn:hover {
  background: #f8f9fa;
  border-color: #ced4da;
}

/* --- Game UI Overrides --- */
.game-wrapper {
  padding: 0;
}

.player-card {
  background: white;
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border: 1px solid #f1f3f5;
  display: flex;
  flex-direction: column;
}

.player-info-wrapper {
  width: 100%;
}

.player-info-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 8px;
}

.player-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
  margin-top: 5px;
}

.skill-button {
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.9rem;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  margin: 0 !important;
}

/* Active Skills Bar */
.active-skill-section {
  background: #f8f9fa;
  border-radius: 16px;
  padding: 10px;
  margin-top: 15px;
  border: none;
}
.active-skill-list {
  justify-content: flex-start;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 5px; /* Scrollbar space */
}
.active-skill-button {
  flex-shrink: 0;
}

/* Animations */
@keyframes popIn {
  0% { opacity: 0; transform: scale(0.5); }
  70% { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* --- Keep Existing Essential Classes (but modernized) --- */
.guess-badge {
  border-radius: 6px;
  font-weight: bold;
}

.log-container {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 10px;
  border: 1px solid #eee;
  max-height: 200px;
}
.log-message {
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 0.9rem;
  padding: 8px 12px;
}

/* Attribute Backgrounds - Refined */
.bg-wood { background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border-color: #a5d6a7; }
.bg-water { background: linear-gradient(135deg, #e3f2fd, #bbdefb); border-color: #90caf9; }
.bg-fire { background: linear-gradient(135deg, #ffebee, #ffcdd2); border-color: #ef9a9a; }
.bg-thunder { background: linear-gradient(135deg, #fffde7, #fff9c4); border-color: #fff59d; }

/* Ensure text is dark and readable on these light backgrounds */
.bg-wood, .bg-water, .bg-fire, .bg-thunder {
    color: #2c3e50;
}

/* Specific button colors for attributes need to be vibrant */
.bg-wood button { background: #4caf50; color: white !important; }
.bg-water button { background: #2196f3; color: white !important; }
.bg-fire button { background: #f44336; color: white !important; }
.bg-thunder button { background: #ffeb3b; color: #333 !important; }

/* Modal and Overlay needed if not in style.css, but they are */

/* Player Status Grid */
.player-stats-grid div {
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    border: none;
    background: #f8f9fa;
}

.player-level { font-weight: 800; color: #333; }
.player-name-text { color: #555; }

</style>