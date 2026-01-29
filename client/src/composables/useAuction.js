import { ref, computed, watch } from 'vue';
import axios from 'axios';

export function useAuction(game, player, apiUrl, addLogMessage) {
    const auctionTimeLeft = ref(0);
    const userBidInputs = ref({}); // 前端暫存的使用者輸入值 { [skillName]: amount }

    const auctionableSkills = computed(() => {
        return game.value?.skillsForAuction || {};
    });

    const auctionTimeDisplay = computed(() => {
        if (auctionTimeLeft.value <= 0) return '00:00';
        const m = Math.floor(auctionTimeLeft.value / 60000);
        const s = Math.floor((auctionTimeLeft.value % 60000) / 1000);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    });

    const currentSkill = computed(() => game.value?.auctionState?.currentSkill);
    const bidHistory = computed(() => game.value?.bids || []);

    const isMyBidHighest = computed(() => {
        if (!player.value || !currentSkill.value) return false;

        const skillBids = bidHistory.value.filter(b => b.skill === currentSkill.value);
        if (skillBids.length === 0) return false;

        // 修正邏輯：必須確認「最高價」是不是我出的
        const maxAmount = Math.max(...skillBids.map(b => b.amount));
        const myHighest = skillBids
            .filter(b => b.playerId === player.value._id || b.playerId.toString() === player.value._id.toString())
            .reduce((max, b) => Math.max(max, b.amount), 0);

        return myHighest >= maxAmount && maxAmount > 0;
    });

    const remainingHpBase = computed(() => {
        if (!player.value) return 0;
        return player.value.hp;
    });

    const hpBreakdown = computed(() => {
        if (!player.value) return {
            current: 0,
            reserved: 5,
            maxBid: 0,
            active: { val: 0, pct: 0 },
            other: { val: 0, pct: 0 },
            biddable: { val: 0, pct: 0 }
        };
        const current = player.value.hp;
        const reserved = 5;
        // 這裡可以加入更精細的計算
        const maxBid = Math.max(0, current - reserved);
        return {
            current,
            reserved,
            maxBid,
            // 補齊 App.vue 需要的結構，避免 undefined error
            active: { val: 0, pct: 0 }, // 實際上這應該計算目前已鎖定的 HP
            other: { val: 0, pct: 0 },
            biddable: { val: maxBid, pct: current > 0 ? (maxBid / current) * 100 : 0 }
        };
    });

    const placeBid = async () => {
        if (!game.value || !player.value || !currentSkill.value) return;

        const skill = currentSkill.value;
        const amount = userBidInputs.value[skill];

        if (!amount || amount <= 0) {
            addLogMessage('請輸入有效的出價金額', 'error');
            return;
        }

        if (amount > hpBreakdown.value.maxBid) {
            addLogMessage(`出價超過上限！你必須保留至少 5 HP`, 'error');
            return;
        }

        try {
            const response = await axios.post(`${apiUrl}/api/game/bid`, {
                gameCode: game.value.gameCode,
                playerId: player.value._id,
                skill: skill,
                bidAmount: Number(amount)
            });
            addLogMessage(response.data.message, 'success');
        } catch (error) {
            addLogMessage(error.response?.data?.message || '出價失敗', 'error');
        }
    };

    // 監聽時間更新
    watch(() => game.value?.auctionState?.endTime, (newEnd) => {
        if (newEnd) {
            const end = new Date(newEnd).getTime();
            const updateTime = () => {
                const now = Date.now();
                const left = Math.max(0, end - now);
                auctionTimeLeft.value = left;
                if (left > 0) requestAnimationFrame(updateTime);
            };
            updateTime();
        } else {
            auctionTimeLeft.value = 0;
        }
    });

    return {
        auctionTimeLeft,
        auctionableSkills,
        auctionTimeDisplay,
        isMyBidHighest,
        remainingHpBase,
        hpBreakdown,
        bidHistory,         // Server 端的出價紀錄
        userBidInputs,      // 前端的輸入綁定 Ref { skill: amount } - 重要：App.vue 應該綁定這裡
        placeBid            // 執行出價 (無參數，自動讀取 userBidInputs)
    };
}
