import React, { useEffect, useState } from "react";
import { Header } from "../../components/ui/header";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { listAuditLogs } from "../../services/auditLogs";
import { FaShieldAlt, FaHistory, FaSearch } from "react-icons/fa";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      // Dùng take=100 để demo, thực tế nên có pagination
      const data = await listAuditLogs({ take: 100 });
      setLogs(data?.items || []);
    } catch (err) {
      setError("Không thể tải nhật ký hệ thống: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.object_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.payload?.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <Header>Nhật Ký Kiểm Toán (Audit Logs)</Header>
          <span className="text-sm text-slate-600 italic">Theo dõi bảo mật và thay đổi hệ thống</span>
        </div>
        <Button onClick={fetchLogs} disabled={loading} className="flex items-center gap-2">
          <FaHistory /> Làm mới
        </Button>
      </header>

      <Card>
        <CardContent className="p-4 flex gap-4">
          <div className="flex-1 relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo hành động hoặc đối tượng..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}

      <Card>
        <CardContent className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 text-slate-600 text-sm">
                <tr>
                  <th className="p-4 font-semibold">Thời gian</th>
                  <th className="p-4 font-semibold">Người dùng</th>
                  <th className="p-4 font-semibold">Hành động</th>
                  <th className="p-4 font-semibold">Đối tượng</th>
                  <th className="p-4 font-semibold">IP / Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-500">
                      {loading ? "Đang tải..." : "Không tìm thấy nhật ký"}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-sm whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="p-4 text-sm font-medium">
                        User #{log.user_id}
                      </td>
                      <td className="p-4 text-sm">
                        <Badge className={log.action.includes('DELETE') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm">
                        <span className="font-semibold text-slate-700">{log.object_type}</span>
                        <span className="text-slate-400 ml-2">#{log.object_id}</span>
                      </td>
                      <td className="p-4 text-xs text-slate-500 max-w-xs truncate">
                        {log.payload?.source?.ip || 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
