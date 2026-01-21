import React, { useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";
import { FaSearch, FaUndo, FaReceipt, FaCheckCircle, FaExclamationTriangle, FaWarehouse } from "react-icons/fa";

// Dummy invoices for return
const invoices = [
    {
        id: "INV-001",
        date: "2026-01-10T14:30:00",
        customer: "Nguyễn Văn A",
        items: [
            { id: 1, name: "Sữa tươi Vinamilk 1L", sku: "SKU-001", price: 35000, quantity: 2, returned: 0 },
            { id: 2, name: "Coca-Cola 330ml", sku: "SKU-002", price: 12000, quantity: 5, returned: 0 },
        ],
        total: 130000,
        paymentMethod: "cash",
    },
    {
        id: "INV-002",
        date: "2026-01-09T10:15:00",
        customer: "Khách lẻ",
        items: [
            { id: 3, name: "Bánh Oreo", sku: "SKU-003", price: 25000, quantity: 3, returned: 1 },
            { id: 4, name: "Mì gói Hảo Hảo", sku: "SKU-004", price: 5000, quantity: 10, returned: 0 },
        ],
        total: 125000,
        paymentMethod: "card",
    },
    {
        id: "INV-003",
        date: "2026-01-05T16:45:00",
        customer: "Trần Thị B",
        items: [
            { id: 5, name: "Nước suối Aquafina", sku: "SKU-005", price: 8000, quantity: 4, returned: 0 },
        ],
        total: 32000,
        paymentMethod: "cash",
    },
];

// Return reasons
const returnReasons = [
    "Sản phẩm hư hỏng",
    "Sản phẩm hết hạn",
    "Khách đổi ý",
    "Sản phẩm không đúng mô tả",
    "Khác",
];

// Return history
const initialReturnHistory = [
    {
        id: "RTN-001",
        invoiceId: "INV-002",
        date: "2026-01-09T11:00:00",
        item: "Bánh Oreo",
        quantity: 1,
        reason: "Sản phẩm hư hỏng",
        refundAmount: 25000,
        refundMethod: "cash",
        restockProduct: true,
        approvedBy: "Admin",
    },
];

const Return = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [returnHistory, setReturnHistory] = useState(initialReturnHistory);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    // Return form state
    const [returnItems, setReturnItems] = useState([]);
    const [returnReason, setReturnReason] = useState("");
    const [customReason, setCustomReason] = useState("");
    const [refundMethod, setRefundMethod] = useState("cash");
    const [restockProducts, setRestockProducts] = useState(true);

    // Search invoice
    const searchInvoice = () => {
        const invoice = invoices.find((inv) => inv.id.toLowerCase() === searchTerm.toLowerCase());
        if (invoice) {
            // Check if return is within allowed time (e.g., 7 days)
            const invoiceDate = new Date(invoice.date);
            const now = new Date();
            const daysDiff = Math.floor((now - invoiceDate) / (1000 * 60 * 60 * 24));

            if (daysDiff > 7) {
                alert("Hóa đơn đã quá thời hạn trả hàng (7 ngày)!");
                return;
            }

            setSelectedInvoice(invoice);
            setReturnItems(
                invoice.items.map((item) => ({
                    ...item,
                    returnQty: 0,
                    maxReturn: item.quantity - item.returned,
                }))
            );
        } else {
            alert("Không tìm thấy hóa đơn!");
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
    const refundTotal = returnItems.reduce((sum, item) => sum + item.price * item.returnQty, 0);

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

    // Process return
    const processReturn = (e) => {
        e.preventDefault();
        const errors = validateReturn();
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        // Create return records
        const newReturns = returnItems
            .filter((item) => item.returnQty > 0)
            .map((item) => ({
                id: `RTN-${String(returnHistory.length + 1).padStart(3, "0")}`,
                invoiceId: selectedInvoice.id,
                date: new Date().toISOString(),
                item: item.name,
                quantity: item.returnQty,
                reason: returnReason === "Khác" ? customReason : returnReason,
                refundAmount: item.price * item.returnQty,
                refundMethod: refundMethod,
                restockProduct: restockProducts,
                approvedBy: "Admin", // Would come from auth context
            }));

        setReturnHistory([...newReturns, ...returnHistory]);

        alert(`Trả hàng thành công!\nSố tiền hoàn: ${formatCurrency(refundTotal)}`);

        // Reset
        setSelectedInvoice(null);
        setSearchTerm("");
        setReturnItems([]);
        setReturnReason("");
        setCustomReason("");
        setFormErrors({});
        setIsReturnModalOpen(false);
    };

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
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

            {/* Selected Invoice */}
            {selectedInvoice && (
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <FaReceipt className="text-teal-600 text-xl" />
                                <div>
                                    <h3 className="font-bold">{selectedInvoice.id}</h3>
                                    <p className="text-sm text-gray-500">{formatDate(selectedInvoice.date)}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-500">Khách hàng</p>
                                <p className="font-medium">{selectedInvoice.customer}</p>
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
                                    <th className="text-left p-4 font-medium text-gray-600">Sản phẩm</th>
                                    <th className="text-center p-4 font-medium text-gray-600">SL</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Lý do</th>
                                    <th className="text-right p-4 font-medium text-gray-600">Hoàn tiền</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Nhập kho</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {returnHistory.map((rtn) => (
                                    <tr key={rtn.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-mono text-blue-600">{rtn.id}</td>
                                        <td className="p-4 font-mono text-gray-600">{rtn.invoiceId}</td>
                                        <td className="p-4 text-gray-600">{formatDate(rtn.date)}</td>
                                        <td className="p-4">{rtn.item}</td>
                                        <td className="p-4 text-center">{rtn.quantity}</td>
                                        <td className="p-4 text-gray-600">{rtn.reason}</td>
                                        <td className="p-4 text-right font-medium text-teal-600">{formatCurrency(rtn.refundAmount)}</td>
                                        <td className="p-4 text-center">
                                            {rtn.restockProduct ? (
                                                <FaCheckCircle className="text-green-500 inline" />
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {returnHistory.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="p-8 text-center text-gray-500">
                                            Chưa có lịch sử trả hàng
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Return;
