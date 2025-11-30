import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { InvoiceDetail } from "../lib/types";
import { ArrowLeft, Download, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<InvoiceDetail>(`/invoices/${id}`);
        setInvoice(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Nie udało się pobrać szczegółów faktury");
        navigate("/invoices"); // Wróć do listy w razie błędu
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const downloadPdf = async () => {
    if (!invoice) return;
    setDownloading(true);
    const toastId = toast.loading("Pobieranie PDF...");
    try {
      await api.post(`/invoices/${invoice.id}/pdf`);
      const res = await api.get(`/invoices/${invoice.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Faktura-${invoice.full_number.replace('/', '_')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Pobrano PDF", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Błąd pobierania PDF", { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Ładowanie...</div>;
  if (!invoice) return null;

  const isCorrection = invoice.is_correction;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Przycisk powrotu */}
      <button 
        onClick={() => navigate("/invoices")} 
        className="flex items-center text-gray-600 mb-6 hover:text-black transition-colors"
      >
        <ArrowLeft size={18} className="mr-1" />
        Powrót do listy
      </button>

      {/* Baner informacyjny dla korekty */}
      {isCorrection && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r shadow-sm flex items-start gap-3">
          <AlertCircle className="text-yellow-600 mt-0.5" />
          <div>
            <h3 className="font-bold text-yellow-800">To jest faktura korygująca</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Dotyczy faktury o ID: <span 
                className="font-medium underline cursor-pointer hover:text-yellow-900"
                onClick={() => navigate(`/invoices/${invoice.parent_id}`)}
              >
                {invoice.parent_id}
              </span>
            </p>
            {invoice.correction_reason && (
              <p className="text-sm text-yellow-800 mt-2">
                <strong>Powód korekty:</strong> {invoice.correction_reason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Nagłówek faktury */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isCorrection ? "KOREKTA" : "Faktura"} {invoice.full_number}
            </h1>
            <p className="text-gray-500 text-sm">
              Data wystawienia: {new Date(invoice.created_at).toLocaleString("pl-PL")}
            </p>
            {/* Wyświetlamy techniczne ID tylko pomocniczo, małym drukiem */}
            <p className="text-gray-400 text-xs mt-1">ID systemowe: {invoice.id}</p>
          </div>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Download size={18} />
            {downloading ? "Pobieranie..." : "Pobierz PDF"}
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Nabywca</h3>
            <div className="text-gray-900 font-medium text-lg">{invoice.buyer_name}</div>
            <div className="text-gray-600">
              {invoice.buyer_nip && <p>NIP: {invoice.buyer_nip}</p>}
              {invoice.buyer_address && <p>{invoice.buyer_address}</p>}
            </div>
          </div>
          <div className="text-right">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Podsumowanie</h3>
            <div className="space-y-1">
              <div className="flex justify-end gap-4 text-gray-600">
                <span>Suma Netto:</span>
                <span className="font-medium">{invoice.total_net.toFixed(2)} zł</span>
              </div>
              <div className="flex justify-end gap-4 text-gray-600">
                <span>Suma VAT:</span>
                <span className="font-medium">{invoice.total_vat.toFixed(2)} zł</span>
              </div>
              <div className="flex justify-end gap-4 text-xl font-bold text-gray-900 mt-2 border-t pt-2">
                <span>Do zapłaty:</span>
                <span>{invoice.total_gross.toFixed(2)} zł</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela pozycji */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="bg-gray-50 px-6 py-3 border-b">
          <h3 className="font-semibold text-gray-700">Pozycje na dokumencie</h3>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-6 py-3 text-left font-medium">Produkt</th>
              <th className="px-6 py-3 text-right font-medium">Cena Netto</th>
              <th className="px-6 py-3 text-right font-medium">VAT</th>
              <th className="px-6 py-3 text-right font-medium">Ilość</th>
              <th className="px-6 py-3 text-right font-medium">Wartość Brutto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-gray-900 font-medium">{item.product_name}</td>
                <td className="px-6 py-4 text-right text-gray-600">{item.price_net.toFixed(2)}</td>
                <td className="px-6 py-4 text-right text-gray-600">{item.tax_rate}%</td>
                <td className="px-6 py-4 text-right text-gray-900">{item.quantity}</td>
                <td className="px-6 py-4 text-right font-medium text-gray-900">{item.total_gross.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}