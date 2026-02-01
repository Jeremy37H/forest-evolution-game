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
    console.log("=== Connecting DB (Passive Skills Test) ===");
    await mongoose.connect(process.env.MONGODB_URI);

    let game, p1, p2, p3, dummy;

    try {
        const gameCode = 'PASSIVE_TEST_' + Math.floor(Math.random() * 10000);
        console.log(`Creating test game: ${gameCode}`);
        game = await Game.create({
            gameCode: gameCode,
            playerCount: 4,
            gamePhase: 'attack_round_1',
            currentRound: 1
        });

        // Initialize Players
        p1 = await Player.create({ gameId: game._id, name: 'Attacker', playerCode: 'P1', attribute: '火', hp: 30, attack: 5, defense: 0, skills: [], status: { isAlive: true } });
        p2 = await Player.create({ gameId: game._id, name: 'Defender', playerCode: 'P2', attribute: '水', hp: 30, attack: 0, defense: 0, skills: [], status: { isAlive: true } });
        p3 = await Player.create({ gameId: game._id, name: 'VultureUser', playerCode: 'P3', attribute: '木', hp: 10, attack: 0, defense: 0, skills: ['禿鷹'], status: { isAlive: true } });
        dummy = await Player.create({ gameId: game._id, name: 'Dummy', playerCode: 'D1', attribute: '木', hp: 1, attack: 0, defense: 0, skills: [], status: { isAlive: true } });

        game.players = [p1._id, p2._id, p3._id, dummy._id];
        await game.save();

        const reset = async () => {
            const defaultStats = { hasAttacked: false, timesBeenAttacked: 0, attackedBy: [], usedSkillsThisRound: [], isHibernating: false };

            p1 = await Player.findById(p1._id);
            p1.hp = 30; p1.skills = []; p1.roundStats = { ...defaultStats }; p1.usedOneTimeSkills = [];
            await p1.save();

            p2 = await Player.findById(p2._id);
            p2.hp = 30; p2.skills = []; p2.roundStats = { ...defaultStats }; p2.usedOneTimeSkills = [];
            await p2.save();

            p3 = await Player.findById(p3._id);
            p3.hp = 10; p3.skills = ['禿鷹']; p3.roundStats = { ...defaultStats }; p3.usedOneTimeSkills = [];
            await p3.save();

            dummy = await Player.findById(dummy._id);
            dummy.hp = 1; dummy.status.isAlive = true; dummy.skills = []; dummy.roundStats = { ...defaultStats }; dummy.usedOneTimeSkills = [];
            await dummy.save();
        };

        const assert = (condition, msg) => {
            if (!condition) {
                console.error(`[FAIL] ${msg}`);
                throw new Error(msg);
            }
            console.log(`[PASS] ${msg}`);
        };

        // --- Test 1: Shell ---
        console.log("\n--- Test: Base Damage (Fire vs Water) ---");
        await reset();
        await handleAttackFlow(gameCode, p1._id, p2._id, mockIo);
        let p2_after = await Player.findById(p2._id);
        const normalDamage = 30 - p2_after.hp;
        console.log(`Base Damage: ${normalDamage}`);

        console.log("\n--- Test: Shell (Damage Reduction) ---");
        await reset();
        p2.skills.push('龜甲'); await p2.save();
        await handleAttackFlow(gameCode, p1._id, p2._id, mockIo);
        p2_after = await Player.findById(p2._id);
        const shellDamage = 30 - p2_after.hp;
        console.log(`Shell Damage: ${shellDamage}`);
        assert(shellDamage < normalDamage || shellDamage === 0, `Shell should reduce damage (Base: ${normalDamage}, Shell: ${shellDamage})`);



        // --- Test 3: Vulture ---
        console.log("\n--- Test: Vulture (Heal on kill) ---");
        await reset();
        await handleAttackFlow(gameCode, p1._id, dummy._id, mockIo);

        const dummy_after = await Player.findById(dummy._id);
        assert(dummy_after.hp <= 0 && dummy_after.status.isAlive === false, "Dummy should be dead");

        const p3_after = await Player.findById(p3._id);
        assert(p3_after.hp === 13, `Vulture user should heal 3 HP (Actual: ${p3_after.hp})`);




        // --- Test 5: Bloodlust ---
        console.log("\n--- Test: Bloodlust ---");
        await reset();
        p1.skills.push('嗜血'); await p1.save();
        p1.hp = 20; await p1.save();
        // Ensure P1 wins (Fire vs Wood)
        p2.attribute = '木'; await p2.save();
        await handleAttackFlow(gameCode, p1._id, p2._id, mockIo);
        const p1_blood = await Player.findById(p1._id);
        assert(p1_blood.hp > 20, `Bloodlust attacker should heal (Original: 20, Now: ${p1_blood.hp})`);

        console.log("\nAll passive skills tests completed!");

    } catch (err) {
        console.error("\nError during tests:", err);
    } finally {
        if (game) {
            console.log("\nCleaning up...");
            await Game.deleteOne({ _id: game._id });
            await Player.deleteMany({ gameId: game._id });
        }
        await mongoose.disconnect();
    }
}

runTests();
