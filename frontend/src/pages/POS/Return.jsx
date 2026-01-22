import React, { useEffect, useMemo, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import Modal from "../../components/ui/modal";
import { FaSearch, FaUndo, FaReceipt, FaCheckCircle, FaExclamationTriangle, FaWarehouse } from "react-icons/fa";
import axiosClient from "../../services/axiosClient";

// Return reasons
const returnReasons = [
    "Sản phẩm hư hỏng",
    "Sản phẩm hết hạn",
    "Khách đổi ý",
    "Sản phẩm không đúng mô tả",
    "Khác",
];

const Return = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [returnHistory, setReturnHistory] = useState([]);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [invoiceMatches, setInvoiceMatches] = useState([]);
    const [loadingInvoice, setLoadingInvoice] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [formErrors, setFormErrors] = useState({});

    // Return form state
    const [returnItems, setReturnItems] = useState([]);
    const [returnReason, setReturnReason] = useState("");
    const [customReason, setCustomReason] = useState("");
    const [refundMethod, setRefundMethod] = useState("cash");
    const [restockProducts, setRestockProducts] = useState(true);

    // Format currency
    const formatCurrency = (amount) => {
        const n = Number(amount);
        if (!Number.isFinite(n)) return "0đ";
        return new Intl.NumberFormat("vi-VN").format(n) + "đ";
    };

    // Search invoice
    const searchInvoice = async () => {
        const q = searchTerm.trim();
        if (!q) return;

        setErrorMessage(null);
        try {
            const res = await axiosClient.get("/returns/invoices", { params: { q, take: 10, skip: 0 } });
            const items = res.data?.items ?? [];
            if (!items.length) {
                alert("Không tìm thấy hóa đơn!");
                return;
            }

            if (items.length === 1) {
                await selectInvoice(items[0]);
                return;
            }

            setInvoiceMatches(items);
            setIsReturnModalOpen(true);
        } catch (e) {
            setErrorMessage(e?.response?.data?.error || e.message);
        }
    };

    const selectInvoice = async (invoice) => {
        setLoadingInvoice(true);
        setErrorMessage(null);
        try {
            const invoiceId = Number(invoice.id);
            const res = await axiosClient.get(`/returns/invoices/${invoiceId}`);

            const inv = res.data?.invoice;
            const items = res.data?.items ?? [];

            // Optional: soft-check window (7 days) like old UI
            const dateStr = inv?.created_at || inv?.createdAt || inv?.date;
            if (dateStr) {
                const invoiceDate = new Date(dateStr);
                const now = new Date();
                const daysDiff = Math.floor((now - invoiceDate) / (1000 * 60 * 60 * 24));
                if (daysDiff > 7) {
                    alert("Hóa đơn đã quá thời hạn trả hàng (7 ngày)!");
                    return;
                }
            }

            setSelectedInvoice(inv);
            setReturnItems(
                items.map((item) => ({
                    id: item.invoiceItemId,
                    name: item.name,
                    sku: item.sku,
                    price: Number(item.unitPrice) || 0,
                    quantity: Number(item.soldQty) || 0,
                    returned: Number(item.returnedQty) || 0,
                    maxReturn: Math.max(0, Number(item.remainingQty) || 0),
                    returnQty: 0,
                }))
            );
            setFormErrors({});
            setReturnReason("");
            setCustomReason("");
        } finally {
            setLoadingInvoice(false);
            setIsReturnModalOpen(false);
        }
    };

    // Update return quantity
    const updateReturnQty = (itemId, qty) => {
        setReturnItems(
            returnItems.map((item) => {
                if (item.id === itemId) {
                    const newQty = Math.max(0, Math.min(qty, item.maxReturn));
                    return { ...item, returnQty: newQty };
                }
                return item;
            })
        );
    };

    // Calculate refund total
    const refundTotal = useMemo(
        () => returnItems.reduce((sum, item) => sum + item.price * item.returnQty, 0),
        [returnItems]
    );

    // Validate return
    const validateReturn = () => {
        const errors = {};

        if (!returnItems.some((item) => item.returnQty > 0)) {
            errors.items = "Vui lòng chọn ít nhất 1 sản phẩm để trả";
        }

        if (!returnReason) {
            errors.reason = "Vui lòng chọn lý do trả hàng";
        }

        if (returnReason === "Khác" && !customReason.trim()) {
            errors.customReason = "Vui lòng nhập lý do cụ thể";
        }

        // Require manager approval for large refunds
        if (refundTotal > 500000) {
            errors.approval = "Hoàn tiền lớn hơn 500.000đ cần Store Manager duyệt";
        }

        return errors;
    };

    const loadReturnHistory = async () => {
        setLoadingHistory(true);
        try {
            const res = await axiosClient.get("/returns", { params: { take: 50, skip: 0 } });
            setReturnHistory(res.data?.items ?? []);
        } catch (e) {
            setErrorMessage(e?.response?.data?.error || e.message);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        loadReturnHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Process return
    const processReturn = async (e) => {
        e.preventDefault();
        const errors = validateReturn();
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        try {
            const invoiceId = Number(selectedInvoice?.id);
            if (!Number.isFinite(invoiceId)) {
                alert("Hóa đơn không hợp lệ!");
                return;
            }

            const payload = {
                invoiceId,
                refundMethod,
                restock: restockProducts,
                reason: returnReason === "Khác" ? customReason : returnReason,
                note: null,
                items: returnItems
                    .filter((item) => item.returnQty > 0)
                    .map((item) => ({
                        invoiceItemId: item.id,
                        quantity: item.returnQty,
                    })),
            };

            const res = await axiosClient.post("/returns", payload);

            alert(`Trả hàng thành công!\nMã phiếu: ${res.data?.returnNumber || ""}\nSố tiền hoàn: ${formatCurrency(refundTotal)}`);

            // Refresh UI
            await loadReturnHistory();
            await selectInvoice({ id: invoiceId });
            setSearchTerm("");
        } catch (e) {
            setErrorMessage(e?.response?.data?.error || e.message);
        }
    };

    // Format date
    const formatDate = (isoString) => {
        return new Date(isoString).toLocaleString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    <Header>Trả hàng / Hoàn tiền</Header>
                    <span className="italic text-gray-500">Xử lý trả hàng và hoàn tiền cho khách</span>
                </div>
            </header>

            {/* Search Invoice */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium mb-1">Mã hóa đơn</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && searchInvoice()}
                                    placeholder="VD: INV-001"
                                    className="flex-1 rounded-md border px-3 py-2"
                                />
                                <Button onClick={searchInvoice}>
                                    <FaSearch className="mr-2" /> Tìm kiếm
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {errorMessage && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            )}

            <Modal
                isOpen={isReturnModalOpen}
                onClose={() => setIsReturnModalOpen(false)}
                title="Chọn hóa đơn"
            >
                <div className="space-y-2">
                    {invoiceMatches.map((inv) => (
                        <button
                            key={inv.id}
                            type="button"
                            className="w-full rounded-md border p-3 text-left hover:bg-gray-50"
                            onClick={() => selectInvoice(inv)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="font-mono text-sm text-gray-800">{inv.invoice_number || `#${inv.id}`}</div>
                                <div className="text-sm font-medium text-teal-700">{formatCurrency(inv.total_amount || 0)}</div>
                            </div>
                            <div className="text-xs text-gray-500">
                                {inv.created_at ? formatDate(inv.created_at) : ""} — {inv.customers?.name || "Khách lẻ"}
                            </div>
                        </button>
                    ))}
                </div>
            </Modal>

            {/* Selected Invoice */}
            {selectedInvoice && (
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <FaReceipt className="text-teal-600 text-xl" />
                                <div>
                                    <h3 className="font-bold">{selectedInvoice.id}</h3>
                                    <p className="text-sm text-gray-500">{selectedInvoice.created_at ? formatDate(selectedInvoice.created_at) : ""}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-500">Khách hàng</p>
                                <p className="font-medium">{selectedInvoice.customers?.name || "Khách lẻ"}</p>
                            </div>
                        </div>

                        {/* Items */}
                        <table className="w-full text-sm mb-4">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left p-3">Sản phẩm</th>
                                    <th className="text-center p-3">Đã mua</th>
                                    <th className="text-center p-3">Đã trả</th>
                                    <th className="text-center p-3">Có thể trả</th>
                                    <th className="text-center p-3">Số lượng trả</th>
                                    <th className="text-right p-3">Tiền hoàn</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {returnItems.map((item) => (
                                    <tr key={item.id}>
                                        <td className="p-3">
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-xs text-gray-500">{item.sku}</p>
                                        </td>
                                        <td className="p-3 text-center">{item.quantity}</td>
                                        <td className="p-3 text-center text-orange-600">{item.returned}</td>
                                        <td className="p-3 text-center">{item.maxReturn}</td>
                                        <td className="p-3">
                                            <input
                                                type="number"
                                                value={item.returnQty}
                                                onChange={(e) => updateReturnQty(item.id, parseInt(e.target.value) || 0)}
                                                className="w-20 mx-auto block rounded-md border px-2 py-1 text-center"
                                                min="0"
                                                max={item.maxReturn}
                                                disabled={item.maxReturn === 0}
                                            />
                                        </td>
                                        <td className="p-3 text-right font-medium text-teal-600">
                                            {formatCurrency(item.price * item.returnQty)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {loadingInvoice && (
                            <p className="text-sm text-gray-500 mb-4">Đang tải hóa đơn...</p>
                        )}

                        {formErrors.items && (
                            <p className="text-red-500 text-sm mb-4">{formErrors.items}</p>
                        )}

                        {/* Return Options */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Lý do trả hàng *</label>
                                <select
                                    value={returnReason}
                                    onChange={(e) => setReturnReason(e.target.value)}
                                    className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.reason ? "border-red-500" : ""}`}
                                >
                                    <option value="">Chọn lý do</option>
                                    {returnReasons.map((reason) => (
                                        <option key={reason} value={reason}>{reason}</option>
                                    ))}
                                </select>
                                {formErrors.reason && <p className="text-red-500 text-xs mt-1">{formErrors.reason}</p>}
                            </div>

                            {returnReason === "Khác" && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">Lý do cụ thể *</label>
                                    <input
                                        type="text"
                                        value={customReason}
                                        onChange={(e) => setCustomReason(e.target.value)}
                                        className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.customReason ? "border-red-500" : ""}`}
                                        placeholder="Nhập lý do..."
                                    />
                                    {formErrors.customReason && <p className="text-red-500 text-xs mt-1">{formErrors.customReason}</p>}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1">Phương thức hoàn tiền</label>
                                <select
                                    value={refundMethod}
                                    onChange={(e) => setRefundMethod(e.target.value)}
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                >
                                    <option value="cash">Tiền mặt</option>
                                    <option value="card">Hoàn về thẻ</option>
                                    <option value="other">Khác</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2 pt-6">
                                <input
                                    type="checkbox"
                                    id="restock"
                                    checked={restockProducts}
                                    onChange={(e) => setRestockProducts(e.target.checked)}
                                    className="h-4 w-4"
                                />
                                <label htmlFor="restock" className="text-sm flex items-center gap-1">
                                    <FaWarehouse className="text-gray-500" />
                                    Nhập lại kho
                                </label>
                            </div>
                        </div>

                        {formErrors.approval && (
                            <div className="p-3 bg-orange-50 rounded-lg flex items-center gap-2 mb-4">
                                <FaExclamationTriangle className="text-orange-600" />
                                <p className="text-sm text-orange-800">{formErrors.approval}</p>
                            </div>
                        )}

                        {/* Summary & Actions */}
                        <div className="flex items-center justify-between pt-4 border-t">
                            <div>
                                <p className="text-sm text-gray-500">Tổng tiền hoàn:</p>
                                <p className="text-2xl font-bold text-teal-600">{formatCurrency(refundTotal)}</p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
                                    Hủy
                                </Button>
                                <Button onClick={processReturn} disabled={refundTotal === 0}>
                                    <FaUndo className="mr-2" /> Xác nhận trả hàng
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Return History */}
            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b bg-gray-50 flex items-center gap-2">
                        <FaUndo className="text-gray-500" />
                        <h3 className="font-medium">Lịch sử trả hàng</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left p-4 font-medium text-gray-600">Mã trả hàng</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Hóa đơn gốc</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Thời gian</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Trạng thái</th>
                                    <th className="text-right p-4 font-medium text-gray-600">Tổng hoàn</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {returnHistory.map((rtn) => (
                                    <tr key={rtn.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-mono text-blue-600">{rtn.return_number || `#${rtn.id}`}</td>
                                        <td className="p-4 font-mono text-gray-600">{rtn.invoices?.invoice_number || rtn.invoice_id}</td>
                                        <td className="p-4 text-gray-600">{rtn.created_at ? formatDate(rtn.created_at) : ""}</td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center gap-2">
                                                <span className="text-gray-700">{rtn.status}</span>
                                                {rtn.status === "completed" ? <FaCheckCircle className="text-green-500" /> : null}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-medium text-teal-600">{formatCurrency(rtn.total_refund || 0)}</td>
                                    </tr>
                                ))}
                                {!loadingHistory && returnHistory.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-gray-500">
                                            Chưa có lịch sử trả hàng
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {loadingHistory && (
                            <div className="p-4 text-sm text-gray-500">Đang tải lịch sử...</div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Return;
