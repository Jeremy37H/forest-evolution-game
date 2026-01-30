import { ref } from 'vue';
import gameApi from '../services/gameApi';
import socketService from '../socketService';

export function useGameActions(game, player, uiState, addLogMessage, apiUrl) {
    const newPlayerName = ref('');
    const gameCodeInput = ref('');
    const playerCodeInput = ref('');
    const scoutResult = ref(null);
    const scoutConfirm = ref({ active: false, target: null });
    const hibernateConfirm = ref({ active: false });

    const joinGame = async () => {
        if (!newPlayerName.value || !gameCodeInput.value) return addLogMessage('請輸入名字和遊戲代碼', 'error');
        try {
            const response = await gameApi.join({
                gameCode: gameCodeInput.value.toUpperCase(),
                name: newPlayerName.value,
            });
            player.value = response.data.player;
            game.value = response.data.game;
            localStorage.setItem('forestPlayerCode', player.value.playerCode);
            uiState.value = 'showCode';
        } catch (error) {
            addLogMessage(error.response?.data?.message || '加入失敗', 'error');
        }
    };

    const rejoinWithCode = async () => {
        const rawCode = playerCodeInput.value || localStorage.getItem('forestPlayerCode');
        if (!rawCode) return;
        const code = rawCode.trim();

        try {
            const response = await gameApi.rejoin({ playerCode: code.toUpperCase() });
            player.value = response.data.player;
            game.value = response.data.game;
            uiState.value = 'inGame';
            localStorage.setItem('forestPlayerCode', player.value.playerCode);
            addLogMessage(`歡迎回來, ${player.value.name}!`, 'success');

            if (game.value.gameCode && (!socketService.socket || !socketService.socket.connected)) {
                socketService.connect(apiUrl);
                socketService.emit('joinGame', game.value.gameCode);
            }
        } catch (error) {
            console.warn("Rejoin failed:", error);
            localStorage.removeItem('forestPlayerCode');
            if (playerCodeInput.value) {
                addLogMessage(error.response?.data?.message || '找不到此代碼，無法重返', 'error');
            }
            uiState.value = 'login';
        }
    };

    const attackPlayer = async (targetId) => {
        if (!game.value || !player.value) return;
        try {
            await gameApi.attack({
                gameCode: game.value.gameCode,
                attackerId: player.value._id,
                targetId: targetId,
            });
        } catch (error) {
            addLogMessage(error.response?.data?.message || '攻擊失敗', 'error');
        }
    };

    const scoutPlayer = async (target) => {
        if (!player.value || !target) return;
        try {
            const response = await gameApi.scout({
                gameCode: game.value.gameCode,
                playerId: player.value._id,
                targetId: target._id
            });
            scoutResult.value = response.data.scoutResult;
            addLogMessage(response.data.message, 'success');
            scoutConfirm.value = { active: false, target: null };
        } catch (error) {
            addLogMessage(error.response?.data?.message || '偵查失敗', 'error');
            scoutConfirm.value = { active: false, target: null };
        }
    };

    const levelUp = async () => {
        if (!player.value) return;
        try {
            const response = await gameApi.levelUp({ playerId: player.value._id });
            addLogMessage(response.data.message, 'success');
        } catch (error) {
            addLogMessage(error.response?.data?.message || '升級失敗', 'error');
        }
    };

    const logout = () => {
        localStorage.removeItem('forestPlayerCode');
        window.location.reload();
    };

    return {
        newPlayerName,
        gameCodeInput,
        playerCodeInput,
        scoutResult,
        scoutConfirm,
        hibernateConfirm,
        joinGame,
        rejoinWithCode,
        attackPlayer,
        scoutPlayer,
        levelUp,
        logout
    };
}
