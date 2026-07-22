import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Save, Plus, Receipt, Pencil, X, CreditCard, Gift, Copy, Check, Share2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { orgApi, type PaymentSettings } from '@/api/org';
import { serviceRatesApi, type ServiceRate, type RateModality } from '@/api/serviceRates';
import { startCheckout, billingApi, type PlanInfo, type BillingPeriod } from '@/api/billing';
import { Toggle, FieldRow, FInput, FSelect, SectionCard } from './primitives';

const MODALITY_LABELS: Record<string, string> = {
  IN_PERSON: 'Presencial',
  VIRTUAL:   'Virtual',
  HYBRID:    'Híbrida',
};

// formatMoney renders a decimal string ("80000.00") as a grouped amount without
// the trailing ",00" when there are no cents — never parsing money as a float.
function formatMoney(amount: string, currency: string): string {
  const [intPart, fracRaw = ''] = amount.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = fracRaw.replace(/0+$/, '');
  const sym = currency === 'COP' ? '$' : '';
  return `${sym}${grouped}${frac ? ',' + frac : ''} ${currency}`;
}

const EMPTY_RATE = { name: '', description: '', amount: '', currency: 'COP', modality: '' as '' | RateModality, staff_id: '' };

const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  trialing:  { label: 'Prueba gratuita', color: '#2a2769', bg: '#f3f2fb' },
  active:    { label: 'Plan activo',     color: '#059669', bg: '#ecfdf5' },
  past_due:  { label: 'Pago pendiente',  color: '#d97706', bg: '#fffbeb' },
  canceled:  { label: 'Cancelado',       color: '#dc2626', bg: '#fef2f2' },
  suspended: { label: 'Suspendido',      color: '#6b7280', bg: '#f9fafb' },
};

export function PlanStatusCard() {
  const { user } = useAuth();
  const [plan,   setPlan]   = useState<PlanInfo | null>(null);
  const [seats,  setSeats]  = useState(1);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    billingApi.plan()
      .then(p => { setPlan(p); setSeats(Math.max(p.seats_used, 1)); })
      .catch(() => {}); // non-admins (403) or older backends just see the plain card
  }, []);

  if (!user) return null;

  const status = user.subscription_status ?? 'trialing';
  const display = STATUS_DISPLAY[status] ?? { label: status, color: '#6b7280', bg: '#f9fafb' };

  let until: string | null = null;
  if (status === 'active' && user.current_period_end) {
    until = new Date(user.current_period_end).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  } else if (status === 'trialing' && user.trial_ends_at) {
    until = new Date(user.trial_ends_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Seat pricing only matters once the clinic has (or pays for) more than one
  // professional; solo practices keep the simple card.
  const multiSeat = plan !== null && (plan.seats_used > 1 || plan.seat_limit > 1);
  const minSeats  = Math.max(plan?.seats_used ?? 1, 1);
  const total     = plan ? (period === 'annual' ? plan.per_seat_annual_amount : plan.per_seat_amount) * seats : 0;

  const stepBtn = (label: string, onClick: () => void, disabled: boolean) => (
    <button onClick={onClick} disabled={disabled} style={{
      width: 26, height: 26, borderRadius: 7, border: '1.5px solid #c7c3e8', background: '#fff',
      color: disabled ? '#c7c3e8' : '#2a2769', fontWeight: 700, fontSize: 14, cursor: disabled ? 'default' : 'pointer', lineHeight: 1,
    }}>{label}</button>
  );

  const periodBtn = (label: string, value: BillingPeriod) => (
    <button onClick={() => setPeriod(value)} style={{
      padding: '5px 12px', borderRadius: 7, border: '1.5px solid #c7c3e8',
      background: period === value ? '#2a2769' : '#fff', color: period === value ? '#fff' : '#2a2769',
      fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div style={{ background: display.bg, border: `1.5px solid ${display.color}33`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: display.color }}>{display.label}</div>
        {until && (
          <div style={{ fontSize: 13, color: '#5f5a6e', marginTop: 2 }}>
            {status === 'active' ? 'Próxima renovación' : 'Período de prueba hasta'}: <strong>{until}</strong>
          </div>
        )}
        {status === 'active' && multiSeat && plan && (
          <div style={{ fontSize: 13, color: '#5f5a6e', marginTop: 2 }}>
            Asientos de profesional: <strong>{plan.seats_used} de {plan.seat_limit}</strong> en uso
            {plan.seats_used >= plan.seat_limit && ' — para ampliar el plan, escríbenos por WhatsApp'}
          </div>
        )}
      </div>
      {(status !== 'active') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {periodBtn('Mensual', 'monthly')}
              {periodBtn('Anual', 'annual')}
            </div>
            {multiSeat && plan && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: '#5f5a6e' }}>Profesionales:</span>
                {stepBtn('−', () => setSeats(s => Math.max(minSeats, s - 1)), seats <= minSeats)}
                <span style={{ fontWeight: 700, fontSize: 14, color: '#2a2769', minWidth: 18, textAlign: 'center' }}>{seats}</span>
                {stepBtn('+', () => setSeats(s => Math.min(100, s + 1)), seats >= 100)}
              </div>
            )}
            <span style={{ fontSize: 12.5, color: '#5f5a6e', whiteSpace: 'nowrap' }}>
              = <strong>${total.toLocaleString('es-CO')}</strong> COP{period === 'annual' ? ' (pago único, 12 meses)' : '/mes'}
            </span>
            <button
              onClick={() => startCheckout(multiSeat ? seats : undefined, period).catch(() => {})}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2a2769', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Activar plan
            </button>
          </div>
          <span style={{ fontSize: 11.5, color: '#5f5a6e', textAlign: 'right' }}>
            {period === 'annual'
              ? '2 meses gratis · tarjeta, PSE, Efecty o Nequi'
              : 'Débito automático mensual · solo tarjeta de crédito'}
          </span>
        </div>
      )}
    </div>
  );
}

export function OnlinePaymentCard() {
  const blank: PaymentSettings = { enabled: false, session_price: 180000, token_set: false, token_mode: '', webhook_secret_set: false };
  const [s, setS] = useState<PaymentSettings>(blank);
  const [token, setToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    orgApi.getPayment()
      .then(setS)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const out = await orgApi.savePayment({
        enabled: s.enabled,
        session_price: s.session_price,
        access_token: token,
        webhook_secret: webhookSecret,
      });
      setS(out);
      setToken('');
      setWebhookSecret('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* keep form */ }
    finally { setSaving(false); }
  };

  const modeBadge = s.token_set
    ? s.token_mode === 'test'
      ? <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700 }}>PRUEBA</span>
      : s.token_mode === 'live'
        ? <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 6, background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 700 }}>PRODUCCIÓN</span>
        : null
    : null;

  return (
    <SectionCard title="Pagos en línea (MercadoPago)" icon={CreditCard}>
      <p style={{ fontSize: 13, color: 'var(--s500)', lineHeight: 1.6, marginBottom: 12 }}>
        El dinero de las reservas en línea va directamente a la cuenta de MercadoPago de la clínica,
        separado del pago de suscripción a la plataforma.
      </p>
      <Toggle value={s.enabled} onChange={v => setS(p => ({ ...p, enabled: v }))}
        disabled={loading} label="Activar pagos en línea" sub="Habilita el botón de pago en el formulario de reserva público" />
      <FieldRow
        label={<span style={{ display: 'flex', alignItems: 'center' }}>Access Token (MP){modeBadge}</span>}
        sub={s.token_set ? 'Pega un token TEST-... para pruebas o APP_USR-... para producción' : 'Token de tu cuenta MercadoPago — APP_USR-... (producción) o TEST-... (pruebas)'}
      >
        <FInput value={token} onChange={setToken} mono disabled={loading}
          placeholder={s.token_set ? '••••••••••••••••' : 'APP_USR-... o TEST-...'} />
      </FieldRow>
      <FieldRow label="Clave secreta de webhook (MP)" sub={s.webhook_secret_set ? 'Clave guardada — pega una nueva para reemplazarla' : 'Clave secreta de notificaciones en el portal de MP'}>
        <FInput value={webhookSecret} onChange={setWebhookSecret} mono disabled={loading}
          placeholder={s.webhook_secret_set ? '••••••••••••••••' : 'b2faf936...'} />
      </FieldRow>
      <FieldRow label="Precio de sesión (COP)" sub="Monto que paga el paciente al reservar en línea">
        <FInput value={String(s.session_price)} onChange={v => setS(p => ({ ...p, session_price: Number(v) || 0 }))}
          mono disabled={loading} placeholder="180000" />
      </FieldRow>
      <button onClick={save} disabled={saving || loading} style={{
        marginTop: 8, padding: '9px 18px', borderRadius: 9, border: 'none',
        background: saving || loading ? 'var(--s200)' : 'var(--teal)',
        color: saving || loading ? 'var(--s400)' : '#fff',
        fontWeight: 600, fontSize: 13.5, cursor: saving || loading ? 'default' : 'pointer',
      }}>
        {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar pagos'}
      </button>
    </SectionCard>
  );
}

export function RatesSection() {
  const [rates,   setRates]   = useState<ServiceRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  // Clinical staff for per-professional rates: name resolution in the list and
  // the target selector in the form (only shown when the org has > 1).
  const [profs, setProfs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    import('@/api/auth')
      .then(({ authApi }) => authApi.listProfessionals())
      .then(res => setProfs((res.items ?? []).map(p => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, []);
  const profName = (id?: string | null) => profs.find(p => p.id === id)?.name;

  const [editing, setEditing] = useState<string | null>(null); // rate id, 'new', or null
  const [form,    setForm]    = useState(EMPTY_RATE);
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState('');

  // Initial fetch: `loading` already starts true, so the effect only fires the
  // request. `load` (spinner + fetch) is for event-handler refreshes.
  const fetchRates = useCallback(() => {
    serviceRatesApi.list(true)
      .then(setRates)
      .catch(() => setLoadErr('No se pudieron cargar las tarifas.'))
      .finally(() => setLoading(false));
  }, []);
  const load = () => {
    setLoading(true);
    fetchRates();
  };
  useEffect(() => { fetchRates(); }, [fetchRates]);

  const openNew = () => { setForm(EMPTY_RATE); setFormErr(''); setEditing('new'); };
  const openEdit = (r: ServiceRate) => {
    setForm({ name: r.name, description: r.description ?? '', amount: r.amount, currency: r.currency, modality: (r.modality ?? '') as '' | RateModality, staff_id: r.staff_id ?? '' });
    setFormErr(''); setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setFormErr(''); };

  const save = async () => {
    setSaving(true); setFormErr('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      amount: form.amount.trim().replace(/\s/g, ''), // dot = decimal separator (see field hint)
      currency: form.currency || 'COP',
      modality: form.modality === '' ? null : form.modality,
      staff_id: form.staff_id || null,
    };
    try {
      if (editing === 'new') await serviceRatesApi.create(payload);
      else if (editing)      await serviceRatesApi.update(editing, payload);
      setEditing(null);
      load();
    } catch (e) {
      setFormErr(e instanceof Error && e.message ? e.message : 'No se pudo guardar la tarifa.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: ServiceRate) => {
    setRates(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !x.is_active } : x));
    try { await serviceRatesApi.setActive(r.id, !r.is_active); }
    catch { load(); }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, padding: '12px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 11, fontSize: 12.5, color: '#065f46', lineHeight: 1.55 }}>
        <Receipt size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Define los precios de tus servicios. Estas tarifas se usarán al generar facturas y comprobantes de pago. No constituyen facturación electrónica DIAN.</span>
      </div>

      <SectionCard title="Tarifario de servicios" icon={Receipt} color="#10b981">
        {loading ? (
          <div style={{ padding: '22px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : loadErr ? (
          <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--red)' }}>{loadErr}</div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {rates.length === 0 && editing !== 'new' && (
              <div style={{ padding: '18px 0', fontSize: 13.5, color: 'var(--s500)', lineHeight: 1.6 }}>
                Aún no tienes tarifas. Crea la primera para empezar a facturar tus sesiones.
              </div>
            )}

            {rates.map(r => editing === r.id ? (
              <RateForm key={r.id} form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} err={formErr} profs={profs} />
            ) : (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--s100)', opacity: r.is_active ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>{r.name}</span>
                    {r.modality && <Badge label={MODALITY_LABELS[r.modality] ?? r.modality} color="#0369a1" bg="#e0f2fe" />}
                    {r.staff_id && <Badge label={profName(r.staff_id) ?? 'Profesional'} color="#7c3aed" bg="#f3e8ff" />}
                    {!r.is_active && <Badge label="Inactiva" color="var(--s500)" bg="var(--s100)" />}
                  </div>
                  {r.description && <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{r.description}</div>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>
                  {formatMoney(r.amount, r.currency)}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(r)} title="Editar"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s500)', cursor: 'pointer' }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => toggleActive(r)} title={r.is_active ? 'Desactivar' : 'Activar'}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--s200)', background: '#fff', color: r.is_active ? 'var(--s500)' : '#10b981', cursor: 'pointer' }}>
                    {r.is_active ? <X size={14} /> : <CheckCircle size={14} />}
                  </button>
                </div>
              </div>
            ))}

            {editing === 'new' && (
              <RateForm form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} err={formErr} profs={profs} />
            )}

            {editing !== 'new' && (
              <button onClick={openNew} style={{
                display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '9px 18px', borderRadius: 9, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                <Plus size={14} />Nueva tarifa
              </button>
            )}
          </div>
        )}
      </SectionCard>
    </>
  );
}

function RateForm({ form, setForm, onSave, onCancel, saving, err, profs }: {
  form: typeof EMPTY_RATE; setForm: (f: typeof EMPTY_RATE) => void;
  onSave: () => void; onCancel: () => void; saving: boolean; err: string;
  profs: { id: string; name: string }[];
}) {
  const upd = (patch: Partial<typeof EMPTY_RATE>) => setForm({ ...form, ...patch });
  return (
    <div style={{ padding: '14px 16px', margin: '8px 0', background: 'var(--s50)', borderRadius: 11, border: '1.5px solid var(--s200)' }}>
      <FieldRow label="Nombre" sub="Ej: Sesión individual, Primera consulta">
        <FInput value={form.name} onChange={v => upd({ name: v })} placeholder="Sesión individual" />
      </FieldRow>
      {profs.length > 1 && (
        <FieldRow label="Profesional" sub="Opcional — la tarifa aplica solo a este profesional">
          <FSelect value={form.staff_id} onChange={v => upd({ staff_id: v })}>
            <option value="">Toda la clínica</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FSelect>
        </FieldRow>
      )}
      <FieldRow label="Descripción" sub="Opcional">
        <FInput value={form.description} onChange={v => upd({ description: v })} placeholder="Detalle visible en la factura" />
      </FieldRow>
      <FieldRow label="Monto" sub="Sin puntos de mil; usa punto para decimales (ej: 80000)">
        <FInput value={form.amount} onChange={v => upd({ amount: v })} placeholder="80000" mono />
      </FieldRow>
      <FieldRow label="Moneda">
        <FSelect value={form.currency} onChange={v => upd({ currency: v })}>
          <option value="COP">COP — Peso colombiano</option>
          <option value="USD">USD — Dólar</option>
          <option value="EUR">EUR — Euro</option>
        </FSelect>
      </FieldRow>
      <FieldRow label="Modalidad" sub="Opcional — aplica a todas si se deja vacío">
        <FSelect value={form.modality} onChange={v => upd({ modality: v as '' | RateModality })}>
          <option value="">Todas las modalidades</option>
          <option value="IN_PERSON">Presencial</option>
          <option value="VIRTUAL">Virtual</option>
          <option value="HYBRID">Híbrida</option>
        </FSelect>
      </FieldRow>
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', padding: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{err}</div>}
      <div style={{ display: 'flex', gap: 8, paddingTop: 14 }}>
        <button onClick={onSave} disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
          background: saving ? 'var(--s200)' : '#10b981', color: saving ? 'var(--s400)' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
        }}>
          {saving ? 'Guardando…' : <><Save size={14} />Guardar tarifa</>}
        </button>
        <button onClick={onCancel} disabled={saving} style={{
          padding: '9px 18px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff',
          color: 'var(--s600)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Integrations section (CLINIC_ADMIN only, password-gated) ─────────────────

// ── Referral card ─────────────────────────────────────────────────────────────

// "Invite a colleague" — shareable landing link tagged with the org slug. The
// landing forwards ?ref= into the signup's referral_source, so the operator
// sees who brought whom and applies the reward (one free month) manually.
export function ReferralCard() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  if (!user?.org_slug) return null;
  const link = `https://chapni.com/?ref=${user.org_slug}`;
  const waText = encodeURIComponent(
    `Te comparto Chapni, el sistema que uso para mi consultorio: agenda, historia clínica cifrada y notas con IA. Con este enlace puedes probarlo gratis 14 días: ${link}`,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — the input below stays selectable */ }
  };

  return (
    <SectionCard title="Invita a un colega" icon={Gift} color="#d9a038">
      <p style={{ fontSize: 13, color: 'var(--s500)', lineHeight: 1.6, margin: '12px 0 14px' }}>
        Comparte tu enlace con colegas psicólogos. Cuando uno se suscriba habiendo llegado
        con tu enlace, te regalamos un mes de Chapni.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          readOnly
          value={link}
          onFocus={e => e.currentTarget.select()}
          style={{
            flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 9,
            border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s700)',
            fontFamily: "'DM Mono', monospace", background: 'var(--s50)',
          }}
        />
        <button
          onClick={copy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
            borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: copied ? '#10b981' : 'var(--teal)', color: '#fff', transition: 'background .2s',
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <a
          href={`https://wa.me/?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
            borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            background: '#25d366', color: '#fff',
          }}
        >
          <Share2 size={14} />
          WhatsApp
        </a>
      </div>
    </SectionCard>
  );
}
