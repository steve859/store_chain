import React, { useState, useEffect } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { FaUpload, FaPaperPlane, FaEye } from "react-icons/fa";
import Modal from "../../components/ui/modal";

// Default complaint reasons
const complaintReasons = [
    "Vi phạm quy định công ty",
    "Trễ giờ làm việc",
    "Thái độ không phù hợp",
    "Không hoàn thành công việc",
    "Vấn đề về lương thưởng",
    "Môi trường làm việc",
    "Quấy rối",
    "Khác",
];

export default function Complaints() {
    const [formData, setFormData] = useState({
        reason: "",
        description: "",
        image: null,
    });
    const [imagePreview, setImagePreview] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [myComplaints, setMyComplaints] = useState([]);
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

    // Load user's complaints
    useEffect(() => {
        loadMyComplaints();
    }, []);

    const loadMyComplaints = () => {
        const allComplaints = JSON.parse(localStorage.getItem("complaints") || "[]");
        // Filter complaints by current employee (mock - would use real user session)
        const userComplaints = allComplaints.filter(
            (c) => c.employeeName === "Employee User"
        );
        setMyComplaints(userComplaints);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData({ ...formData, image: file });

            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Simulate API call
        setTimeout(() => {
            // Store complaints in localStorage for demo
            const existingComplaints = JSON.parse(
                localStorage.getItem("complaints") || "[]"
            );
            const newComplaint = {
                id: `CPL-${String(existingComplaints.length + 1).padStart(3, "0")}`,
                storeName: "Cửa hàng Q1", // Mock data - would come from user session
                employeeName: "Employee User", // Mock data - would come from user session
                reason: formData.reason,
                description: formData.description,
                image: imagePreview,
                date: new Date().toISOString(),
                status: "Chờ xử lý",
            };

            existingComplaints.push(newComplaint);
            localStorage.setItem("complaints", JSON.stringify(existingComplaints));

            setIsSubmitting(false);
            alert("Đã gửi khiếu nại thành công!");

            // Reset form
            setFormData({
                reason: "",
                description: "",
                image: null,
            });
            setImagePreview(null);

            // Reload complaints
            loadMyComplaints();
        }, 1000);
    };

    const handleRemoveImage = () => {
        setFormData({ ...formData, image: null });
        setImagePreview(null);
    };

    const handleViewDetails = (complaint) => {
        setSelectedComplaint(complaint);
        setIsDetailsModalOpen(true);
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("vi-VN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "Chờ xử lý":
                return "bg-yellow-100 text-yellow-800";
            case "Đang xử lý":
                return "bg-blue-100 text-blue-800";
            case "Đã giải quyết":
                return "bg-green-100 text-green-800";
            case "Từ chối":
                return "bg-red-100 text-red-800";
            default:
                return "bg-gray-100 text-gray-800";
        }
    };

    return (
        <div className="space-y-6">
            <header>
                <Header>Khiếu Nại</Header>
                <span className="text-sm text-slate-600 italic">
                    Gửi khiếu nại về vấn đề trong công việc
                </span>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Complaint Form */}
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-lg font-semibold mb-4">Gửi khiếu nại mới</h2>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Reason Dropdown */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Lý do khiếu nại <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={formData.reason}
                                    onChange={(e) =>
                                        setFormData({ ...formData, reason: e.target.value })
                                    }
                                    className="w-full h-10 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                                >
                                    <option value="">-- Chọn lý do --</option>
                                    {complaintReasons.map((reason, index) => (
                                        <option key={index} value={reason}>
                                            {reason}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Chi tiết khiếu nại <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    required
                                    rows={4}
                                    placeholder="Vui lòng mô tả chi tiết về vấn đề của bạn..."
                                    value={formData.description}
                                    onChange={(e) =>
                                        setFormData({ ...formData, description: e.target.value })
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                                />
                                <div className="text-xs text-slate-500">
                                    {formData.description.length} ký tự
                                </div>
                            </div>

                            {/* Image Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Hình ảnh minh họa (không bắt buộc)
                                </label>

                                {!imagePreview ? (
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-teal-500 transition-colors">
                                        <input
                                            type="file"
                                            id="image-upload"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                        <label
                                            htmlFor="image-upload"
                                            className="cursor-pointer flex flex-col items-center gap-2"
                                        >
                                            <FaUpload className="text-gray-400 text-2xl" />
                                            <span className="text-sm text-gray-600">
                                                Nhấp để tải lên
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                PNG, JPG, GIF
                                            </span>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="relative border rounded-lg p-3 bg-gray-50">
                                        <img
                                            src={imagePreview}
                                            alt="Preview"
                                            className="max-h-40 mx-auto rounded-lg shadow-sm"
                                        />
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            onClick={handleRemoveImage}
                                            className="absolute top-1 right-1 text-xs px-2 py-1"
                                        >
                                            Xóa
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Submit Button */}
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setFormData({ reason: "", description: "", image: null });
                                        setImagePreview(null);
                                    }}
                                >
                                    Hủy bỏ
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex items-center gap-2"
                                >
                                    <FaPaperPlane />
                                    {isSubmitting ? "Đang gửi..." : "Gửi khiếu nại"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Complaint History */}
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-lg font-semibold mb-4">
                            Khiếu nại của bạn ({myComplaints.length})
                        </h2>
                        <div className="space-y-3 max-h-[600px] overflow-y-auto">
                            {myComplaints.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 text-sm">
                                    Bạn chưa gửi khiếu nại nào
                                </div>
                            ) : (
                                myComplaints.map((complaint) => (
                                    <div
                                        key={complaint.id}
                                        className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-sm">
                                                        {complaint.id}
                                                    </span>
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                                            complaint.status
                                                        )}`}
                                                    >
                                                        {complaint.status}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-semibold text-gray-800">
                                                    {complaint.reason}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {formatDate(complaint.date)}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                onClick={() => handleViewDetails(complaint)}
                                                title="Xem chi tiết"
                                                className="text-xs px-2"
                                            >
                                                <FaEye />
                                            </Button>
                                        </div>
                                        <p className="text-sm text-slate-600 line-clamp-2">
                                            {complaint.description}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Details Modal */}
            <Modal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                title={`Chi tiết khiếu nại - ${selectedComplaint?.id || ""}`}
                className="max-w-3xl"
            >
                {selectedComplaint && (
                    <div className="max-h-[calc(100vh-12rem)] overflow-y-auto space-y-6 pr-2">
                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-sm text-slate-600">ID:</span>
                                <p className="font-medium">{selectedComplaint.id}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-sm text-slate-600">Trạng thái:</span>
                                <div>
                                    <span
                                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                            selectedComplaint.status
                                        )}`}
                                    >
                                        {selectedComplaint.status}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-1 col-span-2">
                                <span className="text-sm text-slate-600">Ngày gửi:</span>
                                <p className="font-medium">
                                    {formatDate(selectedComplaint.date)}
                                </p>
                            </div>
                        </div>

                        {/* Reason */}
                        <div className="space-y-2">
                            <h3 className="font-semibold text-lg">Lý do khiếu nại</h3>
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <p className="text-sm">{selectedComplaint.reason}</p>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <h3 className="font-semibold text-lg">Chi tiết</h3>
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <p className="text-sm whitespace-pre-wrap">
                                    {selectedComplaint.description}
                                </p>
                            </div>
                        </div>

                        {/* Image */}
                        {selectedComplaint.image && (
                            <div className="space-y-2">
                                <h3 className="font-semibold text-lg">Hình ảnh minh họa</h3>
                                <div className="border rounded-lg p-4 bg-gray-50">
                                    <img
                                        src={selectedComplaint.image}
                                        alt="Complaint attachment"
                                        className="max-h-96 mx-auto rounded-lg shadow-sm"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="pt-4 flex justify-end border-t sticky bottom-0 bg-white">
                            <Button
                                variant="outline"
                                onClick={() => setIsDetailsModalOpen(false)}
                            >
                                Đóng
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
