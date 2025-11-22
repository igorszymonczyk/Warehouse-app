import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ScrollText, Search } from "lucide-react";
import toast from "react-hot-toast";

type LogItem = {
  id: number;
  user_id: number | null;
  action: string;
  resource: string;
  status: "SUCCESS" | "FAIL" | string;
  ip_address: string | null;
  timestamp: string;
  meta?: Record<string, unknown>;
};

type LogsResponse = {
  items: LogItem[];
  total: number;
  page: number;
  page_size: number;
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchAction, setSearchAction] = useState("");
  
  const pageSize = 20;

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await api.get<LogsResponse>("/logs", {
          params: {
            page,
            page_size: pageSize,
            action: searchAction || undefined,
          },
        });
        setLogs(res.data.items);
        setTotal(res.data.total);
      } catch (err) {
        console.error(err);
        toast.error("Nie udało się pobrać logów");
      } finally {
        setLoading(false);
      }
    };

    // Debounce dla wyszukiwania
    const timeout = setTimeout(() => {
        fetchLogs();
    }, 300);

    return () => clearTimeout(timeout);
  }, [page, searchAction]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText /> Logi Systemowe
        </h1>
        <div className="relative">
            <input 
                type="text" 
                placeholder="Szukaj akcji (np. LOGIN)..."
                className="border rounded pl-10 pr-4 py-2 w-64"
                value={searchAction}
                onChange={(e) => {setSearchAction(e.target.value); setPage(1);}}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-600 uppercase border-b">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Użytkownik (ID)</th>
              <th className="px-4 py-3">Akcja</th>
              <th className="px-4 py-3">Zasób</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
                <tr><td colSpan={7} className="p-4 text-center">Ładowanie...</td></tr>
            ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-center text-gray-500">Brak logów</td></tr>
            ) : (
                logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-500">{log.id}</td>
                    <td className="px-4 py-3">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3">
                        {log.user_id ? <span className="font-bold text-blue-600">#{log.user_id}</span> : <span className="text-gray-400">System/Gość</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold">{log.action}</td>
                    <td className="px-4 py-3 text-gray-600">{log.resource}</td>
                    <td className="px-4 py-3">
                    <span
                        className={`px-2 py-1 rounded text-xs font-bold ${
                        log.status === "SUCCESS"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                    >
                        {log.status}
                    </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{log.ip_address || "-"}</td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginacja */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="px-4 py-2 border rounded disabled:opacity-50 bg-white hover:bg-gray-50"
        >
          Poprzednia
        </button>
        <span className="text-gray-600">
          Strona {page} z {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
          className="px-4 py-2 border rounded disabled:opacity-50 bg-white hover:bg-gray-50"
        >
          Następna
        </button>
      </div>
    </div>
  );
}