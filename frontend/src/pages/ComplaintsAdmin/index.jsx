import React, { useMemo, useState, useEffect } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import { FaEye, FaTrashAlt } from "react-icons/fa";
import Modal from "../../components/ui/modal";
import { deleteComplaint, listComplaints, updateComplaintStatus } from "../../services/complaints";

export default function ComplaintsAdmin() {
    const [complaints, setComplaints] = useState([]);
    const [query, setQuery] = useState("");
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [selectedComplaint, setSelectedComplaint] = useState(null);

    const refresh = async (q = "") => {
        try {
            const data = await listComplaints({ q, take: 200, skip: 0 });
            setComplaints(data.items || []);
        } catch (err) {
            console.error(err);
            setComplaints([]);
        }
    };

    useEffect(() => {
        refresh("");
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

    const handleDelete = async (id) => {
        if (!confirm("Xóa khiếu nại này?")) return;
        try {
            await deleteComplaint(id);
            const updatedComplaints = complaints.filter((c) => c.id !== id);
            setComplaints(updatedComplaints);
            if (selectedComplaint?.id === id) {
                setSelectedComplaint(null);
                setIsDetailsModalOpen(false);
            }
        } catch (err) {
            console.error(err);
            alert("Xóa khiếu nại thất bại.");
        }
    };

    const handleStatusChange = async (complaintId, newStatus) => {
        try {
            const updated = await updateComplaintStatus(complaintId, newStatus);

            const updatedComplaints = complaints.map((c) =>
                c.id === complaintId ? { ...c, status: updated.status } : c
            );
            setComplaints(updatedComplaints);

            if (selectedComplaint?.id === complaintId) {
                setSelectedComplaint({ ...selectedComplaint, status: updated.status });
            }
        } catch (err) {
            console.error(err);
            alert("Cập nhật trạng thái thất bại.");
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
