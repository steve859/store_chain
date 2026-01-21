import React, { useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";
import { FaEdit, FaTrashAlt, FaUserPlus, FaToggleOn, FaToggleOff } from "react-icons/fa";

// Dummy stores for dropdown
const stores = [
    { id: "SHP-001", name: "Cửa hàng Q1" },
    { id: "SHP-002", name: "Cửa hàng Q7" },
    { id: "SHP-003", name: "Cửa hàng Q3" },
];

// Dummy users data
const initialUsers = [
    {
        id: 1,
        username: "admin",
        fullName: "Nguyễn Văn Admin",
        email: "admin@store.com",
        phone: "0901 234 567",
        role: "admin",
        stores: [],
        status: "active",
        avatar: "👨‍💼",
    },
    {
        id: 2,
        username: "manager01",
        fullName: "Trần Thị Manager",
        email: "manager01@store.com",
        phone: "0902 345 678",
        role: "store_manager",
        stores: ["SHP-001", "SHP-002"],
        status: "active",
        avatar: "👩‍💼",
    },
    {
        id: 3,
        username: "cashier01",
        fullName: "Lê Văn Cashier",
        email: "cashier01@store.com",
        phone: "0903 456 789",
        role: "cashier",
        stores: ["SHP-001"],
        status: "active",
        avatar: "👨",
    },
    {
        id: 4,
        username: "cashier02",
        fullName: "Phạm Thị Thu",
        email: "cashier02@store.com",
        phone: "0904 567 890",
        role: "cashier",
        stores: ["SHP-002"],
        status: "inactive",
        avatar: "👩",
    },
];

const roleLabels = {
    admin: "Admin",
    store_manager: "Store Manager",
    cashier: "Cashier",
};

const getRoleBadge = (role) => {
    switch (role) {
        case "admin":
            return <Badge className="bg-purple-100 text-purple-800">Admin</Badge>;
        case "store_manager":
            return <Badge className="bg-blue-100 text-blue-800">Store Manager</Badge>;
        case "cashier":
            return <Badge className="bg-green-100 text-green-800">Cashier</Badge>;
        default:
            return <Badge>{role}</Badge>;
    }
};

const getStatusBadge = (status) => {
    return status === "active" ? (
        <Badge className="bg-emerald-100 text-emerald-800">Hoạt động</Badge>
    ) : (
        <Badge className="bg-red-100 text-red-800">Vô hiệu hóa</Badge>
    );
};

const Users = () => {
    const [users, setUsers] = useState(initialUsers);
    const [searchTerm, setSearchTerm] = useState("");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [formErrors, setFormErrors] = useState({});

    // Form state
    const [formData, setFormData] = useState({
        username: "",
        fullName: "",
        email: "",
        phone: "",
        role: "cashier",
        stores: [],
        status: "active",
    });

    // Filter users by search
    const filteredUsers = users.filter(
        (user) =>
            user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Validate form
    const validateForm = (data, isEdit = false) => {
        const errors = {};

        if (!data.username.trim()) {
            errors.username = "Username là bắt buộc";
        } else if (!isEdit && users.some(u => u.username === data.username)) {
            errors.username = "Username đã tồn tại";
        }

        if (!data.fullName.trim()) {
            errors.fullName = "Họ tên là bắt buộc";
        }

        if (!data.email.trim()) {
            errors.email = "Email là bắt buộc";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.email = "Email không hợp lệ";
        } else if (!isEdit && users.some(u => u.email === data.email)) {
            errors.email = "Email đã tồn tại";
        }

        if (data.role === "cashier" && data.stores.length !== 1) {
            errors.stores = "Cashier chỉ được gán 1 cửa hàng";
        }

        if (data.role !== "admin" && data.stores.length === 0) {
            errors.stores = "Vui lòng chọn ít nhất 1 cửa hàng";
        }

        return errors;
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            username: "",
            fullName: "",
            email: "",
            phone: "",
            role: "cashier",
            stores: [],
            status: "active",
        });
        setFormErrors({});
    };

    // Open add modal
    const handleOpenAddModal = () => {
        resetForm();
        setIsAddModalOpen(true);
    };

    // Handle add user
    const handleAddUser = (e) => {
        e.preventDefault();
        const errors = validateForm(formData);
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        const newUser = {
            id: Math.max(...users.map((u) => u.id)) + 1,
            ...formData,
            avatar: formData.role === "admin" ? "👨‍💼" : formData.role === "store_manager" ? "👩‍💼" : "👨",
        };

        setUsers([...users, newUser]);
        setIsAddModalOpen(false);
        resetForm();
    };

    // Open edit modal
    const handleOpenEditModal = (user) => {
        setSelectedUser(user);
        setFormData({
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            stores: user.stores,
            status: user.status,
        });
        setFormErrors({});
        setIsEditModalOpen(true);
    };

    // Handle update user
    const handleUpdateUser = (e) => {
        e.preventDefault();
        const errors = validateForm(formData, true);
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setUsers(
            users.map((u) =>
                u.id === selectedUser.id
                    ? { ...u, ...formData }
                    : u
            )
        );
        setIsEditModalOpen(false);
        setSelectedUser(null);
        resetForm();
    };

    // Toggle user status
    const handleToggleStatus = (user) => {
        // Prevent admin from deactivating themselves
        if (user.role === "admin" && user.username === "admin") {
            alert("Không thể vô hiệu hóa tài khoản admin chính!");
            return;
        }

        setUsers(
            users.map((u) =>
                u.id === user.id
                    ? { ...u, status: u.status === "active" ? "inactive" : "active" }
                    : u
            )
        );
    };

    // Open delete modal
    const handleOpenDeleteModal = (user) => {
        if (user.role === "admin" && user.username === "admin") {
            alert("Không thể xóa tài khoản admin chính!");
            return;
        }
        setSelectedUser(user);
        setIsDeleteModalOpen(true);
    };

    // Handle delete user
    const handleDeleteUser = () => {
        setUsers(users.filter((u) => u.id !== selectedUser.id));
        setIsDeleteModalOpen(false);
        setSelectedUser(null);
    };

    // Handle store selection for form
    const handleStoreToggle = (storeId) => {
        if (formData.role === "cashier") {
            // Cashier can only select 1 store
            setFormData({ ...formData, stores: [storeId] });
        } else {
            // Admin/Manager can select multiple
            const newStores = formData.stores.includes(storeId)
                ? formData.stores.filter((id) => id !== storeId)
                : [...formData.stores, storeId];
            setFormData({ ...formData, stores: newStores });
        }
    };

    // Get store names from IDs
    const getStoreNames = (storeIds) => {
        return storeIds
            .map((id) => stores.find((s) => s.id === id)?.name || id)
            .join(", ");
    };

    // Render form
    const renderForm = (onSubmit, buttonText) => (
        <form onSubmit={onSubmit} className="space-y-4">
            {/* Username */}
            <div>
                <label className="block text-sm font-medium mb-1">Username *</label>
                <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.username ? 'border-red-500' : ''}`}
                    placeholder="Nhập username"
                />
                {formErrors.username && <p className="text-red-500 text-xs mt-1">{formErrors.username}</p>}
            </div>

            {/* Full Name */}
            <div>
                <label className="block text-sm font-medium mb-1">Họ tên *</label>
                <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.fullName ? 'border-red-500' : ''}`}
                    placeholder="Nhập họ tên"
                />
                {formErrors.fullName && <p className="text-red-500 text-xs mt-1">{formErrors.fullName}</p>}
            </div>

            {/* Email */}
            <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.email ? 'border-red-500' : ''}`}
                    placeholder="Nhập email"
                />
                {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
            </div>

            {/* Phone */}
            <div>
                <label className="block text-sm font-medium mb-1">Số điện thoại</label>
                <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Nhập số điện thoại"
                />
            </div>

            {/* Role */}
            <div>
                <label className="block text-sm font-medium mb-1">Vai trò *</label>
                <select
                    value={formData.role}
                    onChange={(e) => {
                        const newRole = e.target.value;
                        setFormData({
                            ...formData,
                            role: newRole,
                            stores: newRole === "admin" ? [] : formData.stores.slice(0, newRole === "cashier" ? 1 : undefined)
                        });
                    }}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                >
                    <option value="admin">Admin</option>
                    <option value="store_manager">Store Manager</option>
                    <option value="cashier">Cashier</option>
                </select>
            </div>

            {/* Stores - Only show for non-admin */}
            {formData.role !== "admin" && (
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Cửa hàng * {formData.role === "cashier" && "(Chọn 1)"}
                    </label>
                    <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                        {stores.map((store) => (
                            <label key={store.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type={formData.role === "cashier" ? "radio" : "checkbox"}
                                    name="store"
                                    checked={formData.stores.includes(store.id)}
                                    onChange={() => handleStoreToggle(store.id)}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm">{store.name}</span>
                            </label>
                        ))}
                    </div>
                    {formErrors.stores && <p className="text-red-500 text-xs mt-1">{formErrors.stores}</p>}
                </div>
            )}

            {/* Status */}
            <div>
                <label className="block text-sm font-medium mb-1">Trạng thái</label>
                <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                >
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Vô hiệu hóa</option>
                </select>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
                <Button type="submit">{buttonText}</Button>
            </div>
        </form>
    );

    return (
        <div>
            <Header title="Quản lý Người dùng" />

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
                <SearchBar
                    placeholder="Tìm kiếm người dùng..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Button onClick={handleOpenAddModal} className="flex items-center gap-2">
                    <FaUserPlus />
                    Thêm người dùng
                </Button>
            </div>

            {/* Users Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left p-4 font-medium text-gray-600">Người dùng</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Username</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Email</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Vai trò</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Cửa hàng</th>
                                    <th className="text-left p-4 font-medium text-gray-600">Trạng thái</th>
                                    <th className="text-center p-4 font-medium text-gray-600">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">{user.avatar}</span>
                                                <div>
                                                    <p className="font-medium">{user.fullName}</p>
                                                    <p className="text-sm text-gray-500">{user.phone}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-600">{user.username}</td>
                                        <td className="p-4 text-gray-600">{user.email}</td>
                                        <td className="p-4">{getRoleBadge(user.role)}</td>
                                        <td className="p-4 text-gray-600">
                                            {user.role === "admin" ? "Toàn hệ thống" : getStoreNames(user.stores) || "-"}
                                        </td>
                                        <td className="p-4">{getStatusBadge(user.status)}</td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleToggleStatus(user)}
                                                    className={`p-2 rounded-lg transition-colors ${user.status === "active"
                                                            ? "text-green-600 hover:bg-green-50"
                                                            : "text-gray-400 hover:bg-gray-50"
                                                        }`}
                                                    title={user.status === "active" ? "Vô hiệu hóa" : "Kích hoạt"}
                                                >
                                                    {user.status === "active" ? <FaToggleOn size={20} /> : <FaToggleOff size={20} />}
                                                </button>
                                                <button
                                                    onClick={() => handleOpenEditModal(user)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Chỉnh sửa"
                                                >
                                                    <FaEdit />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenDeleteModal(user)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Xóa"
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

            {/* Add Modal */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Thêm người dùng mới"
            >
                {renderForm(handleAddUser, "Thêm người dùng")}
            </Modal>

            {/* Edit Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Chỉnh sửa người dùng"
            >
                {renderForm(handleUpdateUser, "Cập nhật")}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="Xác nhận xóa"
            >
                <div className="space-y-4">
                    <p>
                        Bạn có chắc chắn muốn xóa người dùng{" "}
                        <strong>{selectedUser?.fullName}</strong>?
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>
                            Hủy
                        </Button>
                        <Button
                            onClick={handleDeleteUser}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            Xóa
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Users;
