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
        // Just verify it exists first? joinAdminSocket will handle updates
        const res = await axios.get(`${props.apiUrl}/api/game/${code}`);
        game.value = res.data;
        viewMode.value = 'control';
        message.value = '';
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

const createGame = async () => {
    try {
        const res = await axios.post(`${props.apiUrl}/api/game/create`, { playerCount: playerCount.value });
        // game.value = res.data;
        // gameCode.value = res.data.gameCode;
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
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
    }
};

const startAttack = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start-attack`, { gameCode: gameCode.value });
        message.value = '?脣?餅??挾嚗?;
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
    }
};

const startAuction = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/start-auction`, { gameCode: gameCode.value });
        message.value = '?脣蝡嗆??挾嚗?;
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
    }
};

const endAuction = async () => {
    try {
        await axios.post(`${props.apiUrl}/api/game/end-auction`, { gameCode: gameCode.value });
        message.value = '蝡嗆?蝯?嚗?蝞??葉...';
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
    } catch (err) {
        message.value = `?航炊: ${err.response?.data?.message || err.message}`;
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
                <button @click="createGame" class="btn-create">撱箇??唳??/button>
            </div>
            
            <button class="back-btn" @click="$emit('back')">餈?擐?</button>
        </div>

        <!-- CONTROL MODE -->
        <div v-else-if="viewMode === 'control'">
            <div class="top-bar">
                <button class="btn-small-back" @click="viewMode = 'dashboard'; gameCode = ''; fetchGames()">??餈??”</button>
            </div>
            <div class="game-info">
                 <h2 v-if="game.currentRound > 0" class="round-display">
                    蝚?{{ game.currentRound }} ?? <span class="phase-badge">{{ formatPhase(game.gamePhase) }}</span>
                </h2>
                <h3>?隞?Ⅳ: <span class="code" @click="copyCode">{{ gameCode }}</span></h3>
            </div>
            
            <div class="controls-grid">
                <button @click="startGame" class="btn-start" :disabled="game && game.gamePhase !== 'waiting'">??? (閮?)</button>
                <button @click="startAttack" class="btn-attack" :disabled="!game || !game.gamePhase.startsWith('discussion')">???餅??挾</button>
                <button @click="startAuction" class="btn-auction" :disabled="!game || !game.gamePhase.startsWith('attack') || game.currentRound >= 4">??蝡嗆??挾</button>
                <button @click="endAuction" class="btn-end-auction" :disabled="!game || !game.gamePhase.startsWith('auction')">蝯?蝡嗆? (蝯?)</button>
                <button @click="triggersEndGame" class="btn-danger">撘瑕蝯??</button>
            </div>

            <!-- ?啣?嚗??脩?????(?蝯??＊蝷? -->
            <div class="results-section" v-if="game && game.gamePhase === 'finished'">
                <h3>?? ?蝯???/h3>
                <ul class="ranking-list">
                    <li v-for="(p, index) in game.players.slice().sort((a, b) => b.hp - a.hp)" :key="p._id" :class="{ 'top-winner': index === 0 }">
                        <span class="rank">#{{ index + 1 }}</span>
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
                        </div>
                    </div>
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
