import axios from 'axios';

const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

const apiClient = axios.create({
    baseURL: API_URL
});

export const gameApi = {
    // 遊戲進入
    join: (data) => apiClient.post('/api/game/join', data),
    rejoin: (data) => apiClient.post('/api/game/rejoin', data),

    // 玩家行動
    attack: (data) => apiClient.post('/api/game/action/attack', data),
    scout: (data) => apiClient.post('/api/game/action/scout', data),
    levelUp: (data) => apiClient.post('/api/game/action/levelup', data),
    useSkill: (data) => apiClient.post('/api/game/action/use-skill', data),
    placeBid: (data) => apiClient.post('/api/game/action/bid', data),

    // 其他
    getVersion: () => apiClient.get('/api/game/version')
};

export default gameApi;
