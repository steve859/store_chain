import React, { useEffect, useMemo, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getDashboardStats } from "../../services/reports";

function formatVND(number) {
  return new Intl.NumberFormat("vi-VN").format(number) + "đ";
}

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    profitThisMonth: 0,
    productsSoldToday: 0,
    productsSoldThisMonth: 0,
    ordersThisMonth: 0,
    topProduct: "N/A",
    topStore: "N/A",
    recentOrders: [],
  });

  const recentOrders = useMemo(() => stats.recentOrders ?? [], [stats.recentOrders]);

  const loadStats = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getDashboardStats();
      setStats((prev) => ({
        ...prev,
        ...data,
      }));
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Không thể tải dữ liệu dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Bảng điều khiển</Header>
          <span className="text-sm text-slate-600 italic">Tổng quan kinh doanh</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadStats} disabled={loading}>
            {loading ? "Đang tải..." : "Làm mới"}
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <main className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Lợi nhuận tháng này</div>
            <div className="mt-2 text-2xl font-semibold text-green-600">{formatVND(stats.profitThisMonth)}</div>
            <div className="text-xs text-slate-400 mt-2">Số liệu tổng hợp từ các cửa hàng</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Sản phẩm bán hôm nay</div>
            <div className="mt-2 text-2xl font-semibold">{stats.productsSoldToday}</div>
            <div className="text-xs text-slate-400 mt-2">Sản phẩm (hôm nay)</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Sản phẩm bán trong tháng</div>
            <div className="mt-2 text-2xl font-semibold">{stats.productsSoldThisMonth}</div>
            <div className="text-xs text-slate-400 mt-2">Tổng số sản phẩm bán được</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Số đơn hàng (tháng)</div>
            <div className="mt-2 text-2xl font-semibold">{stats.ordersThisMonth}</div>
            <div className="text-xs text-slate-400 mt-2">Từ khách hàng</div>
          </CardContent>
        </Card>
      </main>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Sản phẩm bán nhiều nhất tháng</h3>
            <div className="text-xl font-bold">{stats.topProduct}</div>
            <div className="text-sm text-slate-400 mt-2">Dựa trên số lượng được bán</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Cửa hàng bán nhiều nhất</h3>
            <div className="text-xl font-bold">{stats.topStore}</div>
            <div className="text-sm text-slate-400 mt-2">Được tính theo tổng sản phẩm bán</div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Đơn hàng gần đây</h3>
              <Button variant="ghost" onClick={() => alert("Xem chi tiết đơn hàng")}>Xem tất cả</Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2">ID</th>
                    <th className="px-4 py-2">Ngày</th>
                    <th className="px-4 py-2">Cửa hàng</th>
                    <th className="px-4 py-2">Sản phẩm</th>
                    <th className="px-4 py-2">Số lượng</th>
                    <th className="px-4 py-2">Doanh thu</th>
                  </tr>
                </thead>
                <tbody>
                      {recentOrders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                            {loading ? "Đang tải dữ liệu..." : "Chưa có dữ liệu"}
                          </td>
                        </tr>
                      ) : (
                        recentOrders.map((o) => (
                          <tr key={o.id} className="even:bg-slate-50">
                            <td className="px-4 py-2 font-medium">{o.id}</td>
                            <td className="px-4 py-2 text-sm text-slate-600">{o.date || "-"}</td>
                            <td className="px-4 py-2 text-sm">{o.store || "-"}</td>
                            <td className="px-4 py-2 text-sm">{o.product || "-"}</td>
                            <td className="px-4 py-2 text-sm">{o.items ?? 0}</td>
                            <td className="px-4 py-2 text-sm text-blue-600">{formatVND(o.amount ?? 0)}</td>
                          </tr>
                        ))
                      )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}