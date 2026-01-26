// client/src/utils/gameHelpers.js

export const attributeEmojiMap = {
    '木': '🌳',
    '水': '💧',
    '火': '🔥',
    '雷': '⚡'
};

export const getAttributeSlug = (attr) => {
    const map = { '木': 'wood', '水': 'water', '火': 'fire', '雷': 'thunder' };
    return map[attr] || '';
};

export const isSkillAvailable = (skill, player, gamePhase) => {
    if (!player || !player.skills.includes(skill)) return false;
    if (player.usedOneTimeSkills && player.usedOneTimeSkills.includes(skill)) return false;

    const isDiscussion = gamePhase && gamePhase.startsWith('discussion');
    const usedThisRound = player.roundStats && player.roundStats.usedSkillsThisRound.includes(skill);

    switch (skill) {
        case '冬眠':
        case '瞪人':
        case '劇毒':
        case '荷魯斯之眼':
        case '擬態':
        case '寄生':
        case '森林權杖':
        case '獅子王':
        case '折翅':
        case '同病相憐':
            return isDiscussion && !usedThisRound;
        default:
            return false;
    }
};

export const calculateHpBreakdown = (player, game) => {
    if (!player || !game) return null;
    const reserved = 5;
    const currentSkill = game.auctionState?.currentSkill;
    const myBidOnCurrent = (game.bids || []).find(b => b.skill === currentSkill && b.playerId === player._id)?.amount || 0;

    const otherBids = (game.bids || []).reduce((sum, b) => {
        // 排除掉當前正在標的技能，只算其他已經出過價但還沒結標的 (雖然目前的邏輯是一次標一個，但報價單裡可能還有舊資料)
        if (b.playerId === player._id && b.skill !== currentSkill && game.auctionState?.queue.includes(b.skill)) {
            return sum + b.amount;
        }
        return sum;
    }, 0);

    const total = player.hp;
    const biddable = Math.max(0, total - reserved - otherBids - myBidOnCurrent);

    return {
        reserved: { val: reserved, pct: (reserved / total) * 100 },
        other: { val: otherBids, pct: (otherBids / total) * 100 },
        active: { val: myBidOnCurrent, pct: (myBidOnCurrent / total) * 100 },
        biddable: { val: biddable, pct: (biddable / total) * 100 }
    };
};
