const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  gameCode: { type: String, unique: true, required: true },
  playerCount: { type: Number, required: true },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  currentRound: { type: Number, default: 0 },
  gamePhase: { type: String, default: 'waiting' },
  skillsForAuction: { type: Map, of: String },
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
}, { timestamps: true });

module.exports = mongoose.model('Game', gameSchema);