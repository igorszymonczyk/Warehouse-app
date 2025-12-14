// Generic pagination wrapper
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// Summary representation of an invoice for list views
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

// Detailed representation of an invoice line item
// product_name is snapshotted at creation time
export interface InvoiceItemDetail {
  product_id: number;
  product_name: string;
  quantity: number;
  price_net: number;
  tax_rate: number;
  total_net: number;
  total_gross: number;
}

// Full invoice details including buyer info and item list
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
  shipping_address: string | null;
}

// Represents a Warehouse Document (WZ) entity
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