<script setup>
import { ref, defineProps, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import axios from 'axios';

import socketService from '../socketService';

const props = defineProps(['apiUrl']);
const playerCount = ref(4);
const gameCode = ref('');
const game = ref(null);
const message = ref('');
const showEndGameConfirm = ref(false);
const showDeleteGameConfirm = ref(false);
const showKickPlayerConfirm = ref(false);
const gameToDelete = ref(null);
const playerToKick = ref(null);
const gamesList = ref([]);
const viewMode = ref('dashboard'); // 'dashboard', 'control'
const showSkillConfig = ref(false);
const activeConfigRound = ref(1);
const allSkillsPool = ref({});
const selectedSkillsByRound = ref({
    1: {},
    2: {},
    3: {}
});
const isAutoPilot = ref(true);

const fetchSkillsPool = async () => {
    try {
        const res = await axios.get(`${props.apiUrl}/api/game/admin/skills-pool`);
        allSkillsPool.value = res.data;
    } catch (err) {
        console.error("Failed to fetch skills pool", err);
    }
};

const openSkillConfig = async () => {
    await fetchSkillsPool();
    showSkillConfig.value = true;
};

const toggleSkillSelection = (round, skillName, desc) => {
    if (selectedSkillsByRound.value[round][skillName]) {
        delete selectedSkillsByRound.value[round][skillName];
    } else {
        selectedSkillsByRound.value[round][skillName] = desc;
    }
};

const selectAllForRound = (round) => {
    const roundSkills = allSkillsPool.value[round] || {};
    const skillNames = Object.keys(roundSkills);
    if (skillNames.length === 0) return;

    const isAllSelected = skillNames.every(s => selectedSkillsByRound.value[round][s]);
    if (isAllSelected) {
        selectedSkillsByRound.value[round] = {};
    } else {
        selectedSkillsByRound.value[round] = { ...roundSkills };
    }
};

const formatPhase = (phase) => {
    if (!phase) return '';
    if (phase === 'waiting') return '等待開始';
    if (phase.startsWith('discussion')) return '討論階段';
    if (phase.startsWith('attack')) return '攻擊階段';
    if (phase.startsWith('auction')) return '競標階段';
    if (phase === 'finished') return '遊戲結束';
    return phase;
};

// Computed for Players List
const playersList = computed(() => {
    return game.value?.players || [];
});

const fetchGames = async () => {
    try {
        const res = await axios.get(`${props.apiUrl}/api/game/admin/list`);
        gamesList.value = res.data;
    } catch (err) {
        console.error("Failed to fetch games", err);
        message.value = `取得列表失敗: ${err.response?.data?.message || err.message} (${props.apiUrl}/api/game/admin/list)`;
    }
};

const enterControlPanel = async (code) => {
    gameCode.value = code;
    sessionStorage.setItem('adminGameCode', code);
    try {
        // Just verify it exists first
        const res = await axios.get(`${props.apiUrl}/api/game/${code}`);
        game.value = res.data;
        viewMode.value = 'control';
        sessionStorage.setItem('adminViewMode', 'control');
        message.value = '';
        
        // Explicitly join socket to ensure connection
        if (typeof joinAdminSocket === 'function') {
             joinAdminSocket();
        }
    } catch (err) {
        message.value = `無法進入遊戲: ${err.response?.data?.message || err.message}`;
    }
};

const requestDeleteGame = (code) => {
    gameToDelete.value = code;
    showDeleteGameConfirm.value = true;
};

const confirmDeleteGame = async () => {
    if (!gameToDelete.value) return;
    try {
        await axios.delete(`${props.apiUrl}/api/game/admin/delete/${gameToDelete.value}`);
        message.value = `遊戲 ${gameToDelete.value} 已刪除`;
        showDeleteGameConfirm.value = false;
        gameToDelete.value = null;
        await fetchGames();
    } catch (err) {
        message.value = `刪除失敗: ${err.response?.data?.message || err.message}`;
        showDeleteGameConfirm.value = false;
    }
};

const cancelDeleteGame = () => {
    showDeleteGameConfirm.value = false;
    gameToDelete.value = null;
};

// Helper to refresh current game state manually
const refreshCurrentGame = async () => {
    if (!gameCode.value) return;
    try {
        const res = await axios.get(`${props.apiUrl}/api/game/${gameCode.value}`);
        game.value = res.data;
    } catch (err) {
        console.error("Failed to refresh game:", err);
    }
};

const createGame = async () => {
    try {
        // Prepare custom skills: remove empty rounds so backend uses defaults
        const cleanCustomSkills = {};
        for (const [round, skills] of Object.entries(selectedSkillsByRound.value)) {
            if (skills && Object.keys(skills).length > 0) {
                cleanCustomSkills[round] = skills;
            }
        }

        const res = await axios.post(`${props.apiUrl}/api/game/create`, { 
            playerCount: playerCount.value,
            customSkillsByRound: cleanCustomSkills,
            isAutoPilot: isAutoPilot.value
        });
        message.value = `遊戲建立成功，代碼: ${res.data.gameCode}`;
        await fetchGames();
        await enterControlPanel(res.data.gameCode);
    } catch (err) {
        message.value = `建立失敗: ${err.response?.data?.message || err.message}`;
    }
};

const startGame = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start`, { gameCode: gameCode.value });
        message.value = '遊戲已經開始！';
        await refreshCurrentGame();
    } catch (err) {
        message.value = `啟動失敗: ${err.response?.data?.message || err.message}`;
    }
};

const startAttack = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start-attack`, { gameCode: gameCode.value });
        message.value = '進入攻擊階段！';
        await refreshCurrentGame();
    } catch (err) {
        message.value = `啟動失敗: ${err.response?.data?.message || err.message}`;
    }
};

const startAuction = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start-auction`, { gameCode: gameCode.value });
        message.value = '進入競標階段！';
        await refreshCurrentGame();
    } catch (err) {
        message.value = `啟動失敗: ${err.response?.data?.message || err.message}`;
    }
};

const forceSkip = async () => {
    if (!gameCode.value) return;
    try {
        await axios.post(`${props.apiUrl}/api/game/admin/force-skip`, { gameCode: gameCode.value });
        message.value = "已跳過倒數";
    } catch (err) {
        message.value = `跳過失敗: ${err.response?.data?.message || err.message}`;
    }
};

const endAuction = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/end-auction`, { gameCode: gameCode.value });
        message.value = '競標結束，正在結算中...';
        await refreshCurrentGame();
    } catch (err) {
        message.value = `啟動失敗: ${err.response?.data?.message || err.message}`;
    }
};

const triggersEndGame = () => {
    showEndGameConfirm.value = true;
};

const cancelEndGame = () => {
    showEndGameConfirm.value = false;
};

const confirmEndGame = async () => {
    showEndGameConfirm.value = false;
     try {
        await axios.post(`${props.apiUrl}/api/game/end-game`, { gameCode: gameCode.value });
        message.value = '遊戲強制結束！';
        await refreshCurrentGame();
        // [修正] 更新遊戲列表，確保回到列表時狀態正確
        await fetchGames();
    } catch (err) {
        message.value = `操作失敗: ${err.response?.data?.message || err.message}`;
    }
};

const requestKickPlayer = (p) => {
    playerToKick.value = p;
    showKickPlayerConfirm.value = true;
};

const cancelKickPlayer = () => {
    showKickPlayerConfirm.value = false;
    playerToKick.value = null;
};

const confirmKickPlayer = async () => {
    if (!playerToKick.value) return;
    try {
        await axios.post(`${props.apiUrl}/api/game/admin/kick-player`, {
            gameCode: gameCode.value,
            playerId: playerToKick.value._id
        });
        message.value = `玩家 ${playerToKick.value.name} 已被移出`;
        showKickPlayerConfirm.value = false;
        playerToKick.value = null;
        await refreshCurrentGame();
    } catch (err) {
        message.value = `移出失敗: ${err.response?.data?.message || err.message}`;
        showKickPlayerConfirm.value = false;
    }
};

const copyCode = () => {
    navigator.clipboard.writeText(gameCode.value);
    message.value = '代碼已複製！';
};

const addAiPlayer = async () => {
    try {
        const res = await axios.post(`${props.apiUrl}/api/game/admin/add-ai`, { gameCode: gameCode.value });
        message.value = 'AI 玩家已加入！';
        await refreshCurrentGame();
    } catch (err) {
        message.value = `加入 AI 失敗: ${err.response?.data?.message || err.message}`;
    }
};

const updatePlayerHp = async (p, newHp) => {
    try {
        await axios.post(`${props.apiUrl}/api/game/admin/update-player`, {
            gameCode: gameCode.value,
            playerId: p._id,
            updates: { hp: newHp }
        });
        // Feedback is handled via socket update
    } catch (err) {
        message.value = `更新失敗: ${err.response?.data?.message || err.message}`;
    }
};

const onGameStateUpdate = (updatedGame) => {
    if (updatedGame && updatedGame.gameCode === gameCode.value) {
        game.value = updatedGame;
    }
};

const joinAdminSocket = () => {
    if (gameCode.value) {
        socketService.connect(props.apiUrl);
        
        // 確保初次連線與斷線重連都能成功加入頻道
        const handleJoin = () => {
            console.log('[Admin] Socket joining room:', gameCode.value);
            socketService.emit('joinGame', gameCode.value);
        };

        if (socketService.socket && socketService.socket.connected) {
            handleJoin();
        }

        // 監聽重連 (先移除舊的以防重複)
        socketService.off('connect', handleJoin);
        socketService.on('connect', handleJoin);

        // 監聽遊戲狀態更新 (只需掛載一次，或是先移除舊的)
        socketService.off('gameStateUpdate', onGameStateUpdate);
        socketService.on('gameStateUpdate', onGameStateUpdate);
    }
};

onUnmounted(() => {
    socketService.off('gameStateUpdate', onGameStateUpdate);
});

watch(gameCode, (newVal) => {
    if (newVal) joinAdminSocket();
});

// Log auto-scroll logic
const logContainer = ref(null);
watch(() => game.value?.gameLog, async (newLogs) => {
    if (newLogs && newLogs.length > 0) {
        await nextTick();
        if (logContainer.value) {
            logContainer.value.scrollTop = logContainer.value.scrollHeight;
        }
    }
}, { deep: true });

// Auto-refresh interval
const refreshInterval = ref(null);

onMounted(async () => {
    fetchGames();
    
    // Auto-refresh the games list every 3 seconds
    refreshInterval.value = setInterval(() => {
        if (viewMode.value === 'dashboard') {
            fetchGames();
        }
    }, 3000);
    
    // 嘗試從 sessionStorage 恢復狀態
    const savedViewMode = sessionStorage.getItem('adminViewMode');
    const savedGameCode = sessionStorage.getItem('adminGameCode');
    
    if (savedViewMode === 'control' && savedGameCode) {
        await enterControlPanel(savedGameCode);
        // 如果進入失敗 (viewMode 仍為 dashboard)，則清除過期的 session
        if (viewMode.value !== 'control') {
            console.log("Auto-restore failed, clearing session.");
            sessionStorage.removeItem('adminGameCode');
            sessionStorage.removeItem('adminViewMode');
            message.value = ''; // 清除錯誤訊息，讓使用者看到乾淨的列表
        }
    }
});

onUnmounted(() => {
    if (refreshInterval.value) clearInterval(refreshInterval.value);
    socketService.disconnect();
});
</script>

<template>
    <div class="admin-panel">
        <h2>管理員控制台</h2>
        <div class="message" v-if="message">{{ message }}</div>



        <!-- DASHBOARD MODE -->
        <div v-if="viewMode === 'dashboard'" class="admin-dashboard-view">
            <div class="games-list-section card">
                <div class="section-header">
                    <h3>🏆 當前遊戲列表</h3>
                    <button class="btn-refresh-small" @click="fetchGames" title="重新整理">🔄</button>
                </div>
                
                <div class="active-games-list" v-if="gamesList.length > 0">
                    <div v-for="g in gamesList" :key="g.gameCode" class="game-item-card">
                        <div class="game-item-info-grid">
                            <div class="code-badge">{{ g.gameCode }}</div>
                            <span class="g-phase">{{ formatPhase(g.gamePhase) }}</span>
                            <span class="g-players">👥 {{ g.joinedCount }}/{{ g.playerCount }}</span>
                            <span class="g-date">{{ new Date(g.createdAt).toLocaleString('zh-TW', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
                        </div>
                        <div class="game-item-actions">
                            <button class="btn-dashboard-enter" @click="enterControlPanel(g.gameCode)">進入</button>
                            <button class="btn-dashboard-delete" @click="requestDeleteGame(g.gameCode)">刪除</button>
                        </div>
                    </div>
                </div>
                <div v-else class="no-games-container">
                    <p class="no-games">目前沒有進行中的遊戲</p>
                    <p class="hint-text">資料庫似乎是空的，請先建立一場遊戲。</p>
                    <button @click="createGame" class="btn-create-small">+ 建立測試戰局</button>
                    <!-- Debug Info -->
                    <small style="display:block; margin-top:10px; color:#999;">API: {{ apiUrl }}/api/game/admin/list</small>
                </div>
            </div>

            <div class="create-section card">

                <div class="create-form">
                    <div class="form-row">
                        <div class="form-group-custom">
                            <label>預設玩家人數</label>
                            <div class="number-input-wrapper">
                                <button @click="playerCount = Math.max(2, playerCount - 1)">-</button>
                                <input type="number" v-model="playerCount" min="2" max="10" />
                                <button @click="playerCount = Math.min(10, playerCount + 1)">+</button>
                            </div>
                        </div>
                        <div class="form-group-custom config-trigger">
                            <label>自選技能池</label>
                            <button class="btn-outline-config" @click="openSkillConfig">
                                📖 配置技能
                            </button>
                        </div>
                    </div>
                    
                    <div class="form-row auto-pilot-row">
                        <label class="auto-pilot-toggle">
                            <input type="checkbox" v-model="isAutoPilot">
                            <span class="toggle-text">啟動「全自動流程系統」</span>
                        </label>
                    </div>
                    <button @click="createGame" class="btn-create-massive">立即開啟戰局</button>
                </div>
            </div>
            
            <button class="btn-home-exit" @click="$emit('back')">返回玩家首頁</button>
        </div>

        <!-- CONTROL MODE -->
        <!-- CONTROL MODE -->
        <div v-else-if="viewMode === 'control'" class="control-panel-container">
            <header class="admin-header">
                <div class="header-titles">
                    <div class="game-id-badge" @click="copyCode">
                        <span class="label">ID:</span>
                        <span class="code">{{ gameCode }}</span>
                    </div>
                </div>
                <div class="round-indicator" v-if="game && game.currentRound > 0">
                    <div class="round-num">第 {{ game.currentRound }} 回合</div>
                    <div class="phase-badge">{{ formatPhase(game.gamePhase) }}</div>
                </div>
                <button class="btn-back-header" @click="viewMode = 'dashboard'; gameCode = ''; sessionStorage.removeItem('adminGameCode'); sessionStorage.removeItem('adminViewMode'); fetchGames()" title="返回列表">
                    <span class="icon">⬅</span>
                </button>
            </header>
            
            <div class="controls-grid-premium">
                <div class="action-card card">
                    <div class="action-buttons">
                        <button v-if="game && game.gamePhase === 'waiting'" @click="startGame" class="p-btn p-btn-primary">
                            開始討論階段
                        </button>
                        <button v-if="game && game.gamePhase.startsWith('discussion')" @click="startAttack" class="p-btn p-btn-warning">
                            開放攻擊階段
                        </button>
                        <button v-if="game && game.gamePhase.startsWith('attack') && game.currentRound < 4" @click="startAuction" class="p-btn p-btn-info">
                            開始競標階段
                        </button>
                        <button v-if="game && game.gamePhase.startsWith('auction')" @click="endAuction" class="p-btn p-btn-success">
                            結束競標並結算
                        </button>
                    </div>
                    <div class="danger-zone">
                        <button v-if="game && game.isAutoPilot && game.gamePhase !== 'waiting' && game.gamePhase !== 'finished'" 
                                @click="forceSkip" class="p-btn p-btn-outline p-btn-small skip-timer-btn">
                            ⏩ 略過倒時
                        </button>
                        <button @click="triggersEndGame" class="p-btn p-btn-danger p-btn-small">強制終止遊戲</button>
                    </div>
                </div>
            </div>

            <!-- 結算：當遊戲結束時顯示 -->
            <div class="results-section" v-if="game && game.gamePhase === 'finished'">
                <h3>🏆 最終排名</h3>
                <ul class="ranking-list">
                    <li v-for="(p, index) in game.players.slice().sort((a, b) => b.hp - a.hp)" :key="p._id" :class="{ 'top-winner': p.hp === Math.max(...game.players.map(pl => pl.hp)) }">
                        <span class="rank">#{{ game.players.filter(other => other.hp > p.hp).length + 1 }}</span>
                        <span class="p-name">{{ p.name }}</span>
                        <span class="final-hp">HP: {{ Math.max(0, p.hp) }}</span>
                    </li>
                </ul>
            </div>

            <div class="players-section" v-if="game && game.players">
                <div class="section-header-admin">
                    <h3>👥 玩家管理 ({{ game.players.length }}/{{ game.playerCount }})</h3>
                    <button v-if="game && game.gamePhase === 'waiting' && game.players.length < game.playerCount" 
                            @click="addAiPlayer" class="btn-add-ai-small">
                        🤖 加入 AI 玩家
                    </button>
                </div>
                <div class="players-grid">
                    <div v-for="p in game.players" :key="p._id" class="player-admin-card">
                        <div class="p-row-1">
                            <div class="p-identity">
                                <span class="badgem" :class="p.attribute">{{ p.attribute }}</span>
                                <strong class="name-text">{{ p.name }}</strong>
                                <span v-if="p.isAI" class="ai-badge" :title="p.aiType">🤖 {{ p.aiType }}</span>
                                <small class="code-small">{{ p.playerCode }}</small>
                                <span class="stat-inline">LV.{{ p.level }} ⚔️{{ p.attack }}</span>
                            </div>
                            <button class="btn-mini-kick" @click="requestKickPlayer(p)" title="踢除">❌</button>
                        </div>
                        <div class="p-row-2">
                             <div class="hp-control">
                                <button class="btn-mini" @click="updatePlayerHp(p, p.hp - 1)">-</button>
                                <span class="hp-val">{{ Math.max(0, p.hp) }}</span>
                                <button class="btn-mini" @click="updatePlayerHp(p, p.hp + 1)">+</button>
                            </div>
                            <div class="p-skills-mini" v-if="p.skills && p.skills.length > 0">
                                <span v-for="skill in p.skills" :key="skill" class="skill-tag-mini">
                                    {{ skill }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="admin-log-section" v-if="game && game.gameLog && game.gameLog.length > 0">
                 <h3>📑 遊戲日誌</h3>
                 <div class="log-container" ref="logContainer">
                    <div v-for="(log, idx) in game.gameLog" :key="idx" :class="`log-message log-${log.type}`">{{ log.text }}</div>
                 </div>
            </div>
        </div>
        

        
        <!-- Dashboard has its own back button -->
        <!-- <button class="back-btn" @click="$emit('back')">返回上一頁</button> -->

        <div v-if="showEndGameConfirm" class="modal-overlay">
            <div class="modal">
                <h3>結束確認</h3>
                <p>您確定要強制結束這場遊戲嗎？此操作不可恢復。</p>
                <div class="modal-buttons">
                    <button class="btn-cancel" @click="cancelEndGame">取消</button>
                    <button class="btn-confirm" @click="confirmEndGame">確定</button>
                </div>
            </div>
        </div>

        <div v-if="showDeleteGameConfirm" class="modal-overlay">
            <div class="modal">
                <h3>刪除確認</h3>
                <p>您確定要刪除這場戰局 {{ gameToDelete }} 嗎？所有相關資料將被清除。</p>
                <div class="modal-buttons">
                    <button class="btn-cancel" @click="cancelDeleteGame">取消</button>
                    <button class="btn-confirm" @click="confirmDeleteGame">確定</button>
                </div>
            </div>
        </div>

        <div v-if="showKickPlayerConfirm" class="modal-overlay">
            <div class="modal">
                <h3>踢除確認</h3>
                <p>您確定要將玩家 {{ playerToKick?.name }} 踢出遊戲嗎？</p>
                <div class="modal-buttons">
                    <button class="btn-cancel" @click="cancelKickPlayer">取消</button>
                    <button class="btn-confirm" @click="confirmKickPlayer">確定</button>
                </div>
            </div>
        </div>

        <!-- Skill Config Modal -->
        <div v-if="showSkillConfig" class="modal-overlay" @click="showSkillConfig = false">
            <div class="modal skill-config-modal" @click.stop>
                <div class="modal-header-config">
                    <h3 style="margin: 0; color: #333;">⚙️ 設定每個回合的神祕技能</h3>
                    <p class="subtitle-config">如果不勾選，該回合將保持預設設定</p>
                </div>

                <div class="round-nav-config">
                    <button v-for="r in [1,2,3]" :key="r" 
                            :class="{ active: activeConfigRound === r }"
                            @click="activeConfigRound = r"
                            style="width: auto; padding: 6px 12px; margin: 0;">
                        R{{ r }}
                    </button>
                </div>

                <div class="config-content">
                    <div class="btn-text-only" @click="selectAllForRound(activeConfigRound)" style="cursor: pointer; padding: 5px 0;">
                        {{ Object.keys(allSkillsPool[activeConfigRound] || {}).every(s => selectedSkillsByRound[activeConfigRound][s]) ? '取消本回合全選' : '本回合全選技能' }}
                    </div>
                    <div class="simple-skill-list">
                        <div v-for="(desc, name) in allSkillsPool[activeConfigRound]" :key="name" 
                             class="skill-item-simple"
                             :class="{ 'is-selected': selectedSkillsByRound[activeConfigRound][name] }"
                             @click="toggleSkillSelection(activeConfigRound, name, desc)">
                            <div class="skill-name-row">
                                <span v-if="selectedSkillsByRound[activeConfigRound][name]" class="check-icon">✅</span>
                                <span v-else class="check-icon">⬜</span>
                                {{ name }}
                            </div>
                            <div class="skill-desc-simple">{{ desc }}</div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer-config">
                    <button class="btn-confirm-config" @click="showSkillConfig = false" style="background-color: #e91e63;">確定儲存設定</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 僅補上遺漏的彈窗定位，其餘完全恢復原狀 */
.modal-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}
.modal {
    background: white;
    padding: 2.5rem;
    border-radius: 12px;
    max-width: 400px;
    width: 90%;
    text-align: center;
}

.admin-panel {
    position: relative;
    padding: 0;
    border-radius: 12px;
    background-color: #f0f2f5;
    min-height: 80vh;
    color: #1a1a1b;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
}

.card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    padding: 20px;
    margin-bottom: 20px;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid #edf2f7;
    padding-bottom: 12px;
}

.section-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #2d3748;
}

.section-header-admin {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}

.btn-add-ai-small {
    background: #6366f1;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
}

.btn-add-ai-small:hover {
    background: #4f46e5;
    transform: translateY(-1px);
}

.ai-badge {
    background: #f1f5f9;
    color: #64748b;
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 5px;
    border: 1px solid #e2e8f0;
    text-transform: uppercase;
    vertical-align: middle;
}

/* --- Dashboard Specific --- */
.admin-dashboard-view {
    padding: 24px;
    max-width: 800px;
    margin: 0 auto;
}

.game-item-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: #f8fafc;
    border-radius: 10px;
    margin-bottom: 12px;
    border: 1px solid #e2e8f0;
    transition: transform 0.2s, box-shadow 0.2s;
}

.game-item-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.game-item-info-grid {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-grow: 1;
}

.code-badge {
    background: #6366f1;
    color: white;
    padding: 4px 10px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-weight: bold;
    font-size: 1.1em;
}

.g-phase {
    color: #64748b;
    font-weight: 500;
    min-width: 80px;
}

.g-players {
    color: #475569;
    font-size: 0.9em;
}

.g-date {
    color: #94a3b8;
    font-size: 0.85em;
}

.game-item-actions {
    display: flex;
    gap: 8px;
}

.btn-dashboard-enter {
    writing-mode: vertical-lr;
    text-orientation: upright;
    background: #007bff;
    color: white;
    border: none;
    padding: 10px 6px;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    min-height: 60px;
    letter-spacing: 2px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.btn-dashboard-enter:hover {
    background: #0056b3;
}

.btn-dashboard-delete {
    writing-mode: vertical-lr;
    text-orientation: upright;
    background: #dc3545;
    color: white;
    border: none;
    padding: 10px 6px;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    min-height: 60px;
    letter-spacing: 2px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.btn-dashboard-delete:hover {
    background: #a71d2a;
}

/* --- Create Form --- */
.create-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.form-row {
    display: flex;
    gap: 24px;
}

.form-group-custom {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
}

.form-group-custom label {
    font-weight: 600;
    color: #4a5568;
    font-size: 0.9em;
}

.number-input-wrapper {
    display: flex;
    align-items: center;
    background: #f1f5f9;
    border-radius: 8px;
    padding: 4px;
    width: fit-content;
}

.number-input-wrapper button {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: white;
    border: 1px solid #e2e8f0;
    color: #1e293b;
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.number-input-wrapper input {
    width: 60px;
    background: transparent;
    border: none;
    text-align: center;
    font-size: 1.1rem;
    font-weight: bold;
    color: #1e293b;
}

.btn-outline-config {
    background: white;
    border: 1px solid #cbd5e1;
    color: #475569;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-outline-config:hover {
    border-color: #6366f1;
    color: #6366f1;
    background: #f5f3ff;
}

.btn-create-massive {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    color: white;
    border: none;
    padding: 16px;
    border-radius: 10px;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
    transition: transform 0.2s, box-shadow 0.2s;
}

.btn-create-massive:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(79, 70, 229, 0.5);
}

.btn-home-exit {
    background: transparent;
    color: #64748b;
    border: 1px solid #e2e8f0;
    padding: 10px;
    width: 100%;
    border-radius: 8px;
    margin-top: 20px;
    cursor: pointer;
}

/* --- Control Panel Premium --- */
.admin-header {
    background: white;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 20px;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.phase-badge {
    background: white;
    color: #1a1a1b;
    border: 2px solid #333;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 700;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.btn-back-header {
    margin-left: auto;
    background: #f1f5f9;
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #64748b;
}

.btn-back-header .icon {
    font-size: 1.2rem;
    font-weight: bold;
}

.header-titles {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.header-titles h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #1e293b;
}

.game-id-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f8fafc;
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    width: fit-content;
    cursor: pointer;
    font-size: 1rem;
}

.game-id-badge .label {
    color: #64748b;
    font-weight: 500;
}

.game-id-badge .code {
    font-weight: 800;
    color: #4f46e5;
    font-size: 1.2rem;
    letter-spacing: 0.5px;
}

.round-indicator {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
    background: #f1f5f9;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
}

.round-num {
    font-weight: 800;
    font-size: 1.1rem;
    color: #1e293b;
    white-space: nowrap;
}

.phase-badge {
    white-space: nowrap;
}

.action-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}

.p-btn {
    padding: 18px;
    border-radius: 12px;
    border: none;
    color: white;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.p-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0,0,0,0.1); }
.p-btn:active { transform: translateY(0); }

.p-btn-primary { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
.p-btn-warning { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
.p-btn-info { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
.p-btn-success { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); }
.p-btn-danger { background: #ef4444; }

.p-btn-small { padding: 8px 16px; font-size: 0.9rem; }

.danger-zone {
    border-top: 1px solid #fee2e2;
    padding-top: 16px;
    text-align: center;
}

.message {
    padding: 12px 20px;
    background: white;
    color: #1a1a1b;
    border: 2px solid #333; /* 黑框 */
    margin: 10px 24px;
    border-radius: 10px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.phase-badge {
    background: white;
    color: #333;
    border: 2px solid #333;
    padding: 2px 10px;
    border-radius: 6px;
    font-weight: bold;
    font-size: 0.85em;
}
.action-card {
    border-radius: 0 !important;
}

.players-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
}

.player-admin-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
}

.p-row-1, .p-row-2 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
}
.p-row-2 {
    margin-bottom: 0;
}

.p-identity {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.name-text {
    margin: 0 4px;
    font-size: 1.05rem;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.code-small {
    color: #718096;
    margin-right: 12px;
    white-space: nowrap;
    flex-shrink: 0;
}

.p-skills-mini {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}

.skill-tag-mini {
    background: rgba(0, 0, 0, 0.05);
    color: #4a5568;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
}

.stat-inline {
    font-size: 0.8rem;
    color: #4a5568;
    background: #edf2f7;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
    margin-left: 4px;
}

.hp-control {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #f8fafc;
    padding: 2px 8px;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
}

.hp-val {
    font-weight: 800;
    color: #ef4444;
    font-size: 1rem;
    min-width: 22px;
    text-align: center;
}

.btn-mini {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: white;
    border: 1px solid #e2e8f0;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
}

.btn-mini:hover { border-color: #6366f1; color: #6366f1; }

.badgem {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 800;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.badgem.木 { background: #10b981; }
.badgem.水 { background: #3b82f6; }
.badgem.火 { background: #ef4444; }
.badgem.雷 { background: #f59e0b; }

.btn-mini-kick {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 2px;
    border-radius: 4px;
    opacity: 0.6;
    transition: all 0.2s;
}

.btn-mini-kick:hover { 
    opacity: 1;
    background: #fee2e2; 
}
.log-message.log-info { color: #0c5460; background-color: #d1ecf1; }

/* Dashboard Styles */
.games-list-section {
    margin-bottom: 20px;
}
.active-games-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.game-item-card {
    background: white;
    padding: 10px;
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    gap: 15px; 
}
.game-item-info-grid {
    flex-grow: 1; 
    display: grid;
    grid-template-columns: minmax(110px, max-content) 1fr; 
    grid-template-rows: auto auto;
    gap: 5px 20px; 
    align-items: center;
}
.g-code {
    font-weight: bold;
    font-family: monospace;
    background: #eee;
    padding: 2px 6px;
    border-radius: 3px;
}
.g-phase {
    font-size: 0.9em;
    color: #666;
    text-align: right; 
}
.g-players {
    font-size: 0.9em;
    color: #333;
}
.g-date {
    font-size: 0.8em;
    color: #999;
    text-align: right; 
}
.game-item-actions {
    display: flex;
    flex-direction: row; 
    gap: 5px;
}
.btn-enter, .btn-delete {
    width: 32px; 
    padding: 8px 4px; 
    writing-mode: vertical-rl; 
    text-orientation: upright; 
    letter-spacing: 4px;
    height: auto;
    font-size: 0.9em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    color: white;
    border: none;
    cursor: pointer;
}
.btn-enter { background-color: #4caf50; }
.btn-delete { background-color: #d32f2f; }

/* Ranking Styles */
.results-section {
    background: white;
    padding: 15px;
    border-radius: 8px;
    margin-top: 20px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}
.results-section h3 {
    margin-top: 0;
    color: #e91e63;
    border-bottom: 2px solid #fce4ec;
    padding-bottom: 10px;
}
.ranking-list {
    list-style: none;
    padding: 0;
}
.ranking-list li {
    display: flex;
    justify-content: space-between;
    padding: 10px;
    border-bottom: 1px solid #eee;
}
.ranking-list li.top-winner {
    background-color: #fff8e1;
    font-weight: bold;
    border-left: 5px solid #ffc107;
}
.rank {
    font-weight: bold;
    color: #666;
    width: 40px;
}
.p-name {
    flex-grow: 1;
}
.final-hp {
    font-weight: bold;
    color: #2e7d32;
}

/* Skill Selection Styles */
.skill-config-modal {
    max-width: 450px !important;
    width: 95% !important;
    padding: 20px !important;
    border-radius: 12px !important;
    background: white !important;
    text-align: left !important;
}
.subtitle-config { font-size: 0.8em; color: #777; margin: 4px 0 15px; }
.round-nav-config {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 15px;
}
.config-content {
    background: #fafafa;
    border: 1px solid #eee;
    padding: 10px;
    max-height: 50vh;
    overflow-y: auto;
}
.skill-item-simple {
    padding: 10px;
    border: 1px solid #e0e0e0;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
    color: #333;
}
.skill-item-simple.is-selected {
    border-color: #e91e63;
    background: #fce4ec;
}
.skip-timer-btn {
    border-color: #6c757d !important;
    background: transparent !important;
    color: #6c757d !important;
    margin-bottom: 5px !important;
}
.skip-timer-btn:hover {
    background: #6c757d !important;
    color: white !important;
}
.btn-create-small {
    margin-top: 10px;
    padding: 8px 16px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9em;
}
.btn-create-small:hover {
    background: #45a049;
}
</style>
