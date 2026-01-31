const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  gameCode: { type: String, unique: true, required: true },
  playerCount: { type: Number, required: true },
  isAutoPilot: { type: Boolean, default: true },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  currentRound: { type: Number, default: 0 },
  gamePhase: { type: String, default: 'waiting' },
  skillsForAuction: { type: Map, of: String },
  // 記錄所有回合出現過的技能 (累積)
  allAuctionedSkills: [{ skill: String, description: String, round: Number }],
  // **** 新增此欄位來儲存出價紀錄 ****
  bids: [{
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    skill: String,
    amount: Number,
    createdAt: { type: Date, default: Date.now } // 用於平手時判定
  }],
  // **** 新增：屬性池 ****
  availableAttributes: [String], // 預先生成的屬性列表，玩家加入時從中取出
  gameLog: [{
    text: String,
    type: { type: String, default: 'info' }, // info, success, error, battle, system
    timestamp: { type: Date, default: Date.now }
  }],
  // ---- 新增：競標連鎖狀態 ----
  auctionState: {
    queue: [String],        // 待競標的技能列表
    currentSkill: String,   // 目前正在競標的技能
    status: { type: String, default: 'none' }, // none, starting (顯示5秒倒數), active (3分鐘), finished
    endTime: Date,          // 此技能競標截止時間
    remainingPicks: [String] // 剩餘未結算的技能 (用於顯示進度)
  },
  // ---- 新增：自定義每回合技能 ----
  customSkillsByRound: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Game', gameSchema);