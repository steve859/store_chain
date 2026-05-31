import React, { useEffect, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { listReturns, processReturn } from "../../services/returns";
import { FaUndo, FaSearch } from "react-icons/fa";
import Modal from "../../components/ui/modal";

export default function Returns() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [returnItems, setReturnItems] = useState([{ variantId: "", quantity: 1, reason: "Defective" }]);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const data = await listReturns({ take: 50 });
      setReturns(data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.error || "Không thể tải danh sách trả hàng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const handleProcessReturn = async () => {
    try {
      await processReturn({
        invoiceId: Number(invoiceId),
        items: returnItems.map(it => ({ variantId: Number(it.variantId), quantity: Number(it.quantity), reason: it.reason }))
      });
      alert("Đã xử lý trả hàng thành công!");
      setIsReturnModalOpen(false);
      setInvoiceId("");
      setReturnItems([{ variantId: "", quantity: 1, reason: "Defective" }]);
      fetchReturns();
    } catch (e) {
      alert(e?.response?.data?.error || "Lỗi khi xử lý trả hàng");
    }
  };

  const handleAddItem = () => {
    setReturnItems([...returnItems, { variantId: "", quantity: 1, reason: "Defective" }]);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...returnItems];
    newItems[index][field] = value;
    setReturnItems(newItems);
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Quản lý Trả hàng</Header>
          <span className="text-sm text-slate-600 italic">Lịch sử và xử lý hoàn trả</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchReturns} disabled={loading}>Làm mới</Button>
          <Button onClick={() => setIsReturnModalOpen(true)} className="flex items-center gap-2">
            <FaUndo /> Tạo Phiếu Trả
          </Button>
        </div>
      </header>

      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}

      <Card>
        <CardContent className="p-0">
          <table className="min-w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-600 text-sm">
              <tr>
                <th className="p-4 font-semibold">Mã Phiếu</th>
                <th className="p-4 font-semibold">Mã Hoá đơn gốc</th>
                <th className="p-4 font-semibold">Cửa hàng</th>
                <th className="p-4 font-semibold">Tổng tiền hoàn</th>
                <th className="p-4 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {returns.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500">Không có dữ liệu trả hàng</td>
                </tr>
              ) : (
                returns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50">
                    <td className="p-4 text-sm font-medium">#{ret.id}</td>
                    <td className="p-4 text-sm">#{ret.invoice_id}</td>
                    <td className="p-4 text-sm">{ret.store_id}</td>
                    <td className="p-4 text-sm text-red-600 font-semibold">{ret.refund_amount}đ</td>
                    <td className="p-4 text-sm">
                      <Badge className="bg-green-100 text-green-700">{ret.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal isOpen={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)} title="Xử lý Trả hàng">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Mã hoá đơn gốc (Invoice ID)</label>
            <input
              type="number"
              className="w-full px-3 py-2 border rounded-md"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Danh sách sản phẩm trả</label>
            {returnItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  type="number"
                  placeholder="Variant ID"
                  className="flex-1 px-3 py-2 border rounded-md"
                  value={item.variantId}
                  onChange={(e) => updateItem(idx, 'variantId', e.target.value)}
                />
                <input
                  type="number"
                  placeholder="SL"
                  className="w-20 px-3 py-2 border rounded-md"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                />
                <select
                  className="w-32 px-3 py-2 border rounded-md"
                  value={item.reason}
                  onChange={(e) => updateItem(idx, 'reason', e.target.value)}
                >
                  <option value="Defective">Lỗi</option>
                  <option value="Customer Change Mind">Khách đổi ý</option>
                  <option value="Wrong Item">Sai hàng</option>
                </select>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={handleAddItem} className="mt-2 text-xs">+ Thêm sản phẩm</Button>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsReturnModalOpen(false)}>Huỷ</Button>
            <Button onClick={handleProcessReturn} disabled={!invoiceId || !returnItems[0].variantId}>Xác nhận</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
