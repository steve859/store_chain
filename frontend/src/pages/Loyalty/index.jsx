import React, { useEffect, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { getLoyaltyTiers, addLoyaltyPoints, getCustomerLoyalty } from "../../services/loyalty";
import { FaCrown, FaStar, FaSearch, FaPlusCircle } from "react-icons/fa";
import Modal from "../../components/ui/modal";

export default function Loyalty() {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [customerId, setCustomerId] = useState("");
  const [customerData, setCustomerData] = useState(null);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [pointsToAdd, setPointsToAdd] = useState("");

  const loadTiers = async () => {
    setLoading(true);
    try {
      const data = await getLoyaltyTiers();
      setTiers(data || []);
    } catch (e) {
      setError(e?.response?.data?.error || "Không thể tải danh sách hạng thành viên");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTiers();
  }, []);

  const handleSearchCustomer = async () => {
    if (!customerId) return;
    setLoading(true);
    setError("");
    setCustomerData(null);
    try {
      const data = await getCustomerLoyalty(customerId);
      setCustomerData(data);
    } catch (e) {
      setError(e?.response?.data?.error || "Không tìm thấy khách hàng");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPoints = async () => {
    try {
      await addLoyaltyPoints({ customerId, points: Number(pointsToAdd), reason: "Admin added points" });
      alert("Đã thêm điểm thành công!");
      setIsPointsModalOpen(false);
      setPointsToAdd("");
      handleSearchCustomer(); // refresh
    } catch (e) {
      alert(e?.response?.data?.error || "Lỗi khi cộng điểm");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Khách hàng thân thiết</Header>
          <span className="text-sm text-slate-600 italic">Quản lý hạng và tích điểm</span>
        </div>
      </header>

      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tiers List */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FaCrown className="text-yellow-500" /> Cấu hình hạng thành viên
            </h3>
            {tiers.length === 0 ? (
              <p className="text-slate-500 text-sm">Chưa có hạng thành viên nào.</p>
            ) : (
              <div className="space-y-4">
                {tiers.map((tier) => (
                  <div key={tier.id} className="p-4 border rounded-lg bg-slate-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-lg text-slate-800">{tier.name}</span>
                      <Badge className="bg-yellow-100 text-yellow-700">{tier.points_required} điểm</Badge>
                    </div>
                    <p className="text-sm text-slate-600">Hệ số quy đổi: x{tier.multiplier}</p>
                    <p className="text-sm text-slate-600">Đặc quyền: {tier.benefits || "Không có"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Lookup */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FaStar className="text-blue-500" /> Tra cứu khách hàng
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Nhập ID hoặc SĐT khách hàng..."
                className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />
              <Button onClick={handleSearchCustomer} disabled={loading || !customerId}>
                <FaSearch />
              </Button>
            </div>

            {customerData && (
              <div className="p-4 border border-teal-200 bg-teal-50 rounded-lg">
                <h4 className="font-bold text-teal-800 mb-2">Khách hàng #{customerData.id}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-700 mb-4">
                  <div><strong>Tổng điểm:</strong> {customerData.total_points}</div>
                  <div><strong>Khả dụng:</strong> {customerData.redeemable_points}</div>
                  <div><strong>Hạng hiện tại:</strong> <Badge className="bg-blue-100 text-blue-700">{customerData.tier || "Standard"}</Badge></div>
                </div>
                <Button onClick={() => setIsPointsModalOpen(true)} className="w-full flex items-center justify-center gap-2">
                  <FaPlusCircle /> Cộng điểm thủ công
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={isPointsModalOpen} onClose={() => setIsPointsModalOpen(false)} title="Cộng điểm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Số điểm cộng thêm</label>
            <input
              type="number"
              className="w-full px-3 py-2 border rounded-md"
              value={pointsToAdd}
              onChange={(e) => setPointsToAdd(e.target.value)}
              min={1}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsPointsModalOpen(false)}>Huỷ</Button>
            <Button onClick={handleAddPoints} disabled={!pointsToAdd}>Lưu</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
