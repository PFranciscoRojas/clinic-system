import { api } from './client';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'INSURED' | 'CANCELLED';

export type PaymentMethod =
  | 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'BANK_TRANSFER'
  | 'NEQUI' | 'DAVIPLATA' | 'BREB' | 'PSE' | 'INSURANCE_EPS' | 'INSURANCE_PRIVATE' | 'OTHER';

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
  invoice_number?: number | null;
  service?: string;
  receipt_sent_at?: string | null;
}

/** Human consecutive label (F-000001) or the short id for a draft. */
export function invoiceLabel(inv: Pick<Invoice, 'invoice_number' | 'id'>): string {
  if (inv.invoice_number != null) return `F-${String(inv.invoice_number).padStart(6, '0')}`;
  return inv.id.slice(0, 8).toUpperCase();
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

export interface SeriesPoint {
  label: string;
  online: string;
  direct: string;
}

export interface MethodStat {
  label: string;
  channel: 'online' | 'direct';
  count: number;
  amount: string;
}

export type BillingPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface BillingOverview {
  currency: string;
  period: BillingPeriod;
  income: string;         // collected in period (online + direct)
  income_online: string;
  income_direct: string;
  income_prev: string;    // same-elapsed previous period
  has_delta: boolean;
  payments_count: number;
  pending: string;        // current outstanding (cartera)
  overdue: string;        // overdue slice of cartera
  overdue_count: number;
  invoiced: string;       // all-time invoiced (non-cancelled)
  collected: string;      // all-time collected
  collected_pct: number;
  methods: MethodStat[];  // in period
  series: SeriesPoint[];  // income bucketed for the period
}

export interface PatientBalance {
  patient_id: string;
  name: string;
  sessions: number;
  invoiced: string;
  collected: string;
  pending: string;
  paid_pct: number;
}

export interface BookingPayment {
  id: string;
  booking_number: number;
  scheduled_at: string;
  guest_name: string;
  email: string;
  phone: string;
  modality: string;
  amount: number;
  status: 'PAID' | 'PENDING_PAYMENT';
  payment_type: string;
  payment_method: string;
  mp_payment_id: string;
  voucher_url: string;
  hold_expires_at: string | null;
  paid_at: string | null;
  appointment_id: string | null;
}

export const invoicesApi = {
  listByPatient: (patientId: string) => api.get<Invoice[]>(`/invoices?patient_id=${patientId}`),
  patientsBalance: (period: BillingPeriod = 'all') =>
    api.get<PatientBalance[]>(`/invoices/patients-balance${period && period !== 'all' ? `?period=${period}` : ''}`),
  listAll: (status?: string, period?: BillingPeriod) =>
    api.get<Invoice[]>(`/invoices?with_patient=true${status ? `&status=${status}` : ''}${period && period !== 'all' ? `&period=${period}` : ''}`),
  overview: (period: BillingPeriod = 'month') => api.get<BillingOverview>(`/invoices/overview?period=${period}`),
  listBookings: (status?: string, period?: BillingPeriod) =>
    api.get<BookingPayment[]>(`/invoices/bookings${status || (period && period !== 'all') ? '?' : ''}${status ? `status=${status}` : ''}${status && period && period !== 'all' ? '&' : ''}${period && period !== 'all' ? `period=${period}` : ''}`),
  sendReminders: () => api.post<{ sent: number; skipped: number; pending: number }>('/invoices/send-reminders', {}),
  get: (id: string) => api.get<Invoice>(`/invoices/${id}`),
  create: (input: CreateInvoiceInput) => api.post<Invoice>('/invoices', input),
  issue: (id: string, dueAt?: string) =>
    api.post<Invoice>(`/invoices/${id}/issue`, dueAt ? { due_at: dueAt } : {}),
  cancel: (id: string) => api.post<Invoice>(`/invoices/${id}/cancel`, {}),
  recordPayment: (id: string, input: RecordPaymentInput) =>
    api.post<Invoice>(`/invoices/${id}/payments`, input),
  send: (id: string) => api.post<{ sent: boolean; email?: string }>(`/invoices/${id}/send`, {}),
  downloadReceipt: (id: string): Promise<Blob> =>
    api.getBlob(`/invoices/${id}/receipt`, 'No se pudo generar el comprobante'),
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  DEBIT_CARD: 'Tarjeta débito',
  CREDIT_CARD: 'Tarjeta crédito',
  BANK_TRANSFER: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  BREB: 'Bre-B (llave)',
  PSE: 'PSE',
  INSURANCE_EPS: 'EPS',
  INSURANCE_PRIVATE: 'Seguro privado',
  OTHER: 'Otro',
};

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Borrador',     color: '#4a4560', bg: '#f4eedd' },
  ISSUED:    { label: 'Emitida',      color: '#0369a1', bg: '#e0f2fe' },
  PARTIAL:   { label: 'Pago parcial', color: '#b45309', bg: '#fef3c7' },
  PAID:      { label: 'Pagada',       color: '#065f46', bg: '#d1fae5' },
  INSURED:   { label: 'Por seguro',   color: '#2a2769', bg: '#e4e2f6' },
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
