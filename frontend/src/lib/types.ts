export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// For the invoice list page (as used in InvoicesPage.tsx)
export interface Invoice {
  id: number;
  full_number: string;
  created_at: string;
  buyer_name: string;
  buyer_nip: string | null;
  total_gross: number;
  total_net: number;
  total_vat: number;
  is_correction: boolean;
  parent_id?: number | null;
  correction_reason?: string | null;
}

// Represents a single item within a detailed invoice view.
// product_name is now a required string, snapshotted from the product at creation time.
export interface InvoiceItemDetail {
  product_id: number;
  product_name: string;
  quantity: number;
  price_net: number;
  tax_rate: number;
  total_net: number;
  total_gross: number;
}

// For the full invoice detail page (as used in InvoiceDetailPage.tsx)
export interface InvoiceDetail {
  id: number;
  full_number: string;
  buyer_name: string;
  buyer_nip: string | null;
  buyer_address: string | null;
  created_at: string;
  total_net: number;
  total_vat: number;
  total_gross: number;
  items: InvoiceItemDetail[];
  is_correction: boolean;
  parent_id?: number | null;
  correction_reason?: string | null;
}

// Warehouse Document Type
export interface WarehouseDoc {
  id: number;
  buyer_name: string | null;
  invoice_id: number | null;
  invoice_date: string | null;
  items_json: string | null;
  status: "NEW" | "IN_PROGRESS" | "RELEASED" | "CANCELLED";
  created_at: string;
  pdf_path?: string | null;
}