import React, { useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getPriceRecommendations, triggerBatchRecalculation, trackCompetitorPrice } from "../../services/pricing";
import { FaChartLine, FaRobot, FaSync, FaExclamationTriangle } from "react-icons/fa";

export default function Pricing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [productId, setProductId] = useState("");

  const handleGetRecommendations = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getPriceRecommendations({ productId: productId || undefined });
      setRecommendations(data || []);
    } catch (e) {
      setError(e?.response?.data?.error || "Không thể tải gợi ý giá");
    } finally {
      setLoading(false);
    }
  };

  const handleBatchRecalculate = async () => {
    try {
      setLoading(true);
      const res = await triggerBatchRecalculation();
      alert(`Đã đưa ${res.count} sản phẩm vào hàng đợi cập nhật giá!`);
    } catch (e) {
      alert(e?.response?.data?.error || "Lỗi khi chạy batch");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Định giá động (Dynamic Pricing)</Header>
          <span className="text-sm text-slate-600 italic">Quản lý và cập nhật giá tự động bằng quy tắc</span>
        </div>
        <Button onClick={handleBatchRecalculate} disabled={loading} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
          <FaSync /> Chạy cập nhật giá (Batch)
        </Button>
      </header>

      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FaRobot className="text-teal-500" /> Gợi ý giá AI
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                Hệ thống sẽ phân tích lịch sử bán hàng và dữ liệu đối thủ để đưa ra mức giá tối ưu nhất cho từng sản phẩm.
              </p>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Nhập ID SP (tuỳ chọn)"
                  className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                />
                <Button onClick={handleGetRecommendations} disabled={loading}>Xem</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 bg-orange-50 border-orange-200">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-orange-800">
                <FaExclamationTriangle /> Cảnh báo biên lợi nhuận
              </h3>
              <p className="text-sm text-orange-700">
                Chức năng Định giá tự động có thể làm giảm biên lợi nhuận nếu đối thủ phá giá. Hãy thiết lập Margin Threshold cẩn thận.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardContent className="p-0">
              <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <FaChartLine className="text-blue-500" /> Kết quả gợi ý
                </h3>
              </div>
              <table className="min-w-full text-left">
                <thead className="text-xs text-slate-500 bg-white">
                  <tr>
                    <th className="p-4 font-medium uppercase tracking-wider">Sản phẩm</th>
                    <th className="p-4 font-medium uppercase tracking-wider">Giá vốn</th>
                    <th className="p-4 font-medium uppercase tracking-wider">Giá hiện tại</th>
                    <th className="p-4 font-medium uppercase tracking-wider">Giá đối thủ</th>
                    <th className="p-4 font-medium uppercase tracking-wider">Giá gợi ý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recommendations.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-500">
                        {loading ? "Đang tải dữ liệu..." : "Chưa có dữ liệu gợi ý. Bấm 'Xem' để tải."}
                      </td>
                    </tr>
                  ) : (
                    recommendations.map((rec, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-4 font-medium text-slate-800">Variant #{rec.variant_id}</td>
                        <td className="p-4 text-sm text-slate-600">{rec.cost_price}đ</td>
                        <td className="p-4 text-sm text-slate-600">{rec.current_price}đ</td>
                        <td className="p-4 text-sm text-red-500">{rec.competitor_price || "N/A"}</td>
                        <td className="p-4 text-sm font-bold text-green-600">{rec.recommended_price}đ</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
