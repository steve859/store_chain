import { io } from 'socket.io-client';

// Kết nối tới server (Vite proxy sẽ chuyển /socket.io sang backend)
// Nếu deploy thực tế, URL này nên lấy từ env
const SOCKET_URL = '/'; 

let socket = null;

export const initSocket = (token, storeId) => {
    if (!socket) {
        socket = io(SOCKET_URL, {
            auth: {
                token: token
            },
            query: {
                storeId: storeId
            },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            transports: ['websocket', 'polling'], // Fallback polling if websocket fails
        });

        socket.on('connect', () => {
            console.log(`[Socket.IO] Connected with ID: ${socket.id}`);
            if (storeId) {
                // Yêu cầu server join room cho store này
                socket.emit('join_store', storeId);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket.IO] Disconnected: ${reason}`);
        });

        socket.on('connect_error', (error) => {
            console.error('[Socket.IO] Connection error:', error.message);
        });
    }
    return socket;
};

export const getSocket = () => {
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

/**
 * Lắng nghe event thay đổi tồn kho
 * @param {Function} callback (data) => void
 */
export const onInventoryUpdate = (callback) => {
    if (!socket) return () => {};
    
    socket.on('inventory_updated', callback);
    
    return () => {
        socket.off('inventory_updated', callback);
    };
};
