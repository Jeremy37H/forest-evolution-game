// server/routes/gameRoutes.js
const express = require('express');
const router = express.Router();
const Game = require('../models/gameModel');
const Player = require('../models/playerModel');

const { LEVEL_STATS, LEVEL_UP_COSTS, INITIAL_HP } = require('../config/gameConstants');
const {
  getEnrichedGameData, broadcastGameState, startAuctionForSkill,
  finalizeAuctionPhase, useSkill, handleAttackFlow, calculateAssignedAttribute,
  prepareRoundSkills
} = require('../services/gameService');

// --- 版本檢查 ---
router.get('/version', (req, res) => {
  res.json({ version: '1.6.5-SocketFix', timestamp: new Date().toISOString() });
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
    const { playerCount, customSkillsByRound, isAutoPilot } = req.body;
    console.log('[API] Creating Game. Payload:', {
      playerCount,
      isAutoPilot,
      skillsKeys: customSkillsByRound ? Object.keys(customSkillsByRound) : 'null'
    });

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
      isAutoPilot: isAutoPilot !== undefined ? isAutoPilot : true,
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

    const assignedAttribute = await calculateAssignedAttribute(game._id);


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
    let { playerCode } = req.body;
    if (!playerCode) return res.status(400).json({ message: "請提供玩家代碼" });

    playerCode = playerCode.trim().toUpperCase();

    // 如果使用者只輸入 4 碼數字，自動補上 P- 前綴
    if (playerCode.length === 4 && /^\d+$/.test(playerCode)) {
      playerCode = 'P-' + playerCode;
    }

    const player = await Player.findOne({ playerCode });

    if (!player) return res.status(404).json({ message: "找不到此玩家代碼" });

    const game = await Game.findById(player.gameId).populate('players');
    if (!game) return res.status(404).json({ message: "找不到對應的遊戲" });

    res.json({ player, game });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 列出今日可加入的遊戲 (顯示在首頁供玩家快速選取)
router.get('/joinable', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const games = await Game.find({
      gamePhase: 'waiting',
      createdAt: { $gte: today }
    }).sort({ createdAt: -1 });

    const gamesSummary = games.map(g => ({
      gameCode: g.gameCode,
      playerCount: g.playerCount,
      joinedCount: g.players.length,
      createdAt: g.createdAt
    }));
    res.json(gamesSummary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 列出所有遊戲 (管理員)
router.get('/admin/list', async (req, res) => {
  try {
    console.log('[API] /admin/list requested');
    // 關鍵修正：必須 populate players 才能正確計算 joinedCount
    const games = await Game.find().populate('players').sort({ createdAt: -1 });
    console.log(`[API] Found ${games.length} games in DB.`);

    if (games.length > 0) {
      console.log('Sample Game 1:', {
        code: games[0].gameCode,
        phase: games[0].gamePhase,
        players: games[0].players ? games[0].players.length : 'null'
      });
    }

    const gamesWithCounts = games.map(g => ({
      gameCode: g.gameCode,
      playerCount: g.playerCount,
      joinedCount: g.players ? g.players.length : 0,
      gamePhase: g.gamePhase,
      createdAt: g.createdAt
    }));
    res.json(gamesWithCounts);
  } catch (error) {
    console.error('[API] /admin/list error:', error);
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
    let game = await Game.findOne({ gameCode }).populate('players');
    if (!game) return res.status(404).json({ message: "找不到遊戲" });
    if (game.players.length < 2) return res.status(400).json({ message: "玩家人數不足，無法開始" });

    game.currentRound = 1;
    game.gamePhase = 'discussion_round_1';

    // 初始化第一回合技能
    // 初始化第一回合技能 (使用統一邏輯)
    game = prepareRoundSkills(game);

    // --- 全自動流程初始化 ---
    if (game.isAutoPilot) {
      const { transitionToNextPhase } = require('../services/gameService');
      // 這裡直接設定第一階段的時間
      const duration = 300 + (game.players.length * 30); // 5分 + 30秒/人
      game.auctionState.endTime = new Date(Date.now() + duration * 1000);
      game.gameLog.push({ text: `遊戲正式開始！本階段討論時間為 ${Math.floor(duration / 60)} 分 ${duration % 60} 秒。`, type: 'system' });
    }

    await game.save();
    console.log(`[/start] Broadcasting game state for ${game.gameCode}, phase: ${game.gamePhase}`);
    await broadcastGameState(game.gameCode, req.app.get('socketio'), true); // Force broadcast
    console.log(`[/start] Broadcast complete for ${game.gameCode}`);
    res.json({ message: '遊戲已開始', gameCode: game.gameCode });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 開始攻擊階段
router.post('/start-attack', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const { broadcastGameState, calculatePhaseDuration } = require('../services/gameService');
    const io = req.app.get('socketio');
    const game = await Game.findOne({ gameCode }).populate('players');
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    game.gamePhase = `attack_round_${game.currentRound}`;

    // 手動啟動也要設定計時器
    const aliveCount = game.players.filter(p => p.status.isAlive).length;
    const duration = calculatePhaseDuration(aliveCount, game.gamePhase);
    game.auctionState.endTime = new Date(Date.now() + duration * 1000);

    await game.save();
    await broadcastGameState(game.gameCode, io, true);
    res.json({ message: '進入攻擊階段' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 開始競標階段
router.post('/start-auction', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const { startAuctionForSkill } = require('../services/gameService');
    const game = await Game.findOne({ gameCode });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    game.gamePhase = `auction_round_${game.currentRound}`;
    // 初始化競標佇列 (Robust Check)
    let skillKeys = [];
    if (game.skillsForAuction instanceof Map) {
      skillKeys = Array.from(game.skillsForAuction.keys());
    } else {
      skillKeys = Object.keys(game.skillsForAuction || {});
    }
    game.auctionState.queue = skillKeys;
    game.auctionState.status = 'none';

    // 注意：這裡不急著廣播，讓 startAuctionForSkill 統一處理第一個技能的計時與廣播
    await game.save();
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

// 新增 AI 玩家
router.post('/admin/add-ai', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const { addAiPlayer } = require('../services/aiService');
    const io = req.app.get('socketio');

    const aiPlayer = await addAiPlayer(gameCode, io);
    res.json({ message: 'AI 玩家已加入', player: aiPlayer });
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
        "auctionState.queue": [],
        $push: { gameLog: { text: '⚠️ 管理員已強制終止遊戲', type: 'system' } }
      },
      { new: true }
    );
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    // 強制廣播，確保玩家收到結束訊號
    await broadcastGameState(game.gameCode, req.app.get('socketio'), true);
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

// 玩家準備就緒 (切換)
router.post('/player/ready', async (req, res) => {
  try {
    const { gameCode, playerId } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: "找不到玩家" });

    player.roundStats.isReady = !player.roundStats.isReady;
    await player.save();

    const { broadcastGameState, checkReadyFastForward } = require('../services/gameService');
    const io = req.app.get('socketio');
    const game = await Game.findOne({ gameCode }).populate('players');

    // 檢查是否觸發全員 Ready 快進
    await checkReadyFastForward(game, io);
    await broadcastGameState(gameCode, io);

    res.json({ isReady: player.roundStats.isReady });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 管理員強制跳過目前倒數 (Force Skip)
router.post('/admin/force-skip', async (req, res) => {
  try {
    const { gameCode } = req.body;
    const { transitionToNextPhase } = require('../services/gameService');
    const io = req.app.get('socketio');

    // 直接將 endTime 設為現在，觸發 transition
    const game = await Game.findOne({ gameCode });
    if (!game) return res.status(404).json({ message: "找不到遊戲" });

    game.auctionState.endTime = new Date(Date.now());
    await game.save();

    console.log(`[Admin] Force skipping phase for ${gameCode}`);
    await transitionToNextPhase(gameCode, io);
    res.json({ message: "已強制跳過該階段" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
