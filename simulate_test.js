
const axios = require('axios');

const API_URL = 'http://localhost:3001';

async function runTest() {
    console.log("1. Starting Simulation: Create Game with Custom Skills...");

    const customSkillsPayload = {
        '1': {
            '劇毒': '每一回合可指定一位玩家扣除 2 點 HP。',
            '基因改造': '升級進化所需要的血量減少 1 點，且升級後額外多加 1 防禦。'
        },
        '2': {}, // Empty for R2
        '3': {}  // Empty for R3
    };

    try {
        // Step 1: Create Game
        const createRes = await axios.post(`${API_URL}/api/game/create`, {
            playerCount: 4,
            customSkillsByRound: customSkillsPayload
        });

        if (createRes.status !== 201) {
            throw new Error(`Failed to create game: ${createRes.status}`);
        }

        const game = createRes.data;
        console.log(`   -> Game Created! Code: ${game.gameCode}`);

        // Step 2: Verify Game State
        console.log("2. Verifying Game State from API...");
        const getRes = await axios.get(`${API_URL}/api/game/${game.gameCode}`);
        const fetchedGame = getRes.data;

        // Check R1 Skills
        const r1Skills = fetchedGame.customSkillsByRound['1'];
        const skillKeys = Object.keys(r1Skills);

        console.log(`   -> R1 Skills Found: ${skillKeys.join(', ')}`);

        if (skillKeys.length === 2 && skillKeys.includes('劇毒') && skillKeys.includes('基因改造')) {
            console.log("   [SUCCESS] R1 Skills match expected configuration.");
        } else {
            console.error("   [FAILURE] R1 Skills do NOT match!");
            console.error("   Expected: 劇毒, 基因改造");
            console.error(`   Got: ${skillKeys.join(', ')}`);
            process.exit(1);
        }

        // Check R2 (Should be empty or undefined if we sent empty)
        // Actually the backend might store it as Map or Object depending on Schema, 
        // but simple JSON return should be Object.
        const r2Skills = fetchedGame.customSkillsByRound['2'];
        if (!r2Skills || Object.keys(r2Skills).length === 0) {
            console.log("   [SUCCESS] R2 Skills are empty as expected.");
        } else {
            console.warn("   [WARNING] R2 Skills are not empty:", r2Skills);
        }

        console.log("\nSimulation Test Passed! The backend correctly handles custom skill configurations.");

    } catch (error) {
        console.error("Test Failed (Full Error):", error);
        if (error.code === 'ECONNREFUSED') {
            console.error("CRITICAL: Local server (localhost:3001) is NOT running. Please start it with 'npm run dev' or 'npm start'.");
        }
        process.exit(1);
    }
}

runTest();
