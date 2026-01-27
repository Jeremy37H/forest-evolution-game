const fs = require('fs');
const file = 'd:/forest-evolution-game/client/src/App.vue';
let content = fs.readFileSync(file, 'utf8');

const styleStartMarker = '<style scoped>';
const idx = content.lastIndexOf(styleStartMarker);

if (idx === -1) {
  console.error('Could not find <style scoped> in App.vue');
  process.exit(1);
}

const templateAndScript = content.substring(0, idx + styleStartMarker.length);

const newCss = `
/* --- Global Container --- */
#game-container {
  font-family: 'Outfit', sans-serif;
  width: 95%;
  max-width: 450px; /* Reduced for mobile-first feel on desktop */
  margin: 0;        /* Centered by #app flex */
  padding: 20px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.1);
  border: 1px solid rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  min-height: auto; /* Let content dictate height */
}

/* --- Mobile Responsiveness --- */
@media (max-width: 480px) {
    #game-container {
        width: 100%;
        max-width: 100%;
        border-radius: 0;
        min-height: 100vh;
        border: none;
        padding: 15px;
        margin: 0;
    }
    
    .main-title {
        font-size: 2.2rem !important;
    }
    
    .player-stats-grid {
        grid-template-columns: repeat(2, 1fr) !important;
    }
}

/* --- Login Screen Aesthetics --- */
.main-title {
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
  text-align: center;
  /* Lively Gradient Text */
  background: linear-gradient(to right, #ff416c, #ff4b2b);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: popIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.version-tag {
  text-align: center;
  color: #adb5bd;
  font-size: 0.8rem;
  margin-bottom: 2rem;
  font-weight: 500;
}

.login-box {
  background: transparent;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  animation: slideUp 0.5s ease-out;
}

.login-tabs {
  display: flex;
  background: #f1f3f5;
  padding: 5px;
  border-radius: 16px;
  margin-bottom: 20px;
}

.login-tabs button {
  flex: 1;
  background: transparent;
  color: #868e96;
  padding: 10px;
  font-size: 1rem;
  border-radius: 12px;
  transition: all 0.3s;
}

.login-tabs button.active {
  background: white;
  color: #e91e63;
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
  font-weight: bold;
}

input {
  width: 100%;
  padding: 15px;
  border: 2px solid #f1f3f5;
  border-radius: 16px;
  font-size: 1rem;
  background: #f8f9fa;
  transition: border-color 0.3s, background 0.3s;
  box-sizing: border-box; /* Fix width overflow */
}

input:focus {
  outline: none;
  border-color: #ff4b2b;
  background: white;
}

.action-btn {
  width: 100%;
  padding: 15px;
  background: linear-gradient(45deg, #ff416c, #ff4b2b);
  color: white;
  border: none;
  border-radius: 16px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 5px 15px rgba(255, 75, 43, 0.4);
  box-sizing: border-box;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 75, 43, 0.5);
}

.admin-btn {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 1.5rem;
  opacity: 0.2;
  transition: opacity 0.3s;
}
.admin-btn:hover { opacity: 1; }

.rules-btn {
  width: 100%;
  background: white;
  color: #495057;
  border: 1px solid #dee2e6;
  padding: 10px;
  border-radius: 12px;
  font-weight: 600;
  margin-bottom: 20px;
  transition: all 0.2s;
}
.rules-btn:hover {
  background: #f8f9fa;
  border-color: #ced4da;
}

/* --- Game UI Overrides --- */
.game-wrapper {
  padding: 0;
}

.player-card {
  background: white;
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border: 1px solid #f1f3f5;
  display: flex;
  flex-direction: column;
}

.player-info-wrapper {
  width: 100%;
}

.player-info-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 8px;
}

.player-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
  margin-top: 5px;
}

.skill-button {
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.9rem;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  margin: 0 !important;
}

/* Active Skills Bar */
.active-skill-section {
  background: #f8f9fa;
  border-radius: 16px;
  padding: 10px;
  margin-top: 15px;
  border: none;
}
.active-skill-list {
  justify-content: flex-start;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 5px; /* Scrollbar space */
}
.active-skill-button {
  flex-shrink: 0;
}

/* Animations */
@keyframes popIn {
  0% { opacity: 0; transform: scale(0.5); }
  70% { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* --- Keep Existing Essential Classes (but modernized) --- */
.guess-badge {
  border-radius: 6px;
  font-weight: bold;
}

.log-container {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 10px;
  border: 1px solid #eee;
  max-height: 200px;
}
.log-message {
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 0.9rem;
  padding: 8px 12px;
}

/* Attribute Backgrounds - Refined */
.bg-wood { background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border-color: #a5d6a7; }
.bg-water { background: linear-gradient(135deg, #e3f2fd, #bbdefb); border-color: #90caf9; }
.bg-fire { background: linear-gradient(135deg, #ffebee, #ffcdd2); border-color: #ef9a9a; }
.bg-thunder { background: linear-gradient(135deg, #fffde7, #fff9c4); border-color: #fff59d; }

/* Ensure text is dark and readable on these light backgrounds */
.bg-wood, .bg-water, .bg-fire, .bg-thunder {
    color: #2c3e50;
}

/* Specific button colors for attributes need to be vibrant */
.bg-wood button { background: #4caf50; color: white !important; }
.bg-water button { background: #2196f3; color: white !important; }
.bg-fire button { background: #f44336; color: white !important; }
.bg-thunder button { background: #ffeb3b; color: #333 !important; }

/* Modal and Overlay needed if not in style.css, but they are */

/* Player Status Grid */
.player-stats-grid div {
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    border: none;
    background: #f8f9fa;
}

.player-level { font-weight: 800; color: #333; }
.player-name-text { color: #555; }

`;

const finalContent = templateAndScript + '\n' + newCss + '\n</style>';
fs.writeFileSync(file, finalContent, 'utf8');
console.log('Successfully replaced App.vue CSS with Mobile-First Aesthetic System');
