// server/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors');

const gameRoutes = require('./routes/gameRoutes');

const app = express();
app.use(cors());
app.use(express.json()); // 讓 express 可以讀懂 JSON body

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.set('socketio', io);

// ---- 資料庫連接 ----
// **注意**: 如果您使用 MongoDB Atlas, 請將下面的連線字串換成您的 Atlas 字串
// ---- 資料庫連接 ----
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB 資料庫連接成功!'))
  .catch(err => console.error('MongoDB 連接失敗:', err));

// ---- API 路由 ----
app.use('/api/game', gameRoutes);

// ---- 靜態檔案服務 (Production) ----
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV !== 'test') { // Default to serving static if not testing
  // 設定靜態檔案資料夾 (指向 client/dist)
  const clientDistPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDistPath));

  // 所有其他路由導向 index.html (SPA 支援)
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// server/server.js

io.on('connection', (socket) => {
  console.log('一個使用者透過 Socket.IO 連線:', socket.id);

  // **** 新增這一段 ****
  // 監聽前端發送的 'joinGame' 事件
  socket.on('joinGame', (gameCode) => {
    socket.join(gameCode);
    console.log(`[Socket.IO] 連線 ${socket.id} 已成功加入房間 ${gameCode}`);
    // Optional: Emit confirmation back to client
    socket.emit('joinedRoom', gameCode);
  });

  socket.on('disconnect', () => {
    console.log('使用者離線:', socket.id);
  });
});

// ---- 全自動流程實時監控 (Heartbeat) ----
const { broadcastGameState } = require('./services/gameService');
const Game = require('./models/gameModel');

setInterval(async () => {
  try {
    const activeGames = await Game.find({
      gamePhase: { $nin: ['waiting', 'finished'] },
      isAutoPilot: true
    });
    for (const game of activeGames) {
      await broadcastGameState(game.gameCode, io);
    }
  } catch (err) {
    console.error('[Heartbeat Error]:', err);
  }
}, 2000); // 每 2 秒掃描一次

// ---- 啟動伺服器 ----
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
});