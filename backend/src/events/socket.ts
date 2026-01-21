// src/events/socket.ts
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from '../types/socket';

// Định nghĩa kiểu cho IO Server
export type IOServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const setupSocketHandlers = (io: IOServer) => {
  io.on('connection', (socket: Socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // --- XỬ LÝ SỰ KIỆN: JOIN STORE ROOM ---
    socket.on('join_store_room', (storeId) => {
      const roomName = `store_${storeId}`;
      socket.join(roomName);
      console.log(`🔌 Socket ${socket.id} joined room: ${roomName}`);
    });

    // --- XỬ LÝ SỰ KIỆN: LEAVE STORE ROOM ---
    socket.on('leave_store_room', (storeId) => {
      const roomName = `store_${storeId}`;
      socket.leave(roomName);
      console.log(`🔌 Socket ${socket.id} left room: ${roomName}`);
    });

    // --- XỬ LÝ NGẮT KẾT NỐI ---
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });
};
