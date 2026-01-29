<script setup>
import { ref, defineProps, computed, onMounted, onUnmounted, watch } from 'vue';
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
    if (phase === 'waiting') return '蝑???';
    if (phase.startsWith('discussion')) return '閮??挾';
    if (phase.startsWith('attack')) return '?餅??挾';
    if (phase.startsWith('auction')) return '蝡嗆??挾';
    if (phase === 'finished') return '?蝯?';
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
    }
};

const enterControlPanel = async (code) => {
    gameCode.value = code;
    try {
        // Just verify it exists first
        const res = await axios.get(`${props.apiUrl}/api/game/${code}`);
        game.value = res.data;
        viewMode.value = 'control';
        message.value = '';
        
        // Explicitly join socket to ensure connection
        if (typeof joinAdminSocket === 'function') {
             joinAdminSocket();
        }
    } catch (err) {
        message.value = `?⊥??脣?: ${err.response?.data?.message || err.message}`;
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
        message.value = `? ${gameToDelete.value} 撌脣?亡;
        showDeleteGameConfirm.value = false;
        gameToDelete.value = null;
        await fetchGames();
    } catch (err) {
        message.value = `?芷憭望?: ${err.response?.data?.message || err.message}`;
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
            customSkillsByRound: cleanCustomSkills
        });
        message.value = `?撱箇???嚗誨蝣? ${res.data.gameCode}`;
        await fetchGames();
        await enterControlPanel(res.data.gameCode);
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
    }
};

const startGame = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start`, { gameCode: gameCode.value });
        message.value = '?撌脤?憪?';
        await refreshCurrentGame();
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
    }
};

const startAttack = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start-attack`, { gameCode: gameCode.value });
        message.value = '?脣?餅??挾嚗?;
        await refreshCurrentGame();
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
    }
};

const startAuction = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start-auction`, { gameCode: gameCode.value });
        message.value = '?脣蝡嗆??挾嚗?;
        await refreshCurrentGame();
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
    }
};

const endAuction = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/end-auction`, { gameCode: gameCode.value });
        message.value = '蝡嗆?蝯?嚗?蝞??葉...';
        await refreshCurrentGame();
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
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
        message.value = '?撘瑕蝯?嚗?;
        await refreshCurrentGame();
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
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
        message.value = `?拙振 ${playerToKick.value.name} 撌脰◤頦ａ`;
        showKickPlayerConfirm.value = false;
        playerToKick.value = null;
        await refreshCurrentGame();
    } catch (err) {
        message.value = `頦ａ憭望?: ${err.response?.data?.message || err.message}`;
        showKickPlayerConfirm.value = false;
    }
};

const copyCode = () => {
    navigator.clipboard.writeText(gameCode.value);
    message.value = '隞?Ⅳ撌脰?鋆踝?';
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
        message.value = `?湔憭望?: ${err.response?.data?.message || err.message}`;
    }
};

const joinAdminSocket = () => {
    if (gameCode.value) {
        socketService.connect(props.apiUrl);
        
        // Initial join
        if (socketService.socket && socketService.socket.connected) {
             socketService.emit('joinGame', gameCode.value);
        }

        // Handle reconnection
        socketService.socket.on('connect', () => {
             console.log('[Admin] Socket connected/reconnected');
             socketService.emit('joinGame', gameCode.value);
        });

        socketService.on('gameStateUpdate', (updatedGame) => {
            if (updatedGame && updatedGame.gameCode === gameCode.value) {
                game.value = updatedGame;
            }
        });
    }
};

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

onMounted(() => {
    fetchGames();
    if (gameCode.value) {
        joinAdminSocket();
        viewMode.value = 'control';
    }
});

onUnmounted(() => {
    socketService.disconnect();
});
</script>

<template>
    <div class="admin-panel">
        <h2>蝞∠??⊥?嗅</h2>
        <div class="message" v-if="message">{{ message }}</div>



        <!-- DASHBOARD MODE -->
        <div v-if="viewMode === 'dashboard'">
            <div class="games-list-section">
                <h3>?暹???”</h3>
                <div class="active-games-list" v-if="gamesList.length > 0">
                    <div v-for="g in gamesList" :key="g.gameCode" class="game-item-card">
                        <div class="game-item-info">
                            <span class="g-code">{{ g.gameCode }}</span>
                            <span class="g-phase">{{ formatPhase(g.gamePhase) }}</span>
                            <span class="g-players">鈭箸: {{ g.joinedCount }}/{{ g.playerCount }}</span>
                            <span class="g-date">{{ new Date(g.createdAt).toLocaleTimeString() }}</span>
                        </div>
                        <div class="game-item-actions">
                            <button class="btn-enter" @click="enterControlPanel(g.gameCode)">?脣</button>
                            <button class="btn-delete" @click="requestDeleteGame(g.gameCode)">?芷</button>
                        </div>
                    </div>
                </div>
                <p v-else class="no-games">?桀?瘝??脰?銝剔??</p>
            </div>

            <div class="create-section">
                <div class="form-group">
                    <label>?拙振鈭箸:</label>
                    <input type="number" v-model="playerCount" min="2" max="10" />
                </div>
                <!-- Remove manual code entry for simplicity on dashboard, or keep as fallback? -->
                <!-- Keeping hidden or just relying on list -->
                <div style="display: flex; align-items: center; gap: 5px;">
                    <button @click="createGame" class="btn-create">撱箇??唳??/button>
                    <span @click="openSkillConfig" style="cursor: pointer; opacity: 0.3; font-size: 14px; padding: 5px;" title="閮剖?蝡嗆????>??</span>
                </div>
            </div>
            
            <button class="back-btn" @click="$emit('back')">餈?擐?</button>
        </div>

        <!-- CONTROL MODE -->
        <!-- CONTROL MODE -->
        <div v-else-if="viewMode === 'control'" class="control-panel-container">
            <button class="btn-back-arrow-enhanced" @click="viewMode = 'dashboard'; gameCode = ''; fetchGames()" title="餈??”">??/button>
            
            <div class="game-info">
                 <h2 v-if="game.currentRound > 0" class="round-display">
                    蝚?{{ game.currentRound }} ?? <span class="phase-badge">{{ formatPhase(game.gamePhase) }}</span>
                </h2>
                <h3>?隞?Ⅳ: <span class="code" @click="copyCode">{{ gameCode }}</span></h3>
            </div>
            
            <div class="controls-grid-simplified">
                <!-- Row 1: Action Button -->
                <button v-if="game && game.gamePhase === 'waiting'" @click="startGame" class="btn-action btn-start">??? (?脣閮?)</button>
                <button v-if="game && game.gamePhase.startsWith('discussion')" @click="startAttack" class="btn-action btn-attack">???餅??挾</button>
                <button v-if="game && game.gamePhase.startsWith('attack') && game.currentRound < 4" @click="startAuction" class="btn-action btn-auction">??蝡嗆??挾</button>
                <button v-if="game && game.gamePhase.startsWith('auction')" @click="endAuction" class="btn-action btn-end-auction">蝯?蝡嗆? (蝯?)</button>
                
                <!-- Row 2: End Game -->
                <button @click="triggersEndGame" class="btn-action btn-danger">蝯??</button>
            </div>

            <!-- ?啣?嚗??脩?????(?蝯??＊蝷? -->
            <div class="results-section" v-if="game && game.gamePhase === 'finished'">
                <h3>?? ?蝯???/h3>
                <ul class="ranking-list">
                    <li v-for="(p, index) in game.players.slice().sort((a, b) => b.hp - a.hp)" :key="p._id" :class="{ 'top-winner': p.hp === Math.max(...game.players.map(pl => pl.hp)) }">
                        <span class="rank">#{{ game.players.filter(other => other.hp > p.hp).length + 1 }}</span>
                        <span class="p-name">{{ p.name }}</span>
                        <span class="final-hp">HP: {{ Math.max(0, p.hp) }}</span>
                    </li>
                </ul>
            </div>

            <div class="players-section" v-if="game && game.players">
                <h3>? ?拙振蝞∠? ({{ game.players.length }}/{{ game.playerCount }})</h3>
                <div class="players-grid">
                    <div v-for="p in game.players" :key="p._id" class="player-admin-card">
                        <div class="p-row-1">
                            <div class="p-identity">
                                <strong>{{ p.name }}</strong>
                                <small class="code-small">{{ p.playerCode }}</small>
                            </div>
                            <span class="badgem" :class="p.attribute">{{ p.attribute }}</span>
                        </div>
                        <div class="p-row-2">
                             <div class="hp-control">
                                <button class="btn-mini" @click="updatePlayerHp(p, p.hp - 1)">-</button>
                                <span class="hp-val">{{ Math.max(0, p.hp) }}</span>
                                <button class="btn-mini" @click="updatePlayerHp(p, p.hp + 1)">+</button>
                            </div>
                            <div class="stat-mini">
                                蝑?:{{ p.level }} ??{{ p.attack }}
                            </div>
                            <button class="btn-mini-kick" @click="requestKickPlayer(p)" title="頦ａ">??/button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="admin-log-section" v-if="game && game.gameLog && game.gameLog.length > 0">
                 <h3>?? ???</h3>
                 <div class="log-container" ref="logContainer">
                    <div v-for="(log, idx) in game.gameLog" :key="idx" :class="`log-message log-${log.type}`">{{ log.text }}</div>
                 </div>
            </div>
        </div>
        

        
        <!-- Dashboard has its own back button -->
        <!-- <button class="back-btn" @click="$emit('back')">餈?擐?</button> -->

        <div v-if="showEndGameConfirm" class="modal-overlay">
            <div class="modal">
                <h3>蝯?蝣箄?</h3>
                <p>?函Ⅱ摰?撘瑕蝯???????⊥?敺拙???/p>
                <div class="modal-buttons">
                    <button class="btn-cancel" @click="cancelEndGame">??/button>
                    <button class="btn-confirm" @click="confirmEndGame">??/button>
                </div>
            </div>
        </div>

        <div v-if="showDeleteGameConfirm" class="modal-overlay">
            <div class="modal">
                <h3>?芷蝣箄?</h3>
                <p>蝣箏?閬?斗??{{ gameToDelete }} ????摰嗅?鋡怨腺?箝?/p>
                <div class="modal-buttons">
                    <button class="btn-cancel" @click="cancelDeleteGame">??/button>
                    <button class="btn-confirm" @click="confirmDeleteGame">??/button>
                </div>
            </div>
        </div>

        <div v-if="showKickPlayerConfirm" class="modal-overlay">
            <div class="modal">
                <h3>頦ａ蝣箄?</h3>
                <p>蝣箏?閬??拙振 {{ playerToKick?.name }} 頦Ｗ???</p>
                <div class="modal-buttons">
                    <button class="btn-cancel" @click="cancelKickPlayer">??/button>
                    <button class="btn-confirm" @click="confirmKickPlayer">??/button>
                </div>
            </div>
        </div>

        <!-- Skill Config Modal -->
        <div v-if="showSkillConfig" class="modal-overlay" @click="showSkillConfig = false">
            <div class="modal skill-config-modal" @click.stop>
                <div class="modal-header-config">
                    <h3 style="margin: 0; color: #333;">?? ?芷瘥??奎璅???/h3>
                    <p class="subtitle-config">?交?暸嚗府??撠雁??閮剖???/p>
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
                        {{ Object.keys(allSkillsPool[activeConfigRound] || {}).every(s => selectedSkillsByRound[activeConfigRound][s]) ? '?????券' : '???券?祈憚' }}
                    </div>
                    <div class="simple-skill-list">
                        <div v-for="(desc, name) in allSkillsPool[activeConfigRound]" :key="name" 
                             class="skill-item-simple"
                             :class="{ 'is-selected': selectedSkillsByRound[activeConfigRound][name] }"
                             @click="toggleSkillSelection(activeConfigRound, name, desc)">
                            <div class="skill-name-row">
                                <span v-if="selectedSkillsByRound[activeConfigRound][name]" class="check-icon">??/span>
                                <span v-else class="check-icon">??/span>
                                {{ name }}
                            </div>
                            <div class="skill-desc-simple">{{ desc }}</div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer-config">
                    <button class="btn-confirm-config" @click="showSkillConfig = false" style="background-color: #e91e63;">蝣箏?靽?閮剖?</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.admin-panel {
    position: relative;
    padding: 15px; /* Reduced padding from 20px */
    border: 2px solid #333;
    border-radius: 8px;
    background-color: #fce4ec;
}
.message {
    padding: 10px;
    background: #fff;
    border-radius: 4px;
    margin-bottom: 10px;
    color: #c2185b;
    font-weight: bold;
}
.form-group {
    margin-bottom: 15px;
}
.code {
    font-family: monospace;
    font-size: 1.5em;
    background: #eee;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
}
.round-display {
    color: #333;
    margin-bottom: 5px;
}
.phase-badge {
    background-color: #ff9800;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.6em;
    vertical-align: middle;
}
.controls-grid {
    display: none; /* Deprecated */
}
.control-panel-container {
    /* position: relative; Removed */
    padding-top: 5px; /* Reduced from 10px */
}
.btn-back-arrow-enhanced {
    position: absolute;
    top: 15px;
    right: 15px; /* Top Right Position */
    width: 40px !important;
    height: 40px;
    padding: 0;
    font-size: 1.5em;
    line-height: 40px;
    background-color: white;
    color: #555;
    border-radius: 50%; /* Circle shape */
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    z-index: 100;
    transition: all 0.2s;
}
.btn-back-arrow-enhanced:hover {
    background-color: #f5f5f5;
    transform: scale(1.1);
    color: #000;
}
.controls-grid-simplified {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-top: 20px;
}
.btn-action {
    width: 100%;
    padding: 15px;
    font-size: 1.2em;
    font-weight: bold;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    transition: transform 0.1s;
}
.btn-action:active {
    transform: scale(0.98);
}
.btn-start { background-color: #4caf50; }
.btn-attack { background-color: #ff9800; }
.btn-auction { background-color: #2196f3; }
.btn-end-auction { background-color: #9c27b0; }
.btn-danger { background-color: #f44336; }
/* .back-btn removed/deprecated */
button {
    width: 100%;
    color: white;
    border: none;
    padding: 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
}
button:hover {
    filter: brightness(90%);
}
button:disabled {
    background-color: #e0e0e0;
    color: #a0a0a0;
    cursor: not-allowed;
    filter: none;
}
.btn-create {
    background-color: #2196f3;
    margin-top: 10px;
}
.players-section {
    margin-top: 30px;
    border-top: 1px solid #ccc;
    padding-top: 10px;
}
.players-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
}
.player-admin-card {
    background: white;
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    font-size: 0.9em;
}
.p-row-1, .p-row-2 {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.p-row-2 { margin-top: 6px; }
.p-identity {
    display: flex;
    align-items: baseline;
    gap: 6px;
}
.code-small {
    color: #999;
    font-size: 0.8em;
}
.badgem {
    padding: 2px 6px;
    border-radius: 3px;
    color: white;
    font-size: 0.8em;
    font-weight: bold;
}
.badgem.??{ background-color: #4caf50; }
.badgem.瘞?{ background-color: #2196f3; }
.badgem.??{ background-color: #f44336; }
.badgem.??{ background-color: #ff9800; }

.hp-control {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #f5f5f5;
    border-radius: 15px;
    padding: 2px;
}
.hp-val {
    font-weight: bold;
    min-width: 20px;
    text-align: center;
    color: #e91e63;
}
.btn-mini {
    width: 24px;
    height: 24px;
    padding: 0;
    line-height: 24px;
    border-radius: 50%;
    font-size: 1.2em;
    background: #ddd;
    color: #333;
    display: flex;
    justify-content: center;
    align-items: center;
}
.btn-mini:hover { background: #ccc; }
.stat-mini {
    font-size: 0.85em;
    color: #666;
    background: #f0f0f0;
    padding: 2px 6px;
    border-radius: 4px;
}
.btn-mini-kick {
    width: 24px;
    height: 24px;
    padding: 0;
    line-height: 24px;
    border-radius: 50%;
    font-size: 1em;
    background: #ff5252;
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
    border: none;
    cursor: pointer;
    margin-left: auto;
}
.btn-mini-kick:hover { background: #d32f2f; }

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}
.modal {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    text-align: center;
    min-width: 300px;
}
.modal-buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 15px;
}
.btn-confirm {
    background-color: #f44336;
    width: auto;
    padding: 8px 20px;
}
.btn-cancel {
    background-color: #607d8b;
    width: auto;
    padding: 8px 20px;
}

.admin-log-section {
    margin-top: 30px;
    border-top: 2px solid #ccc; /* Separator */
    padding-top: 10px;
}
.log-container {
  margin-top: 10px; 
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 10px;
  max-height: 120px; /* Limit height to approx 3-4 lines */
  min-height: 60px;
  overflow-y: auto; 
  text-align: left;
  display: flex; flex-direction: column;
}
.log-message {
  background-color: #f8f9fa; padding: 5px 8px; margin-bottom: 5px;
  border-radius: 4px; font-size: 0.85em;
  border-bottom: 1px solid #eee;
}
.log-message:last-child { margin-bottom: 0; }
.log-message.log-success { color: #155724; background-color: #d4edda; }
.log-message.log-error { color: #721c24; background-color: #f8d7da; }
.log-message.log-battle { color: #856404; background-color: #fff3cd; }
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
}
.game-item-info {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
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
}
.g-players {
    font-size: 0.9em;
    color: #333;
}
.g-date {
    font-size: 0.8em;
    color: #999;
}
.game-item-actions {
    display: flex;
    gap: 5px;
}
.btn-enter {
    background-color: #4caf50;
    width: auto;
    padding: 5px 10px;
    font-size: 0.9em;
}
.btn-delete {
    background-color: #f44336;
    width: auto;
    padding: 5px 10px;
    font-size: 0.9em;
}
.btn-small-back {
    background-color: #78909c;
    width: auto;
    margin-bottom: 10px;
}
.create-section {
    background: white;
    padding: 15px;
    border-radius: 8px;
    margin-top: 20px;
}
.no-games {
    text-align: center;
    color: #777;
    font-style: italic;
    padding: 20px;
}

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

/* Skill Selection Styles - Kept Independent to avoid breaking existing UI */
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
.round-nav-config button {
    background: #f0f0f0;
    color: #555;
    font-size: 0.9em;
}
.round-nav-config button.active {
    background: #e91e63 !important;
    color: white !important;
}
.config-content {
    background: #fafafa;
    border: 1px solid #eee;
    padding: 10px;
    max-height: 50vh;
    overflow-y: auto;
}
.btn-text-only {
    color: #e91e63;
    font-size: 0.85em;
    font-weight: bold;
}
.simple-skill-list {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
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
.skill-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
}
.check-icon { font-size: 1.2em; color: #e91e63; }
.skill-desc-simple {
    font-size: 0.85em;
    color: #666;
    margin-top: 4px;
    padding-left: 20px;
}
.modal-footer-config {
    margin-top: 20px;
}
.btn-confirm-config {
    width: 100%;
}
</style>
