const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
  name: { type: String, required: true },
  playerCode: { type: String, required: true, unique: true },
  isHelper: { type: Boolean, default: false },
  attribute: { type: String, enum: ['木', '水', '火', '雷'], required: true },
  level: { type: Number, default: 0 },
  hp: { type: Number, default: 28 },
  attack: { type: Number, default: 0 },
  defense: { type: Number, default: 0 },
  skills: { type: [String], default: [] },
  usedOneTimeSkills: { type: [String], default: [] }, // 追蹤一次性技能 (如寄生、森林權杖)
  effects: {
    isPoisoned: { type: Boolean, default: false },
    forestScepterTarget: { type: String, default: null }, // 森林權杖的目標屬性
  },
  status: {
    isAlive: { type: Boolean, default: true },
  },
  roundStats: {
    hasAttacked: { type: Boolean, default: false },
    timesBeenAttacked: { type: Number, default: 0 },
    isHibernating: { type: Boolean, default: false },
    staredBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'Player', default: [] },
    // 記錄本回合被哪些玩家攻擊過 (用於反擊限制規則)
    attackedBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'Player', default: [] },
    minionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    usedSkillsThisRound: { type: [String], default: [] },
  },
}, { timestamps: true });

module.exports = mongoose.model('Player', playerSchema);

