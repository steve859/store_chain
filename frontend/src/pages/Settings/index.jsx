import React, { useEffect, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getSystemSettings, updateSystemSettings, getSystemStatus, runBackup, runCleanup, runDrill } from "../../services/settings";
import { FaCogs, FaSave } from "react-icons/fa";

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await getSystemSettings();
      // Chuyển array [{key, value}, ...] thành object {key: value}
      const mapped = {};
      if (Array.isArray(data)) {
        data.forEach(item => {
          mapped[item.key] = item.value;
        });
      }
      setSettings(mapped);
    } catch (e) {
      setError(e?.response?.data?.error || "Không thể tải cấu hình");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      // API Backend có thể yêu cầu array hoặc object, ở đây giả định backend nhận object key-value
      await updateSystemSettings(settings);
      setSuccess("Lưu cấu hình thành công!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e?.response?.data?.error || "Lỗi khi lưu cấu hình");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header className="flex justify-between items-center">
        <div>
          <Header>Cấu hình hệ thống (Settings)</Header>
          <span className="text-sm text-slate-600 italic">Tuỳ chỉnh các tham số hoạt động chung</span>
        </div>
        <Button onClick={handleSave} disabled={loading || saving} className="flex items-center gap-2">
          <FaSave /> {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      </header>

      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}
      {success && <div className="text-green-500 bg-green-50 p-3 rounded">{success}</div>}

      <Card>
        <CardContent className="p-6 space-y-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
            <FaCogs className="text-slate-500" /> Tham số cơ bản
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">Cửa hàng mặc định (Default Store ID)</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-md"
                value={settings['default_store_id'] || ""}
                onChange={(e) => handleChange('default_store_id', e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">ID cửa hàng dùng cho các tác vụ không xác định vị trí.</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Bật chế độ Offline POS</label>
              <select
                className="w-full px-3 py-2 border rounded-md"
                value={settings['enable_offline_pos'] || "false"}
                onChange={(e) => handleChange('enable_offline_pos', e.target.value)}
              >
                <option value="true">Bật (True)</option>
                <option value="false">Tắt (False)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Thời gian timeout giữ đơn (phút)</label>
              <input
                type="number"
                className="w-full px-3 py-2 border rounded-md"
                value={settings['hold_order_timeout'] || "30"}
                onChange={(e) => handleChange('hold_order_timeout', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Biên độ giá tự động (Max Margin %)</label>
              <input
                type="number"
                className="w-full px-3 py-2 border rounded-md"
                value={settings['dynamic_pricing_max_margin'] || "20"}
                onChange={(e) => handleChange('dynamic_pricing_max_margin', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2 text-red-600">
            <FaCogs className="text-red-500" /> Vận hành & Bảo trì (Maintenance)
          </h3>
          <p className="text-sm text-slate-600">
            Các tác vụ này ảnh hưởng trực tiếp đến trạng thái toàn hệ thống. Hãy cân nhắc kỹ trước khi thực thi.
          </p>
          <div className="flex gap-4 mt-4">
            <Button onClick={async () => {
              try {
                const res = await getSystemStatus();
                alert(`Trạng thái: ${res.status}\nRedis: ${res.details.redis}\nDatabase: ${res.details.database}`);
              } catch (e) { alert("Lỗi khi lấy trạng thái"); }
            }} variant="outline">
              Kiểm tra trạng thái (Status)
            </Button>
            
            <Button onClick={async () => {
              try {
                const res = await runBackup();
                alert(`Backup thành công! File: ${res.file}`);
              } catch (e) { alert("Lỗi khi backup"); }
            }} className="bg-blue-600 hover:bg-blue-700">
              Backup Dữ Liệu
            </Button>

            <Button onClick={async () => {
              if(!window.confirm('Chắc chắn dọn dẹp hệ thống?')) return;
              try {
                await runCleanup();
                alert(`Dọn dẹp thành công!`);
              } catch (e) { alert("Lỗi khi cleanup"); }
            }} className="bg-orange-600 hover:bg-orange-700">
              Dọn dẹp hệ thống (Cleanup)
            </Button>

            <Button onClick={async () => {
              if(!window.confirm('Chạy diễn tập Disaster Recovery? Hệ thống có thể bị gián đoạn nhẹ.')) return;
              try {
                const res = await runDrill();
                alert(`Kết quả Drill: ${res.passed ? 'PASS' : 'FAIL'} \n${res.message}`);
              } catch (e) { alert("Lỗi khi chạy Drill"); }
            }} className="bg-red-600 hover:bg-red-700">
              Disaster Recovery Drill
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
