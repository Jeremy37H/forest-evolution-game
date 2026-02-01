const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Game = require('../models/gameModel');
const Player = require('../models/playerModel');
const { handleAttackFlow } = require('../services/gameService');

// Mock IO
const mockIo = {
    to: (room) => ({
        emit: (event, data) => { }
    }),
    emit: (event, data) => { }
};

async function runTests() {
    console.log("=== Connecting DB (All Battle Skills Test) ===");
    await mongoose.connect(process.env.MONGODB_URI);

    let game, p1, p2, p3, p4, dummy;

    try {
        const gameCode = 'SKILL_TEST_' + Math.floor(Math.random() * 10000);
        const testId = Math.floor(Math.random() * 10000); // For unique player codes
        console.log(`Creating test game: ${gameCode}`);

        // Clean up any existing test data first
        await Game.deleteMany({ gameCode: { $regex: '^SKILL_TEST_' } });
        await Player.deleteMany({ playerCode: { $regex: '^P[1-4]_|^D1_' } });

        game = await Game.create({
            gameCode: gameCode,
            playerCount: 5,
            gamePhase: 'attack_round_1',
            currentRound: 1
        });

        // Initialize Players with unique codes
        // P1: Fire (Attack 5) -> Main Attacker
        // P2: Water (Attack 2, Def 2) -> Defender (for Fang test)
        // P3: Wood (Attack 0) -> Observer (for Vulture)
        // P4: Thunder (hp 8, Attack 5) -> Tester (for Adrenaline)
        // Dummy: Wood (HP 20) -> Common Target
        p1 = await Player.create({ gameId: game._id, name: 'Attacker', playerCode: `P1_${testId}`, attribute: '火', hp: 30, attack: 5, defense: 0, skills: [], status: { isAlive: true } });
        p2 = await Player.create({ gameId: game._id, name: 'Defender', playerCode: `P2_${testId}`, attribute: '水', hp: 30, attack: 2, defense: 2, skills: [], status: { isAlive: true } });
        p3 = await Player.create({ gameId: game._id, name: 'Observer', playerCode: `P3_${testId}`, attribute: '木', hp: 10, attack: 0, defense: 0, skills: [], status: { isAlive: true } });
        p4 = await Player.create({ gameId: game._id, name: 'Tester', playerCode: `P4_${testId}`, attribute: '雷', hp: 8, attack: 5, defense: 0, skills: [], status: { isAlive: true } });
        dummy = await Player.create({ gameId: game._id, name: 'Dummy', playerCode: `D1_${testId}`, attribute: '木', hp: 20, attack: 0, defense: 0, skills: [], status: { isAlive: true } });

        game.players = [p1._id, p2._id, p3._id, p4._id, dummy._id];
        await game.save();

        const reset = async () => {
            const defaultStats = { hasAttacked: false, timesBeenAttacked: 0, attackedBy: [], usedSkillsThisRound: [], isHibernating: false };

            p1 = await Player.findById(p1._id);
            p1.hp = 30; p1.attack = 5; p1.defense = 0; p1.skills = []; p1.roundStats = { ...defaultStats }; p1.usedOneTimeSkills = [];
            await p1.save();

            p2 = await Player.findById(p2._id);
            p2.hp = 30; p2.attack = 2; p2.defense = 2; p2.skills = []; p2.roundStats = { ...defaultStats }; p2.usedOneTimeSkills = [];
            await p2.save();

            p3 = await Player.findById(p3._id);
            p3.hp = 10; p3.attack = 0; p3.defense = 0; p3.skills = []; p3.roundStats = { ...defaultStats }; p3.usedOneTimeSkills = [];
            await p3.save();

            p4 = await Player.findById(p4._id);
            p4.hp = 8; p4.attack = 5; p4.defense = 0; p4.skills = []; p4.roundStats = { ...defaultStats }; p4.usedOneTimeSkills = [];
            await p4.save();

            dummy = await Player.findById(dummy._id);
            dummy.hp = 20; dummy.attack = 0; dummy.defense = 0; dummy.status.isAlive = true; dummy.skills = []; dummy.roundStats = { ...defaultStats }; dummy.usedOneTimeSkills = [];
            await dummy.save();
        };

        const assert = (condition, msg) => {
            if (!condition) {
                console.error(`[FAIL] ${msg}`);
                throw new Error(msg);
            }
            console.log(`[PASS] ${msg}`);
        };

        // --- Test 1: Spike (尖刺) ---
        console.log("\n--- Test: Spike (Reflect 50%) ---");
        await reset();
        dummy.skills.push('尖刺'); await dummy.save();
        // P1(Fire) attacks Dummy(Wood). Dmg = 5(Base) + 3(Round1) = 8.
        // Recoil = floor(8 / 2) = 4.
        await handleAttackFlow(gameCode, p1._id, dummy._id, mockIo);
        const p1_spike = await Player.findById(p1._id);
        const recoil = 30 - p1_spike.hp;
        assert(recoil === 4, `Attacker should take 4 recoil damage (Actual: ${recoil})`);

        // --- Test 2: Shell (龜甲) ---
        console.log("\n--- Test: Shell (Reduce 3 Dmg) ---");
        await reset();
        dummy.skills.push('龜甲'); await dummy.save();
        // P1 attacks Dummy. Dmg = 8. Shell reduces 3 => 5.
        await handleAttackFlow(gameCode, p1._id, dummy._id, mockIo);
        const dummy_shell = await Player.findById(dummy._id);
        const dmgTaken = 20 - dummy_shell.hp;
        assert(dmgTaken === 5, `Shell should reduce damage to 5 (Actual: ${dmgTaken})`);

        // --- Test 3: Fang (獠牙) ---
        console.log("\n--- Test: Fang (Ignore Defense) ---");
        await reset();
        dummy.defense = 5; await dummy.save(); // High defense on dummy
        p1.skills.push('獠牙'); await p1.save();
        // P1 (Fire) attacks Dummy (Wood). Fire wins. Dmg = 8. Defense 5 ignored. Result 8.
        await handleAttackFlow(gameCode, p1._id, dummy._id, mockIo);
        const dummy_fang = await Player.findById(dummy._id);
        const dmgFang = 20 - dummy_fang.hp;
        assert(dmgFang === 8, `Fang should deal full 8 damage ignoring defense (Actual: ${dmgFang})`);

        // --- Test 4: Tail Docking (斷尾) ---
        console.log("\n--- Test: Tail Docking (Cap damage at 2) ---");
        await reset();
        dummy.skills.push('斷尾'); await dummy.save();
        // P1 attacks Dummy. Dmg 8 -> Capped at 2.
        await handleAttackFlow(gameCode, p1._id, dummy._id, mockIo);
        const dummy_tail = await Player.findById(dummy._id);
        const dmgTail = 20 - dummy_tail.hp;
        assert(dmgTail === 2, `Tail Docking should limit damage to 2 (Actual: ${dmgTail})`);

        // --- Test 5: Adrenaline (腎上腺素) ---
        console.log("\n--- Test: Adrenaline (+3 Atk when HP < 10) ---");
        await reset();
        p4.skills.push('腎上腺素'); await p4.save();
        // P4 (HP 8) attacks Dummy. Base 5 + Round 3 + Adrenaline 3 = 11.
        await handleAttackFlow(gameCode, p4._id, dummy._id, mockIo);
        const dummy_adr = await Player.findById(dummy._id);
        const dmgAdr = 20 - dummy_adr.hp;
        assert(dmgAdr === 11, `Adrenaline should deal 11 damage (Actual: ${dmgAdr})`);

        // --- Test 6: Survival of the Fittest (適者生存) ---
        console.log("\n--- Test: Survival of the Fittest (Perm Atk +2) ---");
        await reset();
        p1.skills.push('適者生存'); await p1.save();
        await handleAttackFlow(gameCode, p1._id, dummy._id, mockIo);
        const p1_surv = await Player.findById(p1._id);
        assert(p1_surv.attack === 7, `Attacker should gain +2 Attack (Original: 5, Now: ${p1_surv.attack})`);

        // --- Test 7: Bloodlust (嗜血) ---
        console.log("\n--- Test: Bloodlust (Heal +2) ---");
        await reset();
        p1.skills.push('嗜血');
        p1.hp = 20; // Damaged
        await p1.save();
        await handleAttackFlow(gameCode, p1._id, dummy._id, mockIo); // P1 (Fire) vs Dummy (Wood) -> Winner
        const p1_blood = await Player.findById(p1._id);
        assert(p1_blood.hp === 22, `Bloodlust should heal 2 HP (Original: 20, Now: ${p1_blood.hp})`);

        // --- Test 8: Vulture (禿鷹) ---
        console.log("\n--- Test: Vulture (Heal on Kill) ---");
        await reset();
        p3.skills.push('禿鷹'); await p3.save();
        dummy.hp = 1; await dummy.save();
        // P1 kills Dummy
        await handleAttackFlow(gameCode, p1._id, dummy._id, mockIo);

        const dummy_dead = await Player.findById(dummy._id);
        assert(dummy_dead.hp <= 0 && !dummy_dead.status.isAlive, "Dummy should be dead");

        const p3_vulture = await Player.findById(p3._id);
        assert(p3_vulture.hp === 13, `Vulture should heal 3 HP (Original: 10, Now: ${p3_vulture.hp})`);

        console.log("\n=== All Skill Tests Passed ===");

    } catch (err) {
        console.error("Test Failed:", err);
        process.exit(1);
    } finally {
        console.log("Cleaning up...");
        if (game) await Game.findByIdAndDelete(game._id);
        if (p1) await Player.deleteMany({ gameId: game._id });
        await mongoose.disconnect();
        process.exit(0);
    }
}

runTests();
