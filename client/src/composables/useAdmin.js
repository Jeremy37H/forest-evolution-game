import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import socketService from '../socketService';

export function useAdmin(apiUrl, emit) {
    // --- 狀態定義 ---
    const gamesList = ref([]);
    const game = ref(null);
    const gameCode = ref('');
    const playerCount = ref(4);
    const viewMode = ref('dashboard'); // 'dashboard', 'control'
    const message = ref('');

    // 技能配置相關
    const showSkillConfig = ref(false);
    const activeConfigRound = ref(1);
    const allSkillsPool = ref({});
    const selectedSkillsByRound = ref({ 1: {}, 2: {}, 3: {} });

    // 彈窗確認相關
    const confirmDialog = ref({ active: false, type: '', data: null });

    // --- Computed ---
    const playersList = computed(() => game.value?.players || []);

    const fetchSkillsPool = async () => {
        try {
            const res = await axios.get(`${apiUrl}/api/game/admin/skills-pool`);
            allSkillsPool.value = res.data;
        } catch (error) {
            console.error('Fetch skills pool failed:', error);
        }
    };

    const toggleSkillSelection = (round, skillName, desc) => {
        if (selectedSkillsByRound.value[round][skillName]) {
            const newObj = { ...selectedSkillsByRound.value[round] };
            delete newObj[skillName];
            selectedSkillsByRound.value[round] = newObj;
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

    const fetchGames = async () => {
        try {
            const res = await axios.get(`${apiUrl}/api/game/admin/list`);
            gamesList.value = res.data;
        } catch (error) {
            message.value = '無法獲取遊戲列表';
        }
    };

    const createGame = async () => {
        try {
            const cleanCustomSkills = {};
            for (const [round, skills] of Object.entries(selectedSkillsByRound.value)) {
                if (skills && Object.keys(skills).length > 0) {
                    cleanCustomSkills[round] = skills;
                }
            }

            const res = await axios.post(`${apiUrl}/api/game/create`, {
                playerCount: playerCount.value,
                customSkillsByRound: cleanCustomSkills
            });
            message.value = `遊戲已建立！代碼: ${res.data.gameCode}`;
            await fetchGames();
            await enterControlPanel(res.data.gameCode);
        } catch (error) {
            message.value = error.response?.data?.message || '建立失敗';
        }
    };

    const enterControlPanel = async (code) => {
        try {
            const res = await axios.get(`${apiUrl}/api/game/${code}`);
            game.value = res.data;
            gameCode.value = code;
            viewMode.value = 'control';
            joinAdminSocket();
        } catch (err) {
            message.value = '進入控制面板失敗';
        }
    };

    // --- Socket 監聽 ---
    const joinAdminSocket = () => {
        if (!gameCode.value) return;
        socketService.connect(apiUrl);
        socketService.emit('joinGame', gameCode.value);
        socketService.on('gameStateUpdate', (updatedGame) => {
            if (updatedGame && updatedGame.gameCode === gameCode.value) {
                game.value = updatedGame;
            }
        });
    };

    // --- 遊戲控制 Actions ---
    const adminAction = async (action, data = {}) => {
        try {
            let res;
            if (action === 'delete') {
                res = await axios.delete(`${apiUrl}/api/game/admin/delete/${data.targetCode}`);
                viewMode.value = 'dashboard';
                gameCode.value = '';
                await fetchGames();
            } else if (action === 'kick-player') {
                res = await axios.post(`${apiUrl}/api/game/admin/kick-player`, {
                    gameCode: gameCode.value,
                    playerId: data.playerId
                });
            } else {
                // For start, start-attack, start-auction, end-auction, end-game
                res = await axios.post(`${apiUrl}/api/game/${action}`, {
                    gameCode: gameCode.value,
                    ...data
                });
            }
            message.value = res.data?.message || '操作成功';
            if (action !== 'delete') await refreshCurrentGame();
        } catch (err) {
            message.value = err.response?.data?.message || '操作失敗';
        }
    };

    const updatePlayerHp = async (p, newHp) => {
        try {
            await axios.post(`${apiUrl}/api/game/admin/update-player`, {
                gameCode: gameCode.value,
                playerId: p._id,
                updates: { hp: newHp }
            });
        } catch (err) {
            message.value = '更新 HP 失敗';
        }
    };

    const refreshCurrentGame = async () => {
        if (!gameCode.value) return;
        try {
            const res = await axios.get(`${apiUrl}/api/game/${gameCode.value}`);
            game.value = res.data;
        } catch (err) { }
    };

    onMounted(() => {
        fetchGames();
    });

    return {
        // States
        gamesList, game, gameCode, playerCount, viewMode, message,
        showSkillConfig, activeConfigRound, allSkillsPool, selectedSkillsByRound,
        confirmDialog,
        // Computed
        playersList,
        // Actions
        fetchSkillsPool, toggleSkillSelection, selectAllForRound, fetchGames, createGame,
        enterControlPanel, adminAction, updatePlayerHp, refreshCurrentGame
    };
}
