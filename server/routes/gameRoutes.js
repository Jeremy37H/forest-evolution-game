const express = require('express');
const router = express.Router();
const Game = require('../models/gameModel');
const Player = require('../models/playerModel');

// 遊戲設定
const SKILLS_BY_ROUND = {
  1: {
    '基因改造': '升級進化所需要的血量少一。',
    '適者生存': '攻擊成功後，增加 2 攻擊。',
    '尖刺': '當被攻擊失血時，反彈一半傷害給對方。',
    '劇毒': '每一回合指定一位玩家失血兩滴。（自由討論階段使用）',
    '荷魯斯之眼': '可以查看對方血量，一回合使用一次。',
  },
  2: {
    '兩棲': '攻擊與自身不同的屬性都會勝利，反之。',
    '擬態': '將自身屬性變成與選擇的玩家相同(限定一次，討論階段生效)。',
    '寄生': '指定一位玩家的血量當成自己的血量，指定後血量變更，只能使用一次。',
    '森林權杖': '指定一個屬性，屬性相同者，扣除 2 點 HP (不限等級，攻擊階段使用，只能使用一次)。',
    '嗜血': '攻擊對方成功自身可以多增加兩滴血。',
    '龜甲': '獲得技能時，防禦增加3點。',
  },
  3: {
    '獅子王': '指定一位手下幫你攻擊以及坦傷害。',
    '瞪人': '攻擊階段開始指定兩位玩家，被指定玩家無法對你攻擊。',
    '斷尾': '被攻擊時，自己扣2滴血，躲過對方攻擊。',
    '冬眠': '攻擊階段直接跳過不可攻擊與被攻擊。',
    '禿鷹': '當有人死亡的時候自己加三滴血。',
  }
};
const LEVEL_STATS = {
  0: { attack: 0, defense: 0 }, 1: { attack: 2, defense: 0 },
  2: { attack: 4, defense: 2 }, 3: { attack: 5, defense: 4 },
};
const LEVEL_UP_COSTS = { 0: 3, 1: 5, 2: 7 };
const INITIAL_HP = 28;

// --- 輔助函式 ---
const getEnrichedGameData = (fullGame) => {
  if (!fullGame) return null;
  const highestBids = {};
  for (const bid of fullGame.bids) {
    if (!highestBids[bid.skill] || bid.amount > highestBids[bid.skill].amount) {
      const bidder = fullGame.players.find(p => p._id.equals(bid.playerId));
      highestBids[bid.skill] = {
        amount: bid.amount,
        playerName: bidder ? bidder.name : '未知玩家'
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
    // --- 新增：競標自動補救機制 (Watchdog) ---
    if (fullGame.auctionState && fullGame.auctionState.status !== 'none' && fullGame.auctionState.status !== 'finished') {
      const now = Date.now();
      const endTime = fullGame.auctionState.endTime ? new Date(fullGame.auctionState.endTime).getTime() : 0;

      if (now >= endTime + 500) {
        console.log(`[Auction Watchdog] 偵測到逾期狀態 (${fullGame.auctionState.status})，進行自動補救...`);
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

// ---- 新增：競標生命週期管理 ----
const auctionTimers = {};

async function transitionToActive(gameCode, io) {
  let g = await Game.findOne({ gameCode });
  if (!g || g.auctionState.status !== 'starting') return;

  g.auctionState.status = 'active';
  g.auctionState.endTime = new Date(Date.now() + 120000); // 2分鐘
  await g.save();
  await broadcastGameState(gameCode, io);

  // 啟動伺服器端計時器 (作為主要驅動，若掉了也會有 Watchdog 補救)
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
  game.auctionState.endTime = new Date(Date.now() + 5000); // 5秒準備
  await game.save();
  await broadcastGameState(gameCode, io);

  // 5秒後正式開始
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

  // 從佇列中移除並準備下一個
  game.auctionState.queue = game.auctionState.queue.filter(s => s !== skill);
  game.auctionState.status = 'finished';
  await game.save();
  await broadcastGameState(gameCode, io);

  // 稍等 3 秒顯示結果，再開始下一個
  setTimeout(() => {
    startAuctionForSkill(gameCode, io);
  }, 3000);
}

async function finalizeAuctionPhase(gameCode, io) {
  let game = await Game.findOne({ gameCode });
  if (!game) return;

  game.gameLog.push({ text: '所有技能競標結束，即將進入下一回合...', type: 'system' });
  game.auctionState.status = 'none'; // 確保關閉客戶端彈窗
  game.auctionState.currentSkill = null;

  // 重置回合狀態 (從原有的 end-auction 移植)
  await Player.updateMany({ _id: { $in: game.players } }, {
    $set: {
      "roundStats.hasAttacked": false, "roundStats.timesBeenAttacked": 0,
      "roundStats.isHibernating": false, "roundStats.staredBy": [], "roundStats.minionId": null,
      "roundStats.usedSkillsThisRound": [], "effects.isPoisoned": false,
      "roundStats.attackedBy": [], "roundStats.scoutUsageCount": 0
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
  const nextRoundSkills = SKILLS_BY_ROUND[game.currentRound];
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
    const message = `[攻擊無效] ${attacker.name} 已經倒下了，無法發動攻擊。`;
    return { success: false, valid: false, message };
  }

  if (!target.status.isAlive || target.hp <= 0) {
    const message = `[攻擊無效] ${target.name} 已經倒下了，無法被攻擊。`;
    return { success: false, valid: false, message };
  }

  if (attacker.roundStats.isHibernating || target.roundStats.isHibernating) {
    const message = "冬眠中的玩家無法進行或參與攻擊。";
    game.gameLog.push({ text: message, type: 'battle' });
    await game.save();
    io.to(game.gameCode).emit('attackResult', { message });
    return { success: false, message };
  }

  // --- 新增：反擊限制檢查 ---
  // 如果攻擊者(attacker)已經在目標(target)的 attackedBy 清單中，表示目標已經被這個攻擊者攻擊過了。
  // (這不是檢查重點，重點是反過來：如果目標(target)已經攻擊過攻擊者(attacker)，則攻擊者不能反擊)
  // 檢查規則：同一回合不能攻擊「之前攻擊自己的人」。
  // 即：若 Attacker 的 attackedBy 包含 Target，則 Attacker 不能攻擊 Target。
  if (attacker.roundStats.attackedBy.some(id => id.equals(target._id))) {
    const message = `無法攻擊！因為 ${target.name} 本回合已經先攻擊過您了 (規則：不能攻擊當回合攻擊過你的玩家)。`;
    // 私人錯誤訊息，不廣播全頻
    return { success: false, valid: false, message };
  }

  if (attacker.roundStats.staredBy.some(id => id.equals(target._id))) {
    const message = `${attacker.name} 被 ${target.name} 瞪住了，無法攻擊！`;
    game.gameLog.push({ text: message, type: 'battle' });
    await game.save();
    io.to(game.gameCode).emit('attackResult', { message });
    return { success: false, message };
  }

  if (!isMinionAttack) {
    if (attacker.roundStats.hasAttacked) {
      const message = "您本回合已經攻擊過了";
      // No global log for personal error
      return { success: false, valid: false, message };
    }
    if (game.currentRound <= 3 && target.roundStats.timesBeenAttacked > 0) {
      const message = "該玩家本回合已被攻擊過";
      return { success: false, valid: false, message };
    }
    attacker.roundStats.hasAttacked = true;
    await attacker.save();
  }

  const attributeRules = { '木': '水', '水': '火', '火': '木' };
  const roundBonus = { 1: 3, 2: 4, 3: 5, 4: 7 };
  let attackSuccess = false;
  let skillMessage = '';

  if (attacker.skills.includes('兩棲')) {
    if (attacker.attribute === target.attribute) {
      attackSuccess = false;
      skillMessage += ` [兩棲] 效果觸發，同屬性攻擊無效！`;
    } else {
      attackSuccess = true;
      skillMessage += ` [兩棲] 效果觸發，跨屬性攻擊！`;
    }
  } else {
    // 1. 同屬性戰鬥 (包含雷 vs 雷): 比等級，等級高者勝
    if (attacker.attribute === target.attribute) {
      attackSuccess = attacker.level > target.level;
    }
    // 2. 雷屬性特殊規則 (異屬性戰鬥): 只要有雷，攻擊方或防禦方為雷都成功(必中/必被中)
    else if (attacker.attribute === '雷' || target.attribute === '雷') {
      attackSuccess = true;
    }
    // 3. 一般屬性相剋
    else if (attributeRules[attacker.attribute] === target.attribute) {
      attackSuccess = true;
    } else if (attributeRules[target.attribute] === attacker.attribute) {
      attackSuccess = false;
    } else {
      // 剩下的情況理論上不應存在於四屬性循環，但保留作為 fallback
      attackSuccess = attacker.level > target.level;
    }
  }

  const damageCalculator = (winner, loser) => Math.max(1, winner.attack + (roundBonus[game.currentRound] || 0) - loser.defense);
  let damage = 0;

  if (attackSuccess) {
    damage = damageCalculator(attacker, target);

    // [斷尾] 判斷邏輯修改：只有在「攻擊成功」且「有造成傷害」時才觸發
    if (target.skills.includes('斷尾') && damage > 0) {
      target.hp -= 2;
      await target.save();
      const message = `${attacker.name} 攻擊了 ${target.name}，但對方使用 [斷尾] 躲開了攻擊，只損失 2 HP！`;
      game.gameLog.push({ text: message, type: 'battle' });
      await game.save();
      io.to(game.gameCode).emit('attackResult', { message });

      // 斷尾成功躲避視為本次攻擊結算完成
      return { success: true, message };
    }

    if (target.skills.includes('尖刺')) {
      const recoilDamage = Math.floor(damage / 2);
      attacker.hp -= recoilDamage;
      skillMessage += ` [尖刺] 效果觸發，${attacker.name} 受到 ${recoilDamage} 點反彈傷害！`;
    }
    attacker.hp += damage;
    target.hp -= damage;

    // [適者生存] 修改：攻擊成功增加 2 攻擊
    if (attacker.skills.includes('適者生存')) {
      attacker.attack += 2;
      skillMessage += ` [適者生存] 效果觸發，攻擊力增加 2！目前攻擊力：${attacker.attack}`;
    }

    if (attacker.skills.includes('嗜血')) {
      attacker.hp += 2;
      skillMessage += ` [嗜血] 效果觸發，額外恢復 2 HP！`;
    }
  } else {
    damage = damageCalculator(target, attacker);
    attacker.hp -= damage;
    target.hp += damage;
  }

  target.roundStats.timesBeenAttacked += 1;
  // --- 新增：記錄攻擊來源 ---
  // 只有在攻擊成功造成傷害或判定發生時才記錄？規則是「被攻擊」，所以只要發生攻擊行為就記錄。
  // 這樣 Target 之後就不能反擊 Attacker 了。
  target.roundStats.attackedBy.push(attacker._id);

  await attacker.save();
  await target.save();

  const resultMessage = attackSuccess
    ? `${attacker.name} 成功攻擊了 ${target.name}，造成了 ${damage} 點傷害！${skillMessage}`
    : `${attacker.name} 攻擊 ${target.name} 失敗，自己損失 ${damage} 點HP！`;

  game.gameLog.push({ text: resultMessage, type: 'battle' });
  await game.save();
  io.to(game.gameCode).emit('attackResult', {
    message: resultMessage,
    targetId: target._id,
    type: attackSuccess ? 'damage' : 'miss'
  });
  return { success: attackSuccess, message: resultMessage };
}
// --- 版本檢查 ---
router.get('/version', (req, res) => {
  res.json({ version: '1.0.8', timestamp: new Date().toISOString() });
});

// --- API 路由 ---

router.get('/:gameCode', async (req, res) => {
  try {
    const game = await Game.findOne({ gameCode: req.params.gameCode.toUpperCase() }).populate('players');
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    const gameData = getEnrichedGameData(game);
    res.status(200).json(gameData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- 新增 API：取得此伺服器所有進行中的遊戲 ---
router.get('/admin/list', async (req, res) => {
  try {
    const games = await Game.find({}, 'gameCode playerCount currentRound gamePhase createdAt').sort({ createdAt: -1 });
    // 額外查詢每個遊戲目前的玩家數量
    const gamesWithCount = await Promise.all(games.map(async (g) => {
      const playerDocCount = await Player.countDocuments({ gameId: g._id });
      return { ...g.toObject(), joinedCount: playerDocCount };
    }));
    res.status(200).json(gamesWithCount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- 新增 API：刪除遊戲 ---
router.delete('/admin/delete/:gameCode', async (req, res) => {
  try {
    const { gameCode } = req.params;
    const game = await Game.findOne({ gameCode });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    // 刪除該遊戲的所有玩家
    await Player.deleteMany({ gameId: game._id });
    // 刪除遊戲本體
    await Game.deleteOne({ _id: game._id });

    res.status(200).json({ message: `遊戲 ${gameCode} 已刪除` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/admin/adjust-hp', async (req, res) => {
  try {
    const { gameCode, playerId, amount } = req.body;
    const player = await Player.findById(playerId);
    if (player) {
      player.hp += parseInt(amount, 10);
      await player.save();
    }
    const io = req.app.get('socketio');
    await broadcastGameState(gameCode, io);
    res.status(200).send();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/admin/update-player', async (req, res) => {
  try {
    const { gameCode, playerId, updates } = req.body;
    const player = await Player.findById(playerId);

    if (!player) {
      return res.status(404).json({ message: "找不到玩家" });
    }

    if (updates.hp !== undefined) {
      player.hp = parseInt(updates.hp, 10);
    }

    // Future proofing for other updates if needed
    // if (updates.name) player.name = updates.name;

    await player.save();

    const io = req.app.get('socketio');
    await broadcastGameState(gameCode, io);

    res.status(200).json({ message: '玩家資料更新成功' });
  } catch (error) {
    console.error("[UPDATE PLAYER ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/admin/kick-player', async (req, res) => {
  try {
    const { gameCode, playerId } = req.body;
    const io = req.app.get('socketio');

    const playerToKick = await Player.findById(playerId);
    if (!playerToKick) {
      return res.status(404).json({ message: "找不到要踢除的玩家" });
    }

    const game = await Game.findOneAndUpdate(
      { gameCode },
      { $pull: { players: playerId } },
      { new: true }
    );

    if (!game) {
      return res.status(404).json({ message: "找不到遊戲" });
    }

    await Player.findByIdAndDelete(playerId);

    io.to(gameCode).emit('attackResult', { message: `玩家 ${playerToKick.name} 已被管理員移出遊戲。` });
    await broadcastGameState(gameCode, io);

    res.status(200).json({ message: '玩家已成功踢除' });
  } catch (error) {
    console.error("[KICK PLAYER ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { playerCount } = req.body;
    if (!playerCount) return res.status(400).json({ message: "請提供玩家人數" });
    const gameCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // --- 新增：產生平衡屬性分配 ---
    // 規則：木水火平均分配，多餘的給雷
    const baseCount = Math.floor(playerCount / 3);
    const attributes = [];
    for (let i = 0; i < baseCount; i++) {
      attributes.push('木');
      attributes.push('水');
      attributes.push('火');
    }
    // 剩下的名額全部填入雷
    const thunderCount = playerCount - attributes.length;
    for (let i = 0; i < thunderCount; i++) {
      attributes.push('雷');
    }

    // Fisher-Yates Shuffle 洗牌
    for (let i = attributes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [attributes[i], attributes[j]] = [attributes[j], attributes[i]];
    }

    const newGame = new Game({
      playerCount,
      gameCode,
      skillsForAuction: SKILLS_BY_ROUND[1],
      availableAttributes: attributes // 儲存洗牌後的屬性池
    });
    await newGame.save();
    res.status(201).json(newGame);
  } catch (error) {
    console.error("[CREATE GAME ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/join', async (req, res) => {
  try {
    const { gameCode, name } = req.body;
    let game = await Game.findOne({ gameCode: gameCode.toUpperCase() });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    if (game.players.length >= game.playerCount) return res.status(403).json({ message: "遊戲人數已滿" });

    let playerCode;
    let isCodeUnique = false;
    while (!isCodeUnique) {
      playerCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const existingPlayer = await Player.findOne({ playerCode });
      if (!existingPlayer) isCodeUnique = true;
    }

    // --- 修改：從屬性池取得屬性 ---
    // 使用 $pop 原子操作取出並刪除最後一個元素
    // 注意：需重新 fetch game 或直接 update
    // --- 修正：已移除冗餘的 $pop 操作 ---
    // 之前這裡因為 $pop 取出但沒拿到值，且後面又 pop 一次，導致每個人消耗 2 個屬性。
    // 現在直接保留後面的 logic 來處理屬性分配。

    // 檢查是否有取到屬性 (理論上如果人數控制正確一定有)
    // 我們需要知道被 pop 掉的是什麼，但 $pop 不會直接返回被刪除的值。
    // 方法 2: 先 find 取出陣列最後一個，再用 $pull (有風險若並發)
    // 方法 3 (最好): 用 JS 操作陣列後 save (有 Mongoose 版本鎖機制)

    // 重新取得 game (為了確保 parallel 安全性，這裡其實應該用 transaction 或 findAndModify 但簡單起見用 JS save)
    // 其實之前已經 findOne 了，如果並發極高可能會 race condition，但在這個規模 OK
    // 為了安全，我們在 memory 中 pop 並 save

    // 重新載入一次最新的 game 確保 attribute pool 正確
    game = await Game.findById(game._id);

    let assignedAttribute;
    if (game.availableAttributes && game.availableAttributes.length > 0) {
      assignedAttribute = game.availableAttributes.pop(); // 取出最後一個
      await game.save();
    } else {
      // Fallback (防呆): 如果池子空了隨機給一個
      const attributes = ['木', '水', '火', '雷'];
      assignedAttribute = attributes[Math.floor(Math.random() * attributes.length)];
    }

    const newPlayer = new Player({ gameId: game._id, name, playerCode, attribute: assignedAttribute });
    await newPlayer.save();
    game.players.push(newPlayer._id);
    await game.save();
    const io = req.app.get('socketio');
    const fullGame = await broadcastGameState(game.gameCode, io);
    res.status(201).json({ player: newPlayer, game: fullGame });
  } catch (error) {
    console.error("[JOIN ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/rejoin', async (req, res) => {
  try {
    const { playerCode } = req.body;
    const player = await Player.findOne({ playerCode: playerCode.toUpperCase() });
    if (!player) return res.status(404).json({ message: '找不到此玩家代碼' });
    const game = await Game.findById(player.gameId).populate('players');
    if (!game) return res.status(404).json({ message: '此代碼對應的遊戲已不存在' });

    const gameData = getEnrichedGameData(game);
    res.status(200).json({ game: gameData, player });
  } catch (error) {
    console.error("[REJOIN ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const { gameCode } = req.body;
    let game = await Game.findOne({ gameCode: gameCode.toUpperCase() });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    let initialHP = 28;
    // Dynamic HP removed: 
    // if (game.players.length > 8) initialHP = 32;

    await Player.updateMany({ _id: { $in: game.players } }, {
      $set: {
        "hp": initialHP, // Reset HP with dynamic value
        "roundStats.hasAttacked": false, "roundStats.timesBeenAttacked": 0,
        "roundStats.isHibernating": false, "roundStats.staredBy": [], "roundStats.minionId": null,
        "roundStats.usedSkillsThisRound": [], "effects.isPoisoned": false,
        "roundStats.attackedBy": [] // 重置被攻擊記錄
      }
    });
    game.gamePhase = 'discussion_round_1';
    game.currentRound = 1;
    game.bids = [];
    game.skillsForAuction = SKILLS_BY_ROUND[1];

    // 初始化已競標技能列表 (第一回合的技能)
    game.allAuctionedSkills = [];
    if (SKILLS_BY_ROUND[1]) {
      for (const [skill, desc] of Object.entries(SKILLS_BY_ROUND[1])) {
        game.allAuctionedSkills.push({ skill, description: desc, round: 1 });
      }
    }

    await game.save();
    const io = req.app.get('socketio');
    game.gameLog.push({ text: '遊戲開始！進入討論階段。', type: 'system' });
    await game.save();
    const fullGame = await broadcastGameState(game.gameCode, io);
    console.log(`[Game] 房間 ${fullGame.gameCode} 已開始遊戲，進入討論階段！`);
    res.status(200).json({ message: '遊戲已成功開始', game: fullGame });
  } catch (error) {
    console.error("[START GAME ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/start-attack', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const io = req.app.get('socketio');
    let game = await Game.findOne({ gameCode: gameCode.toUpperCase() }).populate('players');
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "目前不是討論階段" });
    for (const player of game.players) {
      if (player.effects.isPoisoned) {
        player.hp -= 2;
        player.effects.isPoisoned = false;
        if (player.hp <= 0 && player.status.isAlive) {
          player.status.isAlive = false;
          io.to(game.gameCode).emit('attackResult', { message: `[劇毒] 效果致命！${player.name} 倒下了！` });
        } else {
          io.to(game.gameCode).emit('attackResult', { message: `[劇毒] 效果發作！${player.name} 失去了 2 點HP！` });
        }
        await player.save();
      }
    }
    game.gamePhase = `attack_round_${game.currentRound}`;
    game.gameLog.push({ text: `第 ${game.currentRound} 回合攻擊階段開始！`, type: 'system' });
    await game.save();
    await broadcastGameState(game.gameCode, io);
    console.log(`[Game] 房間 ${game.gameCode} 進入攻擊階段！`);
    res.status(200).json({ message: '攻擊階段已開始' });
  } catch (error) {
    console.error("[START ATTACK ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/start-auction', async (req, res) => {
  try {
    const { gameCode } = req.body;
    let game = await Game.findOne({ gameCode: gameCode.toUpperCase() });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    if (!game.gamePhase.startsWith('attack')) return res.status(400).json({ message: "目前不是攻擊階段" });
    if (game.currentRound >= 4) return res.status(400).json({ message: "第四回合沒有競標階段" });

    // 初始化競標佇列
    const skills = Object.keys(SKILLS_BY_ROUND[game.currentRound] || {});
    game.auctionState.queue = skills;
    game.auctionState.remainingPicks = skills; // 用於進度顯示
    game.gamePhase = `auction_round_${game.currentRound}`;
    game.gameLog.push({ text: `第 ${game.currentRound} 回合競標階段開始！所有技能將逐一進行競標。`, type: 'system' });
    await game.save();

    const io = req.app.get('socketio');
    // 開始第一個技能的競標過程
    startAuctionForSkill(game.gameCode, io);

    res.status(200).json({ message: '競標已開始', queue: skills });
  } catch (error) {
    console.error("[START AUCTION ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/action/bid', async (req, res) => {
  try {
    const { gameCode, playerId, skill, amount } = req.body;
    const bidAmount = parseInt(amount, 10);
    if (isNaN(bidAmount) || bidAmount <= 0) return res.status(400).json({ message: "請輸入有效的正數出價！" });
    const player = await Player.findById(playerId);
    let game = await Game.findOne({ gameCode });
    if (!player || !game) return res.status(404).json({ message: "找不到玩家或遊戲" });

    // 檢查目前是否正在進行該技能的競標
    if (game.auctionState.status !== 'active' || game.auctionState.currentSkill !== skill) {
      return res.status(400).json({ message: "目前不是該技能的競標時間，或競標尚未開始/已結束。" });
    }

    // 檢查出價是否高於目前最高價
    let currentMaxBid = 0;
    game.bids.forEach(bid => {
      if (bid.skill === skill && bid.amount > currentMaxBid) {
        currentMaxBid = bid.amount;
      }
    });

    if (bidAmount <= currentMaxBid) {
      return res.status(400).json({ message: `出價必須高於目前最高價 (${currentMaxBid} HP)！` });
    }

    const maxBidAllowed = player.hp - 5;
    if (bidAmount > maxBidAllowed) return res.status(400).json({ message: `出價金額過高！您最多只能使用 ${maxBidAllowed} HP 進行競標 (需保留 5 HP)。` });

    const existingBidIndex = game.bids.findIndex(bid => bid.playerId.equals(player._id) && bid.skill === skill);
    if (existingBidIndex > -1) {
      game.bids[existingBidIndex].amount = bidAmount;
      game.bids[existingBidIndex].createdAt = Date.now();
    } else {
      game.bids.push({ playerId: player._id, skill, amount: bidAmount });
    }

    // --- 加時機制 ---
    const timeLeft = game.auctionState.endTime.getTime() - Date.now();
    if (timeLeft < 10000) { // 少於 10 秒
      game.auctionState.endTime = new Date(Date.now() + 10000); // 重設為 10 秒
      // 這裡不發送 gameLog 以免洗頻，但可以發一個小訊息
      // io.to(game.gameCode).emit('auctionExtension', { skill, newEndTime: game.auctionState.endTime });
    }

    await game.save();
    const io = req.app.get('socketio');
    await broadcastGameState(game.gameCode, io);
    res.status(200).json({ message: `您已對 [${skill}] 成功出價 ${bidAmount} HP！` });
  } catch (error) {
    console.error("[BID ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/end-auction', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const io = req.app.get('socketio');

    // 1. 停止該房間的自動計時器
    if (auctionTimers[gameCode]) {
      clearInterval(auctionTimers[gameCode]);
      delete auctionTimers[gameCode];
    }

    let game = await Game.findOne({ gameCode }).populate({ path: 'bids.playerId' });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    // 2. 如果目前有正在進行的項目，進行最後一次結算
    const skill = game.auctionState.currentSkill;
    if (skill && game.auctionState.status === 'active') {
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
          game.gameLog.push({ text: `[強制結束] ${winner.name} 以 ${winningBid.amount} HP 標得 [${skill}]！`, type: 'success' });
        }
      }
    }

    // 3. 隊列清空，強制進入下一階段
    game.auctionState.queue = [];
    game.auctionState.status = 'finished';
    await game.save();

    // 呼叫原本的結算函式
    await finalizeAuctionPhase(gameCode, io);

    res.status(200).json({ message: '競標已強制結束並結算' });
  } catch (error) {
    console.error("[END AUCTION ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/end-game', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const io = req.app.get('socketio');

    // 1. 停止任何進行中的競標計時器
    if (auctionTimers[gameCode]) {
      clearInterval(auctionTimers[gameCode]);
      delete auctionTimers[gameCode];
    }

    let game = await Game.findOne({ gameCode: gameCode.toUpperCase() });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    if (game.gamePhase === 'waiting') return res.status(400).json({ message: "遊戲尚未開始" });

    // 2. 清除競標狀態，確保視窗關閉
    game.gamePhase = 'finished';
    game.auctionState.status = 'none';
    game.auctionState.currentSkill = null;
    game.auctionState.queue = [];

    await game.save();
    const finalGameState = await broadcastGameState(game.gameCode, io);
    console.log(`[Game] 房間 ${game.gameCode} 遊戲結束！`);
    res.status(200).json({ message: '遊戲已結束', game: finalGameState });
  } catch (error) {
    console.error("[END GAME ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/action/scout', async (req, res) => {
  try {
    const { gameCode, playerId, targetId } = req.body;
    const player = await Player.findById(playerId);
    const target = await Player.findById(targetId);
    let game = await Game.findOne({ gameCode });

    if (!player || !target || !game) return res.status(404).json({ message: "找不到玩家或遊戲" });
    if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段使用偵查" });
    if (player.hp < 2) return res.status(400).json({ message: "血量不足！至少需要 2 HP 才能偵查 (花費 1 HP)" });
    if (player.roundStats.scoutUsageCount >= 2) return res.status(400).json({ message: "本回合偵查次數已達上限 (最多 2 次)" });

    player.hp -= 1;
    player.roundStats.scoutUsageCount = (player.roundStats.scoutUsageCount || 0) + 1;
    await player.save();

    // Broadcast generic action
    const io = req.app.get('socketio');
    const logText = `${player.name} 對 ${target.name} 進行了屬性偵查！`;
    game.gameLog.push({ text: logText, type: 'info' });
    await game.save();

    // Broadcast state WITHOUT revealing private info globally
    await broadcastGameState(game.gameCode, io);

    // Private response to caller
    res.status(200).json({
      message: `偵查成功！${target.name} 的屬性是 [${target.attribute}]`,
      scoutResult: { name: target.name, attribute: target.attribute }
    });
  } catch (error) {
    console.error("[SCOUT ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/action/levelup', async (req, res) => {
  try {
    const { playerId } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: "找不到玩家" });
    if (player.level >= 3) return res.status(400).json({ message: "已達到最高等級" });
    let cost = LEVEL_UP_COSTS[player.level];
    if (player.skills.includes('基因改造')) cost -= 1;
    const requiredHp = INITIAL_HP + cost;
    if (player.hp < requiredHp) return res.status(400).json({ message: `血量不足！升級需要 ${requiredHp} HP` });

    player.level += 1;
    player.hp = INITIAL_HP;
    player.attack = LEVEL_STATS[player.level].attack;
    player.defense = LEVEL_STATS[player.level].defense;

    if (player.skills.includes('龜甲')) {
      player.defense += 3;
    }
    await player.save();
    const game = await Game.findById(player.gameId);
    const io = req.app.get('socketio');
    await broadcastGameState(game.gameCode, io);
    res.status(200).json({ message: `恭喜！成功升級至 LV ${player.level}！` });
  } catch (error) {
    console.error("[LEVEL UP ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/action/use-skill', async (req, res) => {
  try {
    const { playerId, skill, targets, targetAttribute } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: "找不到玩家" });
    const game = await Game.findById(player.gameId).populate('players');
    if (!player || !game) return res.status(404).json({ message: "找不到玩家或遊戲" });

    let message = '';
    let specialResponse = null;

    if (player.skills.includes(skill) && player.usedOneTimeSkills.includes(skill)) return res.status(400).json({ message: `[${skill}] 技能只能使用一次` });

    switch (skill) {
      case '冬眠':
        if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段使用冬眠" });
        player.roundStats.isHibernating = true;
        player.roundStats.usedSkillsThisRound.push('冬眠');
        await player.save();
        message = `${player.name} 決定進入冬眠狀態`;
        break;
      case '瞪人':
        if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段使用瞪人" });
        if (!targets || targets.length > 2 || targets.length === 0) return res.status(400).json({ message: "必須指定1-2位玩家" });
        await Player.updateMany({ _id: { $in: targets } }, { $addToSet: { "roundStats.staredBy": player._id } });
        player.roundStats.usedSkillsThisRound.push('瞪人');
        await player.save();
        message = `${player.name} 瞪了指定的玩家`;
        break;
      case '劇毒':
        if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段使用劇毒" });
        if (player.roundStats.usedSkillsThisRound.includes('劇毒')) return res.status(400).json({ message: "本回合已使用過劇毒" });
        if (!targets || targets.length !== 1) return res.status(400).json({ message: "必須指定1位玩家" });
        const poisonTarget = await Player.findById(targets[0]);
        if (!poisonTarget) return res.status(404).json({ message: "找不到目標玩家" });
        poisonTarget.effects.isPoisoned = true;
        player.roundStats.usedSkillsThisRound.push('劇毒');
        await poisonTarget.save();
        await player.save();
        message = `${player.name} 對 ${poisonTarget.name} 使用了 [劇毒]！`;
        break;
      case '荷魯斯之眼':
        if (player.roundStats.usedSkillsThisRound.includes('荷魯斯之眼')) return res.status(400).json({ message: "本回合已使用過荷魯斯之眼" });
        if (!targets || targets.length !== 1) return res.status(400).json({ message: "必須指定1位玩家" });
        const eyeTarget = await Player.findById(targets[0]);
        if (!eyeTarget) return res.status(404).json({ message: "找不到目標玩家" });
        player.roundStats.usedSkillsThisRound.push('荷魯斯之眼');
        await player.save();
        message = `${player.name} 使用了 [荷魯斯之眼] 查看 ${eyeTarget.name} 的狀態。`;
        specialResponse = { message: `[荷魯斯之眼] 結果：${eyeTarget.name} 的當前血量為 ${eyeTarget.hp} HP。` };
        break;
      case '擬態':
        if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段使用擬態" });
        if (!targets || targets.length !== 1) return res.status(400).json({ message: "必須指定1位玩家" });
        const mimicTarget = await Player.findById(targets[0]);
        if (!mimicTarget) return res.status(404).json({ message: "找不到目標玩家" });
        player.attribute = mimicTarget.attribute;
        player.usedOneTimeSkills.push('擬態');
        await player.save();
        message = `${player.name} 使用了 [擬態]，變成了與 ${mimicTarget.name} 相同的屬性！`;
        break;
      case '寄生':
        if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段使用寄生" });
        if (!targets || targets.length !== 1) return res.status(400).json({ message: "必須指定1位玩家" });
        const parasiteTarget = await Player.findById(targets[0]);
        if (!parasiteTarget) return res.status(404).json({ message: "找不到目標玩家" });
        player.hp = parasiteTarget.hp;
        player.usedOneTimeSkills.push('寄生');
        await player.save();
        message = `${player.name} 對 ${parasiteTarget.name} 使用了 [寄生]！`;
        break;
      case '森林權杖':
        if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段使用權杖" });
        if (!targets || targets.length !== 1 || !targets[0]) return res.status(400).json({ message: "必須指定一個目標屬性" });
        const targetAttr = targets[0];
        const allPlayers = await Player.find({ gameId: game._id });
        let affectedPlayersNames = [];
        for (const p of allPlayers) {
          if (p._id.equals(player._id)) continue;
          if (p.attribute === targetAttr) {
            p.hp -= 2;
            await p.save();
            affectedPlayersNames.push(p.name);
          }
        }
        player.usedOneTimeSkills.push('森林權杖');
        await player.save();
        if (affectedPlayersNames.length > 0) {
          message = `${player.name} 舉起了 [森林權杖]！${affectedPlayersNames.join(', ')} 因屬性為 ${targetAttr} 而損失了 2 HP！`;
        } else {
          message = `${player.name} 舉起了 [森林權杖]，但沒有玩家受到影響。`;
        }
        break;
      case '獅子王':
        if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段指定手下" });
        if (!targets || targets.length !== 1) return res.status(400).json({ message: "必須指定1位手下" });

        // --- 新增：場上剩餘人數檢查 ---
        const aliveCount = game.players.filter(p => p.hp > 0 && p.status.isAlive).length;
        if (aliveCount <= 2) {
          return res.status(400).json({ message: "場上僅剩兩位玩家，[獅子王] 指定手下的功能無效。" });
        }

        player.roundStats.minionId = targets[0];
        player.roundStats.usedSkillsThisRound.push('獅子王');
        await player.save();
        const minion = await Player.findById(targets[0]);
        message = `${player.name} 使用 [獅子王] 指定 ${minion.name} 為本回合的手下！`;
        break;
      default:
        return res.status(400).json({ message: "未知的技能或使用時機不對" });
    }

    const io = req.app.get('socketio');
    await broadcastGameState(game.gameCode, io);
    if (specialResponse) {
      res.status(200).json(specialResponse);
    } else {
      // Log generic usage for public?
      game.gameLog.push({ text: message, type: 'info' });
      await game.save();

      res.status(200).json({ message });
    }
  } catch (error) {
    console.error("[USE SKILL ERROR]", error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/action/attack', async (req, res) => {
  try {
    const io = req.app.get('socketio');
    const { gameCode, attackerId, targetId } = req.body;
    const game = await Game.findOne({ gameCode: gameCode.toUpperCase() }).populate('players');
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    let mainAttacker = game.players.find(p => p._id.equals(attackerId));
    let mainTarget = game.players.find(p => p._id.equals(targetId));
    if (!mainAttacker || !mainTarget) return res.status(404).json({ message: "找不到玩家" });

    // --- 新增：獅子王限制 ---
    if (mainAttacker.roundStats.minionId && mainAttacker.roundStats.minionId.equals(mainTarget._id)) {
      return res.status(400).json({ message: "您不能攻擊自己的手下！" });
    }

    // --- 新增：死亡限制 ---
    if (!mainAttacker.status.isAlive || mainAttacker.hp <= 0) {
      return res.status(400).json({ message: "您已經倒下了，無法發動攻擊。" });
    }
    if (!mainTarget.status.isAlive || mainTarget.hp <= 0) {
      return res.status(400).json({ message: "目標玩家已經倒下了，無法被攻擊。" });
    }

    let result;
    if (mainAttacker.skills.includes('獅子王') && mainAttacker.roundStats.minionId) {
      let minion = game.players.find(p => p._id.equals(mainAttacker.roundStats.minionId));
      if (!minion) {
        result = await handleSingleAttack(game, mainAttacker, mainTarget, io);
      } else {
        result = await handleSingleAttack(game, mainAttacker, mainTarget, io);
        // 如果主攻擊者因驗證失敗(如已攻擊過)而無效，則中斷
        if (result.valid !== false) {
          mainTarget = await Player.findById(targetId);
          if (mainTarget.hp > 0 && mainTarget.status.isAlive) {
            await handleSingleAttack(game, minion, mainTarget, io, true);
          }
        }
      }
    } else {
      result = await handleSingleAttack(game, mainAttacker, mainTarget, io);
    }

    if (result && result.valid === false) {
      return res.status(400).json({ message: result.message });
    }

    const allPlayersInGame = await Player.find({ gameId: game._id });
    for (const p of allPlayersInGame) {
      if (p.hp <= 0 && p.status.isAlive) {
        p.status.isAlive = false;
        await p.save();
        let vultureMessage = '';
        const vulturePlayers = allPlayersInGame.filter(v => v.skills.includes('禿鷹') && v.status.isAlive && !v._id.equals(p._id));
        for (const vulture of vulturePlayers) {
          vulture.hp += 3;
          await Player.findByIdAndUpdate(vulture._id, { hp: vulture.hp });
          vultureMessage += `${vulture.name} `;
        }
        if (vultureMessage) io.to(game.gameCode).emit('attackResult', { message: `${p.name} 倒下了！${vultureMessage}觸發 [禿鷹] 效果，恢復 3 HP！` });
      }
    }

    await broadcastGameState(game.gameCode, io);
    res.status(200).json({ message: '攻擊處理完畢' });
  } catch (error) {
    console.error('[ATTACK ERROR]', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;


