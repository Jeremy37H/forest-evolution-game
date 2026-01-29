const axios = require('axios');

async function debugGames() {
    try {
        const res = await axios.get('http://localhost:3001/api/games/admin/list');
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

debugGames();
