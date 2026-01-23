// client/src/socketService.js
import { io } from "socket.io-client";

class SocketService {
  socket;
  constructor() { }

  connect(url) {
    if (!this.socket) {
      console.log(`[SocketService] Connecting to ${url || 'current host'}...`);
      this.socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5
      });

      this.socket.on('connect', () => {
        console.log('[SocketService] Connected:', this.socket.id);
      });

      this.socket.on('connect_error', (err) => {
        console.error('[SocketService] Connection Error:', err);
      });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }
}

export default new SocketService();