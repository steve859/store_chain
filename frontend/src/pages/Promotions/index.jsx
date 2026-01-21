import React, { useEffect, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";
import { FaPlus, FaEdit, FaTrashAlt, FaTags, FaPercent, FaMoneyBillWave, FaGift, FaCalendarAlt, FaStore } from "react-icons/fa";
import { listStores } from "../../services/stores";
import {
    apiPromotionToUi,
    createPromotion,
    deletePromotion,
    listPromotions,
    mapPromotionTypeToApi,
    updatePromotion,
} from "../../services/promotions";

const defaultStores = [];

// Promotion types
const promotionTypes = [
    { id: "percent", name: "Giảm %", icon: <FaPercent /> },
    { id: "fixed", name: "Giảm tiền", icon: <FaMoneyBillWave /> },
    { id: "combo", name: "Combo", icon: <FaGift /> },
];

const initialPromotions = [];

const getTypeBadge = (type) => {
    switch (type) {
        case "percent":
            return <Badge className="bg-blue-100 text-blue-700"><FaPercent className="mr-1" /> Giảm %</Badge>;
        case "fixed":
            return <Badge className="bg-green-100 text-green-700"><FaMoneyBillWave className="mr-1" /> Giảm tiền</Badge>;
        case "combo":
            return <Badge className="bg-purple-100 text-purple-700"><FaGift className="mr-1" /> Combo</Badge>;
        default:
            return <Badge>{type}</Badge>;
    }
};

const getStatusBadge = (promo) => {
    if (promo.active === false) {
        return <Badge className="bg-red-100 text-red-700">Ngưng áp dụng</Badge>;
    }

    const now = new Date();
    const startDate = new Date(promo.startDate);
    const endDate = new Date(promo.endDate);

    if (now < startDate) {
        return <Badge className="bg-yellow-100 text-yellow-700">Chưa áp dụng</Badge>;
    } else if (now > endDate) {
        return <Badge className="bg-gray-100 text-gray-700">Hết hạn</Badge>;
    } else {
        return <Badge className="bg-green-100 text-green-700">Đang áp dụng</Badge>;
    }
};

const Promotions = () => {
    const [promotions, setPromotions] = useState(initialPromotions);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState("");

    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedPromotion, setSelectedPromotion] = useState(null);
    const [formErrors, setFormErrors] = useState({});

    const [stores, setStores] = useState(defaultStores);

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            try {
                setIsLoading(true);
                setLoadError("");
                const apiPromos = await listPromotions();
                if (!isMounted) return;
                setPromotions((apiPromos || []).map(apiPromotionToUi));
            } catch (err) {
                if (!isMounted) return;
                setLoadError(err?.response?.data?.error || err?.message || "Không tải được danh sách khuyến mãi");
            } finally {
                if (!isMounted) return;
                setIsLoading(false);
            }
        };

        load();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadStores = async () => {
            try {
                const data = await listStores({ q: "", take: 200, skip: 0, includeStats: false });
                if (!isMounted) return;
                const items = (data?.items || []).map((s) => ({ id: s.code, name: s.name }));
                setStores(items);
            } catch {
                if (!isMounted) return;
                setStores([]);
            }
        };

        loadStores();
        return () => {
            isMounted = false;
        };
    }, []);

    // Form state
    const [formData, setFormData] = useState({
        code: "",
        name: "",
        type: "percent",
        value: "",
        minOrder: "",
        maxDiscount: "",
        startDate: "",
        endDate: "",
        scope: "all",
        stores: [],
    });

    // Filter promotions
    const filteredPromotions = promotions.filter((promo) => {
        const matchSearch =
            promo.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            promo.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchType = !filterType || promo.type === filterType;
        return matchSearch && matchType;
    });

    // Reset form
    const resetForm = () => {
        setFormData({
            code: "",
            name: "",
            type: "percent",
            value: "",
            minOrder: "",
            maxDiscount: "",
            startDate: "",
            endDate: "",
            scope: "all",
            stores: [],
        });
        setFormErrors({});
    };

    // Validate form
    const validateForm = (isEdit = false) => {
        const errors = {};

        if (!formData.code.trim()) {
            errors.code = "Mã khuyến mãi là bắt buộc";
        } else if (!isEdit && promotions.some((p) => p.code === formData.code)) {
            errors.code = "Mã khuyến mãi đã tồn tại";
        }

        if (!formData.name.trim()) errors.name = "Tên khuyến mãi là bắt buộc";
        if (!formData.value || parseFloat(formData.value) <= 0) errors.value = "Giá trị phải > 0";
        if (formData.type === "percent" && parseFloat(formData.value) > 100) {
            errors.value = "Phần trăm không được > 100";
        }
        if (!formData.startDate) errors.startDate = "Chọn ngày bắt đầu";
        if (!formData.endDate) errors.endDate = "Chọn ngày kết thúc";
        if (formData.startDate && formData.endDate && new Date(formData.startDate) > new Date(formData.endDate)) {
            errors.endDate = "Ngày kết thúc phải sau ngày bắt đầu";
        }
        if (formData.scope === "stores" && formData.stores.length === 0) {
            errors.stores = "Chọn ít nhất 1 cửa hàng";
        }

        return errors;
    };

    // Handle add promotion
    const handleAddPromotion = async (e) => {
        e.preventDefault();
        const errors = validateForm();
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        try {
            const payload = {
                code: formData.code.trim(),
                name: formData.name.trim(),
                type: mapPromotionTypeToApi(formData.type),
                value: parseFloat(formData.value),
                minOrder: parseFloat(formData.minOrder) || 0,
                maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
                scope: formData.scope,
                stores: formData.stores,
                startDate: formData.startDate,
                endDate: formData.endDate,
            };

            const created = await createPromotion(payload);
            const uiCreated = apiPromotionToUi(created);
            uiCreated.minOrder = parseFloat(formData.minOrder) || 0;
            uiCreated.maxDiscount = formData.maxDiscount ? parseFloat(formData.maxDiscount) : null;
            uiCreated.scope = formData.scope;
            uiCreated.stores = formData.stores;

            setPromotions([uiCreated, ...promotions]);
            setIsAddModalOpen(false);
            resetForm();
        } catch (err) {
            setFormErrors({
                ...formErrors,
                code: err?.response?.data?.error || err?.message || "Không tạo được khuyến mãi",
            });
        }
    };

    // Open edit modal
    const handleOpenEditModal = (promo) => {
        setSelectedPromotion(promo);
        setFormData({
            code: promo.code,
            name: promo.name,
            type: promo.type,
            value: promo.value.toString(),
            minOrder: promo.minOrder.toString(),
            maxDiscount: promo.maxDiscount?.toString() || "",
            startDate: promo.startDate,
            endDate: promo.endDate,
            scope: promo.scope,
            stores: promo.stores,
        });
        setFormErrors({});
        setIsEditModalOpen(true);
    };

    // Handle update promotion
    const handleUpdatePromotion = async (e) => {
        e.preventDefault();
        const errors = validateForm(true);
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        try {
            const payload = {
                code: formData.code.trim(),
                name: formData.name.trim(),
                type: mapPromotionTypeToApi(formData.type),
                value: parseFloat(formData.value),
                minOrder: parseFloat(formData.minOrder) || 0,
                maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
                scope: formData.scope,
                stores: formData.stores,
                startDate: formData.startDate,
                endDate: formData.endDate,
            };

            const updated = await updatePromotion(selectedPromotion.id, payload);
            const uiUpdated = apiPromotionToUi(updated);
            uiUpdated.minOrder = parseFloat(formData.minOrder) || 0;
            uiUpdated.maxDiscount = formData.maxDiscount ? parseFloat(formData.maxDiscount) : null;
            uiUpdated.scope = formData.scope;
            uiUpdated.stores = formData.stores;

            setPromotions(promotions.map((p) => (p.id === selectedPromotion.id ? uiUpdated : p)));
            setIsEditModalOpen(false);
            setSelectedPromotion(null);
            resetForm();
        } catch (err) {
            setFormErrors({
                ...formErrors,
                code: err?.response?.data?.error || err?.message || "Không cập nhật được khuyến mãi",
            });
        }
    };

    // Handle delete
    const handleOpenDeleteModal = (promo) => {
        setSelectedPromotion(promo);
        setIsDeleteModalOpen(true);
    };

    const handleDeletePromotion = async () => {
        try {
            await deletePromotion(selectedPromotion.id);
            setPromotions(promotions.filter((p) => p.id !== selectedPromotion.id));
            setIsDeleteModalOpen(false);
            setSelectedPromotion(null);
        } catch (err) {
            alert(err?.response?.data?.error || err?.message || "Không xóa được khuyến mãi");
        }
    };

    // Toggle store selection
    const toggleStore = (storeId) => {
        const newStores = formData.stores.includes(storeId)
            ? formData.stores.filter((id) => id !== storeId)
            : [...formData.stores, storeId];
        setFormData({ ...formData, stores: newStores });
    };

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
    };

    // Get store names
    const getStoreNames = (storeIds) => {
        return storeIds.map((id) => stores.find((s) => s.id === id)?.name || id).join(", ");
    };

    // Format value display
    const formatValue = (promo) => {
        if (promo.type === "percent") return `-${promo.value}%`;
        if (promo.type === "fixed") return `-${formatCurrency(promo.value)}`;
        return `-${promo.value}%`;
    };

    // Render form
    const renderForm = (onSubmit, buttonText) => (
        <form onSubmit={onSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            {/* Code & Name */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Mã khuyến mãi *</label>
                    <input
                        type="text"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        className={`w-full rounded-md border px-3 py-2 text-sm uppercase ${formErrors.code ? "border-red-500" : ""}`}
                        placeholder="VD: SALE10"
                    />
                    {formErrors.code && <p className="text-red-500 text-xs mt-1">{formErrors.code}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Tên khuyến mãi *</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.name ? "border-red-500" : ""}`}
                        placeholder="VD: Giảm 10% đơn hàng"
                    />
                    {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                </div>
            </div>

            {/* Type */}
            <div>
                <label className="block text-sm font-medium mb-2">Loại khuyến mãi *</label>
                <div className="grid grid-cols-3 gap-2">
                    {promotionTypes.map((type) => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => setFormData({ ...formData, type: type.id })}
                            className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-all ${formData.type === type.id ? "border-teal-500 bg-teal-50 text-teal-700" : "border-gray-200"
                                }`}
                        >
                            {type.icon}
                            <span className="text-sm font-medium">{type.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Value */}
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Giá trị * {formData.type === "percent" && "(%)"}
                    </label>
                    <input
                        type="number"
                        value={formData.value}
                        onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                        className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.value ? "border-red-500" : ""}`}
                        placeholder="0"
                        min="0"
                        max={formData.type === "percent" ? 100 : undefined}
                    />
                    {formErrors.value && <p className="text-red-500 text-xs mt-1">{formErrors.value}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Đơn tối thiểu</label>
                    <input
                        type="number"
                        value={formData.minOrder}
                        onChange={(e) => setFormData({ ...formData, minOrder: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="0"
                        min="0"
                    />
                </div>
                {formData.type === "percent" && (
                    <div>
                        <label className="block text-sm font-medium mb-1">Giảm tối đa</label>
                        <input
                            type="number"
                            value={formData.maxDiscount}
                            onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            placeholder="Không giới hạn"
                            min="0"
                        />
                    </div>
                )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Ngày bắt đầu *</label>
                    <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.startDate ? "border-red-500" : ""}`}
                    />
                    {formErrors.startDate && <p className="text-red-500 text-xs mt-1">{formErrors.startDate}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Ngày kết thúc *</label>
                    <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.endDate ? "border-red-500" : ""}`}
                    />
                    {formErrors.endDate && <p className="text-red-500 text-xs mt-1">{formErrors.endDate}</p>}
                </div>
            </div>

            {/* Scope */}
            <div>
                <label className="block text-sm font-medium mb-2">Phạm vi áp dụng *</label>
                <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="scope"
                            value="all"
                            checked={formData.scope === "all"}
                            onChange={(e) => setFormData({ ...formData, scope: e.target.value, stores: [] })}
                            className="h-4 w-4"
                        />
                        <span className="text-sm">Toàn hệ thống</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="scope"
                            value="stores"
                            checked={formData.scope === "stores"}
                            onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                            className="h-4 w-4"
                        />
                        <span className="text-sm">Cửa hàng cụ thể</span>
                    </label>
                </div>
            </div>

            {/* Store Selection */}
            {formData.scope === "stores" && (
                <div className="ml-6">
                    <div className="space-y-2 border rounded-md p-3 max-h-32 overflow-y-auto">
                        {stores.map((store) => (
                            <label key={store.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.stores.includes(store.id)}
                                    onChange={() => toggleStore(store.id)}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm">{store.name}</span>
                            </label>
                        ))}
                    </div>
                    {formErrors.stores && <p className="text-red-500 text-xs mt-1">{formErrors.stores}</p>}
                </div>
            )}

            {/* Submit */}
            <div className="pt-4 flex justify-end gap-2 border-t">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                        setIsAddModalOpen(false);
                        setIsEditModalOpen(false);
                        resetForm();
                    }}
                >
                    Hủy bỏ
                </Button>
                <Button type="submit">{buttonText}</Button>
            </div>
        </form>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    <Header>Quản lý Khuyến mãi</Header>
                    <span className="italic text-gray-500">Tạo và quản lý chương trình khuyến mãi</span>
                </div>
                <Button onClick={() => setIsAddModalOpen(true)}>
                    <FaPlus className="mr-2" /> Tạo khuyến mãi
                </Button>
            </header>

            {/* Toolbar */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <SearchBar
                        placeholder="Tìm theo mã hoặc tên khuyến mãi..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="rounded-md border px-3 py-2 text-sm"
                >
                    <option value="">Tất cả loại</option>
                    {promotionTypes.map((type) => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                </select>
            </div>

            {/* Promotions Table */}
            <Card>
                <CardContent className="p-0">
                    {loadError && (
                        <div className="p-4 text-sm text-red-600 border-b bg-red-50">{loadError}</div>
                    )}
                    {isLoading && (
                        <div className="p-4 text-sm text-gray-600 border-b">Đang tải khuyến mãi...</div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left p-4 font-medium text-gray-600">Mã</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Tên</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Loại</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Giá trị</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Thời gian</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Phạm vi</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Đã dùng</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Trạng thái</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredPromotions.map((promo) => (
                                    <tr key={promo.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-mono font-medium text-teal-600">{promo.code}</td>
                                        <td className="p-4">{promo.name}</td>
                                        <td className="p-4 text-center">{getTypeBadge(promo.type)}</td>
                                        <td className="p-4 text-center font-bold text-green-600">{formatValue(promo)}</td>
                                        <td className="p-4 text-sm text-gray-600">
                                            <div className="flex items-center gap-1">
                                                <FaCalendarAlt className="text-gray-400" />
                                                {promo.startDate} → {promo.endDate}
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm">
                                            {promo.scope === "all" ? (
                                                <span className="text-gray-600">Toàn hệ thống</span>
                                            ) : (
                                                <span className="text-gray-600">{getStoreNames(promo.stores)}</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center text-gray-600">{promo.usageCount}</td>
                                        <td className="p-4 text-center">{getStatusBadge(promo)}</td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleOpenEditModal(promo)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                >
                                                    <FaEdit />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenDeleteModal(promo)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                                >
                                                    <FaTrashAlt />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredPromotions.length === 0 && (
                                    <tr>
                                        <td colSpan="9" className="p-8 text-center text-gray-500">
                                            Chưa có chương trình khuyến mãi
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Add Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Tạo chương trình khuyến mãi">
                {renderForm(handleAddPromotion, "Tạo khuyến mãi")}
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Chỉnh sửa khuyến mãi">
                {renderForm(handleUpdatePromotion, "Cập nhật")}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Xác nhận xóa">
                <div className="space-y-4">
                    <p>
                        Bạn có chắc chắn muốn xóa khuyến mãi <strong>{selectedPromotion?.code}</strong>?
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>
                            Hủy
                        </Button>
                        <Button onClick={handleDeletePromotion} className="bg-red-600 hover:bg-red-700 text-white">
                            Xóa
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Promotions;
