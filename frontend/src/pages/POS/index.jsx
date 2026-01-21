import React, { useState, useEffect } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import Modal from "../../components/ui/modal";
import {
    FaShoppingCart, FaSearch, FaPlus, FaMinus, FaTrash, FaCreditCard, FaMoneyBillWave,
    FaPause, FaHistory, FaUserAlt, FaTags, FaReceipt, FaBarcode, FaExclamationTriangle, FaCashRegister, FaLock
} from "react-icons/fa";
import { useShift } from "../../components/shift/ShiftManager";

// Dummy products for POS
const posProducts = [
    { id: 1, sku: "SKU-001", barcode: "8934673001014", name: "Sữa tươi Vinamilk 1L", price: 35000, stock: 50, image: "🥛", category: "Đồ uống" },
    { id: 2, sku: "SKU-002", barcode: "5449000000996", name: "Coca-Cola 330ml", price: 12000, stock: 100, image: "🥤", category: "Đồ uống" },
    { id: 3, sku: "SKU-003", barcode: "8935024111111", name: "Bánh Oreo", price: 25000, stock: 30, image: "🍪", category: "Bánh kẹo" },
    { id: 4, sku: "SKU-004", barcode: "8934563001012", name: "Mì gói Hảo Hảo", price: 5000, stock: 200, image: "🍜", category: "Thực phẩm" },
    { id: 5, sku: "SKU-005", barcode: "6920152410012", name: "Nước suối Aquafina", price: 8000, stock: 80, image: "💧", category: "Đồ uống" },
    { id: 6, sku: "SKU-006", barcode: "8934680014129", name: "Bánh mì sandwich", price: 20000, stock: 25, image: "🍞", category: "Thực phẩm" },
    { id: 7, sku: "SKU-007", barcode: "8934680014130", name: "Trà xanh C2", price: 10000, stock: 60, image: "🍵", category: "Đồ uống" },
    { id: 8, sku: "SKU-008", barcode: "8934680014131", name: "Snack Lay's", price: 15000, stock: 40, image: "🥔", category: "Bánh kẹo" },
];

// Dummy promotions
const promotions = [
    { id: 1, code: "SALE10", name: "Giảm 10%", type: "percent", value: 10, minOrder: 50000 },
    { id: 2, code: "SAVE20K", name: "Giảm 20.000đ", type: "fixed", value: 20000, minOrder: 100000 },
];

// Dummy customers
const customers = [
    { id: 1, name: "Khách lẻ", phone: "" },
    { id: 2, name: "Nguyễn Văn A", phone: "0901234567" },
    { id: 3, name: "Trần Thị B", phone: "0912345678" },
];

const paymentMethods = [
    { id: "cash", name: "Tiền mặt", icon: <FaMoneyBillWave /> },
    { id: "card", name: "Thẻ", icon: <FaCreditCard /> },
];

const POS = () => {
    // Shift management
    const { isShiftOpen, requestOpenModal } = useShift();

    const [searchTerm, setSearchTerm] = useState("");
    const [cart, setCart] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(customers[0]);
    const [selectedPromotion, setSelectedPromotion] = useState(null);
    const [filterCategory, setFilterCategory] = useState("");

    // Modal states
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
    const [isHeldOrdersModalOpen, setIsHeldOrdersModalOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);

    // Payment state
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [cashReceived, setCashReceived] = useState("");
    const [holdNote, setHoldNote] = useState("");

    // Held orders
    const [heldOrders, setHeldOrders] = useState([]);

    // Get unique categories
    const categories = [...new Set(posProducts.map((p) => p.category))];

    // Filter products
    const filteredProducts = posProducts.filter((product) => {
        const matchSearch =
            product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.barcode.includes(searchTerm) ||
            product.sku.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCategory = !filterCategory || product.category === filterCategory;
        return matchSearch && matchCategory;
    });

    // Add to cart
    const addToCart = (product) => {
        const existing = cart.find((item) => item.id === product.id);
        if (existing) {
            if (existing.quantity >= product.stock) {
                alert("Không đủ tồn kho!");
                return;
            }
            setCart(cart.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)));
        } else {
            if (product.stock <= 0) {
                alert("Sản phẩm đã hết hàng!");
                return;
            }
            setCart([...cart, { ...product, quantity: 1 }]);
        }
    };

    // Update quantity
    const updateQuantity = (productId, delta) => {
        const product = posProducts.find((p) => p.id === productId);
        setCart(
            cart
                .map((item) => {
                    if (item.id === productId) {
                        const newQty = item.quantity + delta;
                        if (newQty > product.stock) {
                            alert("Không đủ tồn kho!");
                            return item;
                        }
                        return { ...item, quantity: newQty };
                    }
                    return item;
                })
                .filter((item) => item.quantity > 0)
        );
    };

    // Remove from cart
    const removeFromCart = (productId) => {
        setCart(cart.filter((item) => item.id !== productId));
    };

    // Clear cart
    const clearCart = () => {
        setCart([]);
        setSelectedPromotion(null);
    };

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = selectedPromotion
        ? selectedPromotion.type === "percent"
            ? (subtotal * selectedPromotion.value) / 100
            : selectedPromotion.value
        : 0;
    const total = subtotal - discount;
    const change = cashReceived ? parseFloat(cashReceived) - total : 0;

    // Apply promotion
    const applyPromotion = (promo) => {
        if (subtotal < promo.minOrder) {
            alert(`Đơn hàng tối thiểu ${formatCurrency(promo.minOrder)} để áp dụng khuyến mãi này`);
            return;
        }
        setSelectedPromotion(promo);
        setIsPromotionModalOpen(false);
    };

    // Hold order
    const holdOrder = () => {
        if (cart.length === 0) return;
        const heldOrder = {
            id: Date.now(),
            items: [...cart],
            customer: selectedCustomer,
            promotion: selectedPromotion,
            note: holdNote,
            time: new Date().toISOString(),
        };
        setHeldOrders([...heldOrders, heldOrder]);
        clearCart();
        setHoldNote("");
        setIsHoldModalOpen(false);
    };

    // Restore held order
    const restoreHeldOrder = (order) => {
        setCart(order.items);
        setSelectedCustomer(order.customer);
        setSelectedPromotion(order.promotion);
        setHeldOrders(heldOrders.filter((o) => o.id !== order.id));
        setIsHeldOrdersModalOpen(false);
    };

    // Complete payment
    const completePayment = () => {
        if (paymentMethod === "cash" && parseFloat(cashReceived) < total) {
            alert("Số tiền nhận chưa đủ!");
            return;
        }

        // Here you would call API to save the transaction
        alert(`Thanh toán thành công!\nTổng: ${formatCurrency(total)}\nPhương thức: ${paymentMethod === "cash" ? "Tiền mặt" : "Thẻ"}`);

        clearCart();
        setCashReceived("");
        setIsPaymentModalOpen(false);
    };

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
    };

    // Format time
    const formatTime = (isoString) => {
        return new Date(isoString).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    };

    // Handle barcode scan (keyboard input)
    useEffect(() => {
        const handleKeyDown = (e) => {
            // If typing in an input, don't intercept
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

            // Enter key after barcode scan
            if (e.key === "Enter" && searchTerm) {
                const product = posProducts.find((p) => p.barcode === searchTerm);
                if (product) {
                    addToCart(product);
                    setSearchTerm("");
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [searchTerm]);

    return (
        <div className="h-[calc(100vh-120px)] flex gap-4 relative">
            {/* Gray Overlay when shift not open */}
            {!isShiftOpen && (
                <div className="absolute inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <Card className="max-w-md w-full mx-4">
                        <CardContent className="p-6">
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center">
                                    <FaLock className="text-orange-600 text-3xl" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-2">Vui lòng mở ca làm việc</h3>
                                    <p className="text-gray-600 text-sm">
                                        Bạn cần mở ca làm việc trước khi sử dụng POS
                                    </p>
                                </div>
                                <div className="w-full p-4 bg-blue-50 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <FaCashRegister className="text-blue-600 text-xl mt-1" />
                                        <div className="text-left text-sm text-blue-800">
                                            <p className="font-medium mb-1">Quy trình mở ca:</p>
                                            <ol className="list-decimal list-inside space-y-1">
                                                <li>Nhập số tiền đầu ca</li>
                                                <li>Bắt đầu phục vụ khách hàng</li>
                                                <li>Đóng ca và đối soát tiền cuối ca</li>
                                            </ol>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    onClick={requestOpenModal}
                                    className="w-full bg-teal-600 hover:bg-teal-700"
                                >
                                    <FaCashRegister className="mr-2" />
                                    Mở ca làm việc
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* LEFT: Product List */}
            <div className="flex-1 flex flex-col">
                {/* Search & Filter */}
                <div className="mb-4 flex gap-3">
                    <div className="flex-1 relative">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Tìm sản phẩm, quét barcode..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                ×
                            </button>
                        )}
                    </div>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="rounded-lg border px-3 py-2"
                    >
                        <option value="">Tất cả</option>
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                {/* Products Grid */}
                <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-4 gap-3">
                        {filteredProducts.map((product) => (
                            <button
                                key={product.id}
                                onClick={() => addToCart(product)}
                                disabled={product.stock <= 0}
                                className={`p-4 rounded-lg border text-left transition-all hover:shadow-md hover:border-teal-500 ${product.stock <= 0 ? "opacity-50 cursor-not-allowed bg-gray-100" : "bg-white"
                                    }`}
                            >
                                <div className="text-3xl mb-2">{product.image}</div>
                                <p className="font-medium text-sm line-clamp-2">{product.name}</p>
                                <p className="text-teal-600 font-bold mt-1">{formatCurrency(product.price)}</p>
                                <p className={`text-xs mt-1 ${product.stock < 10 ? "text-red-500" : "text-gray-500"}`}>
                                    Còn: {product.stock}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT: Cart */}
            <div className="w-96 flex flex-col bg-white rounded-lg border shadow-sm">
                {/* Cart Header */}
                <div className="p-4 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FaShoppingCart className="text-teal-600" />
                        <h2 className="font-bold">Giỏ hàng</h2>
                        <Badge className="bg-teal-100 text-teal-700">{cart.length}</Badge>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsHeldOrdersModalOpen(true)}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg relative"
                            title="Đơn đang giữ"
                        >
                            <FaHistory />
                            {heldOrders.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                                    {heldOrders.length}
                                </span>
                            )}
                        </button>
                        <button onClick={clearCart} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Xóa giỏ hàng">
                            <FaTrash />
                        </button>
                    </div>
                </div>

                {/* Customer & Promotion */}
                <div className="p-3 border-b space-y-2">
                    <button
                        onClick={() => setIsCustomerModalOpen(true)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg border hover:bg-gray-50 text-sm"
                    >
                        <FaUserAlt className="text-gray-400" />
                        <span>{selectedCustomer.name}</span>
                    </button>
                    <button
                        onClick={() => setIsPromotionModalOpen(true)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg border hover:bg-gray-50 text-sm"
                    >
                        <FaTags className={selectedPromotion ? "text-teal-500" : "text-gray-400"} />
                        <span>{selectedPromotion ? selectedPromotion.name : "Thêm khuyến mãi"}</span>
                        {selectedPromotion && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPromotion(null);
                                }}
                                className="ml-auto text-red-500"
                            >
                                ×
                            </button>
                        )}
                    </button>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <FaShoppingCart className="text-4xl mb-2" />
                            <p>Giỏ hàng trống</p>
                        </div>
                    ) : (
                        cart.map((item) => (
                            <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                                <span className="text-2xl">{item.image}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{item.name}</p>
                                    <p className="text-teal-600 text-sm">{formatCurrency(item.price)}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => updateQuantity(item.id, -1)}
                                        className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                                    >
                                        <FaMinus className="text-xs" />
                                    </button>
                                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity(item.id, 1)}
                                        className="w-7 h-7 rounded-full bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center"
                                    >
                                        <FaPlus className="text-xs" />
                                    </button>
                                </div>
                                <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                    <FaTrash className="text-sm" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Cart Summary */}
                <div className="p-4 border-t space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>Tạm tính:</span>
                        <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {selectedPromotion && (
                        <div className="flex justify-between text-sm text-teal-600">
                            <span>Giảm giá ({selectedPromotion.name}):</span>
                            <span>-{formatCurrency(discount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                        <span>Tổng cộng:</span>
                        <span className="text-teal-600">{formatCurrency(total)}</span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="p-4 border-t grid grid-cols-2 gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setIsHoldModalOpen(true)}
                        disabled={cart.length === 0}
                        className="flex items-center justify-center gap-2"
                    >
                        <FaPause /> Giữ đơn
                    </Button>
                    <Button
                        onClick={() => setIsPaymentModalOpen(true)}
                        disabled={cart.length === 0}
                        className="flex items-center justify-center gap-2"
                    >
                        <FaReceipt /> Thanh toán
                    </Button>
                </div>
            </div>

            {/* Payment Modal */}
            <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Thanh toán">
                <div className="space-y-4">
                    {/* Order Summary */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex justify-between mb-2">
                            <span>Tạm tính:</span>
                            <span>{formatCurrency(subtotal)}</span>
                        </div>
                        {selectedPromotion && (
                            <div className="flex justify-between text-teal-600 mb-2">
                                <span>Giảm giá:</span>
                                <span>-{formatCurrency(discount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-lg pt-2 border-t">
                            <span>Tổng cộng:</span>
                            <span className="text-teal-600">{formatCurrency(total)}</span>
                        </div>
                    </div>

                    {/* Payment Method */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Phương thức thanh toán</label>
                        <div className="grid grid-cols-2 gap-2">
                            {paymentMethods.map((method) => (
                                <button
                                    key={method.id}
                                    onClick={() => setPaymentMethod(method.id)}
                                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === method.id ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:border-gray-300"
                                        }`}
                                >
                                    <span className="text-2xl">{method.icon}</span>
                                    <span className="font-medium">{method.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Cash Input */}
                    {paymentMethod === "cash" && (
                        <div>
                            <label className="block text-sm font-medium mb-1">Tiền nhận</label>
                            <input
                                type="number"
                                value={cashReceived}
                                onChange={(e) => setCashReceived(e.target.value)}
                                className="w-full rounded-md border px-3 py-2 text-lg"
                                placeholder="0"
                                min={total}
                            />
                            {cashReceived && parseFloat(cashReceived) >= total && (
                                <p className="mt-2 text-green-600 font-medium">
                                    Tiền thối: {formatCurrency(change)}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="pt-4 flex justify-end gap-2 border-t">
                        <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                            Hủy
                        </Button>
                        <Button onClick={completePayment} className="bg-teal-600 hover:bg-teal-700">
                            <FaReceipt className="mr-2" /> Hoàn tất
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Hold Order Modal */}
            <Modal isOpen={isHoldModalOpen} onClose={() => setIsHoldModalOpen(false)} title="Tạm giữ đơn hàng">
                <div className="space-y-4">
                    <div className="p-3 bg-orange-50 rounded-lg flex items-center gap-2">
                        <FaPause className="text-orange-600" />
                        <p className="text-sm text-orange-800">Đơn hàng sẽ được giữ và có thể khôi phục sau</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Ghi chú</label>
                        <textarea
                            value={holdNote}
                            onChange={(e) => setHoldNote(e.target.value)}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            rows={2}
                            placeholder="VD: Khách đợi lấy thêm đồ..."
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-2 border-t">
                        <Button variant="outline" onClick={() => setIsHoldModalOpen(false)}>
                            Hủy
                        </Button>
                        <Button onClick={holdOrder} className="bg-orange-600 hover:bg-orange-700">
                            Giữ đơn
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Held Orders Modal */}
            <Modal isOpen={isHeldOrdersModalOpen} onClose={() => setIsHeldOrdersModalOpen(false)} title="Đơn đang giữ">
                <div className="space-y-3 max-h-80 overflow-y-auto">
                    {heldOrders.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Không có đơn nào đang giữ</p>
                    ) : (
                        heldOrders.map((order) => (
                            <div key={order.id} className="p-3 border rounded-lg hover:bg-gray-50">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="font-medium">{order.customer.name}</p>
                                        <p className="text-xs text-gray-500">{formatTime(order.time)}</p>
                                    </div>
                                    <Badge className="bg-orange-100 text-orange-700">{order.items.length} sp</Badge>
                                </div>
                                {order.note && <p className="text-sm text-gray-600 mb-2">"{order.note}"</p>}
                                <div className="flex justify-between items-center pt-2 border-t">
                                    <span className="font-bold text-teal-600">
                                        {formatCurrency(order.items.reduce((s, i) => s + i.price * i.quantity, 0))}
                                    </span>
                                    <Button size="sm" onClick={() => restoreHeldOrder(order)}>
                                        Khôi phục
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Modal>

            {/* Customer Modal */}
            <Modal isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)} title="Chọn khách hàng">
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {customers.map((customer) => (
                        <button
                            key={customer.id}
                            onClick={() => {
                                setSelectedCustomer(customer);
                                setIsCustomerModalOpen(false);
                            }}
                            className={`w-full p-3 rounded-lg border text-left hover:bg-gray-50 ${selectedCustomer.id === customer.id ? "border-teal-500 bg-teal-50" : ""
                                }`}
                        >
                            <p className="font-medium">{customer.name}</p>
                            {customer.phone && <p className="text-sm text-gray-500">{customer.phone}</p>}
                        </button>
                    ))}
                </div>
            </Modal>

            {/* Promotion Modal */}
            <Modal isOpen={isPromotionModalOpen} onClose={() => setIsPromotionModalOpen(false)} title="Chọn khuyến mãi">
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {promotions.map((promo) => (
                        <button
                            key={promo.id}
                            onClick={() => applyPromotion(promo)}
                            className="w-full p-3 rounded-lg border text-left hover:bg-gray-50"
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{promo.name}</p>
                                    <p className="text-xs text-gray-500">Mã: {promo.code}</p>
                                </div>
                                <Badge className="bg-teal-100 text-teal-700">
                                    {promo.type === "percent" ? `-${promo.value}%` : `-${formatCurrency(promo.value)}`}
                                </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Đơn tối thiểu: {formatCurrency(promo.minOrder)}</p>
                        </button>
                    ))}
                </div>
            </Modal>
        </div>
    );
};

export default POS;
