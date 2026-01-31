
const BASE_URL = 'http://localhost:3001/api/game';

async function post(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return { data };
}

async function get(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return { data };
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPhase(gameCode, targetPhase, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const { data: state } = await get(`${BASE_URL}/${gameCode}`);
        if (state.gamePhase.startsWith(targetPhase)) {
            console.log(`[Status] Detected phase transition to: ${state.gamePhase}`);
            return state;
        }
        await sleep(1000);
    }
    throw new Error(`Timeout waiting for phase ${targetPhase}`);
}

async function runTest() {
    console.log("=== Starting Auto-Pilot Logic Test ===");

    // 1. Create Game with AutoPilot
    const { data: createData } = await post(`${BASE_URL}/create`, {
        playerCount: 4,
        isAutoPilot: true
    });
    const gameCode = createData.gameCode;
    console.log(`[Admin] Game Created: ${gameCode}, AutoPilot: true`);

    // 2. Players Join
    const players = [];
    for (let i = 1; i <= 4; i++) {
        const { data: joinData } = await post(`${BASE_URL}/join`, { gameCode, name: `Tester${i}` });
        players.push(joinData.player);
    }
    console.log(`[Status] All 4 players joined.`);

    // 3. Start Game
    await post(`${BASE_URL}/start`, { gameCode });
    console.log("[Admin] Game Started!");

    // 4. Verify Discussion Phase & Timer
    await sleep(1000);
    const { data: state1 } = await get(`${BASE_URL}/${gameCode}`);
    console.log(`[Status] Phase: ${state1.gamePhase}`);
    if (!state1.auctionState.endTime) {
        console.error("[Error] EndTime NOT found in discussion phase!");
        process.exit(1);
    }

    // 5. Test "Ready" Fast-Forward
    console.log("[Test] Testing Everyone Ready Fast-Forward...");
    for (const p of players) {
        await post(`${BASE_URL}/player/ready`, { gameCode, playerId: p._id });
    }

    // Wait for transition to attack phase
    await waitForPhase(gameCode, 'attack');
    console.log("[Success] Discussion Ready fast-forward worked!");

    // 6. Test All Acted Fast-Forward in Attack Phase
    console.log("[Test] Testing All Players Attacked Fast-Forward...");
    const targets = players.map(p => p._id);
    for (let i = 0; i < players.length; i++) {
        const attackerId = players[i]._id;
        const targetId = targets[(i + 1) % targets.length];
        await post(`${BASE_URL}/action/attack`, { gameCode, attackerId, targetId });
    }

    // Wait for transition to auction
    console.log("[Status] Waiting for auto-transition to auction phase...");
    await waitForPhase(gameCode, 'auction');

    // 7. Verify Auction is active
    await sleep(2000); // Wait for transitionToActive (delay is 5s, but we just check if it's there)
    const { data: stateAuction } = await get(`${BASE_URL}/${gameCode}`);
    console.log(`[Status] Auction Phase: ${stateAuction.gamePhase}, Status: ${stateAuction.auctionState.status}`);

    // 8. Test Admin Force Skip in Auction
    console.log("[Test] Testing Admin Force Skip in Auction phase...");
    await post(`${BASE_URL}/admin/force-skip`, { gameCode });
    console.log("[Admin] Force-skip sent");
    await sleep(2000);
    const { data: stateSkip } = await get(`${BASE_URL}/${gameCode}`);
    console.log(`[Status] Current Phase: ${stateSkip.gamePhase}`);

    // If it was auction, force-skip should set endTime to 1s, which heartbeat handles or manual skip does something else?
    // Wait, force-skip logic:
    // game.auctionState.endTime = new Date(Date.now() + 1000);

    await sleep(2000);
    const { data: stateFinal } = await get(`${BASE_URL}/${gameCode}`);
    console.log(`[Status] Final Phase after force-skip wait: ${stateFinal.gamePhase}`);

    console.log("\n=== Auto-Pilot Logic Test PASSED! ===\n");
    process.exit(0);
}

runTest().catch(err => {
    console.error("Test Failed with Exception:", err);
    process.exit(1);
});
