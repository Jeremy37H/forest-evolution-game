const axios = require('axios');

const API_URL = 'http://localhost:3001/api/game';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    try {
        console.log("\n>>> ========================================== <<<");
        console.log(">>> 開始測試升級機制限制 (v1.9.10) <<<");
        console.log(">>> ========================================== <<<\n");

        // 1. 建立遊戲
        console.log("[1] 正在建立遊戲...");
        const createRes = await axios.post(`${API_URL}/create`, { playerCount: 2 });
        const game = createRes.data;
        const gameCode = game.gameCode;
        console.log(`✅ 遊戲建立成功！代碼: ${gameCode}`);
        await sleep(500);

        // 2. 加入玩家
        console.log("\n[2] 玩家加入遊戲...");
        const p1Res = await axios.post(`${API_URL}/join`, { gameCode, name: "測試玩家1" });
        const player = p1Res.data.player;
        console.log(`✅ 玩家1加入: ${player.name}, ID: ${player._id}`);

        await axios.post(`${API_URL}/join`, { gameCode, name: "測試玩家2" });
        console.log(`✅ 玩家2加入成功。`);
        await sleep(500);

        // 3. 在等待階段嘗試升級 (預期失敗)
        console.log("\n[3] 測試：在等待階段 (waiting) 嘗試升級...");
        try {
            await axios.post(`${API_URL}/action/levelup`, {
                playerId: player._id
            });
            console.log("❌ 錯誤：在等待階段竟然升級成功了！");
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log(`👍 測試通過：升級被成功拒絕。伺服器訊息："${error.response.data.message}"`);
            } else {
                console.log("❌ 發生非預期的錯誤:", error.message);
            }
        }
        await sleep(500);

        // 4. 開始遊戲
        console.log("\n[4] 管理員開始遊戲...");
        await axios.post(`${API_URL}/start`, { gameCode });
        console.log("✅ 遊戲已開始。");
        await sleep(1000); // 開始遊戲後多等一下

        // 5. 在第一回合討論階段進行升級 (預期成功)
        console.log("\n[5] 測試：在討論階段嘗試升級...");
        try {
            const levelUpRes = await axios.post(`${API_URL}/action/levelup`, {
                playerId: player._id
            });
            console.log(`👍 測試通過：升級成功！新等级: ${levelUpRes.data.player.level}, 剩餘 HP: ${levelUpRes.data.player.hp}`);

            await sleep(500);

            // 6. 再次嘗試升級 (預期失敗，因為一回合限一次)
            console.log("\n[6] 測試：同一回合再次嘗試升級...");
            try {
                await axios.post(`${API_URL}/action/levelup`, {
                    playerId: player._id
                });
                console.log("❌ 錯誤：同一回合竟然可以升級兩次！");
            } catch (error) {
                if (error.response && error.response.status === 400) {
                    console.log(`👍 測試通過：第二次升級被拒絕。伺服器訊息："${error.response.data.message}"`);
                } else {
                    console.log("❌ 發生非預期的錯誤:", error.message);
                }
            }
        } catch (error) {
            console.log("❌ 升級測試失敗:", error.response?.data?.message || error.message);
        }

        console.log("\n>>> ========================================== <<<");
        console.log(">>> 升級機制測試完成 <<<");
        console.log(">>> ========================================== <<<\n");

    } catch (error) {
        console.error("❌ 測試腳本執行出錯:", error.response?.data || error.message);
    }
}

runTest();
