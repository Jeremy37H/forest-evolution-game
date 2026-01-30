// server/routes/gameRoutes.js
const express = require('express');
const router = express.Router();
const Game = require('../models/gameModel');
const Player = require('../models/playerModel');

const { LEVEL_STATS, LEVEL_UP_COSTS, INITIAL_HP } = require('../config/gameConstants');
const {
  getEnrichedGameData, broadcastGameState, startAuctionForSkill,
  finalizeAuctionPhase, useSkill, handleAttackFlow
} = require('../services/gameService');

// --- 版本檢查 ---
router.get('/version', (req, res) => {
  res.json({ version: '1.4.8-Bugfix', timestamp: new Date().toISOString() });
});

// --- 輔助函式：生成遊戲代碼 ---
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// --- 管理員 & 遊戲控制路由 ---

// 建立遊戲
router.post('/create', async (req, res) => {
  try {
    const { playerCount, customSkillsByRound } = req.body;
    console.log('[API] Creating Game. Payload:', { playerCount, skillsKeys: customSkillsByRound ? Object.keys(customSkillsByRound) : 'null' });

    let gameCode = generateGameCode();

    // 確保代碼唯一
    let existing = await Game.findOne({ gameCode });
    while (existing) {
      gameCode = generateGameCode();
      existing = await Game.findOne({ gameCode });
    }

    // Explicitly convert to Map if provided, to ensure Mongoose handles it correctly
    // Mongoose Map paths expect a Map or an Object with keys.
    // However, sometimes formatting ensures reliability.
    const game = new Game({
      gameCode,
      playerCount,
      customSkillsByRound: customSkillsByRound || {}
    });

    await game.save();
    console.log(`[API] Game Created: ${gameCode}. Skills saved:`, game.customSkillsByRound);

    res.status(201).json(game);
  } catch (error) {
    console.error('[API] Create Error:', error);
    res.status(500).json({ message: error.message });
  }
});

// 加入遊戲
router.post('/join', async (req, res) => {
  try {
    const { gameCode, name } = req.body;
    const game = await Game.findOne({ gameCode });

    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    if (game.gamePhase !== 'waiting') return res.status(400).json({ message: "遊戲已經開始，無法加入" });
    if (game.players.length >= game.playerCount) return res.status(400).json({ message: "遊戲人數已滿" });

    // 產生玩家代碼 (ex: P-1234)
    const playerCode = 'P-' + Math.floor(1000 + Math.random() * 9000); // Simple 4-digit code

    // --- 智慧屬性平衡分配邏輯 ---
    // --- 屬性分配：平均分配水火木，餘數給雷 ---
    const totalSlots = game.playerCount;
    // 每個基本屬性(水火木)的名額
    const baseCount = Math.floor(totalSlots / 3);
    // 雷屬性的名額 (剩下的)
    const thunderCount = totalSlots % 3;

    // 目標分佈
    const targets = {
      '木': baseCount,
      '水': baseCount,
      '火': baseCount,
      '雷': thunderCount
    };

    // 取得目前已加入玩家的屬性
    const existingPlayers = await Player.find({ gameId: game._id });
    const currentCounts = { '木': 0, '水': 0, '火': 0, '雷': 0 };
    existingPlayers.forEach(p => { if (currentCounts[p.attribute] !== undefined) currentCounts[p.attribute]++; });

    // 建立候選池
    let availableBag = [];
    ['木', '水', '火', '雷'].forEach(attr => {
      const slotsLeft = targets[attr] - currentCounts[attr];
      if (slotsLeft > 0) {
        for (let i = 0; i < slotsLeft; i++) {
          availableBag.push(attr);
        }
      }
    });

    if (availableBag.length === 0) availableBag = ['木', '水', '火'];

    const assignedAttribute = availableBag[Math.floor(Math.random() * availableBag.length)];


    // assignedAttribute 已經在上方邏輯中決定好了


    const newPlayer = new Player({
      name,
      gameId: game._id,
      playerCode,
      attribute: assignedAttribute,
      hp: INITIAL_HP, // from config
      attack: LEVEL_STATS[0].attack,
      defense: LEVEL_STATS[0].defense
    });

    await newPlayer.save();
    game.players.push(newPlayer._id);
    await game.save();

    console.log(`[API] Player ${name} joined game ${gameCode}`);

    // Broadcast update via socket
    const io = req.app.get('socketio');
    if (io) {
      // We broadcast to the specific room.
      // Note: The new player hasn't joined the socket room yet, so they won't receive this immediately 
      // until they connect socket and emit 'joinGame'.
      // But existing players (like admin) will see the update.
      await broadcastGameState(gameCode, io);
    }

    // Fetch populated game to return full player objects
    const populatedGame = await Game.findOne({ gameCode }).populate('players');

    res.json({ player: newPlayer, game: populatedGame });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 用玩家代碼重返遊戲
router.post('/rejoin', async (req, res) => {
  try {
    const { playerCode } = req.body;
    const player = await Player.findOne({ playerCode: playerCode.toUpperCase() });

    if (!player) return res.status(404).json({ message: "找不到此玩家代碼" });

    const game = await Game.findById(player.gameId).populate('players');
    if (!game) return res.status(404).json({ message: "找不到對應的遊戲" });

    res.json({ player, game });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 列出所有遊戲
router.get('/admin/list', async (req, res) => {
  try {
    const games = await Game.find().sort({ createdAt: -1 });
    const gamesWithCounts = games.map(g => ({
      gameCode: g.gameCode,
      playerCount: g.playerCount,
      joinedCount: g.players.length,
      gamePhase: g.gamePhase,
      createdAt: g.createdAt
    }));
    res.json(gamesWithCounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 取得單一遊戲資訊
router.get('/:gameCode', async (req, res) => {
  try {
    const { gameCode } = req.params;
    // Case-insensitive search
    const game = await Game.findOne({
      gameCode: { $regex: new RegExp(`^${gameCode}$`, 'i') }
    }).populate('players');

    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    // Convert Map to Object for JSON response if needed (Express/Mongoose usually handles this, but let's be safe)
    const gameObj = game.toObject();

    // Ensure customSkillsByRound is included
    if (game.customSkillsByRound && game.customSkillsByRound instanceof Map) {
      gameObj.customSkillsByRound = Object.fromEntries(game.customSkillsByRound);
    }

    res.json(gameObj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 刪除遊戲
router.delete('/admin/delete/:gameCode', async (req, res) => {
  try {
    const { gameCode } = req.params;
    const game = await Game.findOneAndDelete({ gameCode });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    // 同步刪除該遊戲的玩家 (選用)
    await Player.deleteMany({ gameId: game._id });
    res.json({ message: `遊戲 ${gameCode} 已刪除` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 開始遊戲 (進入第一回合討論)
router.post('/start', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const game = await Game.findOne({ gameCode }).populate('players');
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    if (game.players.length < 2) return res.status(400).json({ message: "玩家人數不足，無法開始" });

    game.currentRound = 1;
    game.gamePhase = 'discussion_round_1';

    // 初始化第一回合技能
    const { SKILLS_BY_ROUND } = require('../config/gameConstants');
    let roundSkills = game.customSkillsByRound?.get ? game.customSkillsByRound.get('1') : game.customSkillsByRound['1'];
    if (!roundSkills || Object.keys(roundSkills).length === 0) roundSkills = SKILLS_BY_ROUND[1];

    game.skillsForAuction = roundSkills;

    // 紀錄到累積列表
    for (const [skill, desc] of Object.entries(roundSkills)) {
      game.allAuctionedSkills.push({ skill, description: desc, round: 1 });
    }

    await game.save();
    await broadcastGameState(game.gameCode, req.app.get('socketio'));
    res.json({ message: '遊戲已開始' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 開始攻擊階段
router.post('/start-attack', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const game = await Game.findOne({ gameCode });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    game.gamePhase = `attack_round_${game.currentRound}`;
    await game.save();
    await broadcastGameState(game.gameCode, req.app.get('socketio'));
    res.json({ message: '進入攻擊階段' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 開始競標階段
router.post('/start-auction', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const game = await Game.findOne({ gameCode });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    game.gamePhase = `auction_round_${game.currentRound}`;
    // 初始化競標佇列
    game.auctionState.queue = Array.from(game.skillsForAuction.keys());
    game.auctionState.status = 'none';

    await game.save();
    await broadcastGameState(game.gameCode, req.app.get('socketio'));

    // 觸發第一個技能競標
    await startAuctionForSkill(gameCode, req.app.get('socketio'));

    res.json({ message: '進入競標階段' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 取得所有可用技能清單 (按回合分類)
router.get('/admin/skills-pool', (req, res) => {
  const { SKILLS_BY_ROUND } = require('../config/gameConstants');
  res.json(SKILLS_BY_ROUND);
});

// 更新玩家資料 (管理員)
router.post('/admin/update-player', async (req, res) => {
  try {
    const { gameCode, playerId, updates } = req.body;
    const player = await Player.findByIdAndUpdate(playerId, { $set: updates }, { new: true });
    if (!player) return res.status(404).json({ message: "找不到玩家" });
    await broadcastGameState(gameCode, req.app.get('socketio'));
    res.json({ message: '玩家資料已更新', player });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 踢除玩家
router.post('/admin/kick-player', async (req, res) => {
  try {
    const { gameCode, playerId } = req.body;
    const player = await Player.findByIdAndDelete(playerId);
    if (!player) return res.status(404).json({ message: "找不到玩家" });

    const game = await Game.findOneAndUpdate(
      { gameCode },
      { $pull: { players: playerId } },
      { new: true }
    );

    await broadcastGameState(gameCode, req.app.get('socketio'));
    res.json({ message: '玩家已踢除' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- API 路由 ---

// 競標出價
router.post('/action/bid', async (req, res) => {
  try {
    const { gameCode, playerId, skill, bidAmount } = req.body;
    const game = await Game.findOne({ gameCode });
    const player = await Player.findById(playerId);

    if (!game || !player) return res.status(404).json({ message: "找不到遊戲或玩家" });
    if (game.auctionState.currentSkill !== skill || game.auctionState.status !== 'active') {
      return res.status(400).json({ message: "目前非該技能競標時間" });
    }

    let currentMaxBid = 0;
    game.bids.forEach(bid => {
      if (bid.skill === skill && bid.amount > currentMaxBid) currentMaxBid = bid.amount;
    });

    if (bidAmount <= currentMaxBid) return res.status(400).json({ message: `出價必須高於目前最高價 (${currentMaxBid} HP)！` });

    const maxBidAllowed = player.hp - 5;
    if (bidAmount > maxBidAllowed) return res.status(400).json({ message: `出價金額過高！您最多只能使用 ${maxBidAllowed} HP 進行競標 (需保留 5 HP)。` });

    const existingBidIndex = game.bids.findIndex(bid => bid.playerId.equals(player._id) && bid.skill === skill);
    if (existingBidIndex > -1) {
      game.bids[existingBidIndex].amount = bidAmount;
      game.bids[existingBidIndex].createdAt = Date.now();
    } else {
      game.bids.push({ playerId: player._id, skill, amount: bidAmount });
    }

    // 加時機制
    const timeLeft = game.auctionState.endTime.getTime() - Date.now();
    if (timeLeft < 10000) game.auctionState.endTime = new Date(Date.now() + 10000);

    await game.save();
    await broadcastGameState(game.gameCode, req.app.get('socketio'));
    res.status(200).json({ message: `您已對 [${skill}] 成功出價 ${bidAmount} HP！` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 強制結束競標 (管理員)
router.post('/end-auction', async (req, res) => {
  try {
    const { gameCode } = req.body;
    await finalizeAuctionPhase(gameCode, req.app.get('socketio'));
    res.status(200).json({ message: '競標已強制結束並結算' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 結束遊戲
router.post('/end-game', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const game = await Game.findOneAndUpdate(
      { gameCode: gameCode.toUpperCase() },
      {
        gamePhase: 'finished',
        "auctionState.status": 'none',
        "auctionState.currentSkill": null,
        "auctionState.queue": []
      },
      { new: true }
    );
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    await broadcastGameState(game.gameCode, req.app.get('socketio'));
    res.status(200).json({ message: '遊戲已結束' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 屬性偵查
router.post('/action/scout', async (req, res) => {
  try {
    const { gameCode, playerId, targetId } = req.body;
    const [player, target, game] = await Promise.all([
      Player.findById(playerId), Player.findById(targetId), Game.findOne({ gameCode })
    ]);

    if (!player || !target || !game) return res.status(404).json({ message: "找不到玩家或遊戲" });
    if (!game.gamePhase.startsWith('discussion')) return res.status(400).json({ message: "只能在討論階段使用偵查" });
    if (player.hp < 2) return res.status(400).json({ message: "血量不足！至少需要 2 HP 才能偵查" });
    if (player.roundStats.scoutUsageCount >= 2) return res.status(400).json({ message: "本回合偵查次數已達上限" });

    player.hp -= 1;
    player.roundStats.scoutUsageCount = (player.roundStats.scoutUsageCount || 0) + 1;
    await player.save();

    game.gameLog.push({ text: `${player.name} 對 ${target.name} 進行了屬性偵查！`, type: 'info' });
    await game.save();
    await broadcastGameState(game.gameCode, req.app.get('socketio'));

    res.status(200).json({
      message: `偵查成功！${target.name} 的屬性是 [${target.attribute}]`,
      scoutResult: { name: target.name, attribute: target.attribute }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 等級提升
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
    if (player.skills.includes('基因改造')) player.defense += 1;
    if (player.skills.includes('龜甲')) player.defense += 3;

    await player.save();
    const game = await Game.findById(player.gameId);
    await broadcastGameState(game.gameCode, req.app.get('socketio'));
    res.status(200).json({ message: `成功升級至 LV ${player.level}！` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 使用技能
router.post('/action/use-skill', async (req, res) => {
  try {
    const { playerId, skill, targets, targetAttribute } = req.body;
    const result = await useSkill(playerId, skill, targets, targetAttribute, req.app.get('socketio'));
    res.status(200).json(result.specialResponse || { message: result.message });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// 發動攻擊
router.post('/action/attack', async (req, res) => {
  try {
    const { gameCode, attackerId, targetId } = req.body;
    await handleAttackFlow(gameCode, attackerId, targetId, req.app.get('socketio'));
    res.status(200).json({ message: '攻擊處理完畢' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
