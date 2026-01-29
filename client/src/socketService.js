// client/src/socketService.js
import { io } from "socket.io-client";

class SocketService {
  socket = null;
  queue = [];

  connect(url) {
    if (this.socket) return;

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10
    });

    this.socket.on('connect', () => {
      console.log('[SocketService] Connected:', this.socket.id);
      // 連線成功後，把排隊中的監聽全部掛上去
      this.queue.forEach(({ event, callback }) => {
        this.socket.on(event, callback);
      });
      this.queue = [];
    });
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      // Socket 還沒好？先存起來
      this.queue.push({ event, callback });
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    } else {
      console.warn('[SocketService] Attempted to emit before connection:', event);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.queue = [];
    }
  }
}

export default new SocketService();