<template>
  <div v-if="game.auctionState && game.auctionState.status !== 'none'" class="modal-overlay auction-overlay">
    <div class="modal-content auction-modal" :class="{ 'starting-bg': game.auctionState.status === 'starting' }">
      <div class="auction-phase-indicator">
        <span class="pulse-dot" v-if="game.auctionState.status === 'active'"></span>
        競標中 (本回剩 {{ game.auctionState.queue.length }} 項)
      </div>
      
      <div class="auction-timer-box" :class="{ 'timer-urgent': auctionTimeLeft < 15 && game.auctionState.status === 'active', 'timer-starting': game.auctionState.status === 'starting' }">
        <span class="timer-label">{{ game.auctionState.status === 'starting' ? '即將開始' : '剩餘時間' }}</span>
        <div class="timer-value">{{ auctionTimeDisplay }}</div>
      </div>

      <div class="auction-skill-main">
        <div class="skill-title-row">
          <h2>{{ game.auctionState.currentSkill }}</h2>
        </div>
        <p class="auction-skill-description">{{ game.skillsForAuction[game.auctionState.currentSkill] }}</p>
      </div>

      <div class="auction-bid-status" :class="{ 'is-leading-status': isMyBidHighest }">
        <div v-if="game.highestBids && game.highestBids[game.auctionState.currentSkill]" class="highest-bidder">
          <span v-if="isMyBidHighest" class="status-deco deco-left">得</span>
          <span v-if="isMyBidHighest" class="status-deco deco-right">標</span>
          <span class="bid-label">目前最高出價為 <strong>{{ currentHighestBidder }}</strong></span>
          <div class="bid-value-row">
            <div class="bid-value">{{ game.highestBids[game.auctionState.currentSkill].amount }} <span class="hp-unit">HP</span></div>
          </div>
        </div>
        <div v-else class="no-bids-yet">目前尚無人出價</div>
      </div>

      <div class="auction-hp-visual" v-if="hpBreakdown">
        <div class="hp-bar-container">
          <div class="hp-bar-segment reserved" :style="{ width: hpBreakdown.reserved.pct + '%' }" title="基本保留量 (5 HP)"></div>
          <div class="hp-bar-segment other" :style="{ width: hpBreakdown.other.pct + '%' }" title="其他尚未結標的技能佔用"></div>
          <div class="hp-bar-segment active" :style="{ width: hpBreakdown.active.pct + '%' }" title="目前技能已出價"></div>
          <div class="hp-bar-segment biddable" :style="{ width: hpBreakdown.biddable.pct + '%' }" title="目前可動用額度"></div>
        </div>
        <div class="hp-bar-legend">
          <span class="legend-item"><i class="dot reserved"></i> 保留:{{ hpBreakdown.reserved.val }}</span>
          <span class="legend-item" v-if="hpBreakdown.other.val > 0"><i class="dot other"></i> 預扣:{{ hpBreakdown.other.val }}</span>
          <span class="legend-item"><i class="dot active"></i> 本次:{{ hpBreakdown.active.val }}</span>
          <span class="legend-item"><i class="dot biddable"></i> 剩餘:{{ hpBreakdown.biddable.val }}</span>
        </div>
      </div>

      <div class="auction-actions" v-if="game.auctionState.status === 'active'">
        <div class="bid-controls-centered">
          <input type="number" 
                 v-model="localBidAmount" 
                 :min="(game.highestBids[game.auctionState.currentSkill]?.amount || 0) + 1" 
                 class="auction-bid-input-large" />
          <button @click="handleBid" 
                  class="auction-bid-btn-primary" 
                  :disabled="remainingHpBase < 1 && !isMyBidHighest">
            投標
          </button>
        </div>
      </div>
      
      <div class="auction-starting-notice" v-if="game.auctionState.status === 'starting'">
        倒數結束後即可開始投標，請準備！
      </div>

      <div class="auction-finished-notice" v-if="game.auctionState.status === 'finished'">
        競標已結束，正在結算得標者...
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  game: Object,
  player: Object,
  auctionTimeLeft: Number,
  auctionTimeDisplay: String,
  isMyBidHighest: Boolean,
  currentHighestBidder: String,
  hpBreakdown: Object,
  remainingHpBase: Number,
  initialBidAmount: Number
});

const emit = defineEmits(['placeBid']);

const localBidAmount = ref(props.initialBidAmount);

watch(() => props.initialBidAmount, (newVal) => {
  localBidAmount.ref = newVal;
});

const handleBid = () => {
  emit('placeBid', {
    skill: props.game.auctionState.currentSkill,
    amount: localBidAmount.value
  });
};
</script>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0,0,0,0.5); display: flex;
  justify-content: center; align-items: center; z-index: 100;
}
.auction-modal {
  background: white; border-radius: 12px; padding: 25px; width: 95%; max-width: 400px;
  position: relative; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}
/* ... ( styles from App.vue will be moved here in a later step combined with App.vue refactor) */
</style>
