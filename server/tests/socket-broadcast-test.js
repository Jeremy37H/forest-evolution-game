const io = require("../../client/node_modules/socket.io-client");
const axios = require("axios");

const API_URL = "http://localhost:3001";
const SOCKET_URL = "http://localhost:3001";

async function testSocketBroadcast() {
    console.log("🚀 開始 Socket 廣播測試...");

    let socket;
    let gameCode;
    let playerId;

    try {
        // 1. 創建遊戲 (管理員) - 改為 2 人
        console.log("\n[1] 創建遊戲...");
        const createRes = await axios.post(`${API_URL}/api/game/create`, {
            playerCount: 2,
            isAutoPilot: false
        });
        gameCode = createRes.data.gameCode;
        console.log(`✅ 遊戲創建成功: ${gameCode}`);

        // 2. 玩家透過 API 加入 (玩家 1 - Socket 使用者)
        console.log("\n[2] 玩家 1 加入 (API)...");
        const joinRes = await axios.post(`${API_URL}/api/game/join`, {
            gameCode: gameCode,
            name: "SocketTestUser"
        });
        playerId = joinRes.data.playerId;
        console.log(`✅ 玩家 1 加入成功: ${joinRes.data.name} (${playerId})`);

        // 2b. 玩家 2 加入 (只是為了滿足人數)
        console.log("\n[2b] 玩家 2 加入 (dummy)...");
        await axios.post(`${API_URL}/api/game/join`, {
            gameCode: gameCode,
            name: "DummyPlayer"
        });
        console.log(`✅ 玩家 2 加入成功`);

        // 3. 建立 Socket 連線 (模擬前端)
        console.log("\n[3] 建立 Socket 連線...");
        socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            forceNew: true
        });

        await new Promise((resolve, reject) => {
            socket.on("connect", () => {
                console.log(`✅ Socket 連線成功: ${socket.id}`);
                resolve();
            });
            socket.on("connect_error", (err) => {
                console.error("❌ Socket 連線失敗:", err.message);
                reject(err);
            });
            setTimeout(() => reject(new Error("Socket 連線超時")), 5000);
        });

        // 4. 加入房間 (模擬前端 joinGame)
        console.log(`\n[4] 加入房間 ${gameCode}...`);
        socket.emit("joinGame", gameCode);

        // 監聽加入確認 (如果後端有回傳的話)
        const joinPromise = new Promise((resolve) => {
            // 目前後端好像沒有 emit 'joinedRoom' 給客戶端，除非我剛剛加了
            // 為了保險，我們先假設連線後直接加入
            // 我剛剛在 server.js 加了 console.log，但沒有 emit 回客戶端
            // 這裡我們先等待一小段時間確保加入完成
            setTimeout(resolve, 500);
        });
        await joinPromise;
        console.log("✅ (模擬) 已發送 joinGame 事件");

        // 5. 設置監聽器：等待遊戲狀態更新
        console.log("\n[5] 監聽遊戲狀態更新...");
        const updatePromise = new Promise((resolve, reject) => {
            socket.on("gameStateUpdate", (data) => {
                console.log(`📩 收到遊戲狀態更新! Phase: ${data.gamePhase}`);
                if (data.gamePhase.startsWith("discussion")) {
                    console.log("✅ 成功收到「討論階段」更新！測試通過！");
                    resolve(true);
                } else if (data.gamePhase === "waiting") {
                    console.log("ℹ️ 收到等待階段更新 (忽略)");
                }
            });

            // 設置超時
            setTimeout(() => {
                reject(new Error("❌ 等待狀態更新超時 (5秒)"));
            }, 5000);
        });

        // 6. 管理員開始遊戲 (觸發廣播)
        console.log("\n[6] 管理員觸發「開始遊戲」...");
        await axios.post(`${API_URL}/api/game/start`, { gameCode: gameCode });
        console.log("✅ API 呼叫成功");

        // 等待 Socket 接收結果
        await updatePromise;

    } catch (error) {
        console.error("\n❌ 測試失敗:", error.message);
        if (error.response) {
            console.error("API 錯誤:", error.response.data);
        }
        process.exit(1);
    } finally {
        if (socket) socket.close();
        console.log("\n測試結束");
        process.exit(0);
    }
}

testSocketBroadcast();
