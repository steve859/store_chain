import React, { useEffect, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from "../../services/suppliers";
import { FaTruck, FaPlus, FaEdit, FaTrashAlt } from "react-icons/fa";
import Modal from "../../components/ui/modal";

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: "", contact_name: "", phone: "", email: "", address: "" });

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const data = await listSuppliers();
      setSuppliers(data?.data || data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.error || "Không thể tải danh sách NCC");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return alert("Tên NCC không được để trống");
    
    try {
      if (formData.id) {
        await updateSupplier(formData.id, formData);
      } else {
        await createSupplier(formData);
      }
      setIsModalOpen(false);
      fetchSuppliers();
    } catch (e) {
      alert(e?.response?.data?.error || "Lỗi khi lưu NCC");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Chắc chắn xoá NCC này?")) return;
    try {
      await deleteSupplier(id);
      fetchSuppliers();
    } catch (e) {
      alert(e?.response?.data?.error || "Lỗi khi xoá NCC");
    }
  };

  const openModal = (sup = null) => {
    if (sup) {
      setFormData({ 
        id: sup.id, 
        name: sup.name, 
        contact_name: sup.contact_name || "", 
        phone: sup.phone || "",
        email: sup.email || "",
        address: sup.address || "" 
      });
    } else {
      setFormData({ id: null, name: "", contact_name: "", phone: "", email: "", address: "" });
    }
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Nhà Cung Cấp</Header>
          <span className="text-sm text-slate-600 italic">Quản lý đối tác cung cấp hàng hoá</span>
        </div>
        <Button onClick={() => openModal()} className="flex items-center gap-2">
          <FaPlus /> Thêm NCC
        </Button>
      </header>

      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}

      <Card>
        <CardContent className="p-0">
          <table className="min-w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-600 text-sm border-b">
              <tr>
                <th className="p-4 font-semibold">NCC</th>
                <th className="p-4 font-semibold">Người liên hệ</th>
                <th className="p-4 font-semibold">Số điện thoại</th>
                <th className="p-4 font-semibold">Email</th>
                <th className="p-4 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500">
                    {loading ? "Đang tải..." : "Chưa có NCC nào"}
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50">
                    <td className="p-4 text-sm font-semibold">{sup.name}</td>
                    <td className="p-4 text-sm">{sup.contact_name || "-"}</td>
                    <td className="p-4 text-sm text-slate-600">{sup.phone || "-"}</td>
                    <td className="p-4 text-sm text-slate-600">{sup.email || "-"}</td>
                    <td className="p-4 text-right">
                      <Button variant="ghost" onClick={() => openModal(sup)}><FaEdit /></Button>
                      <Button variant="ghost" onClick={() => handleDelete(sup.id)} className="text-red-500"><FaTrashAlt /></Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Sửa NCC" : "Thêm NCC"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tên NCC *</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Người liên hệ</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-md"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Số điện thoại</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-md"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 border rounded-md"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Địa chỉ</label>
            <textarea
              className="w-full px-3 py-2 border rounded-md"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Huỷ</Button>
            <Button type="submit">Lưu</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
