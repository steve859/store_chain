import React, { useEffect, useMemo, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";

import { FaEdit, FaTrashAlt } from "react-icons/fa";

import { getSalesOrder, listSalesOrders } from "../../services/salesOrders";

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
                Chờ thanh toán
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
    const take = 20;

    const [q, setQ] = useState("");
    const [skip, setSkip] = useState(0);

    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedItems, setSelectedItems] = useState([]);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState(null);

    const canPrev = skip > 0;
    const canNext = skip + take < total;

    const effectiveQuery = useMemo(() => q.trim(), [q]);

    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined || amount === "") return "0đ";
        const numeric = typeof amount === "number" ? amount : Number.parseFloat(String(amount));
        if (Number.isNaN(numeric)) return "0đ";
        return new Intl.NumberFormat("vi-VN").format(numeric) + "đ";
    };

    const formatDateTime = (isoString) => {
        if (!isoString) return "";
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return String(isoString);
        return date.toLocaleString("vi-VN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const load = async ({ nextSkip = skip, nextQ = effectiveQuery } = {}) => {
        setLoading(true);
        setError(null);
        try {
            const data = await listSalesOrders({ q: nextQ, take, skip: nextSkip });
            setItems(data?.items ?? []);
            setTotal(data?.total ?? 0);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || "Không thể tải đơn hàng");
        } finally {
            setLoading(false);
        }
    };

    const openDetails = async (id) => {
        setSelectedId(id);
        setIsModalOpen(true);
        setSelectedOrder(null);
        setSelectedItems([]);
        setDetailsError(null);
        setDetailsLoading(true);
        try {
            const data = await getSalesOrder(id);
            setSelectedOrder(data?.order ?? null);
            setSelectedItems(data?.items ?? []);
        } catch (e) {
            setDetailsError(e?.response?.data?.error || e?.message || "Không thể tải chi tiết đơn hàng");
        } finally {
            setDetailsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            load({ nextSkip: skip, nextQ: effectiveQuery });
        }, 250);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveQuery, skip]);

    return(
        <div className="space-y-8">
            <header className="flex justify-between h-16 ">
                <div>
                    <Header>Đơn hàng</Header>
                    <span className="text-sm text-slate-600 italic">Danh sách đơn hàng bán (POS)</span>
                </div>
                <Button variant="outline" onClick={() => load({ nextSkip: skip, nextQ: effectiveQuery })} disabled={loading}>
                  {loading ? "Đang tải..." : "Làm mới"}
                </Button>
            </header>

            <div className="flex items-center gap-3">
                <SearchBar
                    placeholder="Tìm kiếm (mã đơn, cửa hàng, nhân viên, phương thức)"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setSkip(0);
                    }}
                />
                <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" onClick={() => setSkip((s) => Math.max(0, s - take))} disabled={!canPrev || loading}>
                        Trước
                    </Button>
                    <Button variant="outline" onClick={() => setSkip((s) => s + take)} disabled={!canNext || loading}>
                        Sau
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            <Card>
                <CardContent className="p-0">
                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                        <table className="min-w-full border border-slate-600">
                            <thead className="bg-gray-200">
                                <tr className="border-b h-3">
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Mã</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Nhân viên</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Cửa hàng</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Số lượng</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Tổng tiền</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Thanh toán</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Thời gian</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Trạng thái</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-card-content uppercase tracking-wider">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {!loading && items.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-500">
                                            Chưa có đơn hàng nào
                                        </td>
                                    </tr>
                                ) : null}

                                {items.map((order) => (
                                    <tr key={order.id} className="hover:bg-card-content/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="font-bold">{order.id}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap font-medium">{order.cashier_name || "-"}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                            {order.store_name ? `${order.store_name}${order.store_code ? ` (${order.store_code})` : ""}` : (order.store_code || "-")}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{order.items_count} sản phẩm</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-500 font-medium">{formatCurrency(order.total_amount)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{order.payment_method || "-"}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{formatDateTime(order.created_at)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{getStatusBadge(order.status)}</td>
                                        <td>
                                            <div>
                                                <Button variant="ghost" onClick={() => openDetails(order.id)} title="Xem chi tiết">
                                                    <FaEdit size={10} />
                                                </Button>
                                                <Button variant="ghost" disabled title="Không hỗ trợ xóa đơn hàng">
                                                    <FaTrashAlt size={10} />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-between px-6 py-4 text-sm text-slate-600">
                        <span>
                            Hiển thị {Math.min(skip + 1, total)} - {Math.min(skip + take, total)} / {total}
                        </span>
                        <span>Mỗi trang: {take}</span>
                    </div>
                </CardContent>
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedId(null);
                }}
                title={selectedId ? `Chi tiết đơn hàng #${selectedId}` : "Chi tiết đơn hàng"}
            >
                {detailsError ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{detailsError}</div>
                ) : null}

                {detailsLoading ? (
                    <div className="text-sm text-slate-600">Đang tải chi tiết...</div>
                ) : null}

                {!detailsLoading && selectedOrder ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <div className="text-slate-500">Cửa hàng</div>
                                <div className="font-medium">
                                    {selectedOrder.store_name ? `${selectedOrder.store_name}${selectedOrder.store_code ? ` (${selectedOrder.store_code})` : ""}` : (selectedOrder.store_code || "-")}
                                </div>
                            </div>
                            <div>
                                <div className="text-slate-500">Nhân viên</div>
                                <div className="font-medium">{selectedOrder.cashier_name || "-"}</div>
                            </div>
                            <div>
                                <div className="text-slate-500">Thời gian</div>
                                <div className="font-medium">{formatDateTime(selectedOrder.created_at)}</div>
                            </div>
                            <div>
                                <div className="text-slate-500">Trạng thái</div>
                                <div className="font-medium">{getStatusBadge(selectedOrder.status)}</div>
                            </div>
                            <div>
                                <div className="text-slate-500">Phương thức</div>
                                <div className="font-medium">{selectedOrder.payment_method || "-"}</div>
                            </div>
                            <div>
                                <div className="text-slate-500">Số tiền</div>
                                <div className="font-medium">
                                    Tổng: {formatCurrency(selectedOrder.total_amount)}
                                    {selectedOrder.paid_amount ? ` | Đã trả: ${formatCurrency(selectedOrder.paid_amount)}` : ""}
                                </div>
                            </div>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                            <table className="min-w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Sản phẩm</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">SKU</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Đơn vị</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-700 uppercase">SL</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-700 uppercase">Giá</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-700 uppercase">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {selectedItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                                                Không có sản phẩm
                                            </td>
                                        </tr>
                                    ) : null}

                                    {selectedItems.map((it) => {
                                        const lineTotal = Number(it.quantity) * Number.parseFloat(String(it.price));
                                        return (
                                            <tr key={it.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 text-sm font-medium">{it.product_name}</td>
                                                <td className="px-4 py-2 text-sm text-slate-600">{it.sku_code}</td>
                                                <td className="px-4 py-2 text-sm text-slate-600">{it.unit}</td>
                                                <td className="px-4 py-2 text-sm text-right">{it.quantity}</td>
                                                <td className="px-4 py-2 text-sm text-right">{formatCurrency(it.price)}</td>
                                                <td className="px-4 py-2 text-sm text-right font-medium">{formatCurrency(lineTotal)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Đóng</Button>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}