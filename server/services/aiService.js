// server/services/aiService.js
const Player = require('../models/playerModel');
const Game = require('../models/gameModel');
const { INITIAL_HP, LEVEL_STATS } = require('../config/gameConstants');
const { broadcastGameState, handleAttackFlow, useSkill, calculateAssignedAttribute } = require('./gameService');

/**
 * 生成符合規則的 AI 名字
 * 規則：三個中文字，其中一個是動物，兩個是疊字 (例如：光豬豬、圓圓狗)
 */
function generateAiName() {
    const animals = ['豬', '狗', '蛇', '貓', '兔', '虎', '狼', '熊', '鹿', '象', '猴', '龍', '馬', '羊', '鳥'];
    const adjectives = ['光', '圓', '溜', '呆', '小', '大', '金', '木', '水', '火', '土', '風', '雷', '雲', '雪', '雨'];

    const isDoubleTrailing = Math.random() > 0.5;
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];

    if (isDoubleTrailing) {
        // 格式：[一字] + [動物疊字] (例：光豬豬)
        return `${adj}${animal}${animal}`;
    } else {
        // 格式：[疊字] + [動物] (例：圓圓狗)
        return `${adj}${adj}${animal}`;
    }
}

/**
 * 為指定遊戲加入一個 AI 玩家
 */
async function addAiPlayer(gameCode, io) {
    const game = await Game.findOne({ gameCode }).populate('players');
    if (!game) throw new Error("找不到遊戲");
    if (game.players.length >= game.playerCount) throw new Error("遊戲人數已滿");

    const intelligencePool = ['smart', 'dumb'];
    const personalityPool = ['aggressive', 'defensive'];

    const aiIntelligence = intelligencePool[Math.floor(Math.random() * intelligencePool.length)];
    const aiPersonality = personalityPool[Math.floor(Math.random() * personalityPool.length)];

    // 組合顯示用的類型標籤 (例如：聰明攻擊)
    const typeNames = {
        'smart': '聰明', 'dumb': '笨拙',
        'aggressive': '攻擊', 'defensive': '防禦'
    };
    const aiType = `${typeNames[aiIntelligence]}${typeNames[aiPersonality]}`;

    // 獲取目前遊戲中所有玩家的名字，以確保不重複
    const existingNames = game.players.map(p => p.name);
    let name = generateAiName();
    let attempts = 0;
    while (existingNames.includes(name) && attempts < 50) {
        name = generateAiName();
        attempts++;
    }

    const playerCode = 'AI-' + Math.floor(1000 + Math.random() * 9000);

    const attribute = await calculateAssignedAttribute(game._id);

    const aiPlayer = new Player({
        name,
        gameId: game._id,
        playerCode,
        attribute,
        hp: INITIAL_HP,
        attack: LEVEL_STATS[0].attack,
        defense: LEVEL_STATS[0].defense,
        isAI: true,
        aiIntelligence,
        aiPersonality,
        aiType: aiType
    });

    await aiPlayer.save();
    game.players.push(aiPlayer._id);
    await game.save();

    console.log(`[AI] Added AI Player: ${name} (${aiType}) to game ${gameCode}`);

    if (io) {
        await broadcastGameState(gameCode, io);
    }
    return aiPlayer;
}

/**
 * AI 決策主入口 (由 heartbeat 或階段轉換觸發)
 */
async function processAiTurns(gameCode, io) {
    const game = await Game.findOne({ gameCode }).populate('players');
    if (!game || game.gamePhase === 'finished' || game.gamePhase === 'waiting') return;

    const aiPlayers = game.players.filter(p => p.isAI && p.status.isAlive);
    if (aiPlayers.length === 0) return;

    for (const ai of aiPlayers) {
        try {
            if (game.gamePhase.startsWith('discussion')) {
                await handleAiDiscussion(game, ai, io);
            } else if (game.gamePhase.startsWith('attack')) {
                await handleAiAttack(game, ai, io);
            } else if (game.gamePhase.startsWith('auction')) {
                await handleAiAuction(game, ai, io);
            }
        } catch (err) {
            console.error(`[AI Error] Decision error for ${ai.name}:`, err.message);
        }
    }
}

async function handleAiDiscussion(game, ai, io) {
    // 1. AI 升級決策 (根據性格與血量)
    if (ai.level < 3 && !ai.roundStats.isReady) {
        const { LEVEL_UP_COSTS, INITIAL_HP } = require('../config/gameConstants');
        let cost = LEVEL_UP_COSTS[ai.level];
        if (ai.skills.includes('基因改造')) cost -= 1;

        const requiredHp = INITIAL_HP + cost;

        // 依據性格與智力決定升級的渴望度
        let upgradeChance = 0.1; // 預設基礎機率

        if (ai.aiIntelligence === 'smart') {
            upgradeChance = ai.hp >= requiredHp + 5 ? 0.4 : 0; // 聰明 AI 在安全血量下更傾向升級
        } else {
            upgradeChance = ai.hp >= requiredHp ? 0.2 : 0; // 笨拙 AI 只要夠血就可能升，不管後果
        }

        // 性格修正
        if (ai.aiPersonality === 'aggressive') upgradeChance *= 1.5; // 攻擊型更愛升級
        if (ai.aiPersonality === 'defensive') upgradeChance *= 0.5;  // 防禦型更保守提升

        if (Math.random() < upgradeChance) {
            console.log(`[AI] ${ai.name} (${ai.aiType}) decides to UPGRADE to LV ${ai.level + 1}`);
            // 直接執行升級邏輯 (模擬 API 行為)
            ai.level += 1;
            ai.hp = INITIAL_HP;
            const { LEVEL_STATS } = require('../config/gameConstants');
            ai.attack = LEVEL_STATS[ai.level].attack;
            ai.defense = LEVEL_STATS[ai.level].defense;
            if (ai.skills.includes('基因改造')) ai.defense += 1;
            if (ai.skills.includes('龜甲')) ai.defense += 3;
            await ai.save();
            game.gameLog.push({ text: `[AI] ${ai.name} 完成了進化，升級至 LV ${ai.level}！`, type: 'info' });
            await game.save();
            await broadcastGameState(game.gameCode, io);
            return; // 升級完本輪就不點 Ready，模擬操作延遲
        }
    }

    // 2. AI 技能使用決策 (新增主動技能邏輯)
    if (!ai.roundStats.isReady && !ai.roundStats.isHibernating) {
        // 防止一回合用太多技能，設定一個隨機門檻
        if (Math.random() < 0.6) { // 60% 機率思考是否用技能
            await tryAiUseSkill(game, ai, io);
        }
    }

    // 3. 如果沒事做且還沒 Ready，隨機決定是否 Ready
    if (!ai.roundStats.isReady) {
        // 大度延遲 Ready，讓人類有時間按按鈕或思考
        const readyProb = ai.aiIntelligence === 'dumb' ? 0.05 : 0.2;
        if (Math.random() < readyProb) {
            ai.roundStats.isReady = true;
            await ai.save();
            const { checkReadyFastForward } = require('./gameService');
            await checkReadyFastForward(game, io);
            await broadcastGameState(game.gameCode, io);
            console.log(`[AI] ${ai.name} is now READY.`);
        }
    }
}

/**
 * AI 嘗試使用技能
 */
async function tryAiUseSkill(game, ai, io) {
    // 找出尚未使用的手牌（這裡簡化判斷，只檢查 usedOneTimeSkills 和 usedSkillsThisRound）
    const availableSkills = ai.skills.filter(s =>
        !ai.usedOneTimeSkills.includes(s) &&
        !ai.roundStats.usedSkillsThisRound.includes(s)
    );

    if (availableSkills.length === 0) return;

    // 隨機選一個技能來評估
    const skillToConsider = availableSkills[Math.floor(Math.random() * availableSkills.length)];
    let target = null;
    let targetAttr = null;
    let shouldCast = false;

    // 取得活著的其他玩家
    const otherPlayers = game.players.filter(p => !p._id.equals(ai._id) && p.status && p.status.isAlive);

    // --- 技能決策樹 ---
    switch (skillToConsider) {
        case '冬眠':
            // 防禦型或膽小AI在血量低時必開，其餘看心情
            if (ai.aiPersonality === 'defensive' && ai.hp < 15) shouldCast = true;
            if (ai.aiIntelligence === 'dumb' && ai.hp < 10) shouldCast = true; // 笨蛋快死才開
            break;

        case '瞪人':
            // 攻擊型最愛用，封鎖剋制自己的或是自己想打的人
            if (otherPlayers.length > 0) {
                if (ai.aiPersonality === 'aggressive' || Math.random() > 0.4) {
                    // 優先瞪那些可能打我的人 (屬性剋我或是上回合打我的人)
                    const attributeRules = { '木': '水', '水': '火', '火': '木' };
                    // 誰剋我？
                    const threats = otherPlayers.filter(p => attributeRules[p.attribute] === ai.attribute);
                    if (threats.length > 0) {
                        target = threats[Math.floor(Math.random() * threats.length)];
                        shouldCast = true;
                    } else {
                        // 沒天敵就隨便瞪一個
                        target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                        shouldCast = true;
                    }
                }
            }
            break;

        case '擬態':
            // 聰明 AI 會隨機根據場況變身
            if (ai.aiIntelligence === 'smart' || Math.random() > 0.5) {
                const attrs = ['水', '火', '木']; // 不擬態成雷，因為雷太顯眼容易被打
                targetAttr = attrs[Math.floor(Math.random() * attrs.length)];
                // 只有當擬態屬性跟現在不同時才用
                if (targetAttr !== ai.attribute) shouldCast = true;
            }
            break;

        case '腎上腺素':
            // 攻擊型幾乎有就開，其他人血量健康時開
            if (ai.aiPersonality === 'aggressive' || ai.hp > 10) shouldCast = true;
            break;

        case '森林權杖':
            // 改變別人屬性，聰明 AI 專門用來搞亂強者
            if (otherPlayers.length > 0 && Math.random() > 0.3) {
                // 找血最多的
                target = otherPlayers.sort((a, b) => b.hp - a.hp)[0];
                const attrs = ['水', '火', '木', '雷'];
                // 把他改成被自己剋制的屬性
                const myRules = { '木': '水', '水': '火', '火': '木' }; // 我剋誰
                // 簡單起見，隨機改一個
                targetAttr = attrs[Math.floor(Math.random() * attrs.length)];
                shouldCast = true;
            }
            break;

        case '折翅':
            // 拔掉別人技能，攻擊型最愛
            if (ai.aiPersonality === 'aggressive' && otherPlayers.length > 0) {
                // 找技能最多的人
                target = otherPlayers.sort((a, b) => b.skills.length - a.skills.length)[0];
                if (target && target.skills.length > 0) shouldCast = true;
            }
            break;

        case '同病相憐':
            // 連結命運，找血最多的連結
            if (ai.aiIntelligence === 'smart' && otherPlayers.length > 0) {
                target = otherPlayers.sort((a, b) => b.hp - a.hp)[0]; // 綁定最強者
                if (target) shouldCast = true;
            }
            break;

        case '寄生':
            // 寄生，找隨機目標
            if (otherPlayers.length > 0 && Math.random() > 0.5) {
                target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                shouldCast = true;
            }
            break;
    }

    if (shouldCast) {
        try {
            const targetsArray = target ? [target._id.toString()] : [];
            // 模擬隨機延時，讓 AI 行為更像人
            await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

            await useSkill(ai._id, skillToConsider, targetsArray, targetAttr, io);
            console.log(`[AI Action] ${ai.name} used skill [${skillToConsider}] on ${target ? target.name : 'self/none'}`);
        } catch (err) {
            console.log(`[AI Skill Fail] ${ai.name} failed to use ${skillToConsider}: ${err.message}`);
        }
    }
}

async function handleAiAttack(game, ai, io) {
    if (ai.roundStats.hasAttacked || ai.roundStats.isHibernating) return;

    // 隨機延遲 (避免瞬間全打完)
    if (Math.random() > 0.7) {
        const aliveTargets = game.players.filter(p =>
            p.status.isAlive &&
            !p._id.equals(ai._id) &&
            !p.roundStats.isHibernating &&
            (game.currentRound > 3 || p.roundStats.timesBeenAttacked === 0)
        );

        if (aliveTargets.length === 0) return;

        let target = null;
        const attributeRules = { '木': '水', '水': '火', '火': '木' };

        if (ai.aiIntelligence === 'smart') {
            // 聰明 AI 會根據性格精確選標
            if (ai.aiPersonality === 'aggressive') {
                // 攻擊型：優先找被自己剋制且血少的，想要斬殺
                target = aliveTargets.find(t => attributeRules[ai.attribute] === t.attribute);
                if (!target) target = aliveTargets.sort((a, b) => a.hp - b.hp)[0];
            } else {
                // 防禦型：優先找威脅大 (血多) 或是有剋制自己的
                target = aliveTargets.sort((a, b) => b.hp - a.hp)[0];
            }
        } else {
            // 笨拙 AI：純隨機或亂打
            target = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
        }

        if (target) {
            console.log(`[AI] ${ai.name} (${ai.aiType}) attacking ${target.name}`);
            await handleAttackFlow(game.gameCode, ai._id, target._id, io);
        }
    }
}

async function handleAiAuction(game, ai, io) {
    if (game.auctionState.status !== 'active') return;

    const skill = game.auctionState.currentSkill;
    const currentMaxBidObj = game.bids.filter(b => b.skill === skill).sort((a, b) => b.amount - a.amount)[0];
    const currentMaxBid = currentMaxBidObj ? currentMaxBidObj.amount : 0;
    const isMeLeading = currentMaxBidObj && currentMaxBidObj.playerId.equals(ai._id);

    if (isMeLeading) return; // 已經是最高標，不自己往上加

    const maxAffordable = ai.hp - 6; // 至少留 6 HP
    if (maxAffordable <= currentMaxBid) return;

    // 技能價值評估 (性格偏好)
    const offenseSkills = ['適者生存', '劇毒', '折翅', '森林權杖', '嗜血', '獠牙', '獅子王', '腎上腺素'];
    const defenseSkills = ['尖刺', '噴墨', '禿鷹', '龜甲', '瞪人', '斷尾', '冬眠'];

    let skillValue = 0.5; // 基礎出價意願
    const personalityFactor = ai.aiPersonality === 'aggressive' ? 1.2 : 0.8;
    const intelligenceFactor = ai.aiIntelligence === 'smart' ? 1.0 : 0.7; // 笨拙 AI 出價較隨機且頻率低

    if (ai.aiPersonality === 'aggressive' && offenseSkills.includes(skill)) skillValue = 0.8;
    if (ai.aiPersonality === 'defensive' && defenseSkills.includes(skill)) skillValue = 0.8;

    if (ai.aiIntelligence === 'smart') {
        // 聰明型會看狀況：如果沒防禦技能就想要防禦，如果血多就想要攻擊
        if (ai.skills.length === 0) skillValue = 0.7 * personalityFactor;
        else if (ai.hp > 20 && offenseSkills.includes(skill)) skillValue = 0.7 * personalityFactor;
        else if (ai.hp < 15 && defenseSkills.includes(skill)) skillValue = 0.8 * personalityFactor;
    } else {
        // 笨拙型純看運氣，但攻擊型還是比較愛出價
        skillValue = 0.4 * personalityFactor;
    }

    // 決定是否要出價/加碼
    // 1. 計算底線機率 (Baseline willingness)
    if (Math.random() < skillValue) {
        // 2. 模擬思考延遲
        if (Math.random() > 0.4) {
            const bidAmount = currentMaxBid + 1;

            // 3. 底線檢查：不是每個 AI 都會無限制加碼
            // 性格對最高出價的容忍度
            let bidLimitFactor = {
                'aggressive': 0.6, // 願意花掉 60% 的可用 HP 來搶標
                'defensive': 0.3   // 只要超過 30% 就不想標了
            }[ai.aiPersonality] || 0.4;

            // --- 升級預算保留邏輯 ---
            // 如果 AI 還沒滿等，且屬於「愛升級」的個性，則會花更少 HP 在競標上，保留實力進化
            if (ai.level < 3) {
                const upgradeDesire = ai.aiPersonality === 'aggressive' || ai.aiIntelligence === 'smart' ? 0.2 : 0.1;
                bidLimitFactor -= upgradeDesire; // 減少預算比例，保留給升級費用
            }

            const myMaxBidLimit = Math.max(1, Math.floor(ai.hp * bidLimitFactor));

            // 智力修正：笨拙 AI 可能會出超出底線的價格，聰明 AI 則會嚴守底線
            if (ai.aiIntelligence === 'smart' && bidAmount > myMaxBidLimit) {
                return; // 太貴了，不跟
            }

            if (bidAmount <= maxAffordable) {
                console.log(`[AI] ${ai.name} (${ai.aiType}) bidding ${bidAmount} for ${skill}`);

                // 更新或新增出價
                const myBidIndex = game.bids.findIndex(b => b.skill === skill && b.playerId.equals(ai._id));
                if (myBidIndex > -1) {
                    game.bids[myBidIndex].amount = bidAmount;
                    game.bids[myBidIndex].createdAt = new Date();
                } else {
                    game.bids.push({ playerId: ai._id, skill, amount: bidAmount, createdAt: new Date() });
                }

                // 加時機制
                const timeLeft = game.auctionState.endTime.getTime() - Date.now();
                if (timeLeft < 8000) game.auctionState.endTime = new Date(Date.now() + 8000);

                await game.save();
                await broadcastGameState(game.gameCode, io);
            }
        }
    }
}

module.exports = {
    addAiPlayer,
    processAiTurns,
    generateAiName
};
