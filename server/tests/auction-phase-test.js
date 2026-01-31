// 競標階段測試腳本
// 測試所有回合的競標流程是否正常運作

const axios = require('axios');

const API_URL = 'http://localhost:3001';
let testGameCode = null;
let testPlayers = [];

// 輔助函數：等待指定時間
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 輔助函數：建立測試玩家
async function createTestPlayer(name) {
    try {
        const res = await axios.post(`${API_URL}/api/game/join`, {
            gameCode: testGameCode,
            name: name
        });
        console.log(`✅ 玩家 ${name} 加入成功 (${res.data.playerCode})`);
        return res.data;
    } catch (err) {
        console.error(`❌ 玩家 ${name} 加入失敗:`, err.response?.data?.message || err.message);
        throw err;
    }
}

// 輔助函數：取得遊戲狀態
async function getGameState() {
    try {
        const res = await axios.get(`${API_URL}/api/game/${testGameCode}`);
        return res.data;
    } catch (err) {
        console.error('❌ 取得遊戲狀態失敗:', err.message);
        throw err;
    }
}

// 輔助函數：管理員強制跳過
async function forceSkip() {
    try {
        await axios.post(`${API_URL}/api/game/admin/force-skip`, {
            gameCode: testGameCode
        });
        console.log('⏩ 管理員強制跳過階段');
    } catch (err) {
        console.error('❌ 強制跳過失敗:', err.message);
    }
}

// 測試場景 1: 預設技能池 (4人遊戲)
async function testDefaultSkillPool() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 測試場景 1: 預設技能池 (4人遊戲)');
    console.log('='.repeat(60));

    try {
        // 1. 建立遊戲
        const createRes = await axios.post(`${API_URL}/api/game/create`, {
            playerCount: 4,
            isAutoPilot: true
        });
        testGameCode = createRes.data.gameCode;
        console.log(`✅ 遊戲建立成功: ${testGameCode}`);

        // 2. 加入 4 位玩家
        for (let i = 1; i <= 4; i++) {
            const player = await createTestPlayer(`測試玩家${i}`);
            testPlayers.push(player);
        }

        // 3. 開始遊戲
        await axios.post(`${API_URL}/api/game/start`, { gameCode: testGameCode });
        console.log('✅ 遊戲開始 (R1 討論階段)');
        await wait(2000);

        // 4. 檢查初始狀態
        let game = await getGameState();
        console.log(`📊 當前階段: ${game.gamePhase}`);
        console.log(`📊 當前回合: ${game.currentRound}`);
        console.log(`📊 R1 技能數量: ${Object.keys(game.skillsForAuction || {}).length}`);
        console.log(`📊 R1 技能列表:`, Object.keys(game.skillsForAuction || {}));

        // 5. 跳過討論階段 -> 進入攻擊階段
        console.log('\n⏩ 跳過 R1 討論階段...');
        await forceSkip();
        await wait(2000);

        game = await getGameState();
        console.log(`📊 當前階段: ${game.gamePhase}`);

        // 6. 跳過攻擊階段 -> 進入競標過渡
        console.log('\n⏩ 跳過 R1 攻擊階段...');
        await forceSkip();
        await wait(4000); // 等待 3 秒過渡

        game = await getGameState();
        console.log(`📊 當前階段: ${game.gamePhase}`);
        console.log(`📊 競標佇列長度: ${game.auctionState?.queue?.length || 0}`);
        console.log(`📊 競標佇列:`, game.auctionState?.queue || []);
        console.log(`📊 當前競標技能: ${game.auctionState?.currentSkill || '無'}`);
        console.log(`📊 競標狀態: ${game.auctionState?.status || '無'}`);

        if (game.gamePhase.startsWith('auction')) {
            console.log('✅ 成功進入 R1 競標階段');

            // 檢查是否有技能在競標
            if (game.auctionState?.currentSkill) {
                console.log(`✅ 正在競標技能: ${game.auctionState.currentSkill}`);
            } else {
                console.log('⚠️ 警告: 沒有技能在競標中');
            }
        } else {
            console.log('❌ 錯誤: 未能進入競標階段');
            console.log(`   實際階段: ${game.gamePhase}`);
        }

        // 7. 測試 R2 和 R3
        for (let round = 2; round <= 3; round++) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📋 測試 R${round} 競標階段`);
            console.log('='.repeat(60));

            // 跳過所有競標技能
            console.log(`⏩ 跳過 R${round - 1} 所有競標技能...`);
            game = await getGameState();
            const skillCount = game.auctionState?.queue?.length || 0;
            for (let i = 0; i < skillCount + 1; i++) {
                await forceSkip();
                await wait(2000);
            }

            // 應該進入下一回合討論
            game = await getGameState();
            console.log(`📊 當前階段: ${game.gamePhase}`);
            console.log(`📊 當前回合: ${game.currentRound}`);

            // 跳過討論
            console.log(`⏩ 跳過 R${round} 討論階段...`);
            await forceSkip();
            await wait(2000);

            // 跳過攻擊
            console.log(`⏩ 跳過 R${round} 攻擊階段...`);
            await forceSkip();
            await wait(4000);

            // 檢查競標階段
            game = await getGameState();
            console.log(`📊 當前階段: ${game.gamePhase}`);
            console.log(`📊 R${round} 技能數量: ${Object.keys(game.skillsForAuction || {}).length}`);
            console.log(`📊 R${round} 技能列表:`, Object.keys(game.skillsForAuction || {}));
            console.log(`📊 競標佇列長度: ${game.auctionState?.queue?.length || 0}`);
            console.log(`📊 當前競標技能: ${game.auctionState?.currentSkill || '無'}`);

            if (game.gamePhase.startsWith('auction')) {
                console.log(`✅ 成功進入 R${round} 競標階段`);
            } else {
                console.log(`❌ 錯誤: 未能進入 R${round} 競標階段`);
            }
        }

        console.log('\n✅ 預設技能池測試完成');
        return true;

    } catch (err) {
        console.error('❌ 測試失敗:', err.message);
        return false;
    }
}

// 測試場景 2: 自定義技能池
async function testCustomSkillPool() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 測試場景 2: 自定義技能池 (4人遊戲)');
    console.log('='.repeat(60));

    try {
        // 1. 建立遊戲 (自定義技能)
        const customSkills = {
            '1': {
                '冬眠': '跳過本回合攻擊，下回合 HP+2',
                '劇毒': '使目標中毒，每回合扣 2 HP'
            },
            '2': {
                '獅子王': '本回合攻擊力 +3',
                '擬態': '複製目標玩家的屬性'
            },
            '3': {
                '森林權杖': '指定一個屬性，該屬性玩家本回合無法攻擊你',
                '折翅': '目標玩家本回合無法使用技能'
            }
        };

        const createRes = await axios.post(`${API_URL}/api/game/create`, {
            playerCount: 4,
            isAutoPilot: true,
            customSkillsByRound: customSkills
        });
        testGameCode = createRes.data.gameCode;
        testPlayers = [];
        console.log(`✅ 遊戲建立成功 (自定義技能): ${testGameCode}`);

        // 2. 加入玩家
        for (let i = 1; i <= 4; i++) {
            const player = await createTestPlayer(`自定義${i}`);
            testPlayers.push(player);
        }

        // 3. 開始遊戲
        await axios.post(`${API_URL}/api/game/start`, { gameCode: testGameCode });
        console.log('✅ 遊戲開始');
        await wait(2000);

        // 4. 快速進入 R1 競標
        await forceSkip(); // 跳過討論
        await wait(2000);
        await forceSkip(); // 跳過攻擊
        await wait(4000);

        let game = await getGameState();
        console.log(`📊 當前階段: ${game.gamePhase}`);
        console.log(`📊 R1 自定義技能:`, Object.keys(game.skillsForAuction || {}));

        const expectedR1 = ['冬眠', '劇毒'];
        const actualR1 = Object.keys(game.skillsForAuction || {});
        const r1Match = expectedR1.every(skill => actualR1.includes(skill));

        if (r1Match) {
            console.log('✅ R1 自定義技能正確');
        } else {
            console.log('❌ R1 自定義技能不符');
            console.log(`   預期: ${expectedR1}`);
            console.log(`   實際: ${actualR1}`);
        }

        // 5. 測試 R2
        console.log('\n⏩ 進入 R2...');
        for (let i = 0; i < 3; i++) {
            await forceSkip();
            await wait(2000);
        }
        await forceSkip(); // 討論
        await wait(2000);
        await forceSkip(); // 攻擊
        await wait(4000);

        game = await getGameState();
        console.log(`📊 當前階段: ${game.gamePhase}`);
        console.log(`📊 R2 自定義技能:`, Object.keys(game.skillsForAuction || {}));

        const expectedR2 = ['獅子王', '擬態'];
        const actualR2 = Object.keys(game.skillsForAuction || {});
        const r2Match = expectedR2.every(skill => actualR2.includes(skill));

        if (r2Match) {
            console.log('✅ R2 自定義技能正確');
        } else {
            console.log('❌ R2 自定義技能不符');
        }

        console.log('\n✅ 自定義技能池測試完成');
        return true;

    } catch (err) {
        console.error('❌ 測試失敗:', err.message);
        return false;
    }
}

// 主測試流程
async function runAllTests() {
    console.log('\n🚀 開始競標階段完整測試');
    console.log('測試伺服器: ' + API_URL);
    console.log('時間: ' + new Date().toLocaleString('zh-TW'));

    const results = {
        defaultSkillPool: false,
        customSkillPool: false
    };

    // 測試 1: 預設技能池
    results.defaultSkillPool = await testDefaultSkillPool();
    await wait(3000);

    // 測試 2: 自定義技能池
    results.customSkillPool = await testCustomSkillPool();

    // 總結
    console.log('\n' + '='.repeat(60));
    console.log('📊 測試結果總結');
    console.log('='.repeat(60));
    console.log(`預設技能池測試: ${results.defaultSkillPool ? '✅ 通過' : '❌ 失敗'}`);
    console.log(`自定義技能池測試: ${results.customSkillPool ? '✅ 通過' : '❌ 失敗'}`);

    const allPassed = Object.values(results).every(r => r === true);
    console.log('\n' + (allPassed ? '🎉 所有測試通過！' : '⚠️ 部分測試失敗'));

    process.exit(allPassed ? 0 : 1);
}

// 執行測試
runAllTests().catch(err => {
    console.error('💥 測試執行失敗:', err);
    process.exit(1);
});
