import React, { useEffect, useMemo, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import Modal from "../../components/ui/modal";
import { FaEdit, FaTrashAlt, FaUserPlus, FaToggleOn, FaToggleOff } from "react-icons/fa";
import { listStores } from "../../services/stores";
import { createUser, deleteUser, getUsersMeta, listUsers, updateUser } from "../../services/users";

const buildAvatar = (roleName, fullName) => {
    if (roleName === "admin") return "👨‍💼";
    if (roleName === "store_manager") return "👩‍💼";
    if (roleName === "cashier") return "👨";
    if (fullName && /[A-Za-z]/.test(fullName)) return "👤";
    return "👤";
};

const getRoleBadge = (roleName) => {
    switch (roleName) {
        case "admin":
            return <Badge className="bg-purple-100 text-purple-800">Admin</Badge>;
        case "store_manager":
            return <Badge className="bg-blue-100 text-blue-800">Store Manager</Badge>;
        case "cashier":
            return <Badge className="bg-green-100 text-green-800">Cashier</Badge>;
        default:
            return <Badge>{roleName || "-"}</Badge>;
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
    const [users, setUsers] = useState([]);
    const [stores, setStores] = useState([]);
    const [roles, setRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [formErrors, setFormErrors] = useState({});

    const roleById = useMemo(() => {
        const m = new Map();
        for (const r of roles) m.set(String(r.id), r);
        return m;
    }, [roles]);

    const storeById = useMemo(() => {
        const m = new Map();
        for (const s of stores) m.set(String(s.id), s);
        return m;
    }, [stores]);

    const defaultRoleId = useMemo(() => {
        const cashier = roles.find((r) => r.name === "cashier");
        return cashier?.id ?? roles[0]?.id ?? "";
    }, [roles]);

    // Form state
    const [formData, setFormData] = useState({
        username: "",
        fullName: "",
        email: "",
        phone: "",
        password: "",
        roleId: "",
        storeId: "",
        status: "active",
    });

    const currentUserEmail = useMemo(() => {
        return (
            localStorage.getItem("userEmail") ||
            localStorage.getItem("email") ||
            localStorage.getItem("user") ||
            ""
        );
    }, []);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            setLoadError("");

            const [usersRes, metaRes, storesRes] = await Promise.allSettled([
                listUsers(),
                getUsersMeta(),
                listStores({ take: 200, skip: 0, includeStats: false }),
            ]);

            if (usersRes.status === "fulfilled") {
                setUsers(usersRes.value.items ?? []);
            } else {
                setLoadError(usersRes.reason?.response?.data?.error || usersRes.reason?.message || "Không tải được danh sách người dùng");
            }

            if (metaRes.status === "fulfilled") {
                setRoles(metaRes.value?.roles ?? []);
                // If BE meta includes stores, prefer them as fallback
                if (storesRes.status !== "fulfilled") {
                    setStores(metaRes.value?.stores ?? []);
                }
            }

            if (storesRes.status === "fulfilled") {
                setStores(storesRes.value?.items ?? []);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Filter users by search
    const filteredUsers = users.filter(
        (user) =>
            String(user.full_name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(user.username ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(user.email ?? "").toLowerCase().includes(searchTerm.toLowerCase())
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

        if (!isEdit && !data.password.trim()) {
            errors.password = "Mật khẩu là bắt buộc";
        }

        const role = roleById.get(String(data.roleId));
        if (!role) {
            errors.roleId = "Vui lòng chọn vai trò";
        }

        const roleName = role?.name;
        if (roleName !== "admin") {
            if (!data.storeId) {
                errors.storeId = "Vui lòng chọn cửa hàng";
            }
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
            password: "",
            roleId: defaultRoleId ? String(defaultRoleId) : "",
            storeId: "",
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
        (async () => {
            e.preventDefault();
            const errors = validateForm(formData);
            if (Object.keys(errors).length > 0) {
                setFormErrors(errors);
                return;
            }

            try {
                const role = roleById.get(String(formData.roleId));
                const payload = {
                    username: formData.username,
                    name: formData.fullName,
                    email: formData.email,
                    password: formData.password,
                    roleId: Number(formData.roleId),
                    storeId: role?.name === "admin" ? null : Number(formData.storeId),
                };
                await createUser(payload);
                await fetchData();
                setIsAddModalOpen(false);
                resetForm();
            } catch (err) {
                setFormErrors({
                    ...formErrors,
                    email: err?.response?.data?.error || err?.message || "Không tạo được người dùng",
                });
            }
        })();
    };

    // Open edit modal
    const handleOpenEditModal = (user) => {
        setSelectedUser(user);
        setFormData({
            username: user.username ?? "",
            fullName: user.full_name ?? "",
            email: user.email ?? "",
            phone: user.phone ?? "",
            password: "",
            roleId: user.role_id ? String(user.role_id) : user.roles?.id ? String(user.roles.id) : "",
            storeId: user.store_id ? String(user.store_id) : "",
            status: user.is_active ? "active" : "inactive",
        });
        setFormErrors({});
        setIsEditModalOpen(true);
    };

    // Handle update user
    const handleUpdateUser = (e) => {
        (async () => {
            e.preventDefault();
            const errors = validateForm(formData, true);
            if (Object.keys(errors).length > 0) {
                setFormErrors(errors);
                return;
            }

            try {
                const role = roleById.get(String(formData.roleId));
                const payload = {
                    username: formData.username,
                    name: formData.fullName,
                    email: formData.email,
                    phone: formData.phone,
                    roleId: Number(formData.roleId),
                    storeId: role?.name === "admin" ? null : Number(formData.storeId),
                    isActive: formData.status === "active",
                    ...(formData.password.trim() ? { password: formData.password } : {}),
                };

                await updateUser(selectedUser.id, payload);
                await fetchData();
                setIsEditModalOpen(false);
                setSelectedUser(null);
                resetForm();
            } catch (err) {
                setFormErrors({
                    ...formErrors,
                    email: err?.response?.data?.error || err?.message || "Không cập nhật được người dùng",
                });
            }
        })();
    };

    // Toggle user status
    const handleToggleStatus = (user) => {
        (async () => {
            const roleName = user.roles?.name;
            const isSelf = currentUserEmail && user.email && String(user.email).toLowerCase() === String(currentUserEmail).toLowerCase();
            if (isSelf && roleName === "admin") {
                alert("Không thể vô hiệu hóa tài khoản admin đang đăng nhập!");
                return;
            }

            try {
                const nextIsActive = !(user.is_active ?? false);
                await updateUser(user.id, { isActive: nextIsActive });
                setUsers(users.map((u) => (u.id === user.id ? { ...u, is_active: nextIsActive } : u)));
            } catch (err) {
                alert(err?.response?.data?.error || err?.message || "Không cập nhật được trạng thái người dùng");
            }
        })();
    };

    // Open delete modal
    const handleOpenDeleteModal = (user) => {
        const roleName = user.roles?.name;
        const isSelf = currentUserEmail && user.email && String(user.email).toLowerCase() === String(currentUserEmail).toLowerCase();
        if (isSelf && roleName === "admin") {
            alert("Không thể xóa tài khoản admin đang đăng nhập!");
            return;
        }
        setSelectedUser(user);
        setIsDeleteModalOpen(true);
    };

    // Handle delete user
    const handleDeleteUser = () => {
        (async () => {
            try {
                await deleteUser(selectedUser.id);
                setUsers(users.map((u) => (u.id === selectedUser.id ? { ...u, is_active: false } : u)));
                setIsDeleteModalOpen(false);
                setSelectedUser(null);
            } catch (err) {
                alert(err?.response?.data?.error || err?.message || "Không xóa được người dùng");
            }
        })();
    };

    const getStoreName = (storeId) => {
        if (!storeId) return "-";
        const store = storeById.get(String(storeId));
        if (!store) return String(storeId);
        return store.code ? `${store.name} (${store.code})` : store.name;
    };

    // Render form
    const renderForm = (onSubmit, buttonText) => (
        <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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

                {/* Password */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Mật khẩu {buttonText === "Thêm người dùng" ? "*" : ""}
                    </label>
                    <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.password ? 'border-red-500' : ''}`}
                        placeholder={buttonText === "Thêm người dùng" ? "Nhập mật khẩu" : "Để trống nếu không đổi"}
                    />
                    {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                </div>

                {/* Role */}
                <div>
                    <label className="block text-sm font-medium mb-1">Vai trò *</label>
                    <select
                        value={formData.roleId}
                        onChange={(e) => {
                            const newRoleId = e.target.value;
                            const role = roleById.get(String(newRoleId));
                            setFormData({
                                ...formData,
                                roleId: newRoleId,
                                storeId: role?.name === "admin" ? "" : formData.storeId,
                            });
                        }}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                        {roles.length === 0 && <option value="">(Chưa tải được vai trò)</option>}
                        {roles.map((r) => (
                            <option key={r.id} value={String(r.id)}>
                                {r.description || r.name}
                            </option>
                        ))}
                    </select>
                    {formErrors.roleId && <p className="text-red-500 text-xs mt-1">{formErrors.roleId}</p>}
                </div>

                {/* Store - Only show for non-admin */}
                {roleById.get(String(formData.roleId))?.name !== "admin" && (
                    <div>
                        <label className="block text-sm font-medium mb-1">Cửa hàng *</label>
                        <select
                            value={formData.storeId}
                            onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                            className={`w-full rounded-md border px-3 py-2 text-sm ${formErrors.storeId ? 'border-red-500' : ''}`}
                        >
                            <option value="">Chọn cửa hàng</option>
                            {stores.map((s) => (
                                <option key={s.id} value={String(s.id)}>
                                    {s.name} {s.code ? `(${s.code})` : ""}
                                </option>
                            ))}
                        </select>
                        {formErrors.storeId && <p className="text-red-500 text-xs mt-1">{formErrors.storeId}</p>}
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
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4 border-t">
                <Button type="submit">{buttonText}</Button>
            </div>
        </form>
    );

    return (
        <div>
            <Header>Quản lý nhân sự</Header>

            {loadError && (
                <Card className="my-4">
                    <CardContent className="p-4 text-sm text-red-600">{loadError}</CardContent>
                </Card>
            )}

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
                                {isLoading && (
                                    <tr>
                                        <td className="p-4 text-sm text-gray-500" colSpan={7}>
                                            Đang tải người dùng...
                                        </td>
                                    </tr>
                                )}
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">{buildAvatar(user.roles?.name, user.full_name)}</span>
                                                <div>
                                                    <p className="font-medium">{user.full_name || "-"}</p>
                                                    <p className="text-sm text-gray-500">{user.phone || ""}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-600">{user.username || "-"}</td>
                                        <td className="p-4 text-gray-600">{user.email || "-"}</td>
                                        <td className="p-4">{getRoleBadge(user.roles?.name)}</td>
                                        <td className="p-4 text-gray-600">
                                            {user.roles?.name === "admin" ? "Toàn hệ thống" : (user.stores?.name || getStoreName(user.store_id))}
                                        </td>
                                        <td className="p-4">{getStatusBadge(user.is_active ? "active" : "inactive")}</td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleToggleStatus(user)}
                                                    className={`p-2 rounded-lg transition-colors ${user.is_active
                                                            ? "text-green-600 hover:bg-green-50"
                                                            : "text-gray-400 hover:bg-gray-50"
                                                        }`}
                                                    title={user.is_active ? "Vô hiệu hóa" : "Kích hoạt"}
                                                >
                                                    {user.is_active ? <FaToggleOn size={20} /> : <FaToggleOff size={20} />}
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
                        <strong>{selectedUser?.full_name}</strong>?
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
