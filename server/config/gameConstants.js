// server/config/gameConstants.js

const SKILLS_BY_ROUND = {
    1: {
        '基因改造': '升級消耗 -1 HP，且升級後額外 +1 防禦。',
        '適者生存': '攻擊成功後，永久 +2 攻擊。',
        '尖刺': '被攻擊時，反彈 50% 傷害給對方。',
        '劇毒': '討論階段指定一名玩家扣除 2 HP。',
        '荷魯斯之眼': '討論階段可查看一名玩家的當前 HP。',
        '噴墨': '(一次性) 被攻擊時閃避，並將傷害轉移給隨機玩家。',
    },
    2: {
        '折翅': '(一次性) 指定一名玩家，隨機移除其一個技能。',
        '擬態': '(一次性) 討論階段模仿一名玩家的屬性。',
        '禿鷹': '每當有玩家死亡，自身恢復 3 HP。',
        '森林權杖': '(一次性) 指定一屬性，該屬性玩家全體扣 2 HP。',
        '嗜血': '攻擊成功後，自身額外恢復 2 HP。',
        '龜甲': '獲得技能時，永久增加 3 防禦。',
        '獠牙': '攻擊時無視目標防禦力。',
    },
    3: {
        '獅子王': '指定一名手下共同發動攻擊，但無法攻擊手下。',
        '瞪人': '指定兩名玩家，使其本回合無法對你攻擊。',
        '斷尾': '被攻擊時僅扣 2 HP 並閃避原始傷害。',
        '冬眠': '本回合無法攻擊，但也不會被攻擊。',
        '寄生': '(一次性) 將自身 HP 同步為目標玩家的 HP。',
        '腎上腺素': '當 HP 低於 10 時，攻擊力額外 +3。',
        '同病相憐': '連結一名玩家，使其同步承受你受到的傷害。',
    }
};

const LEVEL_STATS = {
    0: { attack: 0, defense: 0 },
    1: { attack: 2, defense: 0 },
    2: { attack: 4, defense: 2 },
    3: { attack: 5, defense: 4 },
};

const LEVEL_UP_COSTS = { 0: 2, 1: 4, 2: 4 };

const INITIAL_HP = 28;

const ROUND_DAMAGE_BONUS = { 1: 3, 2: 4, 3: 5, 4: 7 };

const AUCTION_TIMES = {
    STARTING_DELAY: 5000,
    ACTIVE_DURATION: 30000,
    SETTLEMENT_DELAY: 3000
};

module.exports = {
    SKILLS_BY_ROUND,
    LEVEL_STATS,
    LEVEL_UP_COSTS,
    INITIAL_HP,
    ROUND_DAMAGE_BONUS,
    AUCTION_TIMES
};
