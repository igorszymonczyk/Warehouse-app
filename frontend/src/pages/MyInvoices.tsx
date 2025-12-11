// frontend/src/pages/MyInvoices.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import toast from "react-hot-toast";
import { Download, AlertCircle, CheckCircle } from "lucide-react";

// Types matching backend Invoice model
type Invoice = {
  id: number;
  order_id: number;
  payment_status: "pending" | "paid" | "cancelled";
  total_gross: number;
  created_at: string; // ISO string
};

type PaginatedInvoices = {
  items: Invoice[];
  total: number;
  page: number;
  page_size: number;
};

// Status map
const statusMap = {
  pending: { text: "Pending payment", icon: <AlertCircle className="text-yellow-500" />, color: "text-yellow-600" },
  paid: { text: "Paid", icon: <CheckCircle className="text-green-500" />, color: "text-green-600" },
  cancelled: { text: "Cancelled", icon: <AlertCircle className="text-red-500" />, color: "text-red-600" },
};

// Invoice Card Component
function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const [loadingPdf, setLoadingPdf] = useState(false);
  
  const formattedDate = new Date(invoice.created_at).toLocaleDateString("en-GB");
  const status = statusMap[invoice.payment_status] || statusMap.pending;

  const handleDownload = async () => {
    setLoadingPdf(true);
    toast.loading("Generating PDF...");
    
    try {
      // 1. Generate PDF
      await api.post(`/invoices/${invoice.id}/pdf`);
      
      // 2. Download PDF
      const res = await api.get(`/invoices/${invoice.id}/download`, {
        responseType: 'blob', // Important: download as blob
      });
      
      // 3. Force browser download
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Invoice-INV-${invoice.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.dismiss();
      toast.success("PDF downloaded!");

    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error("Failed to download PDF");
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md border flex justify-between items-center">
      <div>
        <h2 className="text-lg font-semibold">Invoice INV-{invoice.id}</h2>
        <p className="text-sm text-gray-500">
          Issue Date: {formattedDate} | Linked to Order #{invoice.order_id}
        </p>
        <div className={`flex items-center gap-2 mt-2 font-medium ${status.color}`}>
          {status.icon}
          <span>{status.text}</span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold mb-2">{invoice.total_gross.toFixed(2)} PLN</p>
        <button
          onClick={handleDownload}
          disabled={loadingPdf}
          className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
        >
          <Download size={16} />
          {loadingPdf ? "Generating..." : "Download PDF"}
        </button>
      </div>
    </div>
  );
}

// Page Component
export default function MyInvoicesPage() {
  const { role } = useAuth();
  const [data, setData] = useState<PaginatedInvoices | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);
      try {
        // Using new endpoint /me
        const res = await api.get<PaginatedInvoices>("/invoices/me", {
          params: { page, page_size: 5 },
        });
        setData(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Failed to fetch invoices");
      } finally {
        setLoading(false);
      }
    };
    loadInvoices();
  }, [page]);

  if (role !== "customer") return <div>Access denied</div>;

  if (loading && !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">My Invoices</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">My Invoices</h1>
        <p>You don't have any invoices yet.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">My Invoices</h1>
      
      <div className="space-y-4">
        {data.items.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} />
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          className="border rounded px-3 py-1 disabled:opacity-50"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} / {totalPages}
        </span>
        <button
          className="border rounded px-3 py-1 disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}