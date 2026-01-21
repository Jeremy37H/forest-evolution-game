// server/server.js
require('dotenv').config();
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

// server/server.js

io.on('connection', (socket) => {
  console.log('一個使用者透過 Socket.IO 連線:', socket.id);

  // **** 新增這一段 ****
  // 監聽前端發送的 'joinGame' 事件
  socket.on('joinGame', (gameCode) => {
    socket.join(gameCode);
    console.log(`[Socket.IO] 連線 ${socket.id} 已成功加入房間 ${gameCode}`);
  });

  socket.on('disconnect', () => {
    console.log('使用者離線:', socket.id);
  });
});

// ---- 啟動伺服器 ----
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
});