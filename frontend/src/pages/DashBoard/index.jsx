import React, { useEffect, useMemo, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getDashboardStats, getRevenueChart, getTopProducts } from "../../services/reports";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { TrendingUp, Package, ShoppingCart, Activity } from "lucide-react";

function formatVND(number) {
  return new Intl.NumberFormat("vi-VN").format(number || 0) + "đ";
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
    realtimeOrdersToday: 0,
    realtimeRevenueToday: 0,
  });
  
  const [chartData, setChartData] = useState([]);
  const [topProductsData, setTopProductsData] = useState([]);

  const recentOrders = useMemo(() => stats.recentOrders ?? [], [stats.recentOrders]);

  const loadStats = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, chartRes, topProductsRes] = await Promise.all([
        getDashboardStats(),
        getRevenueChart(),
        getTopProducts()
      ]);
      
      setStats((prev) => ({
        ...prev,
        ...data,
      }));
      
      setChartData(chartRes || []);
      setTopProductsData(topProductsRes || []);
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
          <span className="text-sm text-slate-600 italic">Tổng quan kinh doanh Real-time</span>
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
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-medium text-slate-500">Lợi nhuận (Tháng)</div>
                <div className="mt-2 text-2xl font-bold text-green-600">{formatVND(stats.profitThisMonth)}</div>
              </div>
              <div className="p-2 bg-green-100 rounded-full text-green-600">
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-4">Doanh thu real-time: {formatVND(stats.realtimeRevenueToday)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-medium text-slate-500">Sản phẩm bán (Hôm nay)</div>
                <div className="mt-2 text-2xl font-bold text-blue-600">{stats.productsSoldToday}</div>
              </div>
              <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                <Package size={20} />
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-4">Trong tháng: {stats.productsSoldThisMonth} sản phẩm</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-medium text-slate-500">Đơn hàng (Tháng)</div>
                <div className="mt-2 text-2xl font-bold text-indigo-600">{stats.ordersThisMonth}</div>
              </div>
              <div className="p-2 bg-indigo-100 rounded-full text-indigo-600">
                <ShoppingCart size={20} />
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-4">Đơn hàng real-time (Hôm nay): {stats.realtimeOrdersToday}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-medium text-slate-500">Cửa hàng nổi bật</div>
                <div className="mt-2 text-xl font-bold text-purple-600 truncate max-w-[120px]">{stats.topStore}</div>
              </div>
              <div className="p-2 bg-purple-100 rounded-full text-purple-600">
                <Activity size={20} />
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-4">Sản phẩm Top: {stats.topProduct}</div>
          </CardContent>
        </Card>
      </main>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-slate-700">Biểu đồ doanh thu (Tháng)</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => val.split('-').slice(1).join('/')} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tickFormatter={(val) => `${val / 1000000}M`} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip 
                    formatter={(value) => [formatVND(value), "Doanh thu"]}
                    labelFormatter={(label) => `Ngày: ${label}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-slate-700">Top 5 Sản Phẩm Bán Chạy</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductsData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false}
                    tickLine={false}
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <RechartsTooltip 
                    formatter={(value, name) => [
                      name === "quantity" ? value : formatVND(value), 
                      name === "quantity" ? "Số lượng" : "Doanh thu"
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="quantity" name="Số lượng" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                  <Bar dataKey="revenue" name="Doanh thu" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <section>
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-700">Đơn hàng gần đây</h3>
              <Button variant="ghost" onClick={() => alert("Xem chi tiết đơn hàng")}>Xem tất cả</Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-3">Mã Đơn</th>
                    <th className="px-6 py-3">Ngày</th>
                    <th className="px-6 py-3">Cửa hàng</th>
                    <th className="px-6 py-3">Sản phẩm chính</th>
                    <th className="px-6 py-3">Số lượng</th>
                    <th className="px-6 py-3">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                        {loading ? "Đang tải dữ liệu..." : "Chưa có dữ liệu"}
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{o.id}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{o.date || "-"}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{o.store || "-"}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 truncate max-w-[200px]">{o.product || "-"}</td>
                        <td className="px-6 py-4 text-sm text-slate-900 font-medium">{o.items ?? 0}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-green-600">{formatVND(o.amount ?? 0)}</td>
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