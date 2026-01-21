import React, { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";
import { FaPlus, FaEye, FaCheck, FaTruck, FaEdit, FaTrashAlt, FaBoxOpen } from "react-icons/fa";

import { listStores } from "../../services/stores";
import { listSuppliers } from "../../services/suppliers";
import {
    createPurchaseOrder,
    deletePurchaseOrder,
    getPurchaseOrder,
    listProductVariants,
    listPurchaseOrders,
    receivePurchaseOrder,
    updatePurchaseOrderStatus,
} from "../../services/purchaseOrders";

const getStatusBadge = (status) => {
    switch (status) {
        case "draft":
            return <Badge className="bg-gray-100 text-gray-700">Nháp</Badge>;
        case "submitted":
        case "approved":
            return <Badge className="bg-blue-100 text-blue-700">Đã đặt hàng</Badge>;
        case "received":
            return <Badge className="bg-green-100 text-green-700">Đã nhập kho</Badge>;
        case "cancelled":
            return <Badge className="bg-red-100 text-red-700">Đã hủy</Badge>;
        default:
            return <Badge>{status}</Badge>;
    }
};

const toNumber = (v, fallback = 0) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
};

const toDateOnly = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
};

const PurchaseOrders = () => {
    const [pos, setPos] = useState([]);
    const [stores, setStores] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [variants, setVariants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("");

    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [selectedPO, setSelectedPO] = useState(null);
    const [formErrors, setFormErrors] = useState({});

    // Form state for creating PO
    const [formData, setFormData] = useState({
        supplier: "",
        store: "",
        note: "",
        items: [{ variantId: "", quantity: "", cost: "" }],
    });

    // Receive form state
    const [receiveData, setReceiveData] = useState([]);

    const suppliersById = useMemo(() => {
        const map = new Map();
        for (const s of suppliers) map.set(String(s.id), s);
        return map;
    }, [suppliers]);

    const storesById = useMemo(() => {
        const map = new Map();
        for (const s of stores) map.set(String(s.id), s);
        return map;
    }, [stores]);

    const variantsById = useMemo(() => {
        const map = new Map();
        for (const v of variants) map.set(String(v.variantId), v);
        return map;
    }, [variants]);

    const normalizeListOrder = (order) => {
        return {
            id: order.id,
            code: order.order_number || `#${order.id}`,
            createdDate: toDateOnly(order.created_at),
            supplier: order.supplier_id ? String(order.supplier_id) : "",
            store: order.store_id ? String(order.store_id) : "",
            status: order.status || "draft",
            totalAmount: toNumber(order.total_amount, 0),
            note: "",
            items: [],
            supplierName: order.suppliers?.name,
            storeName: order.stores?.name,
        };
    };

    // Load base data once
    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const [storesRes, suppliersRes, variantsRes] = await Promise.all([
                    listStores({ take: 200, skip: 0, includeStats: false }),
                    listSuppliers({ page: 1, limit: 200 }),
                    listProductVariants({ take: 200, skip: 0 }),
                ]);

                if (cancelled) return;
                setStores(Array.isArray(storesRes?.items) ? storesRes.items : []);
                setSuppliers(Array.isArray(suppliersRes?.data) ? suppliersRes.data : []);
                setVariants(Array.isArray(variantsRes?.items) ? variantsRes.items : []);
            } catch (e) {
                // keep silent; page will still render
                console.error(e);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, []);

    // Load orders with debounce on filters
    const fetchTimer = useRef(null);
    useEffect(() => {
        if (fetchTimer.current) {
            clearTimeout(fetchTimer.current);
        }

        fetchTimer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await listPurchaseOrders({
                    q: searchTerm,
                    status: filterStatus || undefined,
                    take: 200,
                    skip: 0,
                });
                const items = Array.isArray(res?.items) ? res.items : [];
                setPos(items.map(normalizeListOrder));
            } catch (e) {
                console.error(e);
                setPos([]);
            } finally {
                setLoading(false);
            }
        }, 250);

        return () => {
            if (fetchTimer.current) clearTimeout(fetchTimer.current);
        };
    }, [searchTerm, filterStatus]);

    // Reset form
    const resetForm = () => {
        setFormData({
            supplier: "",
            store: "",
            note: "",
            items: [{ variantId: "", quantity: "", cost: "" }],
        });
        setFormErrors({});
    };

    // Add item row
    const addItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { variantId: "", quantity: "", cost: "" }],
        });
    };

    // Remove item row
    const removeItem = (index) => {
        if (formData.items.length === 1) return;
        setFormData({
            ...formData,
            items: formData.items.filter((_, i) => i !== index),
        });
    };

    // Update item field
    const updateItem = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index] = { ...newItems[index], [field]: value };

        // Auto-fill cost when product is selected
        if (field === "variantId") {
            const variant = variantsById.get(String(value));
            if (variant) {
                newItems[index].cost = String(toNumber(variant.defaultCost, 0));
            }
        }

        setFormData({ ...formData, items: newItems });
    };

    // Calculate total amount
    const calculateTotal = (items) => {
        return items.reduce((sum, item) => {
            const qty = parseInt(item.quantity) || 0;
            const cost = parseFloat(item.cost) || 0;
            return sum + (qty * cost);
        }, 0);
    };

    // Validate form
    const validateForm = () => {
        const errors = {};
        if (!formData.supplier) errors.supplier = "Vui lòng chọn nhà cung cấp";
        if (!formData.store) errors.store = "Vui lòng chọn cửa hàng";

        const itemErrors = [];
        formData.items.forEach((item, index) => {
            const iErrors = {};
            if (!item.variantId) iErrors.variantId = "Chọn sản phẩm";
            if (!item.quantity || parseInt(item.quantity) <= 0) iErrors.quantity = "Số lượng > 0";
            if (!item.cost || parseFloat(item.cost) <= 0) iErrors.cost = "Giá vốn > 0";
            if (Object.keys(iErrors).length > 0) itemErrors[index] = iErrors;
        });

        if (itemErrors.some(e => e)) errors.items = itemErrors;
        return errors;
    };

    const refreshOrders = async () => {
        const res = await listPurchaseOrders({
            q: searchTerm,
            status: filterStatus || undefined,
            take: 200,
            skip: 0,
        });
        const items = Array.isArray(res?.items) ? res.items : [];
        setPos(items.map(normalizeListOrder));
    };

    // Handle create PO
    const handleCreatePO = async (e, asDraft = true) => {
        e.preventDefault();
        const errors = validateForm();
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        try {
            const payload = {
                storeId: Number(formData.store),
                supplierId: formData.supplier ? Number(formData.supplier) : undefined,
                items: formData.items.map((item) => ({
                    variantId: Number(item.variantId),
                    quantity: Number(item.quantity),
                    unitCost: Number(item.cost),
                })),
            };

            const created = await createPurchaseOrder(payload);
            const orderId = created?.order?.id;

            if (!asDraft && orderId) {
                await updatePurchaseOrderStatus(orderId, "submitted");
            }

            setIsCreateModalOpen(false);
            resetForm();
            await refreshOrders();
        } catch (err) {
            console.error(err);
            alert("Tạo đơn nhập thất bại. Vui lòng thử lại.");
        }
    };

    const loadOrderDetails = async (id) => {
        const res = await getPurchaseOrder(id);
        const order = res?.order;
        if (!order) throw new Error("Order not found");

        const items = Array.isArray(order.purchase_items) ? order.purchase_items : [];
        const mappedItems = items.map((it) => {
            const variant = it.product_variants;
            const product = variant?.products;
            const displayName = [product?.name, variant?.name].filter(Boolean).join(" - ");
            return {
                variantId: variant?.id,
                sku: product?.sku || variant?.variant_code || "",
                name: displayName || "(Không rõ)",
                quantity: toNumber(it.quantity, 0),
                cost: toNumber(it.unit_cost, 0),
                receivedQty: order.status === "received" ? toNumber(it.quantity, 0) : 0,
                actualCost: order.status === "received" ? toNumber(it.unit_cost, 0) : 0,
            };
        });

        return {
            id: order.id,
            code: order.order_number || `#${order.id}`,
            createdDate: toDateOnly(order.created_at),
            supplier: order.supplier_id ? String(order.supplier_id) : "",
            store: order.store_id ? String(order.store_id) : "",
            status: order.status || "draft",
            items: mappedItems,
            totalAmount: toNumber(order.total_amount, 0),
            note: "",
            supplierName: order.suppliers?.name,
            storeName: order.stores?.name,
        };
    };

    // Open detail modal
    const handleViewDetail = async (po) => {
        try {
            const detailed = await loadOrderDetails(po.id);
            setSelectedPO(detailed);
            setIsDetailModalOpen(true);
        } catch (e) {
            console.error(e);
            alert("Không tải được chi tiết đơn nhập.");
        }
    };

    // Open receive modal
    const handleOpenReceive = async (po) => {
        try {
            const detailed = await loadOrderDetails(po.id);
            setSelectedPO(detailed);
            setReceiveData(
                detailed.items.map((item) => ({
                    ...item,
                    receivedQty: String(item.quantity ?? 0),
                    actualCost: String(item.cost ?? 0),
                }))
            );
            setIsReceiveModalOpen(true);
        } catch (e) {
            console.error(e);
            alert("Không tải được đơn để nhập kho.");
        }
    };

    // Handle receive goods
    const handleReceiveGoods = async (e) => {
        e.preventDefault();
        try {
            await receivePurchaseOrder(selectedPO.id, {
                items: receiveData
                    .map((it) => ({
                        variantId: Number(it.variantId),
                        receivedQty: Number(it.receivedQty),
                        unitCost: Number(it.actualCost),
                    }))
                    .filter((it) => Number.isFinite(it.variantId) && Number.isFinite(it.receivedQty) && it.receivedQty > 0),
            });

            setIsReceiveModalOpen(false);
            setSelectedPO(null);
            await refreshOrders();
        } catch (err) {
            console.error(err);
            alert("Nhập kho thất bại. Vui lòng thử lại.");
        }
    };

    // Update PO status
    const handleSendOrder = async (po) => {
        try {
            await updatePurchaseOrderStatus(po.id, "submitted");
            await refreshOrders();
        } catch (e) {
            console.error(e);
            alert("Gửi đơn hàng thất bại.");
        }
    };

    // Delete draft PO
    const handleDeletePO = async (po) => {
        if (po.status !== "draft") return;
        if (!window.confirm(`Xóa đơn hàng ${po.code}?`)) return;
        try {
            await deletePurchaseOrder(po.id);
            await refreshOrders();
        } catch (e) {
            console.error(e);
            alert("Xóa đơn thất bại.");
        }
    };

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("vi-VN").format(toNumber(amount, 0)) + "đ";
    };

    // Get names
    const getSupplierName = (id) => suppliersById.get(String(id))?.name || id;
    const getStoreName = (id) => storesById.get(String(id))?.name || id;

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    <Header>Quản lý Đơn nhập hàng</Header>
                    <span className="italic text-gray-500">Tạo và quản lý đơn đặt hàng từ nhà cung cấp</span>
                </div>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                    <FaPlus className="mr-2" /> Tạo đơn nhập
                </Button>
            </header>

            {/* Toolbar */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <SearchBar
                        placeholder="Tìm theo mã đơn, nhà cung cấp..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="rounded-md border px-3 py-2 text-sm"
                >
                    <option value="">Tất cả trạng thái</option>
                    <option value="draft">Nháp</option>
                    <option value="submitted">Đã đặt hàng</option>
                    <option value="received">Đã nhập kho</option>
                </select>
            </div>

            {/* PO Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left p-4 font-medium text-gray-600">Mã đơn</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Ngày tạo</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Nhà cung cấp</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Cửa hàng nhận</th>
                                    <th className="text-right p-4 font-medium text-gray-600">Tổng tiền</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Trạng thái</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {pos.map((po) => (
                                    <tr key={po.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-mono font-medium text-blue-600">{po.code}</td>
                                        <td className="p-4 text-gray-600">{po.createdDate}</td>
                                        <td className="p-4">{po.supplierName || getSupplierName(po.supplier)}</td>
                                        <td className="p-4 text-gray-600">{po.storeName || getStoreName(po.store)}</td>
                                        <td className="p-4 text-right font-medium">{formatCurrency(po.totalAmount)}</td>
                                        <td className="p-4 text-center">{getStatusBadge(po.status)}</td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleViewDetail(po)}
                                                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                                    title="Xem chi tiết"
                                                >
                                                    <FaEye />
                                                </button>

                                                {po.status === "draft" && (
                                                    <>
                                                        <button
                                                            onClick={() => handleSendOrder(po)}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                            title="Gửi đơn hàng"
                                                        >
                                                            <FaTruck />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeletePO(po)}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                                            title="Xóa"
                                                        >
                                                            <FaTrashAlt />
                                                        </button>
                                                    </>
                                                )}

                                                {(po.status === "submitted" || po.status === "approved") && (
                                                    <button
                                                        onClick={() => handleOpenReceive(po)}
                                                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                                        title="Nhập kho"
                                                    >
                                                        <FaBoxOpen />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {!loading && pos.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-gray-500">
                                            Chưa có đơn nhập hàng
                                        </td>
                                    </tr>
                                )}
                                {loading && (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-gray-500">
                                            Đang tải...
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Create PO Modal */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Tạo đơn nhập hàng">
                <form onSubmit={(e) => handleCreatePO(e, false)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Supplier & Store */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Nhà cung cấp *</label>
                            <select
                                value={formData.supplier}
                                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                                className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.supplier ? "border-red-500" : ""}`}
                            >
                                <option value="">Chọn nhà cung cấp</option>
                                {suppliers.map((sup) => (
                                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Cửa hàng nhận *</label>
                            <select
                                value={formData.store}
                                onChange={(e) => setFormData({ ...formData, store: e.target.value })}
                                className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.store ? "border-red-500" : ""}`}
                            >
                                <option value="">Chọn cửa hàng</option>
                                {stores.map((store) => (
                                    <option key={store.id} value={store.id}>{store.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium">Sản phẩm</h4>
                            <Button type="button" size="sm" onClick={addItem}>
                                <FaPlus className="mr-1" /> Thêm dòng
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {formData.items.map((item, index) => (
                                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                                    <div className="col-span-5">
                                        <label className="block text-xs text-gray-500 mb-1">Sản phẩm</label>
                                        <select
                                            value={item.variantId}
                                            onChange={(e) => updateItem(index, "variantId", e.target.value)}
                                            className="w-full rounded-md border px-2 py-1.5 text-sm"
                                        >
                                            <option value="">Chọn sản phẩm</option>
                                            {variants.map((v) => {
                                                const label = [
                                                    v.productName,
                                                    v.variantName,
                                                    v.variantCode ? `(${v.variantCode})` : "",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ");
                                                return (
                                                    <option key={v.variantId} value={v.variantId}>
                                                        {label}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">Số lượng</label>
                                        <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(index, "quantity", e.target.value)}
                                            className="w-full rounded-md border px-2 py-1.5 text-sm"
                                            placeholder="0"
                                            min="1"
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <label className="block text-xs text-gray-500 mb-1">Giá vốn</label>
                                        <input
                                            type="number"
                                            value={item.cost}
                                            onChange={(e) => updateItem(index, "cost", e.target.value)}
                                            className="w-full rounded-md border px-2 py-1.5 text-sm"
                                            placeholder="0"
                                            min="0"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        {formData.items.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="text-red-500 text-sm hover:underline"
                                            >
                                                Xóa
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Total */}
                        <div className="mt-4 p-3 bg-gray-100 rounded-lg flex justify-between items-center">
                            <span className="font-medium">Tổng tiền:</span>
                            <span className="text-xl font-bold text-blue-600">
                                {formatCurrency(calculateTotal(formData.items))}
                            </span>
                        </div>
                    </div>

                    {/* Note */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Ghi chú</label>
                        <textarea
                            value={formData.note}
                            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            rows={2}
                            placeholder="Ghi chú..."
                        />
                    </div>

                    {/* Buttons */}
                    <div className="pt-4 flex justify-end gap-2 border-t">
                        <Button type="button" variant="outline" onClick={() => { setIsCreateModalOpen(false); resetForm(); }}>
                            Hủy bỏ
                        </Button>
                        <Button type="button" variant="ghost" onClick={(e) => handleCreatePO(e, true)}>
                            Lưu nháp
                        </Button>
                        <Button type="submit">
                            <FaTruck className="mr-2" /> Đặt hàng
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Detail Modal */}
            <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={`Chi tiết ${selectedPO?.code || ""}`}>
                {selectedPO && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-gray-500">Nhà cung cấp</p>
                                <p className="font-medium">{selectedPO.supplierName || getSupplierName(selectedPO.supplier)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">Cửa hàng nhận</p>
                                <p className="font-medium">{selectedPO.storeName || getStoreName(selectedPO.store)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">Ngày tạo</p>
                                <p className="font-medium">{selectedPO.createdDate}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">Trạng thái</p>
                                {getStatusBadge(selectedPO.status)}
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <h4 className="font-medium mb-2">Danh sách sản phẩm</h4>
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left p-2">SKU</th>
                                        <th className="text-left p-2">Tên SP</th>
                                        <th className="text-right p-2">SL đặt</th>
                                        <th className="text-right p-2">Giá vốn</th>
                                        {selectedPO.status === "received" && (
                                            <>
                                                <th className="text-right p-2">SL nhận</th>
                                                <th className="text-right p-2">Giá thực</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {selectedPO.items.map((item, i) => (
                                        <tr key={i}>
                                            <td className="p-2 font-mono">{item.sku}</td>
                                            <td className="p-2">{item.name}</td>
                                            <td className="p-2 text-right">{item.quantity}</td>
                                            <td className="p-2 text-right">{formatCurrency(item.cost)}</td>
                                            {selectedPO.status === "received" && (
                                                <>
                                                    <td className="p-2 text-right text-green-600">{item.receivedQty}</td>
                                                    <td className="p-2 text-right">{formatCurrency(item.actualCost)}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t">
                            <span className="font-medium">Tổng tiền:</span>
                            <span className="text-xl font-bold text-blue-600">{formatCurrency(selectedPO.totalAmount)}</span>
                        </div>

                        {selectedPO.note && (
                            <div className="p-3 bg-gray-100 rounded-lg">
                                <p className="text-sm text-gray-600">Ghi chú: {selectedPO.note}</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Receive Modal */}
            <Modal isOpen={isReceiveModalOpen} onClose={() => setIsReceiveModalOpen(false)} title={`Nhập kho - ${selectedPO?.code || ""}`}>
                {selectedPO && (
                    <form onSubmit={handleReceiveGoods} className="space-y-4">
                        <div className="p-3 bg-blue-50 rounded-lg flex items-center gap-2">
                            <FaBoxOpen className="text-blue-600" />
                            <p className="text-sm text-blue-800">Nhập số lượng và giá thực tế nhận được</p>
                        </div>

                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left p-2">Sản phẩm</th>
                                    <th className="text-right p-2">SL đặt</th>
                                    <th className="text-right p-2">SL nhận</th>
                                    <th className="text-right p-2">Giá thực tế</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {receiveData.map((item, index) => (
                                    <tr key={index}>
                                        <td className="p-2">
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-xs text-gray-500">{item.sku}</p>
                                        </td>
                                        <td className="p-2 text-right text-gray-600">{item.quantity}</td>
                                        <td className="p-2">
                                            <input
                                                type="number"
                                                value={item.receivedQty}
                                                onChange={(e) => {
                                                    const newData = [...receiveData];
                                                    newData[index].receivedQty = e.target.value;
                                                    setReceiveData(newData);
                                                }}
                                                className="w-full rounded-md border px-2 py-1 text-sm text-right"
                                                min="0"
                                                max={toNumber(item.quantity, 0)}
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="number"
                                                value={item.actualCost}
                                                onChange={(e) => {
                                                    const newData = [...receiveData];
                                                    newData[index].actualCost = e.target.value;
                                                    setReceiveData(newData);
                                                }}
                                                className="w-full rounded-md border px-2 py-1 text-sm text-right"
                                                min="0"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="pt-4 flex justify-end gap-2 border-t">
                            <Button type="button" variant="outline" onClick={() => setIsReceiveModalOpen(false)}>
                                Hủy bỏ
                            </Button>
                            <Button type="submit" className="bg-green-600 hover:bg-green-700">
                                <FaCheck className="mr-2" /> Hoàn tất nhập kho
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default PurchaseOrders;
