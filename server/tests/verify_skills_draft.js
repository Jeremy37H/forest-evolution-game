
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const Game = require('../models/gameModel');
const Player = require('../models/playerModel');

// 為了避開 socket.io 依賴，我們 mock 一個 io 物件
const mockIo = {
    to: () => ({
        emit: (event, data) => console.log(`[MockIO] Emit ${event}:`, data)
    }),
    emit: (event, data) => console.log(`[MockIO] Global Emit ${event}:`, data)
};

// 導入要測試的函數 (需要 gameService.js 支援導出 SKILL_HANDLERS 或 useSkill)
// 因為 useSkill 不是 module.exports 的一部分（假設），我們可能需要修改 gameService.js 導出它
// 或者我們直接 require gameService，它導出了 broadcastGameState 等，我們檢查它是否導出了 useSkill

const gameService = require('../services/gameService');

// 檢查 gameService 導出內容
// 如果 useSkill 沒有被導出，我們可能需要暫時修改 gameService.js 或使用 rewire (但環境限制可能無法用)
// 這裡假設我們可以直接呼叫，如果不行為再說

async function runTests() {
    console.log("Connect to DB...");
    await mongoose.connect(process.env.MONGODB_URI);

    let game, p1, p2, p3;

    try {
        console.log("Creating Test Game...");
        game = await Game.create({
            gameCode: 'TEST_SKILLS_' + Date.now(),
            playerCount: 3,
            gamePhase: 'discussion_round_1'
        });

        console.log("Creating Test Players...");
        p1 = await Player.create({
            gameId: game._id, name: 'Attacker', playerCode: 'P1', attribute: '火', hp: 20, skills: []
        });
        p2 = await Player.create({
            gameId: game._id, name: 'Victim', playerCode: 'P2', attribute: '水', hp: 20, skills: ['龜甲'] // 給一個技能讓折翅拔
        });
        p3 = await Player.create({
            gameId: game._id, name: 'Bystander', playerCode: 'P3', attribute: '木', hp: 20, skills: []
        });

        game.players = [p1._id, p2._id, p3._id];
        await game.save();

        console.log("=== Start Skill Verification ===");

        // Helper to reset states
        const reset = async () => {
            p1 = await Player.findById(p1._id);
            p2 = await Player.findById(p2._id);
            p3 = await Player.findById(p3._id);

            p1.roundStats = { isReady: false, usedSkillsThisRound: [], staredBy: [], attackedBy: [] };
            p1.usedOneTimeSkills = [];
            p1.effects = { isPoisoned: false };
            p1.attribute = '火';

            p2.roundStats = { isReady: false, usedSkillsThisRound: [], staredBy: [], attackedBy: [] };
            p2.effects = { isPoisoned: false };

            p3.roundStats = { isReady: false, usedSkillsThisRound: [], staredBy: [], attackedBy: [] };

            await p1.save(); await p2.save(); await p3.save();
        };

        // --- Test 1: 冬眠 ---
        await reset();
        console.log("[Test 1] 冬眠");
        p1.skills = ['冬眠']; await p1.save();
        // 假設 route 是這樣呼叫的: useSkill(playerId, skillName, targets, targetAttribute, io)
        // 由於我們無法直接存取 useSkill (如果未導出)，我們嘗試模擬 route 行為或者檢查 gameService 導出
        // 如果 gameService 沒有導出 useSkill，我們只能測試 flow

        // 技巧：我們可以直接宣告 SKILL_HANDLERS 的邏輯在這裡執行，
        // 但為了真實性，我們應該用 gameService 裡的方法。
        // 如果 gameService.js 只有 module.exports = { broadcastGameState, ... }
        // 我們就要先確認導出。

        // 這裡先假設 useSkill 有導出。如果是 private function，此腳本會失敗。
        // 根據剛才的 view_file，gameService.js 最後的 exports 沒看到。
        // 讓我先假定失敗並檢查。

    } catch (err) {
        console.error("Test Failed:", err);
    } finally {
        if (game) {
            console.log("Cleaning up...");
            await Game.deleteOne({ _id: game._id });
            await Player.deleteMany({ gameId: game._id });
        }
        await mongoose.disconnect();
    }
}

// runTests();
// We will not run it yet until checked exports.
