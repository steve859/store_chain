import React, { useEffect, useMemo, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";
import { FaEdit, FaTrashAlt, FaPlus, FaFilter, FaTh, FaList, FaBarcode } from "react-icons/fa";
import softDrinkIcon from "../../assets/soft-drink.png";
import chickenDrumIcon from "../../assets/food.png";
import toolsIcon from "../../assets/tools-icon.png";
import confectioneryIcon from "../../assets/confectionery.png";
import {
    createProduct,
    createVariant,
    listProducts,
    listProductsCatalog,
    listVariantPrices,
    setVariantPrice,
    updateProduct,
    updateVariant as updateVariantApi,
} from "../../services/products";

// Categories and Brands for filters
const categories = ["Đồ uống", "Thực phẩm", "Vật dụng", "Bánh kẹo"];
const brands = ["Vinamilk", "Coca-Cola", "Pepsi", "Orion", "Khác"];

const toNumber = (value, fallback = 0) => {
    if (value === null || value === undefined || value === "") return fallback;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const getDefaultStoreId = () => {
    const candidates = [
        localStorage.getItem("storeId"),
        localStorage.getItem("store_id"),
        localStorage.getItem("selectedStoreId"),
    ];
    for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 1;
};

const getCategoryIcon = (category) => {
    const iconMap = {
        "Đồ uống": softDrinkIcon,
        "Thực phẩm": chickenDrumIcon,
        "Vật dụng": toolsIcon,
        "Bánh kẹo": confectioneryIcon,
    };
    return iconMap[category] || softDrinkIcon;
};

const mapProductFromApi = (p, variantStockById) => {
    const variants = (p.product_variants ?? []).map((v) => {
        const variantId = v.id;
        return {
            id: variantId,
            variantId,
            code: v.variant_code ?? "",
            barcode: v.barcode ?? "",
            price: toNumber(v.price, 0),
            cost: toNumber(v.cost_price, 0),
            minStock: toNumber(v.min_stock, 0),
            stock: toNumber(variantStockById?.get(String(variantId)) ?? 0, 0),
        };
    });

    return {
        id: p.id,
        sku: p.sku ?? "",
        name: p.name ?? "",
        category: p.category ?? "",
        brand: p.brand ?? "",
        unit: p.unit ?? "",
        status: p.is_active ? "active" : "inactive",
        image: getCategoryIcon(p.category ?? ""),
        variants,
    };
};

const getStatusBadge = (status) => {
    return status === "active" ? (
        <Badge className="bg-emerald-100 text-emerald-800">Đang bán</Badge>
    ) : (
        <Badge className="bg-red-100 text-red-800">Ngừng bán</Badge>
    );
};

export default function Products() {
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [viewMode, setViewMode] = useState("grid"); // grid or table
    const [filters, setFilters] = useState({ category: "", brand: "", status: "" });
    const [showFilters, setShowFilters] = useState(false);

    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [formErrors, setFormErrors] = useState({});

    // Store-specific pricing
    const [isStorePriceModalOpen, setIsStorePriceModalOpen] = useState(false);
    const [storePriceVariant, setStorePriceVariant] = useState(null);
    const [storePriceHistory, setStorePriceHistory] = useState([]);
    const [storePriceLoading, setStorePriceLoading] = useState(false);
    const [storePriceError, setStorePriceError] = useState("");
    const [storePriceValue, setStorePriceValue] = useState("");

    // Form state
    const [formData, setFormData] = useState({
        sku: "",
        name: "",
        category: categories[0],
        brand: brands[0],
        unit: "",
        status: "active",
        variants: [{ id: 1, code: "", barcode: "", price: "", cost: "", minStock: 0, stock: 0 }],
    });

    const fetchProducts = async () => {
        try {
            setIsLoading(true);
            setLoadError("");

            const [productsResult, catalogResult] = await Promise.allSettled([
                listProducts({ take: 200, skip: 0 }),
                listProductsCatalog({ take: 200, skip: 0 }),
            ]);

            const productsRes = productsResult.status === "fulfilled" ? productsResult.value : null;
            const catalogRes = catalogResult.status === "fulfilled" ? catalogResult.value : null;

            const variantStockById = new Map();
            for (const item of catalogRes?.items ?? []) {
                const variantId = item?.variant?.id;
                const qty = item?.inventory?.quantity;
                if (variantId !== undefined && variantId !== null) {
                    variantStockById.set(String(variantId), toNumber(qty, 0));
                }
            }

            const mapped = (productsRes?.items ?? []).map((p) => mapProductFromApi(p, variantStockById));
            setProducts(mapped);

            if (!productsRes) {
                const err = productsResult.reason;
                setLoadError(err?.response?.data?.error || err?.message || "Không tải được danh sách sản phẩm");
            }
        } catch (err) {
            setLoadError(err?.response?.data?.error || err?.message || "Không tải được danh sách sản phẩm");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openStorePriceModal = async (variant) => {
        if (!variant?.variantId) return;
        setIsStorePriceModalOpen(true);
        setStorePriceVariant(variant);
        setStorePriceValue(String(variant.price ?? ""));
        setStorePriceError("");
        setStorePriceLoading(true);
        try {
            const res = await listVariantPrices({ variantId: variant.variantId, take: 50, skip: 0 });
            setStorePriceHistory(res.items ?? []);
        } catch (e) {
            setStorePriceHistory([]);
            setStorePriceError(e?.response?.data?.error || e?.response?.data?.message || e.message || "Không tải được lịch sử giá");
        } finally {
            setStorePriceLoading(false);
        }
    };

    const submitStorePrice = async () => {
        if (!storePriceVariant?.variantId) return;
        const priceNum = Number(storePriceValue);
        if (!Number.isFinite(priceNum) || priceNum <= 0) {
            setStorePriceError("Giá phải > 0");
            return;
        }

        setStorePriceError("");
        setStorePriceLoading(true);
        try {
            await setVariantPrice({ variantId: storePriceVariant.variantId, price: priceNum });
            const res = await listVariantPrices({ variantId: storePriceVariant.variantId, take: 50, skip: 0 });
            setStorePriceHistory(res.items ?? []);
            await fetchProducts();
        } catch (e) {
            setStorePriceError(e?.response?.data?.error || e?.response?.data?.message || e.message || "Không đặt được giá");
        } finally {
            setStorePriceLoading(false);
        }
    };

    // Filter products (client-side)
    const filteredProducts = products.filter((product) => {
        const term = searchTerm.toLowerCase();
        const matchSearch =
            product.name.toLowerCase().includes(term) ||
            product.sku.toLowerCase().includes(term) ||
            product.variants.some((v) => String(v.barcode || "").includes(searchTerm));
        const matchCategory = !filters.category || product.category === filters.category;
        const matchBrand = !filters.brand || product.brand === filters.brand;
        const matchStatus = !filters.status || product.status === filters.status;
        return matchSearch && matchCategory && matchBrand && matchStatus;
    });

    // Validate form
    const validateForm = (data, isEdit = false) => {
        const errors = {};

        if (!data.sku.trim()) {
            errors.sku = "SKU là bắt buộc";
        } else if (!isEdit && products.some((p) => p.sku === data.sku)) {
            errors.sku = "SKU đã tồn tại";
        }

        if (!data.name.trim()) {
            errors.name = "Tên sản phẩm là bắt buộc";
        }

        if (!data.unit.trim()) {
            errors.unit = "Đơn vị tính là bắt buộc";
        }

        // Validate variants
        const variantErrors = [];
        const barcodes = new Set();
        data.variants.forEach((variant, index) => {
            const vErrors = {};
            if (!variant.code.trim()) vErrors.code = "Mã biến thể bắt buộc";
            if (!variant.barcode.trim()) {
                vErrors.barcode = "Barcode bắt buộc";
            } else if (barcodes.has(variant.barcode)) {
                vErrors.barcode = "Barcode trùng lặp";
            } else {
                barcodes.add(variant.barcode);
            }
            if (!variant.price || parseFloat(variant.price) <= 0) vErrors.price = "Giá bán phải > 0";
            if (!variant.cost || parseFloat(variant.cost) <= 0) vErrors.cost = "Giá vốn phải > 0";
            if (parseFloat(variant.price) < parseFloat(variant.cost)) {
                vErrors.price = "Giá bán phải >= Giá vốn";
            }
            if (parseFloat(variant.minStock) < 0) vErrors.minStock = "Min stock >= 0";

            if (Object.keys(vErrors).length > 0) {
                variantErrors[index] = vErrors;
            }
        });

        if (variantErrors.length > 0) {
            errors.variants = variantErrors;
        }

        return errors;
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            sku: "",
            name: "",
            category: categories[0],
            brand: brands[0],
            unit: "",
            status: "active",
            variants: [{ id: 1, code: "", barcode: "", price: "", cost: "", minStock: 0, stock: 0 }],
        });
        setFormErrors({});
    };

    // Add variant row
    const addVariant = () => {
        setFormData({
            ...formData,
            variants: [
                ...formData.variants,
                {
                    id: `tmp-${Date.now()}-${formData.variants.length + 1}`,
                    variantId: null,
                    code: "",
                    barcode: "",
                    price: "",
                    cost: "",
                    minStock: 0,
                    stock: 0,
                },
            ],
        });
    };

    // Remove variant row
    const removeVariant = (index) => {
        if (formData.variants.length === 1) return;
        const newVariants = formData.variants.filter((_, i) => i !== index);
        setFormData({ ...formData, variants: newVariants });
    };

    // Update variant field
    const updateVariant = (index, field, value) => {
        const newVariants = [...formData.variants];
        newVariants[index] = { ...newVariants[index], [field]: value };
        setFormData({ ...formData, variants: newVariants });
    };

    // Handle add product
    const handleAddProduct = (e) => {
        (async () => {
            e.preventDefault();
            const errors = validateForm(formData);
            if (Object.keys(errors).length > 0) {
                setFormErrors(errors);
                return;
            }

            try {
                const payload = {
                    sku: formData.sku,
                    name: formData.name,
                    brand: formData.brand,
                    category: formData.category,
                    unit: formData.unit,
                    isActive: formData.status === "active",
                    variants: (formData.variants ?? []).map((v) => ({
                        variantCode: v.code,
                        barcode: v.barcode,
                        price: toNumber(v.price, 0),
                        costPrice: toNumber(v.cost, 0),
                        minStock: toNumber(v.minStock, 0),
                        isActive: true,
                    })),
                };

                const created = await createProduct(payload);
                await fetchProducts();

                setIsAddModalOpen(false);
                resetForm();
                return created;
            } catch (err) {
                setFormErrors({
                    ...formErrors,
                    sku: err?.response?.data?.error || err?.message || "Không tạo được sản phẩm",
                });
            }
        })();
    };

    // Open edit modal
    const handleOpenEditModal = (product) => {
        setSelectedProduct(product);
        setFormData({
            sku: product.sku,
            name: product.name,
            category: product.category,
            brand: product.brand,
            unit: product.unit,
            status: product.status,
            variants: product.variants.map((v) => ({
                ...v,
                variantId: v.variantId ?? v.id,
                price: v.price.toString(),
                cost: v.cost.toString(),
                minStock: v.minStock.toString(),
                stock: v.stock.toString(),
            })),
        });
        setFormErrors({});
        setIsEditModalOpen(true);
    };

    // Handle update product
    const handleUpdateProduct = (e) => {
        (async () => {
            e.preventDefault();
            const errors = validateForm(formData, true);
            if (Object.keys(errors).length > 0) {
                setFormErrors(errors);
                return;
            }

            try {
                const productId = selectedProduct.id;

                await updateProduct(productId, {
                    sku: formData.sku,
                    name: formData.name,
                    brand: formData.brand,
                    category: formData.category,
                    unit: formData.unit,
                    isActive: formData.status === "active",
                });

                const incomingVariantIds = new Set(
                    (formData.variants ?? [])
                        .map((v) => v.variantId)
                        .filter((id) => id !== null && id !== undefined)
                        .map((id) => Number(id))
                        .filter((id) => Number.isFinite(id))
                        .map(String)
                );

                const existingVariantIds = new Set(
                    (selectedProduct.variants ?? [])
                        .map((v) => v.variantId ?? v.id)
                        .filter((id) => id !== null && id !== undefined)
                        .map((id) => Number(id))
                        .filter((id) => Number.isFinite(id))
                        .map(String)
                );

                const removedVariantIds = [];
                for (const id of existingVariantIds) {
                    if (!incomingVariantIds.has(id)) removedVariantIds.push(id);
                }

                // Upsert variants
                for (const v of formData.variants ?? []) {
                    const payload = {
                        variantCode: v.code,
                        barcode: v.barcode,
                        price: toNumber(v.price, 0),
                        costPrice: toNumber(v.cost, 0),
                        minStock: toNumber(v.minStock, 0),
                        isActive: true,
                    };

                    const variantId = v.variantId;
                    if (variantId !== null && variantId !== undefined && Number.isFinite(Number(variantId))) {
                        await updateVariantApi(Number(variantId), payload);
                    } else {
                        await createVariant(productId, payload);
                    }
                }

                // Deactivate removed variants
                for (const id of removedVariantIds) {
                    await updateVariantApi(Number(id), { isActive: false });
                }

                await fetchProducts();

                setIsEditModalOpen(false);
                setSelectedProduct(null);
                resetForm();
            } catch (err) {
                setFormErrors({
                    ...formErrors,
                    name: err?.response?.data?.error || err?.message || "Không cập nhật được sản phẩm",
                });
            }
        })();
    };

    // Handle delete (actually set to inactive)
    const handleOpenDeleteModal = (product) => {
        setSelectedProduct(product);
        setIsDeleteModalOpen(true);
    };

    const handleDeleteProduct = () => {
        (async () => {
            try {
                await updateProduct(selectedProduct.id, { isActive: false });
                setProducts(products.map((p) => (p.id === selectedProduct.id ? { ...p, status: "inactive" } : p)));
                setIsDeleteModalOpen(false);
                setSelectedProduct(null);
            } catch (err) {
                setLoadError(err?.response?.data?.error || err?.message || "Không ngừng bán được sản phẩm");
            }
        })();
    };

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
    };

    // Get total stock across all variants
    const getTotalStock = (product) => {
        return product.variants.reduce((sum, v) => sum + v.stock, 0);
    };

    // Get price range
    const getPriceRange = (product) => {
        const prices = product.variants.map((v) => v.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        return min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`;
    };

    // Render form
    const renderForm = (onSubmit, buttonText) => (
        <form onSubmit={onSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 hide-scrollbar">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1">SKU *</label>
                    <input
                        type="text"
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.sku ? "border-red-500" : ""}`}
                        placeholder="VD: SKU-001"
                    />
                    {formErrors.sku && <p className="text-red-500 text-xs mt-1">{formErrors.sku}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Đơn vị tính *</label>
                    <input
                        type="text"
                        value={formData.unit}
                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                        className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.unit ? "border-red-500" : ""}`}
                        placeholder="VD: Hộp, Lon, Gói"
                    />
                    {formErrors.unit && <p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>}
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium mb-1">Tên sản phẩm *</label>
                <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.name ? "border-red-500" : ""}`}
                    placeholder="VD: Sữa tươi Vinamilk"
                />
                {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Danh mục</label>
                    <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Thương hiệu</label>
                    <select
                        value={formData.brand}
                        onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                        {brands.map((brand) => (
                            <option key={brand} value={brand}>
                                {brand}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Trạng thái</label>
                    <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                        <option value="active">Đang bán</option>
                        <option value="inactive">Ngừng bán</option>
                    </select>
                </div>
            </div>

            {/* Variants Section */}
            <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium flex items-center gap-2">
                        <FaBarcode /> Biến thể sản phẩm
                    </h4>
                    <Button type="button" size="sm" onClick={addVariant}>
                        <FaPlus className="mr-1" /> Thêm biến thể
                    </Button>
                </div>

                <div className="space-y-3">
                    {formData.variants.map((variant, index) => (
                        <div key={index} className="border rounded-lg p-3 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-600">Biến thể #{index + 1}</span>
                                <div className="flex items-center gap-3">
                                    {variant.variantId ? (
                                        <button
                                            type="button"
                                            onClick={() => openStorePriceModal(variant)}
                                            className="text-blue-600 text-sm hover:underline"
                                        >
                                            Giá cửa hàng
                                        </button>
                                    ) : null}
                                    {formData.variants.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeVariant(index)}
                                            className="text-red-500 text-sm hover:underline"
                                        >
                                            Xóa
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Mã biến thể *</label>
                                    <input
                                        type="text"
                                        value={variant.code}
                                        onChange={(e) => updateVariant(index, "code", e.target.value)}
                                        className={`w-full rounded-md border px-2 py-1.5 text-sm ${formErrors.variants?.[index]?.code ? "border-red-500" : ""
                                            }`}
                                        placeholder="VD: SKU-001-1L"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Barcode *</label>
                                    <input
                                        type="text"
                                        value={variant.barcode}
                                        onChange={(e) => updateVariant(index, "barcode", e.target.value)}
                                        className={`w-full rounded-md border px-2 py-1.5 text-sm ${formErrors.variants?.[index]?.barcode ? "border-red-500" : ""
                                            }`}
                                        placeholder="8934673001014"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Giá bán *</label>
                                    <input
                                        type="number"
                                        value={variant.price}
                                        onChange={(e) => updateVariant(index, "price", e.target.value)}
                                        className={`w-full rounded-md border px-2 py-1.5 text-sm ${formErrors.variants?.[index]?.price ? "border-red-500" : ""
                                            }`}
                                        placeholder="0"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Giá vốn *</label>
                                    <input
                                        type="number"
                                        value={variant.cost}
                                        onChange={(e) => updateVariant(index, "cost", e.target.value)}
                                        className={`w-full rounded-md border px-2 py-1.5 text-sm ${formErrors.variants?.[index]?.cost ? "border-red-500" : ""
                                            }`}
                                        placeholder="0"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Tồn kho tối thiểu</label>
                                    <input
                                        type="number"
                                        value={variant.minStock}
                                        onChange={(e) => updateVariant(index, "minStock", e.target.value)}
                                        className="w-full rounded-md border px-2 py-1.5 text-sm"
                                        placeholder="0"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Tồn kho hiện tại</label>
                                    <input
                                        type="number"
                                        value={variant.stock}
                                        onChange={(e) => updateVariant(index, "stock", e.target.value)}
                                        className="w-full rounded-md border px-2 py-1.5 text-sm bg-gray-100"
                                        placeholder="0"
                                        min="0"
                                        readOnly
                                    />
                                </div>
                            </div>

                            {formErrors.variants?.[index] && (
                                <p className="text-red-500 text-xs mt-2">
                                    {Object.values(formErrors.variants[index]).join(", ")}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

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
                    <Header>Quản Lý Sản Phẩm</Header>
                    <span className="italic text-gray-500">Danh sách sản phẩm trong chuỗi cửa hàng</span>
                </div>
                <Button onClick={() => setIsAddModalOpen(true)}>
                    <FaPlus className="mr-2" /> Thêm sản phẩm mới
                </Button>
            </header>

            {loadError && (
                <Card>
                    <CardContent className="p-4 text-sm text-red-600">{loadError}</CardContent>
                </Card>
            )}

            {/* Toolbar */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <SearchBar
                        placeholder="Tìm theo tên, SKU, hoặc barcode..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* View Toggle */}
                <div className="flex border rounded-md overflow-hidden">
                    <button
                        onClick={() => setViewMode("grid")}
                        className={`p-2 ${viewMode === "grid" ? "bg-teal-600 text-white" : "bg-white text-gray-600"}`}
                    >
                        <FaTh />
                    </button>
                    <button
                        onClick={() => setViewMode("table")}
                        className={`p-2 ${viewMode === "table" ? "bg-teal-600 text-white" : "bg-white text-gray-600"}`}
                    >
                        <FaList />
                    </button>
                </div>

                {/* Filter Toggle */}
                <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
                    <FaFilter className="mr-2" /> Bộ lọc
                </Button>
            </div>

            {/* Filters */}
            {showFilters && (
                <Card>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Danh mục</label>
                                <select
                                    value={filters.category}
                                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                >
                                    <option value="">Tất cả</option>
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Thương hiệu</label>
                                <select
                                    value={filters.brand}
                                    onChange={(e) => setFilters({ ...filters, brand: e.target.value })}
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                >
                                    <option value="">Tất cả</option>
                                    {brands.map((brand) => (
                                        <option key={brand} value={brand}>
                                            {brand}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Trạng thái</label>
                                <select
                                    value={filters.status}
                                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                >
                                    <option value="">Tất cả</option>
                                    <option value="active">Đang bán</option>
                                    <option value="inactive">Ngừng bán</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <Button
                                    variant="ghost"
                                    onClick={() => setFilters({ category: "", brand: "", status: "" })}
                                >
                                    Xóa bộ lọc
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Products Grid View */}
            {viewMode === "grid" && (
                <main className="grid grid-cols-4 gap-4">
                    {isLoading && <div className="col-span-4 text-sm text-gray-500">Đang tải sản phẩm...</div>}
                    {filteredProducts.map((product) => (
                        <Card key={product.id} className={product.status === "inactive" ? "opacity-60" : ""}>
                            <CardContent className="flex flex-col items-center space-y-3 p-5">
                                <img src={product.image} alt={product.category} className="w-16 h-16 object-contain" />
                                <h3 className="text-lg font-semibold text-center">{product.name}</h3>
                                <p className="text-sm text-slate-600">{product.category}</p>
                                <p className="text-blue-600 font-medium">{getPriceRange(product)}</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">Tồn: {getTotalStock(product)}</span>
                                    {getStatusBadge(product.status)}
                                </div>
                                <p className="text-xs text-gray-400">{product.variants.length} biến thể</p>
                                <div className="flex space-x-2">
                                    <Button variant="outline" size="sm" onClick={() => handleOpenEditModal(product)}>
                                        <FaEdit className="mr-1" /> Sửa
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleOpenDeleteModal(product)}
                                        disabled={product.status === "inactive"}
                                    >
                                        <FaTrashAlt className="mr-1" /> Ngừng
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </main>
            )}

            {/* Products Table View */}
            {viewMode === "table" && (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left p-4 font-medium text-gray-600">Sản phẩm</th>
                                        <th className="text-left p-4 font-medium text-gray-600">SKU</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Danh mục</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Giá bán</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Tồn kho</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Biến thể</th>
                                        <th className="text-left p-4 font-medium text-gray-600">Trạng thái</th>
                                        <th className="text-center p-4 font-medium text-gray-600">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {isLoading && (
                                        <tr>
                                            <td className="p-4 text-sm text-gray-500" colSpan={8}>
                                                Đang tải sản phẩm...
                                            </td>
                                        </tr>
                                    )}
                                    {filteredProducts.map((product) => (
                                        <tr
                                            key={product.id}
                                            className={`hover:bg-gray-50 ${product.status === "inactive" ? "opacity-60" : ""}`}
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <img src={product.image} alt={product.category} className="w-10 h-10 object-contain" />
                                                    <div>
                                                        <p className="font-medium">{product.name}</p>
                                                        <p className="text-xs text-gray-400">{product.brand}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-gray-600 font-mono text-sm">{product.sku}</td>
                                            <td className="p-4 text-gray-600">{product.category}</td>
                                            <td className="p-4 text-blue-600 font-medium">{getPriceRange(product)}</td>
                                            <td className="p-4">
                                                <span
                                                    className={`font-medium ${getTotalStock(product) < 10 ? "text-red-600" : "text-gray-700"
                                                        }`}
                                                >
                                                    {getTotalStock(product)}
                                                </span>
                                            </td>
                                            <td className="p-4 text-gray-600">{product.variants.length}</td>
                                            <td className="p-4">{getStatusBadge(product.status)}</td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleOpenEditModal(product)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    >
                                                        <FaEdit />
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenDeleteModal(product)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                                        disabled={product.status === "inactive"}
                                                    >
                                                        <FaTrashAlt />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Add Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Thêm sản phẩm mới">
                {renderForm(handleAddProduct, "Lưu sản phẩm")}
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Chỉnh sửa sản phẩm">
                {renderForm(handleUpdateProduct, "Cập nhật")}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Xác nhận ngừng bán">
                <div className="space-y-4">
                    <p>
                        Sản phẩm <strong>{selectedProduct?.name}</strong> sẽ được chuyển sang trạng thái{" "}
                        <span className="text-red-600 font-medium">Ngừng bán</span>.
                    </p>
                    <p className="text-sm text-gray-500">
                        Lưu ý: Sản phẩm đã có giao dịch không thể xóa hoàn toàn, chỉ có thể ngừng bán.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>
                            Hủy
                        </Button>
                        <Button onClick={handleDeleteProduct} className="bg-red-600 hover:bg-red-700 text-white">
                            Ngừng bán
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Store Price Modal */}
            <Modal
                isOpen={isStorePriceModalOpen}
                onClose={() => {
                    setIsStorePriceModalOpen(false);
                    setStorePriceVariant(null);
                    setStorePriceHistory([]);
                    setStorePriceError("");
                    setStorePriceValue("");
                }}
                title="Giá theo cửa hàng"
            >
                <div className="space-y-4">
                    <div>
                        <div className="text-sm text-gray-600">Biến thể</div>
                        <div className="font-medium">{storePriceVariant?.code || storePriceVariant?.barcode || `#${storePriceVariant?.variantId || ""}`}</div>
                    </div>

                    {storePriceError ? (
                        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{storePriceError}</div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3 items-end">
                        <div>
                            <label className="block text-sm font-medium mb-1">Giá bán (cửa hàng hiện tại)</label>
                            <input
                                type="number"
                                value={storePriceValue}
                                onChange={(e) => setStorePriceValue(e.target.value)}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                min="0"
                            />
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={submitStorePrice} disabled={storePriceLoading}>
                                {storePriceLoading ? "Đang lưu..." : "Lưu giá"}
                            </Button>
                        </div>
                    </div>

                    <div className="border rounded-md overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 text-sm font-medium">Lịch sử giá</div>
                        <div className="max-h-64 overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left p-3">Bắt đầu</th>
                                        <th className="text-left p-3">Kết thúc</th>
                                        <th className="text-right p-3">Giá</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {(storePriceHistory ?? []).map((row) => (
                                        <tr key={String(row.id)}>
                                            <td className="p-3 text-gray-700">{row.start_at ? new Date(row.start_at).toLocaleString("vi-VN") : ""}</td>
                                            <td className="p-3 text-gray-700">{row.end_at ? new Date(row.end_at).toLocaleString("vi-VN") : "(đang áp dụng)"}</td>
                                            <td className="p-3 text-right font-medium text-blue-700">{Number(row.price || 0).toLocaleString("vi-VN")}đ</td>
                                        </tr>
                                    ))}
                                    {!storePriceLoading && (storePriceHistory?.length ?? 0) === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="p-4 text-center text-gray-500">
                                                Chưa có giá theo cửa hàng
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}