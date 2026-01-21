const axios = require('axios');

const API_URL = 'http://localhost:3001/api/game';

async function runTest() {
    try {
        console.log("=== 開始測試完整遊戲流程 ===");

        // 1. 建立遊戲
        console.log("\n[1] 正在建立遊戲...");
        const createRes = await axios.post(`${API_URL}/create`, { playerCount: 2 });
        const game = createRes.data;
        const gameCode = game.gameCode;
        console.log(`遊戲建立成功！代碼: ${gameCode}`);

        // 2. 加入玩家
        console.log("\n[2] 玩家加入遊戲...");
        const p1Res = await axios.post(`${API_URL}/join`, { gameCode, name: "測試小豬" });
        const player1 = p1Res.data.player;
        console.log(`玩家 1 加入: ${player1.name} (${player1.attribute}), HP: ${player1.hp}`);

        const p2Res = await axios.post(`${API_URL}/join`, { gameCode, name: "測試小貓" });
        const player2 = p2Res.data.player;
        console.log(`玩家 2 加入: ${player2.name} (${player2.attribute}), HP: ${player2.hp}`);

        // 3. 開始遊戲 (進入討論階段 1)
        console.log("\n[3] 開始遊戲...");
        const startRes = await axios.post(`${API_URL}/start`, { gameCode });
        console.log(`遊戲階段: ${startRes.data.game.gamePhase}`); // 預期: discussion_round_1

        // 4. 使用技能 (模擬 測試小豬 使用 荷魯斯之眼 查看 測試小貓)
        // 注意：荷魯斯之眼可能不是每一場都有 (如果是隨機 Round 1 技能)，但根據 GAME_RULES 是固定的。
        // server.js 中 SKILLS_BY_ROUND[1] 包含 '荷魯斯之眼'。
        console.log("\n[4] 測試技能 (荷魯斯之眼)...");
        try {
            // 需要先確認玩家是否有該技能，但初始並沒有技能？
            // 根據規則，技能是競標獲得的？還是自帶的？
            // 看 server.js: router.post('/create'...) -> skillsForAuction: SKILLS_BY_ROUND[1]
            // JOIN 時， new Player 只有 basic stats.
            // 根據 GAME_RULES, Round 1 技能是 "競標" 獲得的嗎？
            // 規則說 "技能分為不同回合解鎖"，但競標階段是在攻擊階段後。
            // 讓我們再看一次規則：
            // "3. 競標階段... 特定回合結束後會進入競標技能階段"
            // "技能圖鑑... 第一回合技能... 基因改造, 嗜血..."
            // 看起來第一回合開始時，玩家是沒有技能的？
            // 等等，如果是這樣，那第一回合 Discussion Phase 大家都是白板？
            // Server code: /start -> set skillsForAuction = SKILLS_BY_ROUND[1]
            // 所以 Round 1 的技能是拿來標的，不是拿來用的。
            // 那麼 Round 1 Discussion 沒事做？
            console.log("此階段玩家尚未擁有技能，跳過技能測試。");
        } catch (error) {
            console.log("技能測試略過/失敗:", error.response?.data?.message || error.message);
        }

        // 5. 進入攻擊階段
        console.log("\n[5] 進入攻擊階段...");
        const startAttackRes = await axios.post(`${API_URL}/start-attack`, { gameCode });
        console.log(`狀態: ${startAttackRes.data.message}`);

        // 6. 執行攻擊
        console.log("\n[6] 執行攻擊...");
        // P1 攻擊 P2
        console.log(`[攻擊] ${player1.name} -> ${player2.name}`);
        const atk1Res = await axios.post(`${API_URL}/action/attack`, {
            gameCode,
            attackerId: player1._id,
            targetId: player2._id
        });
        console.log(`結果: ${atk1Res.data.message}`);

        // P2 攻擊 P1
        console.log(`[攻擊] ${player2.name} -> ${player1.name}`);
        const atk2Res = await axios.post(`${API_URL}/action/attack`, {
            gameCode,
            attackerId: player2._id,
            targetId: player1._id
        });
        console.log(`結果: ${atk2Res.data.message}`);

        // 7. 進入競標階段
        console.log("\n[7] 進入競標階段...");
        const startAuctionRes = await axios.post(`${API_URL}/start-auction`, { gameCode });
        console.log(`狀態: ${startAuctionRes.data.message}`);

        // 8. 玩家出價
        console.log("\n[8] 玩家出價...");
        // 假設 Round 1 有 '嗜血' 和 '尖刺' 等
        const skillToBid = '嗜血';
        const bidAmount = 3;
        console.log(`${player1.name} 出價 ${bidAmount} HP 購買 [${skillToBid}]`);
        const bidRes = await axios.post(`${API_URL}/action/bid`, {
            gameCode,
            playerId: player1._id,
            skill: skillToBid,
            amount: bidAmount
        });
        console.log(`出價結果: ${bidRes.data.message}`);

        // 9. 結束競標 (進入 Round 2 Discussion)
        console.log("\n[9] 結算競標並進入下一回合...");
        // 為了確保時間戳差異，稍等一下 (server 有 3秒 timeout for broadcast, but API returns immediately asyncly? No, setTimeout is for response? Let's check server code)
        // Server code: setTimeout(..., 3000) inside end-auction handler BEFORE sending res? 
        // No, res.status(200) is inside setTimeout. So we wait 3 seconds.
        const endAuctionRes = await axios.post(`${API_URL}/end-auction`, { gameCode });
        console.log(`競標結果:`, endAuctionRes.data.winners);

        // 10. 驗證新回合狀態
        console.log("\n[10] 驗證新回合狀態...");
        const gameStateRes = await axios.get(`${API_URL}/${gameCode}`);
        const gameState = gameStateRes.data;
        console.log(`目前回合: ${gameState.currentRound}`);
        console.log(`目前階段: ${gameState.gamePhase}`);

        const p1Updated = gameState.players.find(p => p._id === player1._id);
        console.log(`${p1Updated.name} 目前技能: ${p1Updated.skills.join(', ')}`);
        console.log(`${p1Updated.name} 目前 HP: ${p1Updated.hp}`);

        console.log("\n=== 測試完成! ===");

    } catch (error) {
        console.error("測試發生錯誤:", error.response?.data || error.message);
    }
}

runTest();
