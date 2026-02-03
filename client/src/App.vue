<script setup>
import { ref, onMounted, onUnmounted, computed, watch, toRefs } from 'vue';
import axios from 'axios';
import socketService from './socketService.js';

// Components
import AdminPanel from './components/AdminPanel.vue';
import GameRules from './components/GameRules.vue';
import LobbyView from './components/LobbyView.vue';
import BattleLog from './components/BattleLog.vue';
import PlayerList from './components/PlayerList.vue';
import PlayerDashboard from './components/PlayerDashboard.vue';
import AuctionModal from './components/AuctionModal.vue';

// Composables
import { useGameState } from './composables/useGameState.js';
import { useAuction } from './composables/useAuction.js';
import { useSkills } from './composables/useSkills.js';
import { useGameActions } from './composables/useGameActions.js';
import { getAttributeSlug } from './utils/gameHelpers.js';

const attributesList = ['木', '水', '火', '雷'];

// --- 基礎配置 ---
// 強制使用 Proxy (Vite 設定)
const API_URL = ''; 
// const API_URL = 'http://127.0.0.1:3001'; 
// const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

// --- Toast Notification Logic ---
const toast = ref({ visible: false, message: '', type: 'info' });
let toastTimer = null;
const showToast = (message, type = 'info') => {
    toast.value = { visible: true, message, type };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.value.visible = false;
    }, 3000);
};

// --- 1. 使用 useGameState 管理全域狀態與 Socket ---
const { 
    game, 
    player, 
    uiState, 
    logMessages, 
    socketStatus, 
    attributeGuesses,
    logContainer,
    isHit,
    addLogMessage,
    cycleGuess
} = useGameState(API_URL);

// --- 2. 使用 useAuction 管理競標邏輯 ---
const { 
    auctionTimeLeft,
    auctionableSkills,
    auctionStatusText,
    auctionTimeDisplay,
    isMyBidHighest,
    remainingHpBase,
    hpBreakdown,     // New
    bidHistory,      // New/Renamed
    userBidInputs,   // New
    placeBid
} = useAuction(game, player, API_URL, addLogMessage);

// --- 4. 使用 useGameActions 管理基礎動作 ---
const {
    newPlayerName,
    gameCodeInput,
    playerCodeInput,
    scoutResult,
    scoutConfirm,
    hibernateConfirm,
    joinableGames,
    fetchJoinableGames,
    joinGame,
    rejoinWithCode,
    attackPlayer,
    scoutPlayer,
    levelUp,
    toggleReady,
    forceSkip,
    logout
} = useGameActions(game, player, uiState, addLogMessage, API_URL, showToast);

// --- 3. 使用 useSkills 管理技能使用處理 ---
const { 
    skillTargetSelection,
    isOneTimeSkillUsed,
    isSkillAvailable,
    hasActiveSkills,
    useSkill,
    handleSkillClick,
    confirmSkillTargets,
    cancelSkillSelection,
    toggleSkillTarget
} = useSkills(game, player, API_URL, addLogMessage, showToast);

// --- Socket 核心連動 ---
const lastServerLogLength = ref(0);
const syncGameState = (updatedGame) => {
    if (!updatedGame) return;
    
    console.log('[GameState] Received update:', {
        gamePhase: updatedGame.gamePhase,
        currentRound: updatedGame.currentRound,
        playerCount: updatedGame.players?.length
    });
    
    game.value = updatedGame;

    // 日誌同步
    if (updatedGame.gameLog) {
        if (updatedGame.gameLog.length < lastServerLogLength.value) lastServerLogLength.value = 0;
        const newLogs = updatedGame.gameLog.slice(lastServerLogLength.value);
        newLogs.forEach(log => addLogMessage(log.text, log.type));
        lastServerLogLength.value = updatedGame.gameLog.length;
    }

    // 更新個人狀態
    if (player.value) {
        const self = updatedGame.players.find(p => p._id === player.value._id || p.playerCode === player.value.playerCode);
        if (self) player.value = self;
    }

    // 自動跳轉 UI
    if (updatedGame.gamePhase !== 'waiting' && uiState.value !== 'inGame' && uiState.value !== 'admin') {
        console.log('[GameState] Auto-switching to inGame view');
        uiState.value = 'inGame';
    }
};

// --- Socket 同步邏輯 ---
// --- Socket 同步邏輯 ---
const joinRoom = () => {
    // 確保有 gameCode 且 Socket 已連線
    if (game.value?.gameCode && socketService.socket && socketService.socket.connected) {
        console.log('[Socket] Joining room:', game.value.gameCode);
        socketService.emit('joinGame', game.value.gameCode);
        socketStatus.value = `🟢 已連線 | 房間: ${game.value.gameCode}`;
    } else if (!game.value?.gameCode) {
        console.warn('[Socket] Cannot join room: gameCode is missing');
        socketStatus.value = `🟡 等待代碼...`;
    } else {
        console.warn('[Socket] Cannot join room: Socket not connected');
        if (uiState.value === 'login' || uiState.value === 'rejoin') {
            socketStatus.value = `🟡 準備連線...`;
        } else {
            socketStatus.value = `🔴 連線中...`;
        }
    }
};

const initSocketHandlers = () => {
    // 清除舊的監聽器 (避免重複綁定)
    socketService.off('gameStateUpdate', syncGameState);
    socketService.off('connect', joinRoom);
    
    // 綁定新監聽器
    socketService.on('gameStateUpdate', (data) => {
        syncGameState(data);
    });
    
    // 當 Socket 連線成功 (或重連成功) 時，嘗試加入房間
    socketService.on('connect', () => {
        addLogMessage('[Socket] Connected!', 'success');
        joinRoom(); 
    });
    
    // 當斷線時
    socketService.on('disconnect', () => {
        addLogMessage('[Socket] Disconnected!', 'error');
        // 如果是在登入或重新加入畫面，不要顯示紅色的斷線條，改為黃色等待狀態
        if (uiState.value === 'login' || uiState.value === 'rejoin') {
            socketStatus.value = `🟡 未連線`;
        } else {
            socketStatus.value = `🔴 已斷線`;
        }
    });
    
    socketService.on('joinedRoom', (room) => {
        console.log('[Socket] Successfully joined room:', room);
        socketStatus.value = `🟢 已連線 | 房: ${room}`;
    });
    
    // 增加連線錯誤監聽
    socketService.on('connect_error', (err) => {
        console.error('[Socket] Connect Error:', err);
        if (uiState.value === 'login' || uiState.value === 'rejoin') {
            socketStatus.value = `🟡 連線異常 (${err.message})`;
        } else {
            socketStatus.value = `🔴 連線失敗: ${err.message}`;
        }
    });
    
    socketService.on('attackResult', (result) => {
        if (player.value && result.targetId && String(result.targetId) === String(player.value._id) && result.type === 'damage') {
            isHit.value = true;
            setTimeout(() => isHit.value = false, 500);
        }
        
        // [NEW] Show Toast Feedback
        if (player.value) {
            if (String(result.attackerId) === String(player.value._id)) {
                // I am the attacker
                // If message starts with "You", fine, but it usually starts with current name.
                // We use the full message
                showToast(result.message, result.type === 'miss' ? 'warning' : 'success');
            } else if (String(result.targetId) === String(player.value._id)) {
                // I am the target
                 showToast(result.message, result.type === 'miss' ? 'success' : 'error');
            }
        }
        
        addLogMessage(result.message, 'battle');
    });

    // 如果目前已經連線，手動觸發一次 joinRoom
    if (socketService.socket && socketService.socket.connected) {
         console.log('[Socket] Already connected on init, joining room now...');
         joinRoom();
    }
};

// 監聽 Socket
onMounted(() => {
    initSocketHandlers();
});

// --- 3. 監聽遊戲代碼變更，自動連線 Socket ---
watch(() => game.value?.gameCode, (code) => {
    if (code) {
        console.log('[Socket] Game code detected, connecting to:', API_URL);
        // [關鍵修正] 必須先建立連線(產生 socket 實例)，才能綁定監聽器！
        socketService.connect(API_URL);
        
        initSocketHandlers();
        
        // 如果已經連線（可能是重連或保留的連線），直接加入
        if (socketService.socket && socketService.socket.connected) {
             console.log('[Socket] Already connected in watch, joining room...');
             joinRoom();
        }
    }
}, { immediate: true });

// 管理員模式自動連線 (避免顯示斷線紅條)
watch(uiState, (newState) => {
    if (newState === 'admin') {
        console.log('[App] Admin mode detected, ensuring socket connection...');
        socketService.connect(API_URL);
        initSocketHandlers();
    }
});

// --- 其他 UI 控制 ---
const showRules = ref(false);

// --- Computed (維持某些與 UI 緊密相關的) ---
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

const playerAttributeClass = computed(() => {
    if (!player.value) return '';
    const map = { '木': 'bg-wood', '水': 'bg-water', '火': 'bg-fire', '雷': 'bg-thunder' };
    return map[player.value.attribute] || '';
});

const levelUpInfo = computed(() => {
    if (!player.value || player.value.level >= 3) return { possible: false, message: '已達最高等級' };
    
    // 遊戲尚未開始不可升級
    if (game.value && game.value.gamePhase === 'waiting') {
        return { possible: false, message: '遊戲開始後才可升級' };
    }
    
    // 檢查本回合是否已升級
    if (player.value.roundStats && player.value.roundStats.hasLeveledUpThisRound) {
        return { possible: false, message: '本回合已升級' };
    }

    const costs = { 0: 2, 1: 4, 2: 6 };
    let cost = costs[player.value.level];
    if (player.value.skills.includes('基因改造')) cost -= 1;
    
    // 新規則：只要血量足以支付消耗 (且剩餘至少 1 HP)
    const possible = player.value.hp > cost;
    return { possible, message: possible ? `升級 LV${player.value.level + 1} (扣 ${cost} HP)` : `血量不足 (需 > ${cost} HP)` };
});

const otherPlayers = computed(() => {
    if (!game.value || !game.value.players || !player.value) return [];
    return game.value.players.filter(p => p && p._id !== player.value._id);
});

const sortedAllPlayers = computed(() => {
    if (!game.value || !game.value.players) return [];
    // Sort by HP descending
    return [...game.value.players].sort((a, b) => b.hp - a.hp);
});

// --- Actions (核心 API 互動) ---
const confirmScout = (target) => {
    scoutConfirm.value = { active: true, target };
};

const cancelScout = () => {
    scoutConfirm.value = { active: false, target: null };
};

const executeHibernate = async () => {
    await useSkill('冬眠');
    hibernateConfirm.value.active = false;
};

// --- 輔助：取得出價者名稱 ---
const getBidderName = (bidInfo) => {
    if (!bidInfo || !game.value || !player.value) return '無';
    const currentId = String(player.value._id);
    const bidId = String(bidInfo.playerId);
    if (bidId === currentId) return '你';
    const found = game.value.players.find(p => String(p._id) === bidId);
    return found ? found.name : (bidInfo.playerName || '神秘玩家');
};

// --- 技能點擊轉接器 ---
const wrappedHandleSkillClick = (skill, targetId = null) => {
    const res = handleSkillClick(skill, targetId);
    if (res === 'SHOW_HIBERNATE_MODAL') hibernateConfirm.value.active = true;
};

onMounted(() => {
    // 優先檢查是否為管理員狀態
    if (sessionStorage.getItem('forestIsAdmin') === 'true') {
        uiState.value = 'admin';
        return; // 阻止自動登入玩家
    }

    const savedCode = sessionStorage.getItem('forestPlayerCode');
    if (savedCode) {
        playerCodeInput.value = savedCode;
        rejoinWithCode();
    }

    // 初始抓取可加入遊戲
    fetchJoinableGames();
});

// 每 10 秒自動更新一次可加入遊戲清單
let joinableInterval = null;
onMounted(() => {
    joinableInterval = setInterval(() => {
        if (uiState.value === 'login') {
            fetchJoinableGames();
        }
    }, 10000);
});
onUnmounted(() => {
    if (joinableInterval) clearInterval(joinableInterval);
});

// 監聽 uiState, 切換回 login 時也重抓
watch(uiState, (newVal) => {
    if (newVal === 'login') fetchJoinableGames();
});
</script>

<template>
  <div id="game-container" :class="{ 'admin-wide': uiState === 'admin' }">
    <GameRules :is-open="showRules" @close="showRules = false" />
    
    <!-- 登入/重新加入 -->
    <div v-if="uiState === 'login' || uiState === 'rejoin'">
      <button class="admin-btn" @click="() => { uiState = 'admin'; sessionStorage.setItem('forestIsAdmin', 'true'); sessionStorage.removeItem('adminGameCode'); sessionStorage.removeItem('adminViewMode'); }" title="管理員登入">⚙️</button>
      <h1>豬喵大亂鬥</h1>
      <button class="rules-btn" @click="showRules = true">📖 遊戲說明</button>
      <div class="login-tabs">
        <button :class="{ active: uiState === 'login' }" @click="uiState = 'login'">建立新角色</button>
        <button :class="{ active: uiState === 'rejoin' }" @click="uiState = 'rejoin'">用代碼重返</button>
      </div>
      <div v-if="uiState === 'login'" class="login-box">
        <input v-model="gameCodeInput" placeholder="輸入遊戲代碼" id="new-game-code" />
        <input v-model="newPlayerName" placeholder="為你的角色命名" id="new-player-name" maxlength="5" />
        <button @click="joinGame">加入戰局</button>

        <!-- 今日開放中的遊戲清單 -->
        <div v-if="joinableGames.length > 0" class="joinable-section">
          <div class="joinable-header">
            <h3>今日開放中的房間</h3>
            <button class="refresh-mini" @click="fetchJoinableGames" title="重新整理">🔄</button>
          </div>
          <div class="joinable-list">
            <div v-for="g in joinableGames" :key="g.gameCode" 
                 class="joinable-item" @click="gameCodeInput = g.gameCode">
              <div class="joinable-info">
                <span class="joinable-code">{{ g.gameCode }}</span>
                <span class="joinable-count">{{ g.joinedCount }} / {{ g.playerCount }} 人</span>
              </div>
              <div class="joinable-select">選擇</div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="uiState === 'rejoin'" class="login-box">
        <input v-model="playerCodeInput" placeholder="輸入你的專屬玩家代碼" id="rejoin-player-code" />
        <button @click="rejoinWithCode">重返戰局</button>
      </div>
    </div>

    <!-- 管理員介面 -->
    <AdminPanel v-else-if="uiState === 'admin'" :api-url="API_URL" @back="() => { uiState = 'login'; sessionStorage.removeItem('forestIsAdmin'); }" />

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
      <!-- 死亡畫面覆蓋層 (僅在遊戲進行中顯示) -->
      <div v-if="isDead && !isFinishedPhase" class="death-overlay">
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

      <PlayerDashboard 
        :player="player" 
        :attribute-emoji="attributeEmoji" 
        :player-attribute-class="playerAttributeClass" 
        :level-up-info="levelUpInfo"
        @handle-skill-click="wrappedHandleSkillClick"
        @level-up="levelUp"
      />

      <hr>

      <LobbyView v-if="game.gamePhase === 'waiting'" :game="game" />

      <div v-else-if="isDiscussionPhase || isAttackPhase" class="game-phase-content">
        <!-- 全自動流程倒計時條 -->
        <div v-if="game.isAutoPilot && auctionTimeLeft > 0" class="autopilot-timer-container">
            <div class="timer-progress-bar">
                <div class="timer-fill" :style="{ width: Math.min(100, (auctionTimeLeft / 600000) * 100) + '%' }"></div>
            </div>
            <div class="timer-text">{{ auctionTimeDisplay }} 後進入下個階段</div>
        </div>

        <h2>第 {{ game.currentRound }} 回合 - {{ isDiscussionPhase ? '自由討論' : '攻擊階段' }}</h2>
        
        <p v-if="!isDiscussionPhase" class="phase-description">
            {{ isAttackPhase ? '請選擇目標進行攻擊，或使用主動技能。' : '等待管理員進行下一階段...' }}
        </p>
        
        <PlayerList 
          :player="player"
          :game="game"
          :other-players="otherPlayers"
          :is-discussion-phase="isDiscussionPhase"
          :is-attack-phase="isAttackPhase"
          :attribute-guesses="attributeGuesses"
          @cycle-guess="cycleGuess"
          @handle-skill-click="wrappedHandleSkillClick"
          @confirm-scout="confirmScout"
          @attack-player="attackPlayer"
        />

        <!-- 自由討論階段的 Ready 按鈕 - 移至下方 -->
        <div v-if="isDiscussionPhase && !isDead" class="discussion-actions" style="margin-top: 15px; text-align: center;">
           <button @click="toggleReady" :class="['ready-button', { active: player.roundStats.isReady }]">
             {{ player.roundStats.isReady ? '✅ 我已就緒' : '✋ 準備好了' }}
           </button>
        </div>

        <div v-if="hasActiveSkills" class="active-skill-section">
            <span class="active-skill-label">主動技能:</span>
            <div class="active-skill-list">
                <button v-for="s in ['冬眠', '瞪人', '擬態', '寄生', '森林權杖', '獅子王', '折翅', '腎上腺素']" 
                        :key="s" v-if="player.skills.includes(s)"
                        @click="wrappedHandleSkillClick(s)"
                        :disabled="!isSkillAvailable(s)"
                        :class="['active-skill-button', s]">
                  {{ s }}
                </button>
            </div>
        </div>
      </div>

      <div v-else-if="isAuctionPhase" class="auction-phase">
        <h2>第 {{ game.currentRound }} 回合 - 競標階段</h2>
        <p class="phase-description">技能逐一競標中，目前剩餘 {{ remainingHpBase }} HP</p>
        <div class="skills-grid-overview">
          <div v-for="(description, skill) in auctionableSkills" :key="skill" 
               class="skill-card-mini" 
               :class="{ 'active': game.auctionState.currentSkill === skill, 'completed': !game.auctionState.queue.includes(skill) && game.auctionState.currentSkill !== skill }">
            <div class="skill-mini-header">
                <h3>{{ skill }}</h3>
                <span v-if="game.auctionState.currentSkill === skill" class="status-badge-live">競標中</span>
            </div>
            <p class="skill-mini-desc">{{ description }}</p>
          </div>
        </div>
      </div>

      <div v-else-if="isFinishedPhase" class="finished-phase">
        <h2>🏆 遊戲結束 🏆</h2>
        <div class="my-rank-box">
            <span class="rank-number">第 {{ game.players.filter(p => p.hp > player.hp).length + 1 }} 名</span>
        </div>
        
        <!-- Game Result Leaderboard -->
        <div class="leaderboard-section">
            <h3>戰績總結</h3>
            <div class="leaderboard-table">
                <div class="leaderboard-header">
                    <span>排名</span>
                    <span>姓名</span>
                    <span>屬性</span>
                    <span>血量</span>
                </div>
                <div v-for="(p, index) in sortedAllPlayers" :key="p._id" class="leaderboard-row" :class="{ 'highlight-self': p._id === player._id }">
                    <span class="rank-col">#{{ index + 1 }}</span>
                    <span class="name-col">{{ p.name }}</span>
                    <span class="attr-col">{{ { '木': '🌳', '水': '💧', '火': '🔥', '雷': '⚡️' }[p.attribute] }}</span>
                    <span class="hp-col">{{ p.hp }}</span>
                </div>
            </div>
        </div>

        <button @click="logout" class="back-to-lobby-btn">返回大廳</button>
      </div>

      <AuctionModal 
        v-if="isAuctionPhase"
        :game="game"
        :auctionable-skills="auctionableSkills"
        :auction-time-left="auctionTimeLeft"
        :auction-time-display="auctionTimeDisplay"
        :is-my-bid-highest="isMyBidHighest"
        :hp-breakdown="hpBreakdown"
        :user-bid-inputs="userBidInputs"
        :remaining-hp-base="remainingHpBase"
        :get-bidder-name="getBidderName"
        @place-bid="placeBid"
        @logout="logout"
      />

      <BattleLog v-if="!isFinishedPhase" :log-messages="logMessages" />
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
    
    <!-- 顯示 Socket 連線狀態 (除錯用) -->
    <div class="socket-status-indicator" :class="{ 'disconnected': socketStatus.includes('🔴') }">{{ socketStatus }}</div>
    <div class="version-display">v1.9.12</div>
    
    <!-- Toast Popup -->
    <div v-if="toast.visible" class="toast-message" :class="toast.type">
        {{ toast.message }}
    </div>
  </div>
</template>

<style>
/* Toast Styles */
.toast-message {
    position: fixed;
    top: 20%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.85);
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    z-index: 10001;
    font-size: 1.1em;
    font-weight: bold;
    pointer-events: none;
    animation: toastFadeIn 0.3s ease-out;
    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
    text-align: center;
    min-width: 200px;
    max-width: 80%;
}
.toast-message.success { background: rgba(40, 167, 69, 0.95); border: 2px solid #20c997; }
.toast-message.error { background: rgba(220, 53, 69, 0.95); border: 2px solid #ff6b6b; }
.toast-message.warning { background: rgba(255, 193, 7, 0.95); color: #333; border: 2px solid #ffec99; }

@keyframes toastFadeIn {
    from { opacity: 0; transform: translate(-50%, -40%); }
    to { opacity: 1; transform: translate(-50%, -50%); }
}

/* Global unscoped styles for status indicator */
.socket-status-indicator {
    position: fixed;
    bottom: 5px;
    left: 5px;
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
    pointer-events: none;
    transition: all 0.3s ease;
}

.socket-status-indicator.disconnected {
    bottom: auto;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    text-align: center;
    background: rgba(220, 53, 69, 0.95); /* RED */
    font-size: 16px;
    padding: 10px;
    border-radius: 0;
    font-weight: bold;
    pointer-events: auto; /* Allow clicking if we add close btn later */
}

.version-display {
    position: fixed;
    bottom: 5px;
    right: 5px;
    background: rgba(0,0,0,0.3);
    color: rgba(255,255,255,0.7);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    z-index: 10000;
    pointer-events: none;
    font-family: monospace;
}

</style>

<style scoped>
/* --- 整體樣式 --- */
#game-container {
  font-family: Arial, sans-serif; max-width: 400px; margin: 20px auto;
  transition: max-width 0.4s ease, background 0.5s ease;
  padding: 20px; border: 1px solid #ccc; border-radius: 8px;
  text-align: center; position: relative; display: flex; flex-direction: column;
  transition: background 0.5s ease; /* For smooth transitions */
}

#game-container.admin-wide {
  max-width: 400px;
}

.game-wrapper {
  /* To ensure background covers the area effectively if needed, though applied to container usually */
  border-radius: 8px;
  padding: 10px;
  transition: all 0.3s;
}

/* Attribute Backgrounds & Animations moved to global style.css to fix scoping issues */

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

/* --- 可加入遊戲清單 --- */
.joinable-section {
  margin-top: 25px;
  border-top: 1px dashed #ccc;
  padding-top: 15px;
  text-align: left;
}
.joinable-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.joinable-section h3 {
  font-size: 0.9em;
  color: #666;
  margin: 0;
}
.refresh-mini {
  background: transparent;
  color: #666;
  width: auto;
  margin: 0;
  padding: 0;
  font-size: 0.9em;
  border: none;
}
.joinable-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}
.joinable-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.joinable-item:hover {
  border-color: #007bff;
  background: #e7f1ff;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0,123,255,0.1);
}
.joinable-code {
  font-family: monospace;
  font-weight: bold;
  font-size: 1.1em;
  color: #007bff;
  margin-right: 10px;
}
.joinable-count {
  font-size: 0.85em;
  color: #666;
}
.joinable-select {
  font-size: 0.8em;
  color: #007bff;
  font-weight: bold;
  border: 1px solid #007bff;
  padding: 2px 8px;
  border-radius: 4px;
}
.joinable-item:hover .joinable-select {
  background: #007bff;
  color: white;
}

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
  align-items: flex-start; /* Move text to top */
  padding-top: 150px;       /* Spacing from top */
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
  width: 400px;
  max-width: 90% !important;
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
  width: 60% !important; /* 改用百分比寬度 */
  max-width: 180px;      /* 限制最大寬度 */
  font-size: 1.8em !important; /* 字體稍微縮小 */
  font-weight: bold !important;
  text-align: center !important;
  border: 2px solid #007bff !important;
  border-radius: 8px !important;
  padding: 8px !important;
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
  top: 10%; /* 往下移一點點 (從 5% 改回 10%) */
  transform: translateY(0%);
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

/* --- Ranking Styles --- */
.finished-phase {
    background: white;
    padding: 25px;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    margin-top: 10px;
    border: 3px solid #fbc02d;
}

.winner-congrats h2 {
    font-size: 2em;
    color: #fbc02d;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
    margin-bottom: 20px;
}

.my-rank-box {
    background: #fff8e1;
    padding: 20px;
    border-radius: 12px;
    border: 2px dashed #ffc107;
    margin-bottom: 25px;
}

.rank-label {
    display: block;
    font-size: 1em;
    color: #795548;
}

.rank-number {
    display: block;
    font-size: 3em;
    font-weight: 900;
    color: #d32f2f;
    line-height: 1.2;
}

.champion-text {
    color: #fbc02d;
    font-weight: bold;
    margin-top: 10px;
    animation: bounce 1s infinite;
}

.final-rankings h3 {
    text-align: left;
    border-left: 5px solid #ffc107;
    padding-left: 10px;
    margin-bottom: 15px;
}

.player-status-list li {
    background: #fafafa;
    border-radius: 8px;
    margin-bottom: 8px;
    padding: 12px 15px;
    border: 1px solid #eee;
}

.rank-winner {
    background: #fff9c4 !important;
    border-color: #fbc02d !important;
    transform: scale(1.02);
}

.rank-me {
    border: 2px solid #2196f3 !important;
    background: #e3f2fd !important;
}

.rank-info {
    display: flex;
    align-items: center;
    gap: 10px;
}

.rank-pos {
    font-weight: bold;
    font-size: 1.1em;
    color: #666;
    width: 25px;
}

.rank-name {
    font-weight: bold;
    font-size: 1.1em;
}

.me-badge {
    background: #2196f3;
    color: white;
    font-size: 0.7em;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: bold;
}

.final-hp {
    font-weight: bold;
    color: #d32f2f;
}

.back-to-lobby-btn {
    margin-top: 25px;
    background: #6c757d !important;
    width: 100%;
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
  .auction-modal { padding: 15px !important; }
  .auction-skill-main h2 { font-size: 1.8em; }
  .timer-value { font-size: 2.5em; }
}

.auction-close-btn {
  position: absolute !important;
  top: 10px !important;
  right: 15px !important;
  background: transparent !important;
  background-color: transparent !important; /* Double safety */
  border: none !important;
  box-shadow: none !important;
  font-size: 1.8em !important;
  color: #adb5bd !important;
  cursor: pointer;
  z-index: 9999 !important; /* Make sure it is on top */
  width: auto !important;
  padding: 0 !important;
  margin: 0 !important;
  transition: all 0.2s;
  line-height: 1 !important;
  display: block !important;
}
.auction-close-btn:hover {
  color: #dc3545 !important;
  transform: scale(1.2) rotate(90deg);
  background: transparent !important;
}


.auction-modal {
  position: relative !important;
  overflow: visible !important; /* 確保按鈕不會被切掉 */
}

/* --- Autopilot Timer --- */
.autopilot-timer-container {
    margin: 10px 0 20px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 8px;
}
.timer-progress-bar {
    height: 6px;
    background: #e9ecef;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 5px;
}
.timer-fill {
    height: 100%;
    background: linear-gradient(90deg, #28a745, #218838);
    transition: width 1s linear;
}
.timer-text {
    font-size: 0.85em;
    color: #666;
    font-weight: bold;
}

/* --- Ready Button --- */
.ready-button {
    width: auto;
    min-width: 150px;
    margin: 10px auto;
    background-color: #f8f9fa;
    color: #495057;
    border: 2px solid #dee2e6;
    font-weight: bold;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.ready-button.active {
    background-color: #28a745;
    color: white;
    border-color: #218838;
}
.ready-hint {
    font-size: 0.8em;
    color: #999;
    margin-top: -5px;
}

/* --- Leaderboard Styles --- */
.leaderboard-section {
    margin-top: 20px;
    background: #fff;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.leaderboard-section h3 {
    margin: 0 0 15px 0;
    color: #333;
    font-size: 1.2em;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 10px;
}

.leaderboard-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.leaderboard-header {
    display: flex;
    padding: 8px;
    background: #f8f9fa;
    border-radius: 6px;
    font-weight: bold;
    color: #666;
    font-size: 0.9em;
}

.leaderboard-row {
    display: flex;
    padding: 10px 8px;
    border-bottom: 1px solid #eee;
    align-items: center;
    transition: background 0.2s;
}

.leaderboard-row:last-child {
    border-bottom: none;
}

.leaderboard-row.highlight-self {
    background: #e3f2fd;
    border-radius: 6px;
    border-bottom: none;
    font-weight: bold;
    color: #1976d2;
}

.rank-col { width: 15%; text-align: center; }
.name-col { width: 40%; text-align: left; padding-left: 10px; }
.attr-col { width: 25%; text-align: center; }
.hp-col { width: 20%; text-align: center; font-family: monospace; font-size: 1.1em; }
</style>