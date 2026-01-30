<script setup>
import { defineProps } from 'vue';

const props = defineProps(['game', 'auctionableSkills', 'auctionTimeLeft', 'auctionTimeDisplay', 'isMyBidHighest', 'hpBreakdown', 'userBidInputs', 'remainingHpBase', 'getBidderName']);
const emit = defineEmits(['placeBid', 'logout']);
</script>

<template>
  <div v-if="game.auctionState && game.auctionState.status !== 'none'" class="modal-overlay auction-overlay">
    <div class="modal-content auction-modal" :class="{ 'starting-bg': game.auctionState.status === 'starting' }">
      <button class="auction-close-btn" @click="emit('logout')" title="登出並離開">✖</button>
      <div class="auction-phase-indicator">
        <span class="pulse-dot" v-if="game.auctionState.status === 'active'"></span>
        競標中 (本回剩 {{ game.auctionState.queue.length + (game.auctionState.status !== 'none' && game.auctionState.status !== 'starting' ? 0 : 0) }} 項)
      </div>
      
      <div class="auction-timer-box" :class="{ 'timer-urgent': auctionTimeLeft < 15 && game.auctionState.status === 'active', 'timer-starting': game.auctionState.status === 'starting' }">
        <span class="timer-label">{{ game.auctionState.status === 'starting' ? '即將開始' : '剩餘時間' }}</span>
        <div class="timer-value">{{ auctionTimeDisplay }}</div>
      </div>

      <div class="auction-skill-main">
        <div class="skill-title-row">
          <h2>{{ game.auctionState.currentSkill }}</h2>
        </div>
        <p class="auction-skill-description">{{ auctionableSkills[game.auctionState.currentSkill] || '暫無說明' }}</p>
      </div>

      <div class="auction-bid-status" :class="{ 'is-leading-status': isMyBidHighest }">
        <div v-if="game.highestBids && game.highestBids[game.auctionState.currentSkill]" class="highest-bidder">
          <span v-if="isMyBidHighest" class="status-deco deco-left">得</span>
          <span v-if="isMyBidHighest" class="status-deco deco-right">標</span>
          <span class="bid-label">目前最高出價為 <strong>{{ getBidderName(game.highestBids[game.auctionState.currentSkill]) }}</strong></span>
          <div class="bid-value-row">
            <div class="bid-value">{{ game.highestBids[game.auctionState.currentSkill].amount }} <span class="hp-unit">HP</span></div>
          </div>
        </div>
        <div v-else class="no-bids-yet">目前尚無人出價</div>
      </div>

      <div class="auction-hp-visual" v-if="hpBreakdown">
        <div class="hp-bar-container">
          <div class="hp-bar-segment reserved" :style="{ width: ((hpBreakdown.reserved / hpBreakdown.current) * 100) + '%' }" title="基本保留量 (5 HP)"></div>
          <div class="hp-bar-segment biddable" :style="{ width: ((hpBreakdown.maxBid / hpBreakdown.current) * 100) + '%' }" title="可動用額度"></div>
        </div>
        <div class="hp-bar-legend">
          <span class="legend-item"><i class="dot reserved"></i> 保留:5</span>
          <span class="legend-item"><i class="dot biddable"></i> 可用:{{ hpBreakdown.maxBid }}</span>
        </div>
      </div>

      <div class="auction-actions" v-if="game.auctionState.status === 'active'">
        <div class="bid-controls-centered">
          <input type="number" 
                 v-model="userBidInputs[game.auctionState.currentSkill]" 
                 placeholder="金額"
                 :min="(game.highestBids ? (game.highestBids[game.auctionState.currentSkill]?.amount || 0) : 0) + 1" 
                 class="auction-bid-input-large" />
          <button @click="emit('placeBid')" 
                  class="auction-bid-btn-primary" 
                  :disabled="remainingHpBase <= 5 && !isMyBidHighest">
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

<style scoped>
.auction-overlay { background-color: rgba(0,0,0,0.85) !important; z-index: 200 !important; }
.auction-modal {
  max-width: 400px !important;
  border-top: 5px solid #007bff;
  padding: 25px !important;
  border-radius: 12px; background: white;
}
.auction-modal.starting-bg { border-top-color: #ffc107; }
.auction-phase-indicator { font-size: 0.85em; color: #6c757d; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 500; }
.pulse-dot { width: 10px; height: 10px; background: #dc3545; border-radius: 50%; animation: pulse-red 1s infinite; }
.auction-skill-main { margin-bottom: 20px; text-align: center; }
.auction-skill-main h2 { 
  margin: 0; padding: 12px 0; font-size: 2.4em; color: #007bff; font-weight: 900;
  background: #f8f9fa; border-radius: 8px;
}
.auction-skill-description { color: #555; font-size: 0.95em; line-height: 1.4; margin-top: 10px; background: #fdfdfd; padding: 12px; border-radius: 6px; border-left: 4px solid #eee; }

.auction-timer-box { background: #f8f9fa; padding: 12px; border-radius: 12px; margin-bottom: 20px; text-align: center; border: 1px solid #eee; }
.timer-label { font-size: 0.8em; color: #999; display: block; }
.timer-value { font-size: 2.8em; font-weight: bold; color: #333; }
.timer-urgent .timer-value { color: #dc3545; }
.timer-urgent { animation: shake-tiny 0.5s infinite; border-color: #f8d7da; background-color: #fff5f5; }

.auction-bid-status { margin-bottom: 20px; text-align: center; padding: 15px; background: #f9f9f9; border-radius: 12px; border: 2px solid transparent; position: relative; }
.auction-bid-status.is-leading-status { border-color: #dc3545; background: #fff5f5; }
.bid-label { font-size: 0.85em; color: #666; display: block; margin-bottom: 5px; }
.bid-value { font-size: 2.2em; font-weight: bold; color: #2ecc71; }
.hp-unit { font-size: 0.5em; margin-left: 4px; color: #999; }
.no-bids-yet { color: #999; font-style: italic; padding: 10px 0; }

.status-deco {
  font-size: 2.5em; font-weight: 900; color: #dc3545; opacity: 0.1;
  position: absolute; top: 15%; animation: pulse-red 2s infinite;
}
.deco-left { left: 15px; }
.deco-right { right: 15px; }

.auction-hp-visual { margin-bottom: 20px; padding: 12px; background: #f8f9fa; border-radius: 8px; }
.hp-bar-container { display: flex; height: 10px; background: #eee; border-radius: 5px; overflow: hidden; margin-bottom: 8px; }
.hp-bar-segment { height: 100%; transition: width 0.3s; }
.reserved { background: #e74c3c; }
.biddable { background: #2ecc71; }
.hp-bar-legend { display: flex; justify-content: center; gap: 15px; font-size: 0.75em; color: #777; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px; }
.dot.reserved { background: #e74c3c; }
.dot.biddable { background: #2ecc71; }

.auction-actions { background: #f0f7ff; padding: 20px; border-radius: 12px; border: 1px solid #d0e3ff; }
.bid-controls-centered { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.auction-bid-input-large {
  width: 100px; font-size: 1.8em; font-weight: bold; text-align: center;
  border: 2px solid #007bff; border-radius: 8px; padding: 5px; margin: 0;
}
.auction-bid-btn-primary {
  background: #007bff; color: white; font-size: 1.3em; font-weight: bold;
  padding: 10px 40px; border-radius: 8px; border: none; cursor: pointer;
  transition: all 0.2s; box-shadow: 0 4px 6px rgba(0, 123, 255, 0.2);
}
.auction-bid-btn-primary:disabled { background: #ccc; cursor: not-allowed; box-shadow: none; }

.auction-close-btn {
  position: absolute; top: 12px; right: 12px; background: none; border: none;
  font-size: 1.5em; color: #ccc; cursor: pointer; padding: 0; width: auto; margin: 0;
}
.auction-close-btn:hover { color: #dc3545; }

@keyframes pulse-red { 0%, 100% { opacity: 0.1; } 50% { opacity: 0.2; } }
@keyframes shake-tiny { 0%, 100% { transform: translate(0,0); } 25% { transform: translate(1px, 1px); } 75% { transform: translate(-1px, -1px); } }
</style>
