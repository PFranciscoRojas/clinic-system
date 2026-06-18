import { api } from './client';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'INSURED' | 'CANCELLED';

export type PaymentMethod =
  | 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'BANK_TRANSFER'
  | 'NEQUI' | 'DAVIPLATA' | 'PSE' | 'INSURANCE_EPS' | 'INSURANCE_PRIVATE' | 'OTHER';

export interface Payment {
  id: string;
  amount: string;
  currency: string;
  payment_method: PaymentMethod;
  reference?: string;
  notes?: string;
  paid_at: string;
}

export interface Invoice {
  id: string;
  patient_id: string;
  patient_name?: string;
  appointment_id?: string | null;
  rate_id?: string | null;
  currency: string;
  subtotal: string;
  discount: string;
  insurance_covered: string;
  total_due: string;
  total_paid: string;
  status: InvoiceStatus;
  notes?: string;
  issued_at?: string | null;
  due_at?: string | null;
  created_at: string;
  payments?: Payment[];
}

export interface CreateInvoiceInput {
  patient_id: string;
  rate_id?: string | null;
  appointment_id?: string | null;
  currency?: string;
  subtotal: string;
  discount?: string;
  insurance_covered?: string;
  notes?: string;
  due_at?: string | null;
}

export interface RecordPaymentInput {
  amount: string;
  payment_method: PaymentMethod;
  reference?: string;
  notes?: string;
  paid_at?: string;
}

export interface InvoiceSummary {
  invoiced: string;
  collected: string;
  pending: string;
  currency: string;
  count: number;
  draft: number;
  issued: number;
  partial: number;
  paid: number;
  cancelled: number;
}

export const invoicesApi = {
  listByPatient: (patientId: string) => api.get<Invoice[]>(`/invoices?patient_id=${patientId}`),
  listAll: (status?: string) =>
    api.get<Invoice[]>(`/invoices?with_patient=true${status ? `&status=${status}` : ''}`),
  summary: () => api.get<InvoiceSummary>('/invoices/summary'),
  get: (id: string) => api.get<Invoice>(`/invoices/${id}`),
  create: (input: CreateInvoiceInput) => api.post<Invoice>('/invoices', input),
  issue: (id: string, dueAt?: string) =>
    api.post<Invoice>(`/invoices/${id}/issue`, dueAt ? { due_at: dueAt } : {}),
  cancel: (id: string) => api.post<Invoice>(`/invoices/${id}/cancel`, {}),
  recordPayment: (id: string, input: RecordPaymentInput) =>
    api.post<Invoice>(`/invoices/${id}/payments`, input),
  downloadReceipt: async (id: string): Promise<Blob> => {
    const res = await fetch(`/api/v1/invoices/${id}/receipt`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
    });
    if (!res.ok) throw new Error('No se pudo generar el comprobante');
    return res.blob();
  },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  DEBIT_CARD: 'Tarjeta débito',
  CREDIT_CARD: 'Tarjeta crédito',
  BANK_TRANSFER: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  PSE: 'PSE',
  INSURANCE_EPS: 'EPS',
  INSURANCE_PRIVATE: 'Seguro privado',
  OTHER: 'Otro',
};

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Borrador',     color: '#475569', bg: '#f1f5f9' },
  ISSUED:    { label: 'Emitida',      color: '#0369a1', bg: '#e0f2fe' },
  PARTIAL:   { label: 'Pago parcial', color: '#b45309', bg: '#fef3c7' },
  PAID:      { label: 'Pagada',       color: '#065f46', bg: '#d1fae5' },
  INSURED:   { label: 'Por seguro',   color: '#0f766e', bg: '#ccfbf1' },
  CANCELLED: { label: 'Anulada',      color: '#991b1b', bg: '#fee2e2' },
};

/** Render a decimal money string ("80000.00") grouped, dropping trailing ",00". */
export function formatMoney(amount: string, currency = 'COP'): string {
  const [intPart, fracRaw = ''] = amount.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = fracRaw.replace(/0+$/, '');
  const sym = currency === 'COP' ? '$' : '';
  return `${sym}${grouped}${frac ? ',' + frac : ''} ${currency}`;
}

/** Remaining balance (decimal string) of an invoice. */
export function balanceOf(inv: Invoice): string {
  const due = Math.round(parseFloat(inv.total_due) * 100);
  const paid = Math.round(parseFloat(inv.total_paid) * 100);
  return ((due - paid) / 100).toFixed(2);
}
