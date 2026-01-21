import React, { useMemo, useState, useEffect } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import { FaEye, FaTrashAlt } from "react-icons/fa";
import Modal from "../../components/ui/modal";

export default function ComplaintsAdmin() {
    const [complaints, setComplaints] = useState([]);
    const [query, setQuery] = useState("");
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [selectedComplaint, setSelectedComplaint] = useState(null);

    // Load complaints from localStorage with dummy data
    useEffect(() => {
        let storedComplaints = JSON.parse(localStorage.getItem("complaints") || "[]");

        // Add dummy data if no complaints exist
        if (storedComplaints.length === 0) {
            storedComplaints = [
                {
                    id: "CPL-001",
                    storeName: "Cửa hàng Q1",
                    employeeName: "Nguyễn Văn A",
                    reason: "Trễ giờ làm việc",
                    description: "Nhân viên thường xuyên đến muộn 15-20 phút mỗi ngày trong tuần qua. Điều này ảnh hưởng đến hoạt động của cửa hàng.",
                    image: null,
                    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    status: "Chờ xử lý",
                },
                {
                    id: "CPL-002",
                    storeName: "Cửa hàng Q2",
                    employeeName: "Trần Thị B",
                    reason: "Thái độ không phù hợp",
                    description: "Nhân viên có thái độ không tốt với khách hàng, đã nhận được nhiều phản hồi tiêu cực từ khách.",
                    image: null,
                    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    status: "Đang xử lý",
                },
                {
                    id: "CPL-003",
                    storeName: "Cửa hàng Q1",
                    employeeName: "Lê Văn C",
                    reason: "Vấn đề về lương thưởng",
                    description: "Lương tháng này bị thiếu so với hợp đồng. Đã báo cho quản lý nhưng chưa được giải quyết.",
                    image: null,
                    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    status: "Chờ xử lý",
                },
                {
                    id: "CPL-004",
                    storeName: "Cửa hàng Q3",
                    employeeName: "Phạm Thị D",
                    reason: "Môi trường làm việc",
                    description: "Điều hòa bị hỏng đã 1 tuần nhưng chưa được sửa chữa. Nhân viên làm việc trong môi trường nóng bức.",
                    image: null,
                    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                    status: "Đã giải quyết",
                },
                {
                    id: "CPL-005",
                    storeName: "Cửa hàng Q2",
                    employeeName: "Hoàng Văn E",
                    reason: "Không hoàn thành công việc",
                    description: "Nhân viên thường xuyên không hoàn thành công việc được giao, ảnh hưởng đến tiến độ chung.",
                    image: null,
                    date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
                    status: "Chờ xử lý",
                },
            ];

            localStorage.setItem("complaints", JSON.stringify(storedComplaints));
        }

        setComplaints(storedComplaints);
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return complaints;
        return complaints.filter(
            (c) =>
                c.id.toLowerCase().includes(q) ||
                c.storeName.toLowerCase().includes(q) ||
                c.employeeName.toLowerCase().includes(q) ||
                c.reason.toLowerCase().includes(q)
        );
    }, [complaints, query]);

    const handleDelete = (id) => {
        if (!confirm("Xóa khiếu nại này?")) return;

        const updatedComplaints = complaints.filter((c) => c.id !== id);
        setComplaints(updatedComplaints);
        localStorage.setItem("complaints", JSON.stringify(updatedComplaints));
    };

    const handleStatusChange = (complaintId, newStatus) => {
        const updatedComplaints = complaints.map((c) =>
            c.id === complaintId ? { ...c, status: newStatus } : c
        );
        setComplaints(updatedComplaints);
        localStorage.setItem("complaints", JSON.stringify(updatedComplaints));

        // Update selected complaint if it's the one being changed
        if (selectedComplaint?.id === complaintId) {
            setSelectedComplaint({ ...selectedComplaint, status: newStatus });
        }
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
            <header className="flex justify-between items-center">
                <div>
                    <Header>Quản Lý Khiếu Nại</Header>
                    <span className="text-sm text-slate-600 italic">
                        Danh sách các khiếu nại từ nhân viên
                    </span>
                </div>
            </header>

            <div className="flex justify-between items-center">
                <SearchBar
                    placeholder="Tìm kiếm theo ID, cửa hàng, nhân viên, lý do"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <div className="text-sm text-slate-500">{filtered.length} kết quả</div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-200">
                                <tr className="text-left">
                                    <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">
                                        ID
                                    </th>
                                    <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">
                                        Cửa hàng
                                    </th>
                                    <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">
                                        Nhân viên
                                    </th>
                                    <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">
                                        Lý do
                                    </th>
                                    <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">
                                        Ngày gửi
                                    </th>
                                    <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">
                                        Trạng thái
                                    </th>
                                    <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">
                                        Thao tác
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.map((complaint) => (
                                    <tr
                                        key={complaint.id}
                                        className="hover:bg-card-content/30 transition-colors"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap font-medium">
                                            {complaint.id}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {complaint.storeName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            {complaint.employeeName}
                                        </td>
                                        <td className="px-6 py-4 text-sm max-w-xs truncate">
                                            {complaint.reason}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                            {formatDate(complaint.date)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                                    complaint.status
                                                )}`}
                                            >
                                                {complaint.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => handleViewDetails(complaint)}
                                                    title="Xem chi tiết"
                                                >
                                                    <FaEye />
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => handleDelete(complaint.id)}
                                                    title="Xóa"
                                                >
                                                    <FaTrashAlt />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="px-6 py-8 text-center text-sm text-slate-500"
                                        >
                                            Không tìm thấy khiếu nại.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

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
                            <div className="space-y-1">
                                <span className="text-sm text-slate-600">Cửa hàng:</span>
                                <p className="font-medium">{selectedComplaint.storeName}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-sm text-slate-600">Nhân viên:</span>
                                <p className="font-medium">{selectedComplaint.employeeName}</p>
                            </div>
                            <div className="space-y-1 col-span-2">
                                <span className="text-sm text-slate-600">Ngày gửi:</span>
                                <p className="font-medium">{formatDate(selectedComplaint.date)}</p>
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

                        {/* Update Status */}
                        <div className="space-y-2">
                            <h3 className="font-semibold text-lg">Cập nhật trạng thái</h3>
                            <div className="flex items-center gap-3">
                                <select
                                    value={selectedComplaint.status}
                                    onChange={(e) => handleStatusChange(selectedComplaint.id, e.target.value)}
                                    className="flex-1 h-10 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                                >
                                    <option value="Chờ xử lý">Chờ xử lý</option>
                                    <option value="Đang xử lý">Đang xử lý</option>
                                    <option value="Đã giải quyết">Đã giải quyết</option>
                                    <option value="Từ chối">Từ chối</option>
                                </select>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-4 flex justify-end gap-2 border-t sticky bottom-0 bg-white">
                            <Button
                                variant="outline"
                                onClick={() => setIsDetailsModalOpen(false)}
                            >
                                Đóng
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    handleDelete(selectedComplaint.id);
                                    setIsDetailsModalOpen(false);
                                }}
                            >
                                Xóa khiếu nại
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
