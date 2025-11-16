import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { InvoiceDetail } from "../lib/types";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<InvoiceDetail>(`/invoices/${id}`);
        setInvoice(res.data);
      } catch (err) {
        setError("Failed to fetch invoice details. It might not exist.");
        console.error("Błąd przy pobieraniu faktury:", err);
      } finally {
        setLoading(false);
      }
    };
    if (id) {
      fetchInvoice();
    }
  }, [id]);

  if (loading) return <div className="p-6 text-center">Ładowanie...</div>;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;
  if (!invoice) return <div className="p-6 text-center">Nie znaleziono faktury.</div>;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Faktura #{invoice.id}</h1>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors"
          >
            &larr; Wróć do listy
          </button>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-600 mb-2">Nabywca</h2>
              <p className="font-bold text-xl">{invoice.buyer_name}</p>
              {invoice.buyer_nip && <p className="text-gray-500">NIP: {invoice.buyer_nip}</p>}
              {invoice.buyer_address && <p className="text-gray-500">{invoice.buyer_address}</p>}
            </div>
            <div className="text-left md:text-right">
              <h2 className="text-lg font-semibold text-gray-600 mb-2">Szczegóły faktury</h2>
              <p><span className="font-semibold">Numer:</span> INV-{invoice.id}</p>
              <p><span className="font-semibold">Data wystawienia:</span> {new Date(invoice.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left font-semibold">Produkt</th>
                  <th className="p-3 text-right font-semibold">Ilość</th>
                  <th className="p-3 text-right font-semibold">Cena netto</th>
                  <th className="p-3 text-right font-semibold">VAT</th>
                  <th className="p-3 text-right font-semibold">Wartość brutto</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={index} className="border-t">
                    <td className="p-3">{item.product_name}</td>
                    <td className="p-3 text-right">{item.quantity}</td>
                    <td className="p-3 text-right">{item.price_net.toFixed(2)} zł</td>
                    <td className="p-3 text-right">{item.tax_rate}%</td>
                    <td className="p-3 text-right">{item.total_gross.toFixed(2)} zł</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mt-6">
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-gray-600">
                <span>Suma netto:</span>
                <span>{invoice.total_net.toFixed(2)} zł</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Suma VAT:</span>
                <span>{invoice.total_vat.toFixed(2)} zł</span>
              </div>
              <div className="flex justify-between font-bold text-xl mt-2 pt-2 border-t">
                <span>Suma brutto:</span>
                <span>{invoice.total_gross.toFixed(2)} zł</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}