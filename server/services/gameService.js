// server/services/gameService.js
const Game = require('../models/gameModel');
const Player = require('../models/playerModel');
const { SKILLS_BY_ROUND, LEVEL_STATS, LEVEL_UP_COSTS, INITIAL_HP, ROUND_DAMAGE_BONUS, AUCTION_TIMES } = require('../config/gameConstants');

const auctionTimers = {};
const lastBroadcastTime = {}; // 用於節流控制

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
        isAutoPilot: fullGame.isAutoPilot,
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

const broadcastGameState = async (gameCode, io, force = false) => {
    // 簡單的節流控制 (100ms 內僅廣播一次，避免廣播風暴)
    const now = Date.now();
    if (!force && lastBroadcastTime[gameCode] && now - lastBroadcastTime[gameCode] < 100) {
        return;
    }
    lastBroadcastTime[gameCode] = now;

    let fullGame = await Game.findOne({ gameCode: gameCode.toUpperCase() }).populate('players');
    if (fullGame) {
        // --- 全自動流程時間監管 ---
        if (fullGame.isAutoPilot && fullGame.gamePhase !== 'waiting' && fullGame.gamePhase !== 'finished') {
            const now = Date.now();
            const phaseEndTime = fullGame.auctionState.endTime ? new Date(fullGame.auctionState.endTime).getTime() : 0;

            // 競標階段由原有邏輯處理，其它階段在此檢查超時
            if (!fullGame.gamePhase.startsWith('auction') && phaseEndTime > 0 && now >= phaseEndTime) {
                console.log(`[AutoPilot] Phase timeout for ${gameCode} (${fullGame.gamePhase}). Transitioning...`);
                await transitionToNextPhase(gameCode, io);
                fullGame = await Game.findOne({ gameCode }).populate('players');
            } else if (!fullGame.gamePhase.startsWith('auction') && fullGame.gamePhase !== 'waiting') {
                // [新增] 每一秒廣播時，順便檢查是否觸發全員 Ready/Attack 快進 (針對死掉的人排除後剩餘的人)
                if (fullGame.gamePhase.startsWith('discussion')) {
                    await checkReadyFastForward(fullGame, io);
                } else if (fullGame.gamePhase.startsWith('attack')) {
                    await checkAttackFastForward(fullGame, io);
                }
            }
        }

        // 處理競標階段的自動狀態轉換 (安全網救援邏輯)
        if (fullGame.auctionState && fullGame.gamePhase.startsWith('auction')) {
            const auctionEndTime = fullGame.auctionState.endTime ? new Date(fullGame.auctionState.endTime).getTime() : 0;
            const now = Date.now();
            const status = fullGame.auctionState.status;

            // 如果已經超過預定時間 1.5 秒且還沒跳轉
            if (now >= auctionEndTime + 1500 && status !== 'settled') {
                console.log(`[Auction Safety] Auction stuck in status "${status}" for game ${gameCode}. Forcing jump...`);

                if (status === 'starting') {
                    await transitionToActive(gameCode, io);
                    fullGame = await Game.findOne({ gameCode: gameCode.toUpperCase() }).populate('players');
                } else if (status === 'active') {
                    await settleSkillAuction(gameCode, io);
                    fullGame = await Game.findOne({ gameCode: gameCode.toUpperCase() }).populate('players');
                } else if (status === 'finished' || status === 'none') {
                    // 如果競標已完成或處於空閒但沒換階段，嘗試開啟下一個技能或結算整階段
                    await startAuctionForSkill(gameCode, io);
                    fullGame = await Game.findOne({ gameCode: gameCode.toUpperCase() }).populate('players');
                }
            }
        }

        const gameData = getEnrichedGameData(fullGame);
        io.to(fullGame.gameCode).emit('gameStateUpdate', gameData);
    }
    return fullGame;
};

// --- 新增：計時器與自動化輔助函式 ---

/**
 * 計算各階段應有的時長 (秒)
 */
function calculatePhaseDuration(playerCount, phase) {
    if (phase.startsWith('discussion')) {
        // 自由討論：5分鐘 (300) + 30秒/人
        return 300 + (playerCount * 30);
    } else if (phase.startsWith('attack')) {
        // 攻擊階段：1分鐘 (60) + 10秒/人
        return 60 + (playerCount * 10);
    } else if (phase === 'auction_transition') {
        // 競標前的展示緩衝 (玩家要求 3 秒)
        return 3;
    } else if (phase === 'round_settlement') {
        // 回合結束結算緩衝
        return 10;
    }
    return 30; // 預設 30 秒
}

/**
 * 通用階段轉換函式 (用於自動化)
 */
async function transitionToNextPhase(gameCode, io) {
    let game = await Game.findOne({ gameCode }).populate('players');
    if (!game) return;

    const currentPhase = game.gamePhase;
    console.log(`[AutoPilot] Transitioning from ${currentPhase}`);

    if (currentPhase.startsWith('discussion')) {
        // 討論 -> 攻擊
        game.gamePhase = `attack_round_${game.currentRound}`;
    } else if (currentPhase.startsWith('attack')) {
        // 攻擊 -> 競標展示 (如果是 R1-R3) 或 視情況結束
        if (game.currentRound <= 3) {
            game.gamePhase = 'auction_transition';
            game.gameLog.push({ text: "所有攻擊已完成！即將在 3 秒後進入技能競標階段...", type: "system" });

            // [關鍵修正] 在進入競標過渡階段時,就要準備好本回合的技能
            // 否則進入 auction_round 時 skillsForAuction 會是空的
            const { SKILLS_BY_ROUND } = require('../config/gameConstants');
            let roundSkills = null;

            // 檢查是否有自定義技能
            let customSelection = null;
            if (game.customSkillsByRound) {
                if (typeof game.customSkillsByRound.get === 'function') {
                    customSelection = game.customSkillsByRound.get(game.currentRound.toString());
                } else {
                    customSelection = game.customSkillsByRound[game.currentRound.toString()];
                }
            }

            if (customSelection && Object.keys(customSelection).length > 0) {
                roundSkills = {};
                const allSkillsMap = {};
                Object.values(SKILLS_BY_ROUND).forEach(roundPool => {
                    Object.assign(allSkillsMap, roundPool);
                });
                for (const skillName of Object.keys(customSelection)) {
                    if (allSkillsMap[skillName]) {
                        roundSkills[skillName] = allSkillsMap[skillName];
                    } else {
                        roundSkills[skillName] = '特殊技能 (查無說明)';
                    }
                }
            } else {
                // 使用預設技能
                const pool = SKILLS_BY_ROUND[game.currentRound];
                if (pool) {
                    const poolKeys = Object.keys(pool);
                    const targetCount = Math.max(1, Math.floor(game.players.length / 2));
                    const shuffled = [...poolKeys];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    const selectedKeys = shuffled.slice(0, targetCount);
                    roundSkills = {};
                    selectedKeys.forEach(k => { roundSkills[k] = pool[k]; });
                }
            }


            game.skillsForAuction = roundSkills || {};

            // 記錄到累積列表
            if (roundSkills) {
                for (const [skill, desc] of Object.entries(roundSkills)) {
                    game.allAuctionedSkills.push({ skill, description: desc, round: game.currentRound });
                }
            }

            // [關鍵修正] 設定 3 秒過渡時間並立即存檔
            game.auctionState.endTime = new Date(Date.now() + 3000);
            await game.save();

            console.log(`[Auction] Prepared ${Object.keys(roundSkills || {}).length} skills for R${game.currentRound}:`, Object.keys(roundSkills || {}));

            // 廣播並返回,不繼續執行後面的邏輯
            await broadcastGameState(gameCode, io, true);
            return;
        } else {
            // 決賽圈結束
            game.gamePhase = 'finished';
        }
    } else if (currentPhase === 'auction_transition') {
        // 競標過渡 -> 正式進入競標回合
        game.gamePhase = `auction_round_${game.currentRound}`;
        // 初始化競標佇列 (技能已經在 attack->auction_transition 時準備好了)
        game.auctionState.queue = Array.from(game.skillsForAuction.keys());
        game.auctionState.status = 'none';

        console.log(`[Auction] Entering auction_round_${game.currentRound} with ${game.auctionState.queue.length} skills:`, game.auctionState.queue);

        await game.save();
        await startAuctionForSkill(gameCode, io);
        return;
    } else if (currentPhase.startsWith('auction')) {
        // 競標結束會由 finalizeAuctionPhase 處理
        await finalizeAuctionPhase(gameCode, io);
        return;
    }

    // 更新下一階段的結束時間 (重要：在 save 前完成，避免廣播舊時間)
    const aliveCount = game.players.filter(p => p.status && p.status.isAlive).length;
    const duration = calculatePhaseDuration(aliveCount, game.gamePhase);
    game.auctionState.endTime = new Date(Date.now() + duration * 1000);

    // [重要] 在存檔前重置狀態，確保下一階段開始時大家都是未準備/未行動
    // 這樣就不會再發生「瞬間連跳兩階段」或是「因為先重置而留在原地」的問題
    // [修正] 競標階段不需要重置這些狀態，否則會誤觸快進邏輯
    if (game.gamePhase !== currentPhase && !game.gamePhase.startsWith('auction') && game.gamePhase !== 'auction_transition') {
        await Player.updateMany(
            { gameId: game._id },
            { $set: { "roundStats.isReady": false, "roundStats.hasAttacked": false } }
        );
    }

    await game.save();
    // 順便廣播
    await broadcastGameState(gameCode, io, true);
}

/**
 * 檢查並執行 Ready 跳轉邏輯
 */
async function checkReadyFastForward(game, io) {
    if (!game.isAutoPilot || !game.gamePhase.startsWith('discussion')) return;

    const alivePlayers = game.players.filter(p => p.status && p.status.isAlive);
    const readyPlayers = alivePlayers.filter(p => p.roundStats && p.roundStats.isReady);

    // 如果全體「存活」玩家都 Ready 了
    if (readyPlayers.length === alivePlayers.length && alivePlayers.length > 0) {
        const now = Date.now();
        const currentEnd = game.auctionState.endTime ? new Date(game.auctionState.endTime).getTime() : 0;

        // 關鍵修正：如果目前剩餘時間已經小於 5 秒，表示已經在倒數中或是即將結束，不要重複重設倒數
        if (currentEnd > 0 && (currentEnd - now) < 5000) return;

        console.log(`[AutoPilot] Everyone alive is Ready! Fast-forwarding discussion for ${game.gameCode}`);
        game.auctionState.endTime = new Date(Date.now() + 3000); // 3秒後跳轉
        game.gameLog.push({ text: "存活玩家全員準備就緒！即將提前進入攻擊階段...", type: "system" });
        await game.save();
        await broadcastGameState(game.gameCode, io);
    }
}

/**
 * 檢查並執行攻擊完成跳轉邏輯
 */
async function checkAttackFastForward(game, io) {
    if (!game.isAutoPilot || !game.gamePhase.startsWith('attack')) return;

    const relevantPlayers = game.players.filter(p => p.status && p.status.isAlive && !p.roundStats?.isHibernating);
    const donePlayers = relevantPlayers.filter(p => p.roundStats && (p.roundStats.hasAttacked || p.roundStats.isReady));

    if (donePlayers.length === relevantPlayers.length && relevantPlayers.length > 0) {
        const now = Date.now();
        const currentEnd = game.auctionState.endTime ? new Date(game.auctionState.endTime).getTime() : 0;

        // 關鍵修正：避免重複觸發 3 秒倒數導致計時器無限重設
        if (currentEnd > 0 && (currentEnd - now) < 5000) return;

        console.log(`[AutoPilot] Everyone alive has acted or is ready! Fast-forwarding for ${game.gameCode}`);
        game.auctionState.endTime = new Date(Date.now() + 3000); // 3秒後跳轉
        game.gameLog.push({ text: "所有存活玩家行動完畢，即將提前進入結算階段...", type: "system" });
        await game.save();
        await broadcastGameState(game.gameCode, io);
    }
}

// ... (applyDamageWithLink function remains unchanged and is omitted here for brevity, assuming replace_file_content handles partial replacement correctly with StartLine/EndLine logic. Wait, replace_file_content replaces a CONTIGUOUS block. I need to be careful not to overwrite applyDamageWithLink if it is in the middle.
// The previous "view_file" showed `broadcastGameState` ends at line 72, and `transitionToActive` starts at line 100.
// `applyDamageWithLink` is between them (lines 74-98).
// My StartLine is 40. My EndLine is 182. This covers `broadcastGameState`, `applyDamageWithLink`, `transitionToActive`, `startAuctionForSkill`, `settleSkillAuction`.
// I MUST include `applyDamageWithLink` and `transitionToActive` and `startAuctionForSkill` in the ReplacementContent to keep them intact or I will delete them.

// RE-ASSEMBLING THE CONTENT:

// broadcastGameState (Modified)
// applyDamageWithLink (Unchanged)
// transitionToActive (Unchanged)
// startAuctionForSkill (Unchanged)
// settleSkillAuction (Modified) 

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
    g.auctionState.endTime = new Date(Date.now() + AUCTION_TIMES.ACTIVE_DURATION);
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
    try {
        let game = await Game.findOne({ gameCode });
        if (!game) return;

        // 如果佇列空了，代表本回合所有技能結標，跳回討論階段
        if (!game.auctionState.queue || game.auctionState.queue.length === 0) {
            console.log(`[Auction] Queue empty for ${gameCode}, finalizing phase.`);
            game.auctionState.status = 'none';
            game.auctionState.currentSkill = null;
            await game.save();
            await finalizeAuctionPhase(gameCode, io);
            return;
        }

        const nextSkill = game.auctionState.queue[0];
        game.auctionState.currentSkill = nextSkill;
        game.auctionState.status = 'starting';
        game.auctionState.endTime = new Date(Date.now() + AUCTION_TIMES.STARTING_DELAY);
        await game.save();
        await broadcastGameState(gameCode, io, true); // 強制更新

        setTimeout(async () => {
            await transitionToActive(gameCode, io);
        }, AUCTION_TIMES.STARTING_DELAY);
    } catch (err) {
        console.error(`[Auction Error] startAuctionForSkill failed:`, err);
    }
}

async function settleSkillAuction(gameCode, io) {
    let game = await Game.findOne({ gameCode }).populate({ path: 'bids.playerId' });
    if (!game) return;

    // Concurrency check: If already finished, don't re-run processing
    if (game.auctionState.status === 'finished') return;

    try {
        const skill = game.auctionState.currentSkill;
        const bidsForSkill = game.bids.filter(b => b.skill === skill && b.playerId);
        bidsForSkill.sort((a, b) => b.amount - a.amount || a.createdAt - b.createdAt);

        if (bidsForSkill.length > 0) {
            const winningBid = bidsForSkill[0];
            const winner = winningBid.playerId; // 已經被 populate 好了
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

        // Remove skill from queue
        game.auctionState.queue = game.auctionState.queue.filter(s => s !== skill);

    } catch (err) {
        console.error(`[Auction Error] Failed to settle auction for game ${gameCode}:`, err);
        game.gameLog.push({ text: `[系統錯誤] 競標結算發生異常，已自動跳過此階段。`, type: 'error' });
    }

    // ALWAYS ensure state transition happens, even if logic failed
    game.auctionState.status = 'finished';
    // Set explicit end time for the settlement phase so safety net can pick it up
    game.auctionState.endTime = new Date(Date.now() + AUCTION_TIMES.SETTLEMENT_DELAY);

    await game.save();
    await broadcastGameState(gameCode, io, true); // 強制更新，確保結算畫面立即出現

    setTimeout(async () => {
        await startAuctionForSkill(gameCode, io);
    }, AUCTION_TIMES.SETTLEMENT_DELAY);
}

async function finalizeAuctionPhase(gameCode, io) {
    try {
        let game = await Game.findOne({ gameCode });
        if (!game) return;

        game.gameLog.push({ text: '所有技能競標結束，即將進入下一回合...', type: 'system' });
        game.auctionState.status = 'none';
        game.auctionState.currentSkill = null;

        // 重置所有玩家的回合狀態與特殊效果
        const playerIds = game.players.map(p => p._id || p);
        await Player.updateMany({ _id: { $in: playerIds } }, {
            $set: {
                "roundStats.hasAttacked": false,
                "roundStats.timesBeenAttacked": 0,
                "roundStats.isHibernating": false,
                "roundStats.staredBy": [],
                "roundStats.minionId": null,
                "roundStats.usedSkillsThisRound": [],
                "effects.isPoisoned": false,
                "roundStats.attackedBy": [],
                "roundStats.scoutUsageCount": 0,
                "roundStats.damageLinkTarget": null,
                "roundStats.isReady": false
            }
        });

        // 進入下一回合
        if (game.currentRound >= 3) {
            game.gamePhase = 'discussion_round_4';
            game.currentRound = 4;
        } else {
            game.currentRound += 1;
            game.gamePhase = `discussion_round_${game.currentRound}`;
        }

        // 計算自動化流程的下一階段結束時間 (討論階段)
        const aliveCount = game.players.filter(p => p.status && p.status.isAlive).length;
        const duration = calculatePhaseDuration(aliveCount, game.gamePhase);
        game.auctionState.endTime = new Date(Date.now() + duration * 1000);

        // 清空出價記錄
        game.bids = [];

        // [移除] 技能準備邏輯已經移到 attack->auction_transition 階段
        // 這裡不再需要準備下一回合的技能

        await game.save();
        await broadcastGameState(gameCode, io, true); // 強制更新
    } catch (err) {
        console.error(`[Auction Error] finalizeAuctionPhase failed:`, err);
    }
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
        return Math.max(1, winner.attack + (ROUND_DAMAGE_BONUS[game.currentRound] || 0) + adrenalineBonus - effectiveDefense);
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

const SKILL_HANDLERS = {
    '冬眠': async (player, game, targets, targetAttribute, io) => {
        if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用冬眠");
        player.roundStats.isHibernating = true;
        player.roundStats.usedSkillsThisRound.push('冬眠');
        await player.save();
        return `${player.name} 決定進入冬眠狀態`;
    },
    '瞪人': async (player, game, targets, targetAttribute, io) => {
        if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用瞪人");
        if (!targets || targets.length > 2 || targets.length === 0) throw new Error("必須指定1-2位玩家");
        await Player.updateMany({ _id: { $in: targets } }, { $addToSet: { "roundStats.staredBy": player._id } });
        player.roundStats.usedSkillsThisRound.push('瞪人');
        await player.save();
        return `${player.name} 瞪了指定的玩家`;
    },
    '劇毒': async (player, game, targets, targetAttribute, io) => {
        if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用劇毒");
        if (player.roundStats.usedSkillsThisRound.includes('劇毒')) throw new Error("本回合已使用過劇毒");
        if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
        const poisonTarget = await Player.findById(targets[0]);
        if (!poisonTarget) throw new Error("找不到目標玩家");
        poisonTarget.effects.isPoisoned = true;
        player.roundStats.usedSkillsThisRound.push('劇毒');
        await poisonTarget.save();
        await player.save();
        return `${player.name} 對 ${poisonTarget.name} 使用了 [劇毒]！`;
    },
    '荷魯斯之眼': async (player, game, targets, targetAttribute, io) => {
        if (player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼')) throw new Error("本回合已使用過荷魯斯之眼");
        if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
        const eyeTarget = await Player.findById(targets[0]);
        if (!eyeTarget) throw new Error("找不到目標玩家");
        player.roundStats.usedSkillsThisRound.push('荷魯斯之眼');
        await player.save();
        return {
            message: `${player.name} 使用了 [荷魯斯之眼] 查看 ${eyeTarget.name} 的狀態。`,
            specialResponse: { message: `[荷魯斯之眼] 結果：${eyeTarget.name} 的當前血量為 ${eyeTarget.hp} HP。` }
        };
    },
    '擬態': async (player, game, targets, targetAttribute, io) => {
        if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用擬態");
        if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
        const mimicTarget = await Player.findById(targets[0]);
        if (!mimicTarget) throw new Error("找不到目標玩家");
        player.attribute = mimicTarget.attribute;
        player.usedOneTimeSkills.push('擬態');
        await player.save();
        return `${player.name} 使用了 [擬態]，變成了與 ${mimicTarget.name} 相同的屬性！`;
    },
    '寄生': async (player, game, targets, targetAttribute, io) => {
        if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用寄生");
        if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
        const parasiteTarget = await Player.findById(targets[0]);
        if (!parasiteTarget) throw new Error("找不到目標玩家");
        player.hp = Math.max(player.hp - 5, Math.min(parasiteTarget.hp, player.hp + 10));
        player.usedOneTimeSkills.push('寄生');
        await player.save();
        return `${player.name} 對 ${parasiteTarget.name} 使用了 [寄生]！`;
    },
    '森林權杖': async (player, game, targets, targetAttribute, io) => {
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
        return affectedPlayersNames.length > 0
            ? `${player.name} 舉起了 [森林權杖]！${affectedPlayersNames.join(', ')} 因屬性為 ${targetAttr} 而損失了 2 HP！`
            : `${player.name} 舉起了 [森林權杖]，但沒有玩家受到影響。`;
    },
    '獅子王': async (player, game, targets, targetAttribute, io) => {
        if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段指定手下");
        if (!targets || targets.length !== 1) throw new Error("必須指定1位手下");
        const aliveCount = game.players.filter(p => p.hp > 0 && p.status.isAlive).length;
        if (aliveCount <= 2) throw new Error("場上僅剩兩位玩家，[獅子王] 功能無效。");
        player.roundStats.minionId = targets[0];
        player.roundStats.usedSkillsThisRound.push('獅子王');
        await player.save();
        const minion = await Player.findById(targets[0]);
        return `${player.name} 使用 [獅子王] 指定 ${minion.name} 為本回合的手下！`;
    },
    '折翅': async (player, game, targets, targetAttribute, io) => {
        if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用折翅");
        if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
        const clipTarget = await Player.findById(targets[0]);
        if (!clipTarget) throw new Error("找不到目標玩家");
        let resultMsg = "";
        if (clipTarget.skills.length > 0) {
            const randomIndex = Math.floor(Math.random() * clipTarget.skills.length);
            const removedSkill = clipTarget.skills.splice(randomIndex, 1)[0];
            await clipTarget.save();
            resultMsg = `${player.name} 對 ${clipTarget.name} 使用了 [折翅]，隨機拔掉了對方的 [${removedSkill}] 技能！`;
        } else {
            resultMsg = `${player.name} 對 ${clipTarget.name} 使用了 [折翅]，但對方身上沒有任何技能可以拔掉...真尷尬。`;
        }
        player.usedOneTimeSkills.push('折翅');
        await player.save();
        return resultMsg;
    },
    '同病相憐': async (player, game, targets, targetAttribute, io) => {
        if (!game.gamePhase.startsWith('discussion')) throw new Error("只能在討論階段使用同病相憐");
        if (!targets || targets.length !== 1) throw new Error("必須指定1位玩家");
        const linkTarget = await Player.findById(targets[0]);
        if (!linkTarget) throw new Error("找不到目標玩家");
        player.roundStats.damageLinkTarget = linkTarget._id;
        player.roundStats.usedSkillsThisRound.push('同病相憐');
        await player.save();
        return `${player.name} 對 ${linkTarget.name} 使用了 [同病相憐]！本回合兩人的命運將連結在一起...`;
    }
};

async function useSkill(playerId, skill, targets, targetAttribute, io) {
    const player = await Player.findById(playerId);
    if (!player) throw new Error("找不到玩家");
    const game = await Game.findById(player.gameId).populate('players');
    if (!game) throw new Error("找不到遊戲");

    if (player.skills.includes(skill) && player.usedOneTimeSkills.includes(skill)) {
        throw new Error(`[${skill}] 技能只能使用一次`);
    }

    const handler = SKILL_HANDLERS[skill];
    if (!handler) throw new Error("未知的技能或目前無法使用");

    const result = await handler(player, game, targets, targetAttribute, io);
    let message = '';
    let specialResponse = null;

    if (typeof result === 'string') {
        message = result;
    } else {
        message = result.message;
        specialResponse = result.specialResponse;
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

    // --- [NEW] Smart Skip Check ---
    await checkAttackFastForward(game, io);

    // 優化：直接從 game.players 處理死亡判定，不重複查詢資料庫
    const allPlayersInGame = game.players;
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

/**
 * 智慧屬性分配邏輯 (平均分配水火木，餘數給雷)
 */
async function calculateAssignedAttribute(gameId) {
    const game = await Game.findById(gameId);
    if (!game) return '木';

    const totalSlots = game.playerCount;
    const baseCount = Math.floor(totalSlots / 3);
    const thunderCount = totalSlots % 3;

    const targets = { '木': baseCount, '水': baseCount, '火': baseCount, '雷': thunderCount };

    const existingPlayers = await Player.find({ gameId });
    const currentCounts = { '木': 0, '水': 0, '火': 0, '雷': 0 };
    existingPlayers.forEach(p => { if (currentCounts[p.attribute] !== undefined) currentCounts[p.attribute]++; });

    let availableBag = [];
    ['木', '水', '火', '雷'].forEach(attr => {
        const slotsLeft = targets[attr] - currentCounts[attr];
        for (let i = 0; i < slotsLeft; i++) {
            availableBag.push(attr);
        }
    });

    if (availableBag.length === 0) return ['木', '水', '火'][Math.floor(Math.random() * 3)];
    return availableBag[Math.floor(Math.random() * availableBag.length)];
}

module.exports = {
    getEnrichedGameData,
    broadcastGameState,
    startAuctionForSkill,
    settleSkillAuction,
    finalizeAuctionPhase,
    handleSingleAttack,
    useSkill,
    handleAttackFlow,
    transitionToNextPhase,
    checkReadyFastForward,
    calculatePhaseDuration,
    calculateAssignedAttribute
};
