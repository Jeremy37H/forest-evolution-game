
const BASE_URL = 'http://localhost:3001/api/game';
const POLLING_INTERVAL = 1000; // 1 second
const GAME_DURATION_LIMIT = 5 * 60 * 1000; // 5 minutes max

// --- Helper Functions ---
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

// --- Client Class ---
class Client {
    constructor(name) {
        this.name = name;
        this.playerId = null;
        this.playerCode = null;
        this.gameId = null;
        this.gameCode = null;
        this.attribute = null;
        this.hp = 0;
        this.level = 0;
        this.isDead = false;
        this.skills = [];
    }

    async join(gameCode) {
        try {
            const res = await post(`${BASE_URL}/join`, { gameCode, name: this.name });
            this.playerId = res.data.player._id;
            this.playerCode = res.data.player.playerCode;
            this.gameId = res.data.player.gameId;
            this.gameCode = gameCode;
            this.attribute = res.data.player.attribute;
            this.hp = res.data.player.hp;
            console.log(`[${this.name}] Joined. Attr: ${this.attribute}, HP: ${this.hp}`);
            return true;
        } catch (error) {
            console.error(`[${this.name}] Join Failed:`, error.message);
            return false;
        }
    }

    async getGameState() {
        if (!this.gameCode) return null;
        try {
            const res = await get(`${BASE_URL}/${this.gameCode}`);
            return res.data;
        } catch (error) {
            return null;
        }
    }

    async useSkill(skill, targets = []) {
        try {
            const res = await post(`${BASE_URL}/action/use-skill`, {
                playerId: this.playerId,
                skill,
                targets
            });
            console.log(`[${this.name}] Used Skill [${skill}] on ${targets.length} targets. Msg: ${res.data.message}`);
        } catch (error) {
            // Ignore
        }
    }

    async attack(targetId) {
        try {
            if (this.isDead) return;
            const res = await post(`${BASE_URL}/action/attack`, {
                gameCode: this.gameCode,
                attackerId: this.playerId,
                targetId
            });
            console.log(`[${this.name}] Attacked ${targetId}. Msg: ${res.data.message}`);
        } catch (error) {
            console.log(`[${this.name}] Attack Failed:`, error.message);
        }
    }

    async bid(skill, amount) {
        try {
            if (this.isDead || this.hp <= 5) return;
            const res = await post(`${BASE_URL}/bid`, {
                gameCode: this.gameCode,
                playerId: this.playerId,
                skill,
                bidAmount: amount
            });
            console.log(`[${this.name}] Bid ${amount} on [${skill}].`);
        } catch (error) {
            console.log(`[${this.name}] Bid Failed:`, error.message);
        }
    }

    async levelUp() {
        try {
            const res = await post(`${BASE_URL}/action/levelup`, { playerId: this.playerId });
            console.log(`[${this.name}] Leveled Up! Msg: ${res.data.message}`);
        } catch (error) {
            // Ignore
        }
    }
}

// --- Simulation Logic ---

async function runSimulation() {
    console.log("=== Starting 8-Player Game Simulation ===");

    // 1. Admin Create Game
    let gameCode;
    try {
        const createRes = await post(`${BASE_URL}/create`, { playerCount: 8 });
        gameCode = createRes.data.gameCode;
        console.log(`[Admin] Game Created: ${gameCode}`);
    } catch (e) {
        console.error("Failed to create game:", e.message);
        return;
    }

    // 2. Players Join
    const clients = [];
    for (let i = 1; i <= 8; i++) {
        const client = new Client(`P${i}`);
        await client.join(gameCode);
        clients.push(client);
    }

    // Verify Distribution
    const counts = clients.reduce((acc, c) => { acc[c.attribute] = (acc[c.attribute] || 0) + 1; return acc; }, {});
    console.log("[System] Initial Attribute Distribution:", counts);

    // 3. Start Game
    try {
        await post(`${BASE_URL}/start`, { gameCode });
        console.log("[Admin] Game Started!");
    } catch (e) {
        console.error("Failed to start game:", e.message);
        return;
    }

    // 4. Game Loop
    let gamePhase = 'discussion_round_1';
    let isRunning = true;
    const startTime = Date.now();

    // Use Player 1 as the "State Monitor" poller
    const monitor = clients[0];

    const loop = setInterval(async () => {
        if (Date.now() - startTime > GAME_DURATION_LIMIT) {
            console.log("!!! Simulation Timed Out !!!");
            clearInterval(loop);
            return;
        }

        const state = await monitor.getGameState();
        if (!state) return;

        // Sync local client state (HP, isDead)
        state.players.forEach(p => {
            const c = clients.find(cl => cl.playerId === p._id);
            if (c) {
                c.hp = p.hp;
                c.level = p.level;
                c.isDead = p.hp <= 0;
            }
        });

        const aliveClients = clients.filter(c => !c.isDead);
        if (aliveClients.length <= 1 && state.gamePhase !== 'finished') {
            console.log("[System] Game Over Condition Met (1 survivor).");
            await post(`${BASE_URL}/end-game`, { gameCode });
            gamePhase = 'finished';
        }

        // Detect Phase Change
        if (state.gamePhase !== gamePhase) {
            console.log(`\n--- Phase Change: ${gamePhase} -> ${state.gamePhase} ---\n`);
            gamePhase = state.gamePhase;
        }

        // Logic based on phase
        if (gamePhase === 'finished') {
            console.log("=== Game Finished ===");
            console.log("Final Standings:");
            state.players.sort((a, b) => b.hp - a.hp).forEach((p, idx) => {
                console.log(`${idx + 1}. ${p.name} (${p.attribute}) - HP: ${p.hp}, Lv: ${p.level}`);
            });
            clearInterval(loop);
            isRunning = false;
        } else if (gamePhase.startsWith('discussion')) {
            // Discussion Logic
            // - Try to Level Up
            for (const c of aliveClients) {
                if (c.hp > 28 + 3 && c.level < 3) { // Simple logic
                    await c.levelUp();
                }
            }

            // - Random Skill Usage
            const randomClient = aliveClients[Math.floor(Math.random() * aliveClients.length)];
            const target = aliveClients.find(c => c !== randomClient);
            if (target && Math.random() > 0.5) {
                await randomClient.useSkill('劇毒', [target.playerId]);
            }

            // Admin: Wait 2 seconds then Start Attack
            if (Math.random() > 0.8) {
                await post(`${BASE_URL}/start-attack`, { gameCode });
            }

        } else if (gamePhase.startsWith('attack')) {
            // Attack Logic
            for (const attacker of aliveClients) {
                const potentialTargets = aliveClients.filter(c => c !== attacker);
                if (potentialTargets.length > 0) {
                    const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
                    // Very simplified attack logic: spam attack.
                    // The server will reject duplicates for us.
                    await attacker.attack(target.playerId);
                }
            }

            // Admin: Wait a bit then Start Auction or End
            if (Math.random() > 0.8) {
                const currentRound = parseInt(gamePhase.split('_')[2]);
                if (currentRound < 4) {
                    await post(`${BASE_URL}/start-auction`, { gameCode });
                } else {
                    // Round 4 ends -> manually call end-auction to cycle (as discussed)
                    await post(`${BASE_URL}/end-auction`, { gameCode });
                }
            }

        } else if (gamePhase.startsWith('auction')) {
            // Auction Logic
            if (state.auctionState && state.auctionState.currentSkill && state.auctionState.status === 'active') {
                const currentSkill = state.auctionState.currentSkill;
                for (const c of aliveClients) {
                    // 隨機出價，且確保玩家還沒對這個技能出過價 (簡化邏輯)
                    if (c.hp > 15 && Math.random() > 0.7) {
                        const amount = Math.floor(Math.random() * 5) + 1;
                        await c.bid(currentSkill, amount);
                    }
                }
            }

            // 如果競標狀態是 finished 或者 queue 空了，管理員可以按下一個或結束
            if (state.auctionState && (state.auctionState.status === 'finished' || state.auctionState.status === 'none')) {
                if (state.auctionState.queue && state.auctionState.queue.length > 0) {
                    // 這裡後端 startAuctionForSkill 會自動處理第一個技能，但如果是 finished 狀態，管理員要點下一個
                    // 模擬腳本暫時透過 end-auction 觸發 (後端 end-auction 如果 queue 還有會跑下一個)
                    if (Math.random() > 0.5) {
                        await post(`${BASE_URL}/end-auction`, { gameCode });
                    }
                } else {
                    // 沒技能了，結束競標階段
                    if (Math.random() > 0.5) {
                        await post(`${BASE_URL}/end-auction`, { gameCode });
                    }
                }
            }
        }

    }, POLLING_INTERVAL);
}

runSimulation();
