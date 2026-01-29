const axios = require('axios');

async function debugGames() {
    try {
        const res = await axios.get('http://localhost:3001/api/game/admin/list'); // Corrected URL
        console.log("Status:", res.status);
        res.data.forEach(game => {
            console.log(`Game: ${game.gameCode}, Players: ${game.joinedCount}`);
            // Need to fetch individual game details to see players
            axios.get(`http://localhost:3001/api/game/${game.gameCode}`).then(gRes => {
                gRes.data.players.forEach(p => {
                    console.log(` - Player: ${p.name}, Attribute: '${p.attribute}'`);
                });
            }).catch(err => console.error("Game fetch error", err.message));
        });
    } catch (e) {
        console.error("List fetch error:", e.message);
    }
}

debugGames();
