// server/services/gameService.js
const Game = require('../models/gameModel');
const Player = require('../models/playerModel');
const { SKILLS_BY_ROUND, LEVEL_STATS, LEVEL_UP_COSTS, INITIAL_HP } = require('../config/gameConstants');

const auctionTimers = {};

const getEnrichedGameData = (fullGame) => {
    if (!fullGame) return null;
    const highestBids = {};
    for (const bid of fullGame.bids) {
        if (!highestBids[bid.skill] || bid.amount > highestBids[bid.skill].amount) {
            const bidder = fullGame.players.find(p => p._id.equals(bid.playerId));
            highestBids[bid.skill] = {
                amount: bid.amount,
                playerName: bidder ? bidder.name : '未知玩家',
                playerId: bidder ? bidder._id : null,
                playerCode: bidder ? bidder.playerCode : null
            };
        }
    }

    return {
        _id: fullGame._id,
        gameCode: fullGame.gameCode,
        playerCount: fullGame.playerCount,
        players: fullGame.players,
        currentRound: fullGame.currentRound,
        gamePhase: fullGame.gamePhase,
        skillsForAuction: Object.fromEntries(fullGame.skillsForAuction || []),
        allAuctionedSkills: fullGame.allAuctionedSkills || [],
        bids: fullGame.bids,
        gameLog: fullGame.gameLog,
        highestBids: highestBids,
        auctionState: fullGame.auctionState,
    };
};

const broadcastGameState = async (gameCode, io) => {
    let fullGame = await Game.findOne({ gameCode }).populate('players');
    if (fullGame) {
        if (fullGame.auctionState && fullGame.auctionState.status !== 'none' && fullGame.auctionState.status !== 'finished') {
            const now = Date.now();
            const endTime = fullGame.auctionState.endTime ? new Date(fullGame.auctionState.endTime).getTime() : 0;

            if (now >= endTime + 500) {
                if (fullGame.auctionState.status === 'starting') {
                    await transitionToActive(gameCode, io);
                    fullGame = await Game.findOne({ gameCode }).populate('players');
                } else if (fullGame.auctionState.status === 'active') {
                    await settleSkillAuction(gameCode, io);
                    fullGame = await Game.findOne({ gameCode }).populate('players');
                }
            }
        }

        const gameData = getEnrichedGameData(fullGame);
        io.to(fullGame.gameCode).emit('gameStateUpdate', gameData);
    }
    return fullGame;
};

async function applyDamageWithLink(player, damage, game, io) {
    if (damage <= 0 || !player.status.isAlive) return;

    player.hp -= damage;
    if (player.hp <= 0) {
        player.hp = 0;
        player.status.isAlive = false;
    }
    await player.save();

    // 如果有連結目標且目標存活，同步扣血
    if (player.roundStats.damageLinkTarget) {
        const linkTarget = await Player.findById(player.roundStats.damageLinkTarget);
        if (linkTarget && linkTarget.status.isAlive) {
            linkTarget.hp = Math.max(0, linkTarget.hp - damage);
            if (linkTarget.hp === 0) linkTarget.status.isAlive = false;
            await linkTarget.save();

            const linkMsg = `[同病相憐] 效應！${player.name} 受到 ${damage} 點傷害，連結目標 ${linkTarget.name} 也同步受到傷害！`;
            game.gameLog.push({ text: linkMsg, type: 'battle' });
            await game.save();
            io.to(game.gameCode).emit('attackResult', { message: linkMsg, targetId: linkTarget._id });
        }
    }
}

async function transitionToActive(gameCode, io) {
    let g = await Game.findOne({ gameCode });
    if (!g || g.auctionState.status !== 'starting') return;

    g.auctionState.status = 'active';
    g.auctionState.endTime = new Date(Date.now() + 120000);
    await g.save();
    await broadcastGameState(gameCode, io);

    if (auctionTimers[gameCode]) clearInterval(auctionTimers[gameCode]);
    auctionTimers[gameCode] = setInterval(async () => {
        let activeGame = await Game.findOne({ gameCode });
        if (!activeGame || activeGame.auctionState.status !== 'active') {
            clearInterval(auctionTimers[gameCode]);
            delete auctionTimers[gameCode];
            return;
        }

        if (Date.now() >= activeGame.auctionState.endTime.getTime()) {
            clearInterval(auctionTimers[gameCode]);
            delete auctionTimers[gameCode];
            await settleSkillAuction(gameCode, io);
        }
    }, 1000);
}

async function startAuctionForSkill(gameCode, io) {
    let game = await Game.findOne({ gameCode });
    if (!game) return;

    if (game.auctionState.queue.length === 0) {
        game.auctionState.status = 'none';
        game.auctionState.currentSkill = null;
        await game.save();
        await finalizeAuctionPhase(gameCode, io);
        return;
    }

    const nextSkill = game.auctionState.queue[0];
    game.auctionState.currentSkill = nextSkill;
    game.auctionState.status = 'starting';
    game.auctionState.endTime = new Date(Date.now() + 5000);
    await game.save();
    await broadcastGameState(gameCode, io);

    setTimeout(async () => {
        await transitionToActive(gameCode, io);
    }, 5000);
}

async function settleSkillAuction(gameCode, io) {
    let game = await Game.findOne({ gameCode }).populate({ path: 'bids.playerId' });
    if (!game) return;

    const skill = game.auctionState.currentSkill;
    const bidsForSkill = game.bids.filter(b => b.skill === skill && b.playerId);
    bidsForSkill.sort((a, b) => b.amount - a.amount || a.createdAt - b.createdAt);

    if (bidsForSkill.length > 0) {
        const winningBid = bidsForSkill[0];
        const winner = await Player.findById(winningBid.playerId._id);
        if (winner && winner.hp > winningBid.amount) {
            winner.hp -= winningBid.amount;
            if (!winner.skills.includes(skill)) {
                winner.skills.push(skill);
                if (skill === '龜甲') winner.defense += 3;
            }
            await winner.save();
            game.gameLog.push({ text: `[競標結果] 恭喜 ${winner.name} 以 ${winningBid.amount} HP 標得 [${skill}]！`, type: 'success' });
        }
    } else {
        game.gameLog.push({ text: `[競標結果] 技能 [${skill}] 本次無人得標。`, type: 'info' });
    }

    game.auctionState.queue = game.auctionState.queue.filter(s => s !== skill);
    game.auctionState.status = 'finished';
    await game.save();
    await broadcastGameState(gameCode, io);

    setTimeout(() => {
        startAuctionForSkill(gameCode, io);
    }, 3000);
}

async function finalizeAuctionPhase(gameCode, io) {
    let game = await Game.findOne({ gameCode });
    if (!game) return;

    game.gameLog.push({ text: '所有技能競標結束，即將進入下一回合...', type: 'system' });
    game.auctionState.status = 'none';
    game.auctionState.currentSkill = null;

    await Player.updateMany({ _id: { $in: game.players } }, {
        $set: {
            "roundStats.hasAttacked": false, "roundStats.timesBeenAttacked": 0,
            "roundStats.isHibernating": false, "roundStats.staredBy": [], "roundStats.minionId": null,
            "roundStats.usedSkillsThisRound": [], "effects.isPoisoned": false,
            "roundStats.attackedBy": [], "roundStats.scoutUsageCount": 0,
            "roundStats.damageLinkTarget": null
        }
    });

    if (game.currentRound >= 3) {
        game.gamePhase = 'discussion_round_4';
        game.currentRound = 4;
    } else {
        game.currentRound += 1;
        game.gamePhase = `discussion_round_${game.currentRound}`;
    }
    game.bids = [];

    // 優先使用自定義技能，否則使用預設技能
    const { SKILLS_BY_ROUND } = require('../config/gameConstants');
    let nextRoundSkills = null;

    // Check customSkillsByRound (supporting both Map and plain object)
    let customSelection = null;
    if (game.customSkillsByRound) {
        if (typeof game.customSkillsByRound.get === 'function') {
            customSelection = game.customSkillsByRound.get(game.currentRound.toString());
        } else {
            customSelection = game.customSkillsByRound[game.currentRound.toString()];
        }
    }

    if (customSelection && Object.keys(customSelection).length > 0) {
        // 如果有自定義設定，需從 SKILLS_BY_ROUND 查回描述
        // 注意：自定義可能跨回合（例如 R1 賣 R3 技能），所以要查所有回合的表
        nextRoundSkills = {};

        // 建立全技能對照表
        const allSkillsMap = {};
        Object.values(SKILLS_BY_ROUND).forEach(roundPool => {
            Object.assign(allSkillsMap, roundPool);
        });

        for (const skillName of Object.keys(customSelection)) {
            if (allSkillsMap[skillName]) {
                nextRoundSkills[skillName] = allSkillsMap[skillName];
            } else {
                nextRoundSkills[skillName] = '特殊技能 (查無說明)';
            }
        }
    } else {
        nextRoundSkills = SKILLS_BY_ROUND[game.currentRound];
    }

    game.skillsForAuction = nextRoundSkills || {};

    if (nextRoundSkills) {
        for (const [skill, desc] of Object.entries(nextRoundSkills)) {
            game.allAuctionedSkills.push({ skill, description: desc, round: game.currentRound });
        }
    }
    await game.save();
    await broadcastGameState(gameCode, io);
}

async function handleSingleAttack(game, attacker, target, io, isMinionAttack = false) {
    if (!attacker.status.isAlive || attacker.hp <= 0) {
        return { success: false, valid: false, message: `[攻擊無效] ${attacker.name} 已經倒下了。` };
    }
    if (!target.status.isAlive || target.hp <= 0) {
        return { success: false, valid: false, message: `[攻擊無效] ${target.name} 已經倒下了。` };
    }
    if (attacker.roundStats.isHibernating || target.roundStats.isHibernating) {
        const message = "冬眠中的玩家無法進行或參與攻擊。";
        game.gameLog.push({ text: message, type: 'battle' });
        await game.save();
        io.to(game.gameCode).emit('attackResult', { message });
        return { success: false, message };
    }
    if (attacker.roundStats.attackedBy.some(id => id.equals(target._id))) {
        return { success: false, valid: false, message: `無法攻擊！因為 ${target.name} 本回合已經先攻擊過您了。` };
    }
    if (attacker.roundStats.staredBy.some(id => id.equals(target._id))) {
        const message = `${attacker.name} 被 ${target.name} 瞪住了，無法攻擊！`;
        game.gameLog.push({ text: message, type: 'battle' });
        await game.save();
        io.to(game.gameCode).emit('attackResult', { message });
        return { success: false, message };
    }

    if (!isMinionAttack) {
        if (attacker.roundStats.hasAttacked) return { success: false, valid: false, message: "您本回合已經攻擊過了" };
        if (game.currentRound <= 3 && target.roundStats.timesBeenAttacked > 0) return { success: false, valid: false, message: "該玩家本回合已被攻擊過" };
        attacker.roundStats.hasAttacked = true;
        await attacker.save();
    }

    const attributeRules = { '木': '水', '水': '火', '火': '木' };

    // [NEW] 噴墨技能判定 (強制轉移)
    if (target.skills.includes('噴墨') && !target.usedOneTimeSkills.includes('噴墨')) {
        const candidates = await Player.find({
            gameId: game._id,
            _id: { $ne: target._id, $nin: [attacker._id] },
            "status.isAlive": true,
            "roundStats.isHibernating": false,
            "roundStats.timesBeenAttacked": 0
        });

        if (candidates.length > 0) {
            const newTarget = candidates[Math.floor(Math.random() * candidates.length)];
            target.usedOneTimeSkills.push('噴墨');
            await target.save();

            const inkMsg = `${target.name} 使用了 [噴墨]！閃避了 ${attacker.name} 的攻擊並將其轉移給了 ${newTarget.name}！`;
            game.gameLog.push({ text: inkMsg, type: 'battle' });
            await game.save();
            io.to(game.gameCode).emit('attackResult', { message: inkMsg });

            // 遞迴呼叫攻擊新對象，isMinionAttack 設為 true 避免重覆扣除攻擊次數
            return await handleSingleAttack(game, attacker, newTarget, io, true);
        } else {
            const failMsg = `${target.name} 試圖使用 [噴墨]，但場上無可轉移目標，只能自行承受！`;
            game.gameLog.push({ text: failMsg, type: 'info' });
            await game.save();
        }
    }
    const roundBonus = { 1: 3, 2: 4, 3: 5, 4: 7 };
    let attackSuccess = false;
    let skillMessage = '';

    if (attacker.attribute === target.attribute) attackSuccess = attacker.level > target.level;
    else if (attacker.attribute === '雷' || target.attribute === '雷') attackSuccess = true;
    else if (attributeRules[attacker.attribute] === target.attribute) attackSuccess = true;
    else if (attributeRules[target.attribute] === attacker.attribute) attackSuccess = false;
    else attackSuccess = attacker.level > target.level;

    const damageCalculator = (winner, loser) => {
        const effectiveDefense = winner.skills.includes('獠牙') ? 0 : loser.defense;
        const adrenalineBonus = (winner.skills.includes('腎上腺素') && winner.hp < 10) ? 3 : 0;
        return Math.max(1, winner.attack + (roundBonus[game.currentRound] || 0) + adrenalineBonus - effectiveDefense);
    };
    let damage = 0;

    if (attackSuccess) {
        damage = damageCalculator(attacker, target);
        if (target.skills.includes('斷尾') && damage > 0) {
            await applyDamageWithLink(target, 2, game, io);
            const msg = `${attacker.name} 攻擊了 ${target.name}，但對方使用 [斷尾] 躲開了攻擊，只損失 2 HP！`;
            game.gameLog.push({ text: msg, type: 'battle' });
            await game.save();
            io.to(game.gameCode).emit('attackResult', { message: msg });
            return { success: true, message: msg };
        }
        if (target.skills.includes('尖刺')) {
            const recoil = Math.floor(damage / 2);
            await applyDamageWithLink(attacker, recoil, game, io);
            skillMessage += ` [尖刺] 反彈 ${recoil} 點傷害！`;
        }
        attacker.hp += damage;
        await applyDamageWithLink(target, damage, game, io);
        if (attacker.skills.includes('適者生存')) {
            attacker.attack += 2;
            skillMessage += ` [適者生存] 攻擊力增加 2！`;
        }
        if (attacker.skills.includes('嗜血')) {
            attacker.hp += 2;
            skillMessage += ` [嗜血] 額外恢復 2 HP！`;
        }
    } else {
        damage = damageCalculator(target, attacker);
        await applyDamageWithLink(attacker, damage, game, io);
        target.hp += damage;
    }

    target.roundStats.timesBeenAttacked += 1;
    target.roundStats.attackedBy.push(attacker._id);

    await attacker.save();
    await target.save();

    const resMsg = attackSuccess
        ? `${attacker.name} 成功攻擊了 ${target.name}，造成了 ${damage} 點傷害！${skillMessage}`
        : `${attacker.name} 攻擊 ${target.name} 失敗，自己損失 ${damage} 點HP！`;

    game.gameLog.push({ text: resMsg, type: 'battle' });
    await game.save();
    io.to(game.gameCode).emit('attackResult', { message: resMsg, targetId: target._id, type: attackSuccess ? 'damage' : 'miss' });
    return { success: attackSuccess, message: resMsg };
}

async function useSkill(playerId, skill, targets, targetAttribute, io) {
    const player = await Player.findById(playerId);
    if (!player) throw new Error("找不到玩家");
    const game = await Game.findById(player.gameId).populate('players');
    if (!game) throw new Error("找不到遊戲");

    if (player.skills.includes(skill) && player.usedOneTimeSkills.includes(skill)) {
        throw new Error(`[${skill}] 技能只能使用一次`);
    }

    let message = '';
    let specialResponse = null;

    switch (skill) {
        case '冬眠':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用冬眠");
            player.roundStats.isHibernating = true;
            player.roundStats.usedSkillsThisRound.push('冬眠');
            await player.save();
            message = `${player.name} 決定進入冬眠狀態`;
            break;
        case '瞪人':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用瞪人");
            if (!targets || targets.length > 2 || targets.length === 0) throw new Error("必須指定1-2位玩家");
            await Player.updateMany({ _id: { $in: targets } }, { $addToSet: { "roundStats.staredBy": player._id } });
            player.roundStats.usedSkillsThisRound.push('瞪人');
            await player.save();
            message = `${player.name} 瞪了指定的玩家`;
            break;
        case '劇毒':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用劇毒");
            if (player.roundStats.usedSkillsThisRound.includes('劇毒')) throw new Error("本回合已使用過劇毒");
            if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
            const poisonTarget = await Player.findById(targets[0]);
            if (!poisonTarget) throw new Error("找不到目標玩家");
            poisonTarget.effects.isPoisoned = true;
            player.roundStats.usedSkillsThisRound.push('劇毒');
            await poisonTarget.save();
            await player.save();
            message = `${player.name} 對 ${poisonTarget.name} 使用了 [劇毒]！`;
            break;
        case '荷魯斯之眼':
            if (player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼')) throw new Error("本回合已使用過荷魯斯之眼");
            if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
            const eyeTarget = await Player.findById(targets[0]);
            if (!eyeTarget) throw new Error("找不到目標玩家");
            player.roundStats.usedSkillsThisRound.push('荷魯斯之眼');
            await player.save();
            message = `${player.name} 使用了 [荷魯斯之眼] 查看 ${eyeTarget.name} 的狀態。`;
            specialResponse = { message: `[荷魯斯之眼] 結果：${eyeTarget.name} 的當前血量為 ${eyeTarget.hp} HP。` };
            break;
        case '擬態':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用擬態");
            if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
            const mimicTarget = await Player.findById(targets[0]);
            if (!mimicTarget) throw new Error("找不到目標玩家");
            player.attribute = mimicTarget.attribute;
            player.usedOneTimeSkills.push('擬態');
            await player.save();
            message = `${player.name} 使用了 [擬態]，變成了與 ${mimicTarget.name} 相同的屬性！`;
            break;
        case '寄生':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用寄生");
            if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
            const parasiteTarget = await Player.findById(targets[0]);
            if (!parasiteTarget) throw new Error("找不到目標玩家");
            player.hp = Math.max(player.hp - 5, Math.min(parasiteTarget.hp, player.hp + 10));
            player.usedOneTimeSkills.push('寄生');
            await player.save();
            message = `${player.name} 對 ${parasiteTarget.name} 使用了 [寄生]！`;
            break;
        case '森林權杖':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用權杖");
            if (!targets || targets.length !== 1 || !targets[0]) throw new Error("必須指定一個目標屬性");
            const targetAttr = targets[0];
            const allPlayers = await Player.find({ gameId: game._id });
            let affectedPlayersNames = [];
            for (const p of allPlayers) {
                if (p._id.equals(player._id)) continue;
                if (p.attribute === targetAttr) {
                    await applyDamageWithLink(p, 2, game, io);
                    affectedPlayersNames.push(p.name);
                }
            }
            player.usedOneTimeSkills.push('森林權杖');
            await player.save();
            message = affectedPlayersNames.length > 0
                ? `${player.name} 舉起了 [森林權杖]！${affectedPlayersNames.join(', ')} 因屬性為 ${targetAttr} 而損失了 2 HP！`
                : `${player.name} 舉起了 [森林權杖]，但沒有玩家受到影響。`;
            break;
        case '獅子王':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段指定手下");
            if (!targets || targets.length !== 1) throw new Error("必須指定1位手下");
            const aliveCount = game.players.filter(p => p.hp > 0 && p.status.isAlive).length;
            if (aliveCount <= 2) throw new Error("場上僅剩兩位玩家，[獅子王] 功能無效。");
            player.roundStats.minionId = targets[0];
            player.roundStats.usedSkillsThisRound.push('獅子王');
            await player.save();
            const minion = await Player.findById(targets[0]);
            message = `${player.name} 使用 [獅子王] 指定 ${minion.name} 為本回合的手下！`;
            break;
        case '折翅':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用折翅");
            if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
            const clipTarget = await Player.findById(targets[0]);
            if (!clipTarget) throw new Error("找不到目標玩家");
            if (clipTarget.skills.length > 0) {
                const randomIndex = Math.floor(Math.random() * clipTarget.skills.length);
                const removedSkill = clipTarget.skills.splice(randomIndex, 1)[0];
                await clipTarget.save();
                message = `${player.name} 對 ${clipTarget.name} 使用了 [折翅]，隨機拔掉了對方的 [${removedSkill}] 技能！`;
            } else {
                message = `${player.name} 對 ${clipTarget.name} 使用了 [折翅]，但對方身上沒有任何技能可以拔掉...真尷尬。`;
            }
            player.usedOneTimeSkills.push('折翅');
            await player.save();
            break;
        case '同病相憐':
            if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用同病相憐");
            if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
            const linkTarget = await Player.findById(targets[0]);
            if (!linkTarget) throw new Error("找不到目標玩家");
            player.roundStats.damageLinkTarget = linkTarget._id;
            player.roundStats.usedSkillsThisRound.push('同病相憐');
            await player.save();
            message = `${player.name} 對 ${linkTarget.name} 使用了 [同病相憐]！本回合兩人的命運將連結在一起...`;
            break;
        default:
            throw new Error("未知的技能或使用時機不對");
    }

    await broadcastGameState(game.gameCode, io);
    if (!specialResponse) {
        game.gameLog.push({ text: message, type: 'info' });
        await game.save();
    }
    return { message, specialResponse };
}

async function handleAttackFlow(gameCode, attackerId, targetId, io) {
    const game = await Game.findOne({ gameCode: gameCode.toUpperCase() }).populate('players');
    if (!game) throw new Error("找不到遊戲");

    let mainAttacker = game.players.find(p => p._id.equals(attackerId));
    let mainTarget = game.players.find(p => p._id.equals(targetId));
    if (!mainAttacker || !mainTarget) throw new Error("找不到玩家");

    if (mainAttacker.roundStats.minionId && mainAttacker.roundStats.minionId.equals(mainTarget._id)) {
        throw new Error("您不能攻擊自己的手下！");
    }

    let result;
    if (mainAttacker.skills.includes('獅子王') && mainAttacker.roundStats.minionId) {
        let minion = game.players.find(p => p._id.equals(mainAttacker.roundStats.minionId));
        result = await handleSingleAttack(game, mainAttacker, mainTarget, io);
        if (result.valid !== false && minion) {
            mainTarget = await Player.findById(targetId);
            if (mainTarget.hp > 0 && mainTarget.status.isAlive) {
                await handleSingleAttack(game, minion, mainTarget, io, true);
            }
        }
    } else {
        result = await handleSingleAttack(game, mainAttacker, mainTarget, io);
    }

    if (result && result.valid === false) throw new Error(result.message);

    const allPlayersInGame = await Player.find({ gameId: game._id });
    for (const p of allPlayersInGame) {
        if (p.hp <= 0 && p.status.isAlive) {
            p.status.isAlive = false;
            await p.save();
            const vulturePlayers = allPlayersInGame.filter(v => v.skills.includes('禿鷹') && v.status.isAlive && !v._id.equals(p._id));
            let vultureNames = [];
            for (const vulture of vulturePlayers) {
                vulture.hp += 3;
                await Player.findByIdAndUpdate(vulture._id, { hp: vulture.hp });
                vultureNames.push(vulture.name);
            }
            if (vultureNames.length > 0) {
                io.to(game.gameCode).emit('attackResult', { message: `${p.name} 倒下了！${vultureNames.join('、')} 觸發 [禿鷹] 恢復 3 HP！` });
            }
        }
    }

    await broadcastGameState(game.gameCode, io);
}

module.exports = {
    getEnrichedGameData,
    broadcastGameState,
    startAuctionForSkill,
    settleSkillAuction,
    finalizeAuctionPhase,
    handleSingleAttack,
    useSkill,
    handleAttackFlow
};
