// 1. Sự kiện từ Server gửi xuống Client (Emit)
export interface ServerToClientEvents {
  // Báo có đơn hàng mới cho một cửa hàng cụ thể
  new_order: (data: { orderId: number; totalAmount: string; itemsCount: number }) => void;
  
  // Báo tồn kho thấp
  low_inventory_alert: (data: { productId: number; productName: string; currentQty: number }) => void;
}

// 2. Sự kiện từ Client gửi lên Server (On)
export interface ClientToServerEvents {
  // Client (Frontend) xin gia nhập "phòng" của cửa hàng (VD: store_1)
  join_store_room: (storeId: number) => void;
  
  // Client rời phòng
  leave_store_room: (storeId: number) => void;
}

// 3. Dữ liệu đính kèm socket (nếu cần authentication sau này)
export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: number;
  storeId: number;
}