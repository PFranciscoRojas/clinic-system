import React, { useState } from 'react';
import { AlertCircle, Lock, Key, CheckCircle, Mail, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/api/auth';
import { adminApi } from '@/api/admin';
import { getLockConfig, setLockConfig } from '@/lib/screenLock';
import { Toggle, FieldRow, SectionCard, ChipBtn } from './primitives';

export function SecuritySection() {
  const { user } = useAuth();

  // Screen-lock config persists immediately to localStorage (device-local, like
  // the PIN) — it does NOT go through the global SaveBar, so no false "guardado".
  // Seeded synchronously: getLockConfig reads localStorage, so there is nothing
  // to wait for and no flash of default values.
  const [autoLock,    setAutoLock]    = useState(() => getLockConfig(user?.user_id).enabled);
  const [lockMin,     setLockMin]     = useState(() => getLockConfig(user?.user_id).minutes);
  const [lockSaved,   setLockSaved]   = useState(false);
  const [pin,         setPin]         = useState('');
  const [pin2,        setPin2]        = useState('');
  const [pinErr,      setPinErr]      = useState('');
  const [pinSaved,    setPinSaved]    = useState(false);

  const [curPwd,    setCurPwd]    = useState('');
  const [newPwd,    setNewPwd]    = useState('');
  const [newPwd2,   setNewPwd2]   = useState('');
  const [pwdErr,    setPwdErr]    = useState('');
  const [pwdSaved,  setPwdSaved]  = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);

  const [newEmail,      setNewEmail]      = useState('');
  const [emailErr,      setEmailErr]      = useState('');
  const [emailSaved,    setEmailSaved]    = useState('');
  const [emailSaving,   setEmailSaving]   = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErr(''); setPwdSaved(false);
    if (newPwd.length < 8)   { setPwdErr('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    if (newPwd !== newPwd2)  { setPwdErr('Las contraseñas nuevas no coinciden.'); return; }
    setPwdSaving(true);
    try {
      await authApi.changePassword(curPwd, newPwd);
      setPwdSaved(true);
      setCurPwd(''); setNewPwd(''); setNewPwd2('');
      setTimeout(() => setPwdSaved(false), 4000);
    } catch {
      setPwdErr('No se pudo cambiar la contraseña. Verifica la contraseña actual.');
    } finally {
      setPwdSaving(false);
    }
  };

  // Re-read the device-local lock config if the logged user ever changes
  // while this section stays mounted (render-time adjust, no effect).
  const [prevUserId, setPrevUserId] = useState(user?.user_id);
  if (user?.user_id !== prevUserId) {
    setPrevUserId(user?.user_id);
    const cfg = getLockConfig(user?.user_id);
    setAutoLock(cfg.enabled);
    setLockMin(cfg.minutes);
  }

  // Persist lock config immediately and flash an inline "guardado".
  const persistLock = (enabled: boolean, minutes: number) => {
    setLockConfig(user?.user_id, { enabled, minutes });
    setLockSaved(true);
    setTimeout(() => setLockSaved(false), 2000);
  };

  const handleAutoLockToggle = (v: boolean) => { setAutoLock(v); persistLock(v, lockMin); };
  const handleLockMin = (m: number) => { setLockMin(m); persistLock(autoLock, m); };

  const handlePinSave = () => {
    if (pin.length !== 4 || pin !== pin2) { setPinErr('Los PINs no coinciden o son muy cortos'); return; }
    setPinErr('');
    if (user?.user_id) localStorage.setItem(`sghcp_pin_${user.user_id}`, pin);
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2500);
    setPin(''); setPin2('');
  };

  return (
    <>
      <SectionCard title="Bloqueo de pantalla" icon={Lock} color="#ef4444">
        <Toggle value={autoLock} onChange={handleAutoLockToggle} label="Bloqueo automático por inactividad" sub="Bloquea la pantalla tras inactividad. Requiere un PIN configurado abajo." />
        <FieldRow label="Tiempo hasta bloqueo" sub="Minutos de inactividad antes del bloqueo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 7, opacity: autoLock ? 1 : 0.5 }}>
              {[2, 5, 10, 15, 30].map(m => (
                <ChipBtn key={m} active={lockMin === m} color="#ef4444" onClick={() => { if (autoLock) handleLockMin(m); }}>
                  {m}m
                </ChipBtn>
              ))}
            </div>
            {lockSaved && <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} />Guardado</span>}
          </div>
        </FieldRow>

        {/* PIN change */}
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--s800)', marginBottom: 12 }}>Cambiar PIN de bloqueo</div>
          <div className="grid-2" style={{ marginBottom: 10 }}>
            {[
              { label: 'Nuevo PIN (4 dígitos)', val: pin, set: setPin },
              { label: 'Confirmar PIN',         val: pin2, set: setPin2 },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6 }}>{label}</div>
                <input
                  type="password"
                  maxLength={4}
                  value={val}
                  onChange={e => { set(e.target.value.replace(/\D/g, '')); setPinErr(''); }}
                  placeholder="••••"
                  style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${pinErr ? '#ef4444' : 'var(--s200)'}`, borderRadius: 9, fontSize: 18, letterSpacing: 6, textAlign: 'center', color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}
                  onFocus={e => (e.target.style.borderColor = '#ef4444')}
                  onBlur={e => (e.target.style.borderColor = pinErr ? '#ef4444' : 'var(--s200)')}
                />
              </div>
            ))}
          </div>
          {pinErr && (
            <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertCircle size={12} color="#ef4444" />{pinErr}
            </div>
          )}
          {pinSaved && (
            <div style={{ fontSize: 12, color: '#10b981', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle size={12} color="#10b981" />PIN actualizado correctamente
            </div>
          )}
          <button
            onClick={handlePinSave}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Key size={13} />Actualizar PIN
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Cambiar contraseña" icon={Key} color="#ef4444">
        <form onSubmit={handlePasswordChange} style={{ padding: '14px 0' }}>
          <div className="grid-2" style={{ marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Contraseña actual</div>
              <input value={curPwd} onChange={e => setCurPwd(e.target.value)} type="password" required
                autoComplete="current-password"
                style={{ width: '100%', maxWidth: 340, padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Nueva contraseña</div>
              <input value={newPwd} onChange={e => setNewPwd(e.target.value)} type="password" required minLength={8}
                autoComplete="new-password" placeholder="Mínimo 8 caracteres"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Confirmar nueva contraseña</div>
              <input value={newPwd2} onChange={e => setNewPwd2(e.target.value)} type="password" required minLength={8}
                autoComplete="new-password"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          {pwdErr && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{pwdErr}</div>}
          {pwdSaved && <div style={{ fontSize: 12.5, color: '#10b981', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={13} />Contraseña actualizada correctamente.</div>}
          <button type="submit" disabled={pwdSaving} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
            background: pwdSaving ? 'var(--s200)' : '#ef4444', color: pwdSaving ? 'var(--s400)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: pwdSaving ? 'not-allowed' : 'pointer',
          }}>
            {pwdSaving
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Cambiando…</>
              : <><Key size={14} />Cambiar contraseña</>}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Cambiar correo" icon={Mail} color="#0369a1">
        <form onSubmit={async e => {
          e.preventDefault();
          setEmailErr(''); setEmailSaved(''); setEmailSaving(true);
          try {
            await authApi.requestEmailChange(newEmail.trim());
            setEmailSaved(`Enviamos un enlace de confirmación a ${newEmail.trim()}. Haz clic en él para confirmar el cambio.`);
            setNewEmail('');
          } catch (ex) {
            setEmailErr(ex instanceof Error && ex.message ? ex.message : 'No se pudo enviar el enlace.');
          } finally { setEmailSaving(false); }
        }} style={{ padding: '14px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" required placeholder="nuevo@correo.com"
              style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s800)', outline: 'none' }} />
            {emailErr  && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={13} />{emailErr}</div>}
            {emailSaved && <div style={{ fontSize: 12.5, color: '#065f46', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={13} />{emailSaved}</div>}
            <button type="submit" disabled={emailSaving || !newEmail.trim()}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: emailSaving ? 'var(--s200)' : '#0369a1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: emailSaving ? 'wait' : 'pointer' }}>
              <Mail size={14} />{emailSaving ? 'Enviando…' : 'Enviar enlace de confirmación'}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* Admin-only test-data wipe — only when the server has it enabled */}
      {user?.data_reset_enabled && (user?.roles ?? []).includes('CLINIC_ADMIN') && <DataResetCard />}
    </>
  );
}

// Wipes all clinical test data for the organization. Gated three ways: the
// server-side is_internal check (only the operator's own org and the CI demo
// org), the CLINIC_ADMIN role, and a typed confirmation.
function DataResetCard() {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState('');
  const [err, setErr]         = useState('');

  const handleReset = async () => {
    setErr(''); setDone('');
    if (confirm !== 'ELIMINAR') { setErr('Escribe ELIMINAR para confirmar.'); return; }
    setBusy(true);
    try {
      const res = await adminApi.resetClinicalData(confirm);
      const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      setDone(`Datos de prueba eliminados (${total} registros). La base quedó limpia.`);
      setConfirm('');
      queryClient.invalidateQueries();
    } catch {
      setErr('No se pudo limpiar los datos. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Zona de pruebas — limpiar datos" icon={Trash2} color="#dc2626">
      <div style={{ padding: '14px 0' }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: '#991b1b', lineHeight: 1.6 }}>
            Elimina <b>todos</b> los pacientes, citas, registros clínicos, borradores de IA y
            consentimientos firmados de la organización. <b>Conserva</b> tu perfil profesional con
            firma, las plantillas de consentimiento, los usuarios y los catálogos.
            Es <b>irreversible</b> — úsalo solo mientras haces pruebas.
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6 }}>Escribe <b>ELIMINAR</b> para confirmar</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setErr(''); }}
            placeholder="ELIMINAR"
            style={{ padding: '9px 12px', borderRadius: 9, border: `1.5px solid ${err ? '#dc2626' : 'var(--s200)'}`, fontSize: 13, width: 180, letterSpacing: 1, fontWeight: 600 }}
          />
          <button
            onClick={handleReset}
            disabled={busy || confirm !== 'ELIMINAR'}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: busy || confirm !== 'ELIMINAR' ? 'var(--s200)' : '#dc2626', color: busy || confirm !== 'ELIMINAR' ? 'var(--s400)' : '#fff', fontSize: 13, fontWeight: 700, cursor: busy || confirm !== 'ELIMINAR' ? 'not-allowed' : 'pointer' }}
          >
            {busy
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Limpiando…</>
              : <><Trash2 size={14} />Limpiar datos de prueba</>}
          </button>
        </div>
        {err  && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{err}</div>}
        {done && <div style={{ fontSize: 12.5, color: '#10b981', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={13} />{done}</div>}
      </div>
    </SectionCard>
  );
}

// ── Consent templates section (real API, versioned) ──────────────────────────

