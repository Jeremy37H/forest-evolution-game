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
const gameToDelete = ref(null);
const gamesList = ref([]);
const viewMode = ref('dashboard'); // 'dashboard', 'control'

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
    }
};

const enterControlPanel = async (code) => {
    gameCode.value = code;
    try {
        // Just verify it exists first? joinAdminSocket will handle updates
        const res = await axios.get(`${props.apiUrl}/api/game/${code}`);
        game.value = res.data;
        viewMode.value = 'control';
        message.value = '';
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

const createGame = async () => {
    try {
        const res = await axios.post(`${props.apiUrl}/api/game/create`, { playerCount: playerCount.value });
        // game.value = res.data;
        // gameCode.value = res.data.gameCode;
        message.value = `遊戲建立成功！代碼: ${res.data.gameCode}`;
        await fetchGames();
        await enterControlPanel(res.data.gameCode);
    } catch (err) {
        message.value = `錯誤: ${err.response?.data?.message || err.message}`;
    }
};

const startGame = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start`, { gameCode: gameCode.value });
        message.value = '遊戲已開始！';
    } catch (err) {
        message.value = `錯誤: ${err.response?.data?.message || err.message}`;
    }
};

const startAttack = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start-attack`, { gameCode: gameCode.value });
        message.value = '進入攻擊階段！';
    } catch (err) {
        message.value = `錯誤: ${err.response?.data?.message || err.message}`;
    }
};

const startAuction = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start-auction`, { gameCode: gameCode.value });
        message.value = '進入競標階段！';
    } catch (err) {
        message.value = `錯誤: ${err.response?.data?.message || err.message}`;
    }
};

const endAuction = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/end-auction`, { gameCode: gameCode.value });
        message.value = '競標結束，計算結果中...';
    } catch (err) {
        message.value = `錯誤: ${err.response?.data?.message || err.message}`;
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
    } catch (err) {
        message.value = `錯誤: ${err.response?.data?.message || err.message}`;
    }
};

const copyCode = () => {
    navigator.clipboard.writeText(gameCode.value);
    message.value = '代碼已複製！';
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

const joinAdminSocket = () => {
    if (gameCode.value) {
        socketService.connect(props.apiUrl);
         // Admin acts safely effectively as a "viewer" or we can just listen to the specific room
        socketService.emit('joinGame', gameCode.value);
        
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
        <h2>管理員控制台</h2>
        <div class="message" v-if="message">{{ message }}</div>



        <!-- DASHBOARD MODE -->
        <div v-if="viewMode === 'dashboard'">
            <div class="games-list-section">
                <h3>現有遊戲列表</h3>
                <div class="active-games-list" v-if="gamesList.length > 0">
                    <div v-for="g in gamesList" :key="g.gameCode" class="game-item-card">
                        <div class="game-item-info">
                            <span class="g-code">{{ g.gameCode }}</span>
                            <span class="g-phase">{{ formatPhase(g.gamePhase) }}</span>
                            <span class="g-players">人數: {{ g.joinedCount }}/{{ g.playerCount }}</span>
                            <span class="g-date">{{ new Date(g.createdAt).toLocaleTimeString() }}</span>
                        </div>
                        <div class="game-item-actions">
                            <button class="btn-enter" @click="enterControlPanel(g.gameCode)">進入</button>
                            <button class="btn-delete" @click="requestDeleteGame(g.gameCode)">刪除</button>
                        </div>
                    </div>
                </div>
                <p v-else class="no-games">目前沒有進行中的遊戲</p>
            </div>

            <div class="create-section">
                <div class="form-group">
                    <label>玩家人數:</label>
                    <input type="number" v-model="playerCount" min="2" max="10" />
                </div>
                <!-- Remove manual code entry for simplicity on dashboard, or keep as fallback? -->
                <!-- Keeping hidden or just relying on list -->
                <button @click="createGame" class="btn-create">建立新房間</button>
            </div>
            
            <button class="back-btn" @click="$emit('back')">返回首頁</button>
        </div>

        <!-- CONTROL MODE -->
        <div v-else-if="viewMode === 'control'">
            <div class="top-bar">
                <button class="btn-small-back" @click="viewMode = 'dashboard'; gameCode = ''; fetchGames()">← 返回列表</button>
            </div>
            <div class="game-info">
                 <h2 v-if="game.currentRound > 0" class="round-display">
                    第 {{ game.currentRound }} 回合 <span class="phase-badge">{{ formatPhase(game.gamePhase) }}</span>
                </h2>
                <h3>遊戲代碼: <span class="code" @click="copyCode">{{ gameCode }}</span></h3>
            </div>
            
            <div class="controls-grid">
                <button @click="startGame" class="btn-start" :disabled="game && game.gamePhase !== 'waiting'">開始遊戲 (討論)</button>
                <button @click="startAttack" class="btn-attack" :disabled="!game || !game.gamePhase.startsWith('discussion')">開始攻擊階段</button>
                <button @click="startAuction" class="btn-auction" :disabled="!game || !game.gamePhase.startsWith('attack') || game.currentRound >= 4">開始競標階段</button>
                <button @click="endAuction" class="btn-end-auction" :disabled="!game || !game.gamePhase.startsWith('auction')">結束競標 (結算)</button>
                <button @click="triggersEndGame" class="btn-danger">強制結束遊戲</button>
            </div>

            <!-- 新增：遊戲結果排名 (僅在結束時顯示) -->
            <div class="results-section" v-if="game && game.gamePhase === 'finished'">
                <h3>🏆 最終排名</h3>
                <ul class="ranking-list">
                    <li v-for="(p, index) in game.players.slice().sort((a, b) => b.hp - a.hp)" :key="p._id" :class="{ 'top-winner': index === 0 }">
                        <span class="rank">#{{ index + 1 }}</span>
                        <span class="p-name">{{ p.name }}</span>
                        <span class="final-hp">HP: {{ Math.max(0, p.hp) }}</span>
                    </li>
                </ul>
            </div>

            <div class="players-section" v-if="game && game.players">
                <h3>👥 玩家管理 ({{ game.players.length }}/{{ game.playerCount }})</h3>
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
                                等級:{{ p.level }} 攻:{{ p.attack }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        

        
        <!-- Dashboard has its own back button -->
        <!-- <button class="back-btn" @click="$emit('back')">返回首頁</button> -->

        <div v-if="showEndGameConfirm" class="modal-overlay">
            <div class="modal">
                <h3>結束確認</h3>
                <p>您確定要強制結束遊戲嗎？這將無法復原。</p>
                <div class="modal-buttons">
                    <button class="btn-cancel" @click="cancelEndGame">否</button>
                    <button class="btn-confirm" @click="confirmEndGame">是</button>
                </div>
            </div>
        </div>

        <div v-if="showDeleteGameConfirm" class="modal-overlay">
            <div class="modal">
                <h3>刪除確認</h3>
                <p>確定要刪除房間 {{ gameToDelete }} 嗎？所有玩家將被踢出。</p>
                <div class="modal-buttons">
                    <button class="btn-cancel" @click="cancelDeleteGame">否</button>
                    <button class="btn-confirm" @click="confirmDeleteGame">是</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.admin-panel {
    padding: 20px;
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
    display: grid;
    gap: 10px;
    margin-top: 20px;
}
.btn-start { background-color: #4caf50; }
.btn-attack { background-color: #ff9800; }
.btn-auction { background-color: #2196f3; }
.btn-end-auction { background-color: #9c27b0; }
.btn-danger { background-color: #f44336; }
.back-btn {
    margin-top: 20px;
    background-color: #607d8b;
}
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
.badgem.木 { background-color: #4caf50; }
.badgem.水 { background-color: #2196f3; }
.badgem.火 { background-color: #f44336; }
.badgem.雷 { background-color: #ff9800; }

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
</style>
