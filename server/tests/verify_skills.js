
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Game = require('../models/gameModel');
const Player = require('../models/playerModel');
const { useSkill, handleAttackFlow } = require('../services/gameService');

// Mock IO
const mockIo = {
    to: (room) => ({
        emit: (event, data) => {
            // console.log(`[MockIO] To ${room} Emit ${event}`, data);
        }
    }),
    emit: (event, data) => { }
};

async function runTests() {
    console.log("=== 正在連接資料庫 ===");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("資料庫連接成功");

    let game, p1, p2, p3;

    try {
        // --- Setup ---
        const gameCode = 'TEST_' + Math.floor(Math.random() * 10000);
        const testId = Math.floor(Math.random() * 10000);
        console.log(`建立測試遊戲: ${gameCode}`);

        // Clean up first
        await Game.deleteMany({ gameCode: { $regex: '^TEST_' } });
        await Player.deleteMany({ playerCode: { $regex: '^P[1-3]_' } });

        game = await Game.create({
            gameCode: gameCode,
            playerCount: 3,
            gamePhase: 'discussion_round_1'
        });

        p1 = await Player.create({ gameId: game._id, name: 'Attacker', playerCode: `P1_${testId}`, attribute: '火', hp: 30, skills: [], status: { isAlive: true } });
        p2 = await Player.create({ gameId: game._id, name: 'Victim', playerCode: `P2_${testId}`, attribute: '水', hp: 30, skills: ['龜甲'], status: { isAlive: true } });
        p3 = await Player.create({ gameId: game._id, name: 'Bystander', playerCode: `P3_${testId}`, attribute: '木', hp: 30, skills: [], status: { isAlive: true } });

        game.players = [p1._id, p2._id, p3._id];
        await game.save();

        const reset = async () => {
            p1 = await Player.findById(p1._id);
            p2 = await Player.findById(p2._id);
            p3 = await Player.findById(p3._id);

            p1.roundStats = { isReady: false, usedSkillsThisRound: [], staredBy: [], attackedBy: [], damageLinkTarget: null };
            p1.usedOneTimeSkills = [];
            p1.effects = { isPoisoned: false };
            p1.attribute = '火';
            p1.hp = 30;
            p1.skills = [];

            p2.roundStats = { isReady: false, usedSkillsThisRound: [], staredBy: [], attackedBy: [] };
            p2.effects = { isPoisoned: false };
            p2.hp = 30;
            p2.skills = ['龜甲'];

            p3.roundStats = { isReady: false, usedSkillsThisRound: [], staredBy: [], attackedBy: [] };
            p3.hp = 30;

            await p1.save(); await p2.save(); await p3.save();
        };

        const assert = (condition, msg) => {
            if (!condition) {
                console.error(`❌ [失敗] ${msg}`);
                throw new Error(msg);
            }
            console.log(`✅ [通過] ${msg}`);
        };

        // --- Test 1: 冬眠 ---
        console.log("\n--- 測試: 冬眠 ---");
        await reset();
        p1.skills.push('冬眠'); await p1.save();
        await useSkill(p1._id, '冬眠', [], null, mockIo);
        const p1_hib = await Player.findById(p1._id);
        assert(p1_hib.roundStats.isHibernating === true, "玩家狀態應為冬眠中");

        // --- Test 2: 瞪人 ---
        console.log("\n--- 測試: 瞪人 ---");
        await reset();
        p1.skills.push('瞪人'); await p1.save();
        await useSkill(p1._id, '瞪人', [p2._id], null, mockIo);
        const p2_stare = await Player.findById(p2._id);
        assert(p2_stare.roundStats.staredBy.some(id => id.equals(p1._id)), "受害者應被 P1 瞪住");

        // --- Test 3: 劇毒 ---
        console.log("\n--- 測試: 劇毒 ---");
        await reset();
        p1.skills.push('劇毒'); await p1.save();
        await useSkill(p1._id, '劇毒', [p2._id], null, mockIo);
        const p2_poison = await Player.findById(p2._id);
        assert(p2_poison.effects.isPoisoned === true, "受害者應中毒");

        // --- Test 4: 荷魯斯之眼 ---
        console.log("\n--- 測試: 荷魯斯之眼 ---");
        await reset();
        p1.skills.push('荷魯斯之眼'); await p1.save();
        const resEye = await useSkill(p1._id, '荷魯斯之眼', [p2._id], null, mockIo);
        assert(resEye.specialResponse && resEye.specialResponse.message.includes('30 HP'), "應返回受害者真實血量");

        // --- Test 5: 擬態 (火 -> 水) ---
        console.log("\n--- 測試: 擬態 ---");
        await reset();
        p1.skills.push('擬態'); await p1.save();
        await useSkill(p1._id, '擬態', [p2._id], null, mockIo); // P2 is 水
        const p1_mimic = await Player.findById(p1._id);
        assert(p1_mimic.attribute === '水', `P1 屬性應變為水 (實際: ${p1_mimic.attribute})`);

        // --- Test 6: 寄生 (P1:30 -> -5 = 25, heal logic check) ---
        console.log("\n--- 測試: 寄生 ---");
        await reset();
        p1.skills.push('寄生');
        p1.hp = 10; // set low hp
        await p1.save();
        await useSkill(p1._id, '寄生', [p2._id], null, mockIo);
        const p1_para = await Player.findById(p1._id);
        // HP logic: max(hp-5, min(target.hp, hp+10)) ? No, code says:
        // player.hp = Math.max(player.hp - 5, Math.min(parasiteTarget.hp, player.hp + 10));
        // Wait, logic in SKILL_HANDLERS line 756:
        // `player.hp = Math.max(player.hp - 5, Math.min(parasiteTarget.hp, player.hp + 10));`
        // Wait, this logic seems weird in code reading.
        // It's meant to be: Steal life?
        // Actually the code `gameService.js:756` says:
        // `player.hp = Math.max(player.hp - 5, Math.min(parasiteTarget.hp, player.hp + 10));`
        // If my hp is 10. Target hp is 30.
        // min(30, 20) = 20.
        // max(5, 20) = 20. -> HP becomes 20.
        // It increases HP!
        assert(p1_para.hp === 20, `P1 血量應增加到 20 (實際: ${p1_para.hp})`);

        // --- Test 7: 森林權杖 (打木屬性 P3) ---
        console.log("\n--- 測試: 森林權杖 ---");
        await reset();
        p1.skills.push('森林權杖'); await p1.save();
        // Mock applyDamageWithLink? 
        // No, useSkill calls `gameService.js` internal logic.
        // Hopefully applyDamageWithLink works.
        // P3 is 木. Target '木'.
        await useSkill(p1._id, '森林權杖', ['木'], null, mockIo);
        const p3_scepter = await Player.findById(p3._id);
        // Damage is 2. 30 -> 28.
        assert(p3_scepter.hp === 28, `P3 (木) 應受到 2點傷害 (實際: ${p3_scepter.hp})`);

        // --- Test 8: 獅子王 ---
        console.log("\n--- 測試: 獅子王 ---");
        await reset();
        p1.skills.push('獅子王'); await p1.save();
        await useSkill(p1._id, '獅子王', [p3._id], null, mockIo);
        const p1_lion = await Player.findById(p1._id);
        assert(p1_lion.roundStats.minionId.equals(p3._id), "P1 的手下應為 P3");

        // --- Test 9: 折翅 (拔 P2 的龜甲) ---
        console.log("\n--- 測試: 折翅 ---");
        await reset();
        p1.skills.push('折翅'); await p1.save();
        await useSkill(p1._id, '折翅', [p2._id], null, mockIo);
        const p2_clip = await Player.findById(p2._id);
        assert(p2_clip.skills.length === 0, "P2 的龜甲技能應被拔除");

        // --- Test 10: 同病相憐 ---
        console.log("\n--- 測試: 同病相憐 ---");
        await reset();
        p1.skills.push('同病相憐'); await p1.save();
        await useSkill(p1._id, '同病相憐', [p2._id], null, mockIo);
        const p1_link = await Player.findById(p1._id);
        assert(p1_link.roundStats.damageLinkTarget.equals(p2._id), "P1 應與 P2 連結");

        console.log("\n🎉 全部技能測試完成！沒有發現異常。");

    } catch (err) {
        console.error("\n❌ 測試過程中發生錯誤:", err);
    } finally {
        if (game) {
            console.log("\n正在清理測試數據...");
            await Game.deleteOne({ _id: game._id });
            await Player.deleteMany({ gameId: game._id });
            console.log("清理完成");
        }
        await mongoose.disconnect();
    }
}

runTests();
