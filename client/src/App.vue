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
const scoutResult = ref(null);
const scoutConfirm = ref({ active: false, target: null });
const hibernateConfirm = ref({ active: false });
const attributeGuesses = ref({}); // { playerId: '屬性' }

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
            // 只計算目前正在競標的技能，或還在佇列中（未來可能開放預標）的技能
            // 已經結標的技能不再計入「佔用血量」，因為贏家已扣除實際 HP，輸家則返還可用額度。
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

// 判斷技能是否可用（用於閃爍提醒）
const isSkillAvailable = (skill) => {
    if (!player.value || !game.value) return false;
    
    // 被動技能不需要閃爍提醒
    const passiveSkills = ['基因改造', '適者生存', '尖刺', '嗜血', '龜甲', '兩棲', '禿鷹', '斷尾'];
    if (passiveSkills.includes(skill)) return false;
    
    // 討論階段一次性技能
    const discussionOneTimeSkills = ['寄生', '擬態'];
    if (discussionOneTimeSkills.includes(skill)) {
        if (isOneTimeSkillUsed(skill)) return false;
        return game.value.gamePhase?.startsWith('discussion');
    }
    
    // 攻擊階段一次性技能
    if (skill === '森林權杖') {
        if (isOneTimeSkillUsed(skill)) return false;
        return game.value.gamePhase?.startsWith('attack');
    }
    
    // 討論階段技能
    const discussionSkills = ['劇毒', '荷魯斯之眼', '冬眠', '瞪人', '獅子王'];
    if (discussionSkills.includes(skill)) {
        if (!game.value.gamePhase?.startsWith('discussion')) return false;
        
        // 檢查本回合是否已使用
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
    const activeSkills = ['冬眠', '瞪人', '擬態', '寄生', '森林權杖', '獅子王'];
    // 只要有任何一個底部區域顯示的技能目前是「可用」狀態，就顯示該區域
    return player.value.skills.some(s => activeSkills.includes(s) && isSkillAvailable(s));
});

// ---- 新增：競標相關狀態與計時器 ----
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
             // 倒數結束，等待伺服器廣播新狀態
        }
    }, 500);
}

const auctionStatusText = computed(() => {
    if (!game.value?.auctionState) return '';
    const s = game.value.auctionState.status;
    if (s === 'starting') return '準備中...一場激烈的競標即將開始！';
    if (s === 'active') return '競標開始！目前的出價如下...';
    if (s === 'finished') return '競標結束！正在準備揭曉得標者...';
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
    
    // 檢查目前最高出價是否由本人投出
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

// 自動預填競標金額為最高價 + 1
watch(() => game.value?.highestBids?.[game.value?.auctionState?.currentSkill], (newVal) => {
    if (game.value?.auctionState?.status === 'active') {
        const skill = game.value.auctionState.currentSkill;
        if (skill) {
            // newVal 現在是 { amount, playerName } 物件
            bids.value[skill] = (newVal?.amount || 0) + 1;
        }
    }
}, { immediate: true });

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
  try {
    const amount = bids.value[skill];
    
    if (!amount || amount <= 0) return addLogMessage('請輸入有效的競標金額', 'error');

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

// --- Vue 生命週期掛鉤 ---
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
          <button @click="logout" class="logout-button death-logout-btn">離開</button>
        </div>
      </div>

      <!-- Hibernate Confirmation Modal -->
      <div v-if="hibernateConfirm.active" class="modal-overlay" @click="cancelHibernate">
        <div class="modal-content" @click.stop>
            <h3>💤 冬眠確認</h3>
            <p>您確定要使用 <strong>[冬眠]</strong> 嗎？</p>
            <p class="modal-hint">使用後將跳過攻擊階段，無法攻擊與被攻擊。</p>
            <div class="modal-actions">
                <button @click="executeHibernate" class="confirm-button">確定</button>
                <button @click="cancelHibernate" class="cancel-button">取消</button>
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
      
      <!-- Scout Confirmation Modal -->
      <div v-if="scoutConfirm.active" class="modal-overlay" @click="cancelScout">
        <div class="modal-content" @click.stop>
            <h3>🔍 偵查確認</h3>
            <p>確定要花費 <strong>1 HP</strong> 偵查 <strong>{{ scoutConfirm.target?.name }}</strong> 的屬性嗎？</p>
            <div class="modal-actions">
                <button @click="cancelScout" class="cancel-button">取消</button>
                <button @click="scoutPlayer(scoutConfirm.target)">確定</button>
            </div>
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
                <div class="player-info-wrapper">
                  <div class="player-info-line">
                    <span class="player-level">等級: {{ p.level }}</span>
                    <span class="player-name-text">{{ p.name }}</span>
                    <div class="guess-badge" :class="`guess-${getAttributeSlug(attributeGuesses[p._id])}`" @click="cycleGuess(p._id)" title="點擊切換屬性猜測筆記">
                        {{ getGuessLabel(p._id) }}
                    </div>
                    <span v-if="p.effects && p.effects.isPoisoned" title="中毒中">🤢</span>
                    <span v-if="game.players.some(lion => lion.roundStats.minionId === p._id)" title="獅子王的手下">🛡️</span>
                  </div>
                  <div v-if="p.skills && p.skills.length > 0" class="other-player-skills-tags">
                    <span v-for="skill in p.skills" :key="skill" class="skill-tag-small">{{ skill }}</span>
                  </div>
                </div>
                <div class="player-actions">
                    <button v-if="player.skills.includes('劇毒') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('劇毒'))" @click="handleSkillClick('劇毒', p._id)" class="skill-button poison" title="使用劇毒">下毒</button>
                    <button v-if="player.skills.includes('荷魯斯之眼') && !(player.roundStats && player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼'))" @click="handleSkillClick('荷魯斯之眼', p._id)" class="skill-button eye" title="使用荷魯斯之眼">查看</button>
                    <button class="skill-button scout" @click="confirmScout(p)" :disabled="player.hp < 2 || (player.roundStats && player.roundStats.scoutUsageCount >= 2)" title="花費 1 HP 偵查屬性">
                        🔍
                    </button>
                </div>
            </div>
        </div>
        <div v-if="hasActiveSkills" class="active-skill-section">
            <span class="active-skill-label">可使用技能:</span>
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
        <p class="phase-description">等待管理員結束攻擊階段...</p>
        <div class="player-list">
          <div v-for="p in otherPlayers" :key="p._id" class="player-card" :class="{ hibernating: p.roundStats && p.roundStats.isHibernating }">
            <div class="player-info-wrapper">
              <div class="player-info-line">
                <span class="player-level">等級: {{ p.level }}</span>
                <span class="player-name-text">{{ p.name }}</span>
                <div class="guess-badge" :class="`guess-${getAttributeSlug(attributeGuesses[p._id])}`" @click="cycleGuess(p._id)" title="點擊切換屬性猜測筆記">
                    {{ getGuessLabel(p._id) }}
                </div>
                <span v-if="p.effects && p.effects.isPoisoned" title="中毒中">🤢</span>
                <span v-if="game.players.some(lion => lion.roundStats.minionId === p._id)" title="獅子王的手下">🛡️</span>
              </div>
              <div v-if="p.skills && p.skills.length > 0" class="other-player-skills-tags">
                <span v-for="skill in p.skills" :key="skill" class="skill-tag-small">{{ skill }}</span>
              </div>
            </div>
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
        <div v-if="hasActiveSkills" class="active-skill-section">
            <span class="active-skill-label">可使用技能:</span>
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
            所有技能將逐一進行競標，請把握機會！<br>
            <span class="hp-info">當前剩餘可用血量: <strong>{{ remainingHpBase }}</strong> HP</span>
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
                <span v-if="!game.auctionState.queue.includes(skill) && game.auctionState.currentSkill !== skill" class="status-badge-done">已結束</span>
                <span v-else-if="game.auctionState.currentSkill === skill" class="status-badge-live">競標中</span>
                <span v-else class="status-badge-wait">待標</span>
            </div>
            <p class="skill-mini-desc">{{ description }}</p>
            <div v-if="game.highestBids && game.highestBids[skill]" class="mini-bid-info">
                目前最高: {{ game.highestBids[skill].amount }} HP
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

      <!-- 競標專屬視窗 -->
      <div v-if="game.auctionState && game.auctionState.status !== 'none'" class="modal-overlay auction-overlay">
        <div class="modal-content auction-modal" :class="{ 'starting-bg': game.auctionState.status === 'starting' }">
          <div class="auction-phase-indicator">
            <span class="pulse-dot" v-if="game.auctionState.status === 'active'"></span>
            競標中 (本回剩 {{ game.auctionState.queue.length + (game.auctionState.status !== 'none' && game.auctionState.status !== 'starting' ? 0 : 0) }} 項)
          </div>
          
          <div class="auction-timer-box" :class="{ 'timer-urgent': auctionTimeLeft < 15 && game.auctionState.status === 'active', 'timer-starting': game.auctionState.status === 'starting' }">
            <span class="timer-label">{{ game.auctionState.status === 'starting' ? '即將開始' : '剩餘時間' }}</span>
            <div class="timer-value">{{ auctionTimeDisplay }}</div>
          </div>

          <div class="auction-skill-main">
            <div class="skill-title-row">
              <h2>{{ game.auctionState.currentSkill }}</h2>
            </div>
            <p class="auction-skill-description">{{ game.skillsForAuction[game.auctionState.currentSkill] }}</p>
          </div>

          <div class="auction-bid-status" :class="{ 'is-leading-status': isMyBidHighest }">

            <div v-if="game.highestBids && game.highestBids[game.auctionState.currentSkill]" class="highest-bidder">
              <!-- 移到這裡,相對於整個出價資訊區域定位 -->
              <span v-if="isMyBidHighest" class="status-deco deco-left">得</span>
              <span v-if="isMyBidHighest" class="status-deco deco-right">標</span>
              <span class="bid-label">目前最高出價為 <strong>{{ currentHighestBidder }}</strong></span>
              <div class="bid-value-row">
                <div class="bid-value">{{ game.highestBids[game.auctionState.currentSkill].amount }} <span class="hp-unit">HP</span></div>
              </div>
            </div>
            <div v-else class="no-bids-yet">目前尚無人出價</div>
          </div>

          <div class="auction-hp-visual" v-if="hpBreakdown">
            <div class="hp-bar-container">
              <div class="hp-bar-segment reserved" :style="{ width: hpBreakdown.reserved.pct + '%' }" title="基本保留量 (5 HP)"></div>
              <div class="hp-bar-segment other" :style="{ width: hpBreakdown.other.pct + '%' }" title="其他尚未結標的技能佔用"></div>
              <div class="hp-bar-segment active" :style="{ width: hpBreakdown.active.pct + '%' }" title="目前技能已出價"></div>
              <div class="hp-bar-segment biddable" :style="{ width: hpBreakdown.biddable.pct + '%' }" title="目前可動用額度"></div>
            </div>
            <div class="hp-bar-legend">
              <span class="legend-item"><i class="dot reserved"></i> 保留:{{ hpBreakdown.reserved.val }}</span>
              <span class="legend-item" v-if="hpBreakdown.other.val > 0"><i class="dot other"></i> 預扣:{{ hpBreakdown.other.val }}</span>
              <span class="legend-item"><i class="dot active"></i> 本次:{{ hpBreakdown.active.val }}</span>
              <span class="legend-item"><i class="dot biddable"></i> 剩餘:{{ hpBreakdown.biddable.val }}</span>
            </div>
            <div class="hp-visual-footer">
              <span class="hp-total-label">總血量: {{ player.hp }} HP</span>
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
                投標
              </button>
            </div>
          </div>
          
          <div class="auction-starting-notice" v-if="game.auctionState.status === 'starting'">
            倒數結束後即可開始投標，請準備！
          </div>

          <div class="auction-finished-notice" v-if="game.auctionState.status === 'finished'">
            競標已結束，正在結算得標者...
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
/* Attribute Backgrounds */
.bg-wood {
    /* Stronger Forest Vibe: Darker Green -> Vibrant Green -> Light Green */
    background: linear-gradient(135deg, #43a047 0%, #66bb6a 50%, #a5d6a7 100%);
    background-size: 200% 200%;
    animation: sway 6s ease-in-out infinite;
    box-shadow: inset 0 0 50px #1b5e20; /* Deep forest shadow */
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

/* Ensure inner white boxes stay white and readable for ALL backgrounds */
.bg-fire .player-dashboard, .bg-fire .game-lobby li, .bg-fire .player-card, .bg-fire .skill-card, .bg-fire .log-message,
.bg-wood .player-dashboard, .bg-wood .game-lobby li, .bg-wood .player-card, .bg-wood .skill-card, .bg-wood .log-message,
.bg-thunder .player-dashboard, .bg-thunder .game-lobby li, .bg-thunder .player-card, .bg-thunder .skill-card, .bg-thunder .log-message {
    background-color: rgba(255, 255, 255, 0.92);
    color: #333; /* Enforce dark text */
    box-shadow: 0 2px 5px rgba(0,0,0,0.1); /* Slight pop */
}
.bg-fire input, .bg-fire button,
.bg-wood input, .bg-wood button,
.bg-thunder input, .bg-thunder button {
    z-index: 2; /* Ensure inputs are above background */
    position: relative;
    /* background-color: #fff;  Removed to let buttons keep their colors */
    color: #333;
}
/* Specific button overrides for visibility */
.bg-fire button { background-color: #ff9800; color: white; }
.bg-wood button { background-color: #2e7d32; color: white; }
.bg-thunder button { background-color: #7b1fa2; color: white; } /* Purple button contrast with yellow bg */

.bg-thunder {
    /* High Voltage: Yellow -> White -> Darker Yellow */
    background: linear-gradient(45deg, #fdd835 0%, #fff176 25%, #ffffff 50%, #fff176 75%, #fdd835 100%);
    background-size: 400% 400%; /* Larger size for fast movement */
    animation: shock 1.5s linear infinite; /* Faster shock */
    box-shadow: inset 0 0 40px #fbc02d;
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

/* 可用技能閃爍提醒 */
.skill-tag.blink-available {
  animation: skill-blink 2s ease-in-out infinite;
}
@keyframes skill-blink {
  0%, 100% { 
    background-color: #e9ecef;
    color: #495057;
    box-shadow: 0 0 0 rgba(40, 167, 69, 0);
    transform: scale(1);
    font-weight: normal;
  }
  50% { 
    background-color: #d4edda;
    color: #155724;
    box-shadow: 0 0 12px rgba(40, 167, 69, 0.4);
    transform: scale(1.05);
    font-weight: bold;
  }
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
.player-name {
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.player-info-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.player-info-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 24px;
}
.player-name-text {
  font-weight: bold;
  font-size: 1.1em;
}
.player-level {
  font-size: 1em;
  color: #495057;
  font-weight: 600;
}
.other-player-skills-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.skill-tag-small {
  display: inline-block;
  font-size: 0.7em;
  color: #495057;
  padding: 1px 5px;
  background-color: #e9ecef;
  border-radius: 8px;
  font-weight: normal;
  border: 1px solid #dee2e6;
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
/* --- 可使用技能區域 --- */
.active-skill-section {
  margin-top: 10px;
  padding: 1px 12px;
  background-color: #ffffff;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  overflow-x: auto;
  white-space: nowrap;
}

.active-skill-label {
  font-weight: bold;
  font-size: 0.9em;
  color: #888;
  flex-shrink: 0;
}

.active-skill-list {
  display: flex;
  gap: 8px;
  align-items: center;
}

.active-skill-button {
  background-color: #6c757d;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.85em;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.active-skill-button:hover:not(:disabled) {
  background-color: #5a6268;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px rgba(0,0,0,0.15);
}

.active-skill-button:active:not(:disabled) {
  transform: translateY(0);
}

.active-skill-button:disabled {
  background-color: #dee2e6;
  color: #adb5bd;
  cursor: not-allowed;
  box-shadow: none;
}
.skill-button.scout { 
  background-color: transparent; 
  font-size: 1.2em; 
  padding: 2px 5px; 
  margin-left: 5px; 
  border: none;
  color: #6c757d;
  width: auto;
  min-width: auto;
}
.skill-button.scout:hover { 
  background-color: rgba(108, 117, 125, 0.1);
  transform: scale(1.1);
}
.skill-button.scout:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

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
  animation: modal-appear 0.3s ease;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
@keyframes modal-appear {
  from { opacity: 0; transform: scale(0.9) translateY(-20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
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
/* Guess Badge */
.guess-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 0.75em;
  font-weight: bold;
  cursor: pointer;
  background: #f8f9fa;
  color: #adb5bd;
  border: 1px solid #dee2e6;
  margin: 0 5px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}
.guess-badge:hover { 
  transform: scale(1.15) rotate(5deg); 
  filter: brightness(0.95);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.guess-wood { background: #4caf50; color: white !important; border-color: #388e3c; }
.guess-water { background: #2196f3; color: white !important; border-color: #1976d2; }
.guess-fire { background: #f44336; color: white !important; border-color: #d32f2f; }
.guess-thunder { background: #ffeb3b; color: #333 !important; border-color: #fbc02d; }

.player-info-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
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
  font-size: 2.2em;
  margin-bottom: 20px;
  text-shadow: 0 0 10px rgba(220, 53, 69, 0.5);
}
.death-logout-btn {
  margin: 30px auto 0 !important;
  padding: 10px 30px !important;
  font-size: 1em !important;
  display: inline-block !important;
  box-shadow: 0 4px 15px rgba(220, 53, 69, 0.4);
}
.death-logout-btn:hover {
  transform: scale(1.1);
  filter: brightness(1.2);
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

/* --- 競標階段新樣式 --- */
.skills-grid-overview {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 15px;
}
.skill-card-mini {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 10px;
  text-align: left;
  transition: all 0.3s;
  position: relative;
  opacity: 0.8;
}
.skill-card-mini.active {
  border-color: #007bff;
  box-shadow: 0 0 10px rgba(0, 123, 255, 0.2);
  transform: scale(1.02);
  opacity: 1;
}
.skill-card-mini.completed {
  background-color: #f8f9fa;
  opacity: 0.6;
}
.skill-mini-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
}
.skill-mini-header h3 { margin: 0; font-size: 1em; }
.skill-mini-desc { font-size: 0.8em; color: #6c757d; margin: 0; line-height: 1.2; height: 3em; overflow: hidden; }
.status-badge-done { background: #6c757d; color: white; font-size: 0.7em; padding: 2px 5px; border-radius: 4px; }
.status-badge-live { background: #dc3545; color: white; font-size: 0.7em; padding: 2px 5px; border-radius: 4px; animation: pulse-red 2s infinite; }
.status-badge-wait { background: #e9ecef; color: #495057; font-size: 0.7em; padding: 2px 5px; border-radius: 4px; }
.mini-bid-info { font-size: 0.75em; color: #28a745; margin-top: 5px; font-weight: bold; }

/* 競標視窗特效 */
.auction-overlay { background-color: rgba(0,0,0,0.85) !important; z-index: 200 !important; }
.auction-modal {
  max-width: 400px !important;
  border-top: 5px solid #007bff;
  padding: 25px !important;
}
.auction-modal.starting-bg { border-top-color: #ffc107; }
.auction-phase-indicator { font-size: 0.85em; color: #6c757d; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 500; }
.pulse-dot { width: 10px; height: 10px; background: #dc3545; border-radius: 50%; animation: pulse-red 1s infinite; }
.auction-skill-main { margin-bottom: 20px; text-align: center; }
.skill-title-row { margin-bottom: 10px; }
.current-label { font-size: 0.75em; color: #007bff; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; display: block; margin-bottom: 4px; }
.auction-skill-main h2 { 
  margin: 0; 
  padding: 10px 0;
  font-size: 2.8em; 
  color: #007bff; /* 改為藍色 */
  letter-spacing: 2px;
  font-weight: 900;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
  background: linear-gradient(to right, #f8f9fa, #fff, #f8f9fa);
  border-radius: 8px;
}
.auction-skill-description { color: #666; font-size: 1em; line-height: 1.4; margin-top: 10px; background: #fdfdfd; padding: 10px; border-radius: 6px; border-left: 3px solid #eee; }

.auction-timer-box {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 20px;
  text-align: center;
  border: 1px solid #eee;
  transition: all 0.3s;
}
.timer-label { font-size: 0.85em; color: #6c757d; display: block; margin-bottom: 2px; }
.timer-value { font-size: 3em; font-weight: bold; font-family: 'Courier New', Courier, monospace; color: #333; line-height: 1; }
.timer-urgent .timer-value { color: #dc3545; }
.timer-urgent { animation: shake-tiny 0.5s infinite; border-color: #f8d7da; background-color: #fff5f5; box-shadow: 0 0 15px rgba(220, 53, 69, 0.1); }
.timer-starting .timer-value { color: #ffc107; }

.bid-label { font-size: 0.85em; color: #6c757d; display: block; margin-bottom: 2px; }
.bid-value { font-size: 2.2em; font-weight: bold; color: #28a745; line-height: 1; }
.hp-unit { font-size: 0.4em; color: #6c757d; vertical-align: middle; margin-left: 2px; }
.no-bids-yet { color: #6c757d; font-style: italic; font-size: 0.95em; padding: 10px 0; }

.auction-actions { 
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #eef6ff; 
  padding: 15px; 
  border-radius: 12px; 
  border: 1px solid #d0e3ff; 
}
.bid-controls-centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.auction-bid-input-large {
  width: 120px !important;
  font-size: 2.2em !important;
  font-weight: bold !important;
  text-align: center !important;
  border: 2px solid #007bff !important;
  border-radius: 8px !important;
  padding: 5px !important;
  margin: 0 !important;
  background: white;
}
.auction-bid-status { 
  margin-bottom: 20px;
  text-align: center; 
  padding: 10px; 
  background: rgba(40, 167, 69, 0.05); 
  border-radius: 12px; 
  border: 3px solid transparent;
  transition: all 0.3s;
  position: relative;
  overflow: visible; /* 讓內部 deco 溢出控制交給 is-leading-status */
}
.auction-bid-status.is-leading-status {
  border-color: #dc3545 !important;
  background: white !important;
  box-shadow: 0 0 15px rgba(220, 53, 69, 0.2);
  /* 移除 overflow: hidden 讓「得標」文字可以顯示 */
}
.highest-bidder {
  position: relative; /* 讓內部的 status-deco 相對於這個區域定位 */
}
.bid-value-row {
  display: flex;
  justify-content: center;
  align-items: center;
  /* 完全移除 padding,消除第三行空白 */
}
.status-deco {
  font-size: 2.8em;
  font-weight: 900;
  color: #dc3545;
  opacity: 0.15;
  animation: pulse-red 2s infinite;
  position: absolute;
  top: 50%; /* 垂直置中於 .highest-bidder 區域 */
  transform: translateY(-50%);
  user-select: none;
  pointer-events: none;
  line-height: 1;
  display: flex;
  align-items: center;
}
.deco-left {
  left: 10px;
}
.deco-right {
  right: 10px;
}

.auction-bid-btn-primary {
  background: #007bff !important;
  color: white !important;
  font-size: 1.4em !important;
  font-weight: bold !important;
  padding: 12px 50px !important;
  border-radius: 12px !important;
  border: none !important;
  cursor: pointer;
  transition: all 0.2s;
  width: auto !important;
  box-shadow: 0 4px 10px rgba(0, 123, 255, 0.3);
}
.auction-bid-btn-primary:hover { transform: scale(1.05); filter: brightness(110%); }
.auction-bid-btn-primary:active { transform: scale(0.95); }
.auction-bid-btn-primary:disabled { background: #ccc !important; box-shadow: none; transform: none; }

.bid-hint { font-size: 0.75em; color: #6c757d; margin-top: 10px; font-style: italic; text-align: center; }

.winner-badge-you {
  background: #28a745;
  color: white;
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85em;
  font-weight: bold;
  margin-top: 10px;
  animation: bounce 2s infinite;
}

/* HP Allocation Bar Styles */
.auction-hp-visual {
  margin-bottom: 20px;
  background: #f8f9fa;
  padding: 15px;
  border-radius: 12px;
  border: 1px solid #eee;
}
.hp-bar-container {
  display: flex;
  height: 12px;
  background: #e9ecef;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 10px;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
}
.hp-bar-segment {
  height: 100%;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.hp-bar-segment.reserved { background: #dc3545; } /* Red */
.hp-bar-segment.other { background: #fd7e14; }    /* Orange */
.hp-bar-segment.active { background: #007bff; }   /* Blue */
.hp-bar-segment.biddable { background: #28a745; } /* Green */

.hp-bar-legend {
  display: flex;
  justify-content: center; /* 改為置中 */
  flex-wrap: wrap;
  gap: 12px; /* 稍微增加間距 */
  font-size: 0.8em;
  color: #666;
  border-bottom: 1px dashed #eee;
  padding-bottom: 10px;
  margin-bottom: 10px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.dot.reserved { background: #dc3545; }
.dot.other { background: #fd7e14; }
.dot.active { background: #007bff; }
.dot.biddable { background: #28a745; }

.hp-visual-footer {
  display: flex;
  flex-direction: column; /* 改為垂直排列以便置中 */
  align-items: center;
  gap: 5px;
}
.hp-total-label {
  font-size: 0.9em;
  font-weight: bold;
  color: #333;
  white-space: nowrap;
}

.auction-bid-btn.huge {
  font-size: 1.5em !important;
  padding: 15px 30px !important;
  box-shadow: 0 4px 15px rgba(0, 123, 255, 0.4);
}

.auction-starting-notice, .auction-finished-notice { text-align: center; padding: 12px; color: #856404; background: #fff3cd; border-radius: 8px; font-weight: bold; font-size: 0.9em; border: 1px solid #ffeeba; }

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
  40% {transform: translateY(-5px);}
  60% {transform: translateY(-3px);}
}

@keyframes pulse-red {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes shake-tiny {
  0% { transform: translate(1px, 1px); }
  25% { transform: translate(-1px, -1px); }
  50% { transform: translate(1px, -1px); }
  75% { transform: translate(-1px, 1px); }
  100% { transform: translate(1px, 1px); }
}

@media (max-width: 400px) {
  .auction-modal { padding: 15px !important; width: 95%; }
  .auction-skill-main h2 { font-size: 1.8em; }
  .timer-value { font-size: 2.5em; }
}
</style>