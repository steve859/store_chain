import React, { useEffect, useMemo, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";
import { FaPlus, FaHistory, FaWarehouse, FaArrowUp, FaArrowDown } from "react-icons/fa";

import { listStores } from "../../services/stores";
import { createInventoryAdjustment, getInventoryByVariant, listInventoryAdjustments, listProducts } from "../../services/inventoryAdjustments";

// Adjustment reasons
const adjustmentReasons = [
    "Kiểm kê định kỳ",
    "Hàng hư hỏng",
    "Hàng hết hạn",
    "Sai lệch tồn kho",
    "Nhập thêm hàng",
    "Khác",
];

const InventoryAdjustment = () => {
    const [history, setHistory] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStore, setFilterStore] = useState("");
    const [formErrors, setFormErrors] = useState({});

    const [stores, setStores] = useState([]);
    const [products, setProducts] = useState([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [currentStock, setCurrentStock] = useState(null);
    const [loadingStock, setLoadingStock] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        store: "",
        product: "",
        variant: "",
        adjustmentType: "decrease", // increase or decrease
        quantity: "",
        reason: "",
        customReason: "",
        note: "",
    });

    const fetchBootstrap = async () => {
        setLoading(true);
        setError("");
        try {
            const [storesRes, productsRes] = await Promise.all([
                listStores({ take: 200, skip: 0, includeStats: false }),
                listProducts({ take: 200, skip: 0 }),
            ]);
            setStores(storesRes.items || []);
            setProducts(productsRes.items || []);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || "Không tải được dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async ({ q, storeId } = {}) => {
        setLoading(true);
        setError("");
        try {
            const selectedStoreId = storeId !== undefined && storeId !== null && storeId !== "" ? Number(storeId) : null;
            const activeStoreId = localStorage.getItem("activeStoreId") ? Number(localStorage.getItem("activeStoreId")) : null;
            if (Number.isFinite(selectedStoreId) && Number.isFinite(activeStoreId) && selectedStoreId !== activeStoreId) {
                localStorage.setItem("activeStoreId", String(selectedStoreId));
            }

            const res = await listInventoryAdjustments({
                q,
                take: 200,
                skip: 0,
            });

            const mapped = (res.items || []).map((m) => {
                const qty = Number(m.change);
                const productName = m.product_variants?.products?.name || "—";
                const variantName = m.product_variants?.name || m.product_variants?.variant_code || m.product_variants?.barcode || "—";
                const storeLabel = m.stores?.name || m.stores?.code || String(m.store_id ?? "—");
                const variantCode = m.product_variants?.variant_code || m.product_variants?.barcode || "—";
                const userName = m.users?.full_name || m.users?.username || m.users?.email || "—";

                return {
                    id: String(m.id),
                    date: m.created_at,
                    storeId: m.store_id,
                    store: storeLabel,
                    product: `${productName} - ${variantName}`,
                    variant: variantCode,
                    quantity: Number.isFinite(qty) ? qty : 0,
                    reason: m.reason || "—",
                    user: userName,
                    note: m.reference_id || "",
                };
            });

            setHistory(mapped);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || "Không tải được lịch sử điều chỉnh");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBootstrap();
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            fetchHistory({ q: searchTerm, storeId: filterStore || undefined });
        }, 250);
        return () => clearTimeout(t);
    }, [searchTerm, filterStore]);

    // Get available variants for selected product
    const getVariants = () => {
        const product = products.find((p) => p.id.toString() === formData.product);
        return product?.product_variants || [];
    };

    // Load current stock for selected store/variant
    useEffect(() => {
        const storeId = formData.store ? Number(formData.store) : NaN;
        const variantId = formData.variant ? Number(formData.variant) : NaN;
        if (!Number.isFinite(storeId) || !Number.isFinite(variantId)) {
            setCurrentStock(null);
            return;
        }

        const activeStoreId = localStorage.getItem("activeStoreId") ? Number(localStorage.getItem("activeStoreId")) : null;
        if (Number.isFinite(activeStoreId) && storeId !== activeStoreId) {
            localStorage.setItem("activeStoreId", String(storeId));
        }

        let cancelled = false;
        setLoadingStock(true);
        getInventoryByVariant(variantId)
            .then((res) => {
                if (cancelled) return;
                const qty = Number(res?.inventory?.quantity ?? 0);
                setCurrentStock(Number.isFinite(qty) ? qty : 0);
            })
            .catch(() => {
                if (cancelled) return;
                // inventory might not exist yet
                setCurrentStock(0);
            })
            .finally(() => {
                if (cancelled) return;
                setLoadingStock(false);
            });

        return () => {
            cancelled = true;
        };
    }, [formData.store, formData.variant]);

    // Validate form
    const validateForm = () => {
        const errors = {};

        if (!formData.store) errors.store = "Vui lòng chọn cửa hàng";
        if (!formData.product) errors.product = "Vui lòng chọn sản phẩm";
        if (!formData.variant) errors.variant = "Vui lòng chọn biến thể";
        if (!formData.quantity || parseInt(formData.quantity) <= 0) {
            errors.quantity = "Số lượng phải > 0";
        }
        if (!formData.reason) errors.reason = "Vui lòng chọn lý do";
        if (formData.reason === "Khác" && !formData.customReason.trim()) {
            errors.customReason = "Vui lòng nhập lý do cụ thể";
        }

        // Check if decrease would make stock negative
        if (formData.adjustmentType === "decrease") {
            const cs = currentStock;
            if (cs !== null && parseInt(formData.quantity) > cs) {
                errors.quantity = `Không thể giảm quá tồn kho hiện tại (${cs})`;
            }
        }

        return errors;
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            store: "",
            product: "",
            variant: "",
            adjustmentType: "decrease",
            quantity: "",
            reason: "",
            customReason: "",
            note: "",
        });
        setFormErrors({});
    };

    // Handle submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validateForm();
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        try {
            const selectedStoreId = formData.store ? Number(formData.store) : null;
            const activeStoreId = localStorage.getItem("activeStoreId") ? Number(localStorage.getItem("activeStoreId")) : null;
            if (Number.isFinite(selectedStoreId) && Number.isFinite(activeStoreId) && selectedStoreId !== activeStoreId) {
                localStorage.setItem("activeStoreId", String(selectedStoreId));
            }

            await createInventoryAdjustment({
                variantId: formData.variant,
                adjustmentType: formData.adjustmentType,
                quantity: formData.quantity,
                reason: formData.reason,
                customReason: formData.customReason,
                note: formData.note,
            });
            setIsModalOpen(false);
            resetForm();
            await fetchHistory({ q: searchTerm, storeId: filterStore || undefined });
        } catch (e) {
            alert(e?.response?.data?.error || e?.message || "Không thể điều chỉnh tồn kho");
        }
    };

    const filteredHistory = useMemo(() => history, [history]);

    // Format date
    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Get store name
    const getStoreName = (storeId) => {
        const idNum = Number(storeId);
        const store = stores.find((s) => s.id === idNum);
        if (!store) return String(storeId);
        return store.name;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    <Header>Điều chỉnh Tồn kho</Header>
                    <span className="italic text-gray-500">Kiểm kê và cân bằng kho hàng</span>
                </div>
                <Button onClick={() => setIsModalOpen(true)}>
                    <FaPlus className="mr-2" /> Điều chỉnh mới
                </Button>
            </header>

            {/* Toolbar */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <SearchBar
                        placeholder="Tìm theo sản phẩm, mã biến thể..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    value={filterStore}
                    onChange={(e) => setFilterStore(e.target.value)}
                    className="rounded-md border px-3 py-2 text-sm"
                >
                    <option value="">Tất cả cửa hàng</option>
                    {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                            {store.name} ({store.code})
                        </option>
                    ))}
                </select>
            </div>

            {error && (
                <div className="text-sm text-red-600">{error}</div>
            )}

            {/* History Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="flex items-center gap-2 p-4 border-b bg-gray-50">
                        <FaHistory className="text-gray-500" />
                        <h3 className="font-medium">Lịch sử điều chỉnh</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left p-4 font-medium text-gray-600">Thời gian</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Cửa hàng</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Sản phẩm</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Mã biến thể</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Số lượng</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Lý do</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Người thực hiện</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredHistory.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="p-4 text-gray-600 text-sm">{formatDate(item.date)}</td>
                                        <td className="p-4 text-gray-600">{item.storeId ? getStoreName(item.storeId) : item.store}</td>
                                        <td className="p-4 font-medium">{item.product}</td>
                                        <td className="p-4 font-mono text-sm text-gray-600">{item.variant}</td>
                                        <td className="p-4 text-center">
                                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${item.quantity > 0
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                                }`}>
                                                {item.quantity > 0 ? <FaArrowUp /> : <FaArrowDown />}
                                                {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-600">{item.reason}</td>
                                        <td className="p-4 text-gray-600">{item.user}</td>
                                    </tr>
                                ))}
                                {filteredHistory.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-gray-500">
                                            {loading ? "Đang tải..." : "Chưa có lịch sử điều chỉnh"}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Adjustment Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Điều chỉnh tồn kho">
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Info Banner */}
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                        <FaWarehouse className="text-blue-600" />
                        <p className="text-sm text-blue-800">
                            Chức năng này dành cho Store Manager / Admin
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Store */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Cửa hàng *</label>
                            <select
                                value={formData.store}
                                onChange={(e) => setFormData({ ...formData, store: e.target.value })}
                                className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.store ? "border-red-500" : ""}`}
                            >
                                <option value="">Chọn cửa hàng</option>
                                {stores.map((store) => (
                                    <option key={store.id} value={store.id}>
                                        {store.name} ({store.code})
                                    </option>
                                ))}
                            </select>
                            {formErrors.store && <p className="text-red-500 text-xs mt-1">{formErrors.store}</p>}
                        </div>

                        {/* Product */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Sản phẩm *</label>
                            <select
                                value={formData.product}
                                onChange={(e) => setFormData({ ...formData, product: e.target.value, variant: "" })}
                                className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.product ? "border-red-500" : ""}`}
                            >
                                <option value="">Chọn sản phẩm</option>
                                {products.map((product) => (
                                    <option key={product.id} value={product.id}>
                                        {product.name} ({product.sku || "—"})
                                    </option>
                                ))}
                            </select>
                            {formErrors.product && <p className="text-red-500 text-xs mt-1">{formErrors.product}</p>}
                        </div>

                        {/* Variant */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium mb-1">Biến thể *</label>
                            <select
                                value={formData.variant}
                                onChange={(e) => setFormData({ ...formData, variant: e.target.value })}
                                className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.variant ? "border-red-500" : ""}`}
                                disabled={!formData.product}
                            >
                                <option value="">Chọn biến thể</option>
                                {getVariants().map((variant) => (
                                    <option key={variant.id} value={variant.id}>
                                        {(variant.name || "—")} - {(variant.variant_code || variant.barcode || "—")}
                                    </option>
                                ))}
                            </select>
                            {formErrors.variant && <p className="text-red-500 text-xs mt-1">{formErrors.variant}</p>}
                        </div>
                    </div>

                    {/* Current Stock Display */}
                    {currentStock !== null && (
                        <div className="p-3 bg-gray-100 rounded-lg">
                            <p className="text-sm">
                                Tồn kho hiện tại:{" "}
                                <span className="font-bold text-blue-600">
                                    {loadingStock ? "..." : currentStock}
                                </span>
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {/* Adjustment Type */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Loại điều chỉnh *</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="adjustmentType"
                                        value="increase"
                                        checked={formData.adjustmentType === "increase"}
                                        onChange={(e) => setFormData({ ...formData, adjustmentType: e.target.value })}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm text-green-700">Tăng (+)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="adjustmentType"
                                        value="decrease"
                                        checked={formData.adjustmentType === "decrease"}
                                        onChange={(e) => setFormData({ ...formData, adjustmentType: e.target.value })}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm text-red-700">Giảm (-)</span>
                                </label>
                            </div>
                        </div>

                        {/* Quantity */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Số lượng *</label>
                            <input
                                type="number"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.quantity ? "border-red-500" : ""}`}
                                placeholder="0"
                                min="1"
                            />
                            {formErrors.quantity && <p className="text-red-500 text-xs mt-1">{formErrors.quantity}</p>}
                        </div>

                        {/* Reason */}
                        <div className={formData.reason === "Khác" ? "col-span-1" : "col-span-2"}>
                            <label className="block text-sm font-medium mb-1">Lý do *</label>
                            <select
                                value={formData.reason}
                                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.reason ? "border-red-500" : ""}`}
                            >
                                <option value="">Chọn lý do</option>
                                {adjustmentReasons.map((reason) => (
                                    <option key={reason} value={reason}>
                                        {reason}
                                    </option>
                                ))}
                            </select>
                            {formErrors.reason && <p className="text-red-500 text-xs mt-1">{formErrors.reason}</p>}
                        </div>

                        {/* Custom Reason */}
                        {formData.reason === "Khác" && (
                            <div>
                                <label className="block text-sm font-medium mb-1">Lý do cụ thể *</label>
                                <input
                                    type="text"
                                    value={formData.customReason}
                                    onChange={(e) => setFormData({ ...formData, customReason: e.target.value })}
                                    className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.customReason ? "border-red-500" : ""}`}
                                    placeholder="Nhập lý do..."
                                />
                                {formErrors.customReason && <p className="text-red-500 text-xs mt-1">{formErrors.customReason}</p>}
                            </div>
                        )}
                    </div>

                    {/* Note */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Ghi chú</label>
                        <textarea
                            value={formData.note}
                            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            rows={2}
                            placeholder="Ghi chú thêm (tùy chọn)..."
                        />
                    </div>

                    {/* Submit */}
                    <div className="pt-4 flex justify-end gap-2 border-t">
                        <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }}>
                            Hủy bỏ
                        </Button>
                        <Button type="submit">Xác nhận điều chỉnh</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default InventoryAdjustment;
