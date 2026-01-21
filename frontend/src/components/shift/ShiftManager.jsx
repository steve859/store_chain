import React, { useState, useEffect, createContext, useContext } from "react";
import Modal from "../ui/modal";
import { Button } from "../ui/button";
import { FaCashRegister, FaSignOutAlt, FaExclamationTriangle } from "react-icons/fa";

// Shift Context for global state
const ShiftContext = createContext(null);

export const useShift = () => {
    const context = useContext(ShiftContext);
    if (!context) {
        throw new Error("useShift must be used within ShiftProvider");
    }
    return context;
};

// Shift Provider Component
export const ShiftProvider = ({ children }) => {
    const [isShiftOpen, setIsShiftOpen] = useState(false);
    const [shiftData, setShiftData] = useState(null);
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);

    // Check if there's an active shift on mount
    useEffect(() => {
        const savedShift = localStorage.getItem("activeShift");
        if (savedShift) {
            const shift = JSON.parse(savedShift);
            setShiftData(shift);
            setIsShiftOpen(true);
        }
    }, []);

    const openShift = (startingCash) => {
        const shift = {
            id: Date.now(),
            cashier: localStorage.getItem("userEmail") || "Cashier",
            startTime: new Date().toISOString(),
            startingCash: parseFloat(startingCash),
            transactions: [],
            totalSales: 0,
        };
        setShiftData(shift);
        setIsShiftOpen(true);
        localStorage.setItem("activeShift", JSON.stringify(shift));
    };

    const closeShift = (actualCash, note) => {
        const closedShift = {
            ...shiftData,
            endTime: new Date().toISOString(),
            actualCash: parseFloat(actualCash),
            expectedCash: shiftData.startingCash + shiftData.totalSales,
            difference: parseFloat(actualCash) - (shiftData.startingCash + shiftData.totalSales),
            note: note,
        };

        // Save to shift history
        const history = JSON.parse(localStorage.getItem("shiftHistory") || "[]");
        history.push(closedShift);
        localStorage.setItem("shiftHistory", JSON.stringify(history));

        // Clear active shift
        localStorage.removeItem("activeShift");
        setShiftData(null);
        setIsShiftOpen(false);
    };

    const addTransaction = (amount) => {
        if (shiftData) {
            const updated = {
                ...shiftData,
                totalSales: shiftData.totalSales + amount,
                transactions: [...shiftData.transactions, { amount, time: new Date().toISOString() }],
            };
            setShiftData(updated);
            localStorage.setItem("activeShift", JSON.stringify(updated));
        }
    };

    const requestOpenModal = () => setShowOpenModal(true);
    const requestCloseModal = () => setShowCloseModal(true);

    return (
        <ShiftContext.Provider
            value={{
                isShiftOpen,
                shiftData,
                openShift,
                closeShift,
                addTransaction,
                requestOpenModal,
                requestCloseModal,
            }}
        >
            {children}
            <OpenShiftModal isOpen={showOpenModal} onClose={() => setShowOpenModal(false)} onOpen={openShift} />
            <CloseShiftModal
                isOpen={showCloseModal}
                onClose={() => setShowCloseModal(false)}
                onCloseShift={closeShift}
                shiftData={shiftData}
            />
        </ShiftContext.Provider>
    );
};

// Open Shift Modal
const OpenShiftModal = ({ isOpen, onClose, onOpen }) => {
    const [startingCash, setStartingCash] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        setError("");

        if (!startingCash || isNaN(parseFloat(startingCash))) {
            setError("Vui lòng nhập số tiền hợp lệ");
            return;
        }

        if (parseFloat(startingCash) < 0) {
            setError("Số tiền không được âm");
            return;
        }

        onOpen(startingCash);
        setStartingCash("");
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Mở ca làm việc">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                    <FaCashRegister className="text-blue-600 text-2xl" />
                    <div>
                        <p className="font-medium text-blue-800">Bắt đầu ca làm việc</p>
                        <p className="text-sm text-blue-600">Nhập số tiền đầu ca để bắt đầu</p>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Tiền đầu ca *</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={startingCash}
                            onChange={(e) => setStartingCash(e.target.value)}
                            className={`w-full rounded-md border px-3 py-2 text-sm pr-12 ${error ? "border-red-500" : ""}`}
                            placeholder="0"
                            min="0"
                            step="1000"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">đ</span>
                    </div>
                    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Hủy
                    </Button>
                    <Button type="submit">Mở ca</Button>
                </div>
            </form>
        </Modal>
    );
};

// Close Shift Modal
const CloseShiftModal = ({ isOpen, onClose, onCloseShift, shiftData }) => {
    const [actualCash, setActualCash] = useState("");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");

    const expectedCash = shiftData ? shiftData.startingCash + shiftData.totalSales : 0;
    const difference = actualCash ? parseFloat(actualCash) - expectedCash : 0;

    const handleSubmit = (e) => {
        e.preventDefault();
        setError("");

        if (!actualCash || isNaN(parseFloat(actualCash))) {
            setError("Vui lòng nhập số tiền thực tế");
            return;
        }

        if (parseFloat(actualCash) < 0) {
            setError("Số tiền không được âm");
            return;
        }

        // Warn if big difference
        if (Math.abs(difference) > 100000 && !note.trim()) {
            setError("Chênh lệch lớn (>100.000đ), vui lòng nhập ghi chú");
            return;
        }

        onCloseShift(actualCash, note);
        setActualCash("");
        setNote("");
        onClose();
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
    };

    const formatTime = (isoString) => {
        return new Date(isoString).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (!shiftData) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Đóng ca làm việc">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Shift Summary */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium text-gray-800">Thông tin ca</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <p className="text-gray-600">Bắt đầu:</p>
                        <p className="font-medium">{formatTime(shiftData.startTime)}</p>
                        <p className="text-gray-600">Tiền đầu ca:</p>
                        <p className="font-medium">{formatCurrency(shiftData.startingCash)}</p>
                        <p className="text-gray-600">Doanh thu:</p>
                        <p className="font-medium text-green-600">{formatCurrency(shiftData.totalSales)}</p>
                        <p className="text-gray-600">Số giao dịch:</p>
                        <p className="font-medium">{shiftData.transactions.length}</p>
                    </div>
                    <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between items-center">
                            <span className="font-medium">Tiền dự kiến:</span>
                            <span className="text-lg font-bold text-blue-600">{formatCurrency(expectedCash)}</span>
                        </div>
                    </div>
                </div>

                {/* Actual Cash Input */}
                <div>
                    <label className="block text-sm font-medium mb-1">Tiền thực tế đếm được *</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={actualCash}
                            onChange={(e) => setActualCash(e.target.value)}
                            className={`w-full rounded-md border px-3 py-2 text-sm pr-12 ${error ? "border-red-500" : ""}`}
                            placeholder="0"
                            min="0"
                            step="1000"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">đ</span>
                    </div>
                </div>

                {/* Difference Display */}
                {actualCash && (
                    <div
                        className={`flex items-center gap-2 p-3 rounded-lg ${Math.abs(difference) > 10000
                                ? "bg-red-50 text-red-700"
                                : difference === 0
                                    ? "bg-green-50 text-green-700"
                                    : "bg-yellow-50 text-yellow-700"
                            }`}
                    >
                        {Math.abs(difference) > 10000 && <FaExclamationTriangle />}
                        <span>
                            Chênh lệch:{" "}
                            <strong>
                                {difference >= 0 ? "+" : ""}
                                {formatCurrency(difference)}
                            </strong>
                        </span>
                    </div>
                )}

                {/* Note */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Ghi chú {Math.abs(difference) > 100000 && "*"}
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Giải thích chênh lệch (nếu có)..."
                    />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Hủy
                    </Button>
                    <Button type="submit" className="bg-red-600 hover:bg-red-700">
                        <FaSignOutAlt className="mr-2" />
                        Đóng ca
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

// Shift Status Bar Component (to show in POS or header)
export const ShiftStatusBar = () => {
    const { isShiftOpen, shiftData, requestOpenModal, requestCloseModal } = useShift();

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
    };

    if (!isShiftOpen) {
        return (
            <div className="flex items-center gap-2 p-2 bg-orange-100 rounded-lg">
                <FaExclamationTriangle className="text-orange-600" />
                <span className="text-sm text-orange-800">Chưa mở ca</span>
                <Button size="sm" onClick={requestOpenModal}>
                    Mở ca
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-4 p-2 bg-green-100 rounded-lg">
            <div className="flex items-center gap-2">
                <FaCashRegister className="text-green-600" />
                <span className="text-sm text-green-800">Ca đang mở</span>
            </div>
            <div className="text-sm">
                <span className="text-gray-600">Doanh thu: </span>
                <span className="font-medium text-green-700">{formatCurrency(shiftData?.totalSales || 0)}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={requestCloseModal} className="text-red-600 hover:bg-red-50">
                Đóng ca
            </Button>
        </div>
    );
};

export default ShiftProvider;
