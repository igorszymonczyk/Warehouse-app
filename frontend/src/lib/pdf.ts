import { api } from "./api";

/** WZ: generuj + pobierz */
export async function downloadWZPdf(id: number) {
  await api.post(`/warehouse-documents/${id}/pdf`);
  const url = `${api.defaults.baseURL}/warehouse-documents/${id}/download`;
  window.open(url, "_blank");
}

/** Faktury: jeśli masz takie endpointy – analogicznie */
export async function downloadInvoicePdf(id: number) {
  await api.post(`/invoices/${id}/pdf`);
  const url = `${api.defaults.baseURL}/invoices/${id}/download`;
  window.open(url, "_blank");
}
