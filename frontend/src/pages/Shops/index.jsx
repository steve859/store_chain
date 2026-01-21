import React, { useEffect, useMemo, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { SearchBar } from "../../components/ui/searchbar";
import { FaEdit, FaTrashAlt, FaEye } from "react-icons/fa";
import Modal from "../../components/ui/modal";
import { createStore, deactivateStore, getStoreOverview, listStores, updateStore } from "../../services/stores";


function formatVND(number) {
  if (number === null || number === undefined) return "0đ";
  return new Intl.NumberFormat("vi-VN").format(Number(number)) + "đ";
}

export default function Shops() {
  const [shops, setShops] = useState([]);
  const [query, setQuery] = useState("");
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);

  // Form data for adding/editing shop (match DB fields)
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    timezone: "Asia/Ho_Chi_Minh",
    isActive: true,
  });

  const fetchStores = async (q) => {
    setLoading(true);
    setError("");
    try {
      const data = await listStores({ q, take: 200, skip: 0, includeStats: true });
      setShops(data.items || []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Không tải được danh sách cửa hàng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // debounce search
    const t = setTimeout(() => {
      fetchStores(query);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(() => shops, [shops]);

  const handleDelete = async (storeId) => {
    if (!confirm("Ngừng hoạt động cửa hàng này?")) return;
    try {
      await deactivateStore(storeId);
      await fetchStores(query);
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Không thể cập nhật trạng thái cửa hàng");
    }
  };

  const handleEdit = (shop) => {
    // Pre-populate form with shop data
    setFormData({
      name: shop.name,
      address: shop.address || "",
      phone: shop.phone || "",
      timezone: shop.timezone || "Asia/Ho_Chi_Minh",
      isActive: shop.is_active ?? true,
    });
    setSelectedShop(shop);
    setIsEditModalOpen(true);
  };

  const handleViewDetails = async (shop) => {
    setSelectedShop(shop);
    setOverview(null);
    setIsDetailsModalOpen(true);
    try {
      const data = await getStoreOverview(shop.id);
      setOverview(data);
    } catch (e) {
      setOverview({ error: e?.response?.data?.error || e?.message || "Không tải được chi tiết" });
    }
  };

  const handleAddShop = async (e) => {
    e.preventDefault();

    try {
      await createStore({
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        timezone: formData.timezone,
        isActive: formData.isActive,
      });
      setIsAddModalOpen(false);
      setFormData({ name: "", address: "", phone: "", timezone: "Asia/Ho_Chi_Minh", isActive: true });
      await fetchStores(query);
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Không thể tạo cửa hàng");
    }
  };

  const handleUpdateShop = async (e) => {
    e.preventDefault();

    try {
      await updateStore(selectedShop.id, {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        timezone: formData.timezone,
        isActive: formData.isActive,
      });

      setIsEditModalOpen(false);
      setFormData({ name: "", address: "", phone: "", timezone: "Asia/Ho_Chi_Minh", isActive: true });
      setSelectedShop(null);
      await fetchStores(query);
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Không thể cập nhật cửa hàng");
    }
  };

  // Render the form (used by both Add and Edit modals)
  const renderForm = (onSubmit, buttonText) => (
    <form onSubmit={onSubmit}>
      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tên cửa hàng *</label>
              <input
                required
                placeholder="Ví dụ: Cửa hàng Q7"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Địa chỉ *</label>
              <input
                required
                placeholder="Ví dụ: 123 Đường ABC, Quận 7, TP.HCM"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Số điện thoại</label>
              <input
                placeholder="Ví dụ: 0901234567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Múi giờ</label>
              <input
                placeholder="Asia/Ho_Chi_Minh"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="text-xs text-slate-500">Mặc định: Asia/Ho_Chi_Minh</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Trạng thái</label>
              <div className="flex items-center gap-2">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={!!formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="isActive" className="text-sm">Đang hoạt động</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-4 flex justify-end gap-2 border-t mt-4 sticky bottom-0 bg-white">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setIsAddModalOpen(false);
            setIsEditModalOpen(false);
            setFormData({ name: "", address: "", phone: "", timezone: "Asia/Ho_Chi_Minh", isActive: true });
          }}
        >
          Hủy bỏ
        </Button>
        <Button type="submit">
          {buttonText}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Quản Lý Cửa Hàng</Header>
          <span className="text-sm text-slate-600 italic">Danh sách các cửa hàng</span>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsAddModalOpen(true)}>+ Thêm cửa hàng</Button>
        </div>
      </header>

      <div className="flex justify-between items-center">
        <SearchBar
          placeholder="Tìm kiếm theo id, tên hoặc địa chỉ"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="text-sm text-slate-500">
          {loading ? "Đang tải..." : `${filtered.length} kết quả`}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-200">
                <tr className="text-left">
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">Mã</th>
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">Tên</th>
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">Địa chỉ</th>
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">SĐT</th>
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">Trạng thái</th>
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">Nhân viên</th>
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">Sản phẩm</th>
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">Đơn hàng</th>
                  <th className="px-6 py-3 text-xs font-medium text-card-content uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((shop) => (
                  <tr key={shop.id} className="hover:bg-card-content/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-medium">{shop.code}</td>
                    <td className="px-6 py-4 whitespace-nowrap font-semibold">{shop.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{shop.address}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{shop.phone || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {shop.is_active ? (
                        <span className="text-green-700">Hoạt động</span>
                      ) : (
                        <span className="text-slate-500">Ngừng</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{shop.stats?.employees ?? 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{shop.stats?.products ?? 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{shop.stats?.orders ?? 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => handleViewDetails(shop)} title="Xem chi tiết">
                          <FaEye />
                        </Button>
                        <Button variant="ghost" onClick={() => handleEdit(shop)}>
                          <FaEdit />
                        </Button>
                        <Button variant="destructive" onClick={() => handleDelete(shop.id)}>
                          <FaTrashAlt />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-sm text-slate-500">
                      Không tìm thấy cửa hàng.
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
        title={`Chi tiết - ${selectedShop?.name || ""}`}
        className="max-w-3xl"
      >
        {selectedShop && (
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto space-y-6 pr-2">
            {/* Shop Basic Info */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Thông tin cơ bản</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-600">Mã:</span> <span className="font-medium">{selectedShop.code}</span>
                </div>
                <div>
                  <span className="text-slate-600">Tên:</span> <span className="font-medium">{selectedShop.name}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-600">Địa chỉ:</span> <span className="font-medium">{selectedShop.address}</span>
                </div>
                <div>
                  <span className="text-slate-600">SĐT:</span> <span className="font-medium">{selectedShop.phone || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-600">Trạng thái:</span>{" "}
                  <span className="font-medium">{selectedShop.is_active ? "Hoạt động" : "Ngừng"}</span>
                </div>
              </div>
            </div>

            {/* Employees List */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Nhân viên</h3>
              <div className="max-h-40 overflow-y-auto border rounded-lg">
                {overview?.employees && overview.employees.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">ID</th>
                        <th className="px-4 py-2 text-left">Tên</th>
                        <th className="px-4 py-2 text-left">Chức vụ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {overview.employees.map((emp) => (
                        <tr key={emp.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{emp.id}</td>
                          <td className="px-4 py-2">{emp.full_name || emp.username || "—"}</td>
                          <td className="px-4 py-2">{emp.roles?.name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center py-4 text-slate-500">{overview?.error ? overview.error : "Chưa có nhân viên"}</p>
                )}
              </div>
            </div>

            {/* Products List */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Tồn kho (top 50)</h3>
              <div className="max-h-40 overflow-y-auto border rounded-lg">
                {overview?.inventories && overview.inventories.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">Sản phẩm</th>
                        <th className="px-4 py-2 text-left">Variant</th>
                        <th className="px-4 py-2 text-left">SL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {overview.inventories.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{inv.product_variants?.products?.name || "—"}</td>
                          <td className="px-4 py-2">{inv.product_variants?.name || inv.product_variants?.barcode || "—"}</td>
                          <td className="px-4 py-2">{Number(inv.quantity ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center py-4 text-slate-500">{overview?.error ? overview.error : "Chưa có dữ liệu tồn kho"}</p>
                )}
              </div>
            </div>

            {/* Orders List */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Hóa đơn gần đây</h3>
              <div className="max-h-40 overflow-y-auto border rounded-lg">
                {overview?.invoices && overview.invoices.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">ID</th>
                        <th className="px-4 py-2 text-left">Khách hàng</th>
                        <th className="px-4 py-2 text-left">Tổng tiền</th>
                        <th className="px-4 py-2 text-left">Ngày</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {overview.invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{inv.invoice_number || `INV-${inv.id}`}</td>
                          <td className="px-4 py-2">{inv.customers?.name || "Khách lẻ"}</td>
                          <td className="px-4 py-2">{formatVND(inv.total)}</td>
                          <td className="px-4 py-2">{inv.created_at ? new Date(inv.created_at).toISOString().slice(0, 10) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center py-4 text-slate-500">{overview?.error ? overview.error : "Chưa có hóa đơn"}</p>
                )}
              </div>
            </div>

            <div className="pt-4 flex justify-end sticky bottom-0 bg-white border-t mt-4 -mx-2 px-2 pb-2">
              <Button variant="outline" onClick={() => setIsDetailsModalOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Shop Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setFormData({ name: "", address: "", phone: "", timezone: "Asia/Ho_Chi_Minh", isActive: true });
        }}
        title="Thêm cửa hàng mới"
        className="max-w-4xl"
      >
        {renderForm(handleAddShop, "Lưu cửa hàng")}
      </Modal>

      {/* Edit Shop Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setFormData({ name: "", address: "", phone: "", timezone: "Asia/Ho_Chi_Minh", isActive: true });
          setSelectedShop(null);
        }}
        title={`Sửa cửa hàng - ${selectedShop?.name || ""}`}
        className="max-w-4xl"
      >
        {renderForm(handleUpdateShop, "Cập nhật")}
      </Modal>
    </div>
  );
}