import React, { useMemo } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

const mockOrders = [
  // date in ISO yyyy-mm-dd, amount is profit for demo, items = number of products sold
  { id: "ORD-101", date: "2025-11-22", amount: 1200000, items: 3, store: "Cửa hàng Q1", product: "Sữa tươi Vinamilk" },
  { id: "ORD-102", date: "2025-11-22", amount: 450000, items: 1, store: "Cửa hàng Q2", product: "Bánh mì Việt Nam" },
  { id: "ORD-090", date: "2025-11-10", amount: 980000, items: 2, store: "Cửa hàng Q1", product: "Sữa tươi Vinamilk" },
  { id: "ORD-080", date: "2025-10-25", amount: 2200000, items: 6, store: "Cửa hàng Q2", product: "Bánh quy" },
  { id: "ORD-070", date: "2025-11-05", amount: 700000, items: 2, store: "Cửa hàng Q3", product: "Nước suối" },
  // add more mock rows if needed
];

function formatVND(number) {
  return new Intl.NumberFormat("vi-VN").format(number) + "đ";
}

export default function Dashboard() {
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  const currentMonth = new Date().toISOString().slice(0, 7); // yyyy-mm

  const stats = useMemo(() => {
    let profitThisMonth = 0;
    let productsSoldToday = 0;
    let productsSoldThisMonth = 0;
    let ordersThisMonth = 0;
    const productCount = {};
    const storeCount = {};

    for (const o of mockOrders) {
      if (o.date.startsWith(currentMonth)) {
        profitThisMonth += o.amount;
        productsSoldThisMonth += o.items;
        ordersThisMonth += 1;

        // top product/store counts (month)
        productCount[o.product] = (productCount[o.product] || 0) + o.items;
        storeCount[o.store] = (storeCount[o.store] || 0) + o.items;
      }
      if (o.date === today) {
        productsSoldToday += o.items;
      }
    }

    const topProduct = Object.keys(productCount).reduce((a, b) => (productCount[a] >= productCount[b] ? a : b), Object.keys(productCount)[0] || "N/A");
    const topStore = Object.keys(storeCount).reduce((a, b) => (storeCount[a] >= storeCount[b] ? a : b), Object.keys(storeCount)[0] || "N/A");

    return {
      profitThisMonth,
      productsSoldToday,
      productsSoldThisMonth,
      ordersThisMonth,
      topProduct,
      topStore,
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Bảng điều khiển</Header>
          <span className="text-sm text-slate-600 italic">Tổng quan kinh doanh</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">Xuất báo cáo</Button>
        </div>
      </header>

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
                  {mockOrders.slice(0, 6).map((o) => (
                    <tr key={o.id} className="even:bg-slate-50">
                      <td className="px-4 py-2 font-medium">{o.id}</td>
                      <td className="px-4 py-2 text-sm text-slate-600">{o.date}</td>
                      <td className="px-4 py-2 text-sm">{o.store}</td>
                      <td className="px-4 py-2 text-sm">{o.product}</td>
                      <td className="px-4 py-2 text-sm">{o.items}</td>
                      <td className="px-4 py-2 text-sm text-blue-600">{formatVND(o.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}