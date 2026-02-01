const axios = require('axios');

async function debug() {
    try {
        console.log('Fetching games list...');
        const listRes = await axios.get('http://localhost:3001/api/game/admin/list');
        const games = listRes.data;
        if (games.length === 0) {
            console.log('No games found.');
            return;
        }

        const gameCode = games[0].gameCode;
        console.log(`Fetching details for game: ${gameCode}`);

        const gameRes = await axios.get(`http://localhost:3001/api/game/${gameCode}`);
        const game = gameRes.data;

        console.log('--- Inspecting skillsForAuction ---');
        console.log(JSON.stringify(game.skillsForAuction, null, 2));

        console.log('--- Inspecting customSkillsByRound ---');
        console.log(JSON.stringify(game.customSkillsByRound, null, 2));

        console.log('--- Inspecting auctionState.queue ---');
        console.log(JSON.stringify(game.auctionState?.queue, null, 2));

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.error('Response data:', e.response.data);
    }
}

debug();
