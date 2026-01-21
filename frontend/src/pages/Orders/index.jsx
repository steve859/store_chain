import React, { useRef, useEffect, useState } from "react";
import {Header} from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {SearchBar} from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";

import { FaEdit, FaTrashAlt } from "react-icons/fa";
const orders = [
  {
    id: "ORD-001",
    customer: "Nguyễn Văn A",
    store: "Cửa hàng Q1",
    items: 3,
    total: "2,450,000đ",
    status: "completed",
    date: "2024-01-15",
  },
  {
    id: "ORD-002",
    customer: "Trần Thị B",
    store: "Cửa hàng Q2",
    items: 2,
    total: "1,890,000đ",
    status: "pending",
    date: "2024-01-15",
  },
  {
    id: "ORD-003",
    customer: "Lê Văn C",
    store: "Cửa hàng Q3",
    items: 5,
    total: "3,250,000đ",
    status: "completed",
    date: "2024-01-14",
  },
  {
    id: "ORD-004",
    customer: "Phạm Thị D",
    store: "Cửa hàng Q1",
    items: 1,
    total: "980,000đ",
    status: "processing",
    date: "2024-01-14",
  },
  {
    id: "ORD-005",
    customer: "Hoàng Văn E",
    store: "Cửa hàng Q2",
    items: 4,
    total: "2,150,000đ",
    status: "completed",
    date: "2024-01-13",
  },
  {
    id: "ORD-006",
    customer: "Vũ Thị F",
    store: "Cửa hàng Q3",
    items: 2,
    total: "1,600,000đ",
    status: "cancelled",
    date: "2024-01-13",
  },
  {
    id: "ORD-007",
    customer: "Đặng Văn G",
    store: "Cửa hàng Q1",
    items: 3,
    total: "2,800,000đ",
    status: "processing",
    date: "2024-01-12",
  },
  {
    id: "ORD-008",
    customer: "Bùi Thị H",
    store: "Cửa hàng Q2",
    items: 1,
    total: "750,000đ",
    status: "completed",
    date: "2024-01-12",
  },
];

const getStatusBadge = (status) => {
  switch (status) {
    case "completed":
      return (
        <div>
            <Badge className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                Hoàn thành
            </Badge>
        </div>
      );
    case "pending":
      return (
        <div>
            <Badge className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
                Đang chờ xử lý
            </Badge>
        </div>
      );
    case "processing":
        return (
        <div>
            <Badge className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                Đang xử lý
            </Badge>
        </div>
        );
    default: // inactive
      return (
        <div>
            <Badge className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200">
                Đã hủy
            </Badge>
        </div>
      );
  }
};

export default function Orders() { 
    // 2. Tạo State để quản lý Modal
    const [isModalOpen, setIsModalOpen] = useState(false);

    // State lưu dữ liệu form (để gửi lên server sau này)
    const [formData, setFormData] = useState({
      id: "",
      customer: "",
      store: "",
      items: Number,
      total: "",
      status: "",
      date: "",
    });
    const handleSave = (e) => {
        e.preventDefault();
        console.log("Lưu sản phẩm:", formData);
        // Gọi API save tại đây...
        
        setIsModalOpen(false); // Đóng modal sau khi lưu
        alert("Đã thêm sản phẩm thành công!");
    };
    return(
        <div className="space-y-8">
            <header className="flex justify-between h-16 ">
                <div>
                    <Header>Orders</Header>
                    <span className="text-sm text-slate-600 italic">Danh sách các đơn hàng</span>
                </div>
                <Button onClick={() => setIsModalOpen(true)}>
                  + Thêm đơn hàng mới
                </Button>
            </header>
            <SearchBar placeholder="Tìm kiếm đơn hàng"></SearchBar>
            <Card>
                <CardContent className="p-0">
                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                        <table className="min-w-full border border-slate-600">
                            <thead className="bg-gray-200">
                                <tr className="border-b h-3">
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Tên Khách Hàng</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Cửa Hàng</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Số Lượng</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Tổng Tiền</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Ngày Đặt</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Trạng thái</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {orders.map((order) => (
                                    <tr key={order.id} className="hover:bg-card-content/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="font-bold">{order.id}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap font-medium">{order.customer}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{order.store}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{order.items} sản phẩm</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-500 font-medium">{order.total}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{order.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{getStatusBadge(order.status)}</td>
                                        <td>
                                            <div>
                                                <Button 
                                                  variant="ghost"
                                                >
                                                    <FaEdit size={10}/>    
                                                </Button> 
                                                <Button 
                                                  variant="ghost"
                                                  onDelete={() => onDeleteOrder(order.id, order.customer)}
                                                >
                                                    <FaTrashAlt size={10}/>    
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Thêm sản phẩm mới"
            >
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-medium">Mã đơn hàng</label>
                        <input 
                            placeholder="Ví dụ: ORD-001" 
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-medium">Tên khách hàng</label>
                        <input 
                            placeholder="Ví dụ: Nguyễn Văn A" 
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Cửa hàng</label>
                        <select className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                            <option>Cửa hàng Q1</option>
                            <option>Cửa hàng Q2</option>
                            <option>Cửa hàng Q3</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Giá bán</label>
                            <input
                                type="number" 
                                placeholder="0" 
                                onChange={(e) => setFormData({...formData, price: e.target.value})}
                                className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Số lượng </label>
                            <input
                                type="number"
                                placeholder="0"
                                onChange={(e) => setFormData({...formData,stock: e.target.value})}
                                className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Trạng thái</label>
                        <div className="flex items-center gap-6 mt-2">
                            {/* Lựa chọn 1: Hoàn thành */}
                          <div className="flex items-center space-x-2 cursor-pointer">
                              <input
                                  type="radio"
                                  id="status-completed"
                                  name="status"
                                  value="completed"
                                  checked={formData.status === "completed"}
                                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <label htmlFor="status-completed" className="text-sm font-medium text-gray-700 cursor-pointer">
                                  Hoàn thành
                              </label>
                          </div>
                          {/* Lựa chọn 2: Đang chờ xử lý*/}
                          <div className="flex items-center space-x-2 cursor-pointer">
                              <input
                                  type="radio"
                                  id="status-pending"
                                  name="status"
                                  value="pending"
                                  checked={formData.status === "pending"}
                                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                  className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                              />
                              <label htmlFor="status-pending" className="text-sm font-medium text-gray-700 cursor-pointer">
                                  Đang chờ xử lý
                              </label>
                          </div>
                          {/* Lựa chọn 3: Đang xử lý */}
                          <div className="flex items-center space-x-2 cursor-pointer">
                              <input
                                  type="radio"
                                  id="status-processing"
                                  name="status"
                                  value="processing"
                                  checked={formData.status === "processing"}
                                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <label htmlFor="status-processing" className="text-sm font-medium text-gray-700 cursor-pointer">
                                  Đang xử lý
                              </label>
                          </div>
                          {/* Lựa chọn 4: Đã hủy*/}
                          <div className="flex items-center space-x-2 cursor-pointer">
                              <input
                                  type="radio"
                                  id="status-cancelled"
                                  name="status"
                                  value="cancelled"
                                  checked={formData.status === "cancelled"}
                                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <label htmlFor="status-cancelled" className="text-sm font-medium text-gray-700 cursor-pointer">
                                  Đã hủy
                              </label>
                          </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                            Hủy bỏ
                        </Button>
                        <Button type="submit">
                            Lưu sản phẩm
                        </Button>
                    </div>
                </form>
            </Modal>  
        </div> 
    );        
}