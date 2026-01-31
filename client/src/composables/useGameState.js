import { ref, toRefs, reactive, nextTick, onMounted } from 'vue';

export function useGameState(apiUrl) {
    const state = reactive({
        game: null,
        player: null,
        uiState: 'login', // 'login', 'rejoin', 'showCode', 'inGame', 'admin'
        logMessages: [],
        socketStatus: '🟡 等待初始化...',
        attributeGuesses: {}
    });

    const logContainer = ref(null);
    const isHit = ref(false);

    const loadGuesses = () => {
        const saved = localStorage.getItem('attributeGuesses');
        if (saved) {
            try {
                state.attributeGuesses = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to load guesses', e);
            }
        }
    };

    const cycleGuess = (playerId) => {
        const sequence = [null, '木', '水', '火', '雷'];
        const current = state.attributeGuesses[playerId] || null;
        const currentIndex = sequence.indexOf(current);
        const nextIndex = (currentIndex + 1) % sequence.length;
        state.attributeGuesses[playerId] = sequence[nextIndex];
        localStorage.setItem('attributeGuesses', JSON.stringify(state.attributeGuesses));
    };

    const addLogMessage = (text, type = 'info') => {
        if (state.logMessages.length > 0) {
            const lastMsg = state.logMessages[state.logMessages.length - 1];
            if (lastMsg.text === text) return;
        }
        state.logMessages.push({ id: Date.now(), text, type });
        if (state.logMessages.length > 50) {
            state.logMessages.splice(0, state.logMessages.length - 50);
        }
        nextTick(() => {
            if (logContainer.value) {
                logContainer.value.scrollTop = logContainer.value.scrollHeight;
            }
        });
    };

    onMounted(() => {
        loadGuesses();
    });

    return {
        ...toRefs(state),
        logContainer,
        isHit,
        addLogMessage,
        cycleGuess
    };
}
