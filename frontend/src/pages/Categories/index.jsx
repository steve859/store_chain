import React, { useEffect, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { listCategories, createCategory, updateCategory, deleteCategory } from "../../services/categories";
import { FaTags, FaPlus, FaEdit, FaTrashAlt } from "react-icons/fa";
import Modal from "../../components/ui/modal";

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: "", description: "" });

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const data = await listCategories();
      setCategories(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.error || "Không thể tải danh sách danh mục");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return alert("Tên danh mục không được để trống");
    
    try {
      if (formData.id) {
        await updateCategory(formData.id, { name: formData.name, description: formData.description });
      } else {
        await createCategory({ name: formData.name, description: formData.description });
      }
      setIsModalOpen(false);
      fetchCategories();
    } catch (e) {
      alert(e?.response?.data?.error || "Lỗi khi lưu danh mục");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Chắc chắn xoá danh mục này?")) return;
    try {
      await deleteCategory(id);
      fetchCategories();
    } catch (e) {
      alert(e?.response?.data?.error || "Lỗi khi xoá danh mục");
    }
  };

  const openModal = (cat = null) => {
    if (cat) {
      setFormData({ id: cat.id, name: cat.name, description: cat.description || "" });
    } else {
      setFormData({ id: null, name: "", description: "" });
    }
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Danh mục sản phẩm</Header>
          <span className="text-sm text-slate-600 italic">Quản lý các loại mặt hàng</span>
        </div>
        <Button onClick={() => openModal()} className="flex items-center gap-2">
          <FaPlus /> Thêm danh mục
        </Button>
      </header>

      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}

      <Card>
        <CardContent className="p-0">
          <table className="min-w-full text-left">
            <thead className="bg-slate-100 text-slate-600 text-sm border-b">
              <tr>
                <th className="p-4 font-semibold">ID</th>
                <th className="p-4 font-semibold">Tên danh mục</th>
                <th className="p-4 font-semibold">Mô tả</th>
                <th className="p-4 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {categories.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-slate-500">
                    {loading ? "Đang tải..." : "Chưa có danh mục nào"}
                  </td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50">
                    <td className="p-4 text-sm">#{cat.id}</td>
                    <td className="p-4 text-sm font-semibold">{cat.name}</td>
                    <td className="p-4 text-sm text-slate-600">{cat.description || "-"}</td>
                    <td className="p-4 text-right">
                      <Button variant="ghost" onClick={() => openModal(cat)}><FaEdit /></Button>
                      <Button variant="ghost" onClick={() => handleDelete(cat.id)} className="text-red-500"><FaTrashAlt /></Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Sửa danh mục" : "Thêm danh mục"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tên danh mục *</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mô tả</label>
            <textarea
              className="w-full px-3 py-2 border rounded-md"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
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
