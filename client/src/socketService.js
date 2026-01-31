// client/src/socketService.js
import { io } from "socket.io-client";

class SocketService {
  socket = null;
  queue = [];

  connect(url) {
    if (this.socket && this.socket.connected) {
      console.log('[SocketService] Already connected.');
      return;
    }

    if (this.socket) {
      console.log('[SocketService] Socket exists but not connected. Re-initializing...');
      this.socket.close();
      this.socket = null;
    }

    console.log('[SocketService] Connecting to:', url);
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

    this.socket.on('connect_error', (err) => {
      console.error('[SocketService] Connection Error:', err);
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

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    } else {
      this.queue = this.queue.filter(q => q.event !== event || q.callback !== callback);
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