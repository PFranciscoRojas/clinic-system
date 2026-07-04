import React, { useState, useEffect } from 'react';
import { AlertCircle, Key, CheckCircle, Users, Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmByTextModal } from '@/components/ui/ConfirmByTextModal';
import { authApi } from '@/api/auth';
import { billingApi, type PlanInfo } from '@/api/billing';
import { SectionCard } from './primitives';

const ROLES = [
  { value: 'PROFESSIONAL',  label: 'Psicólogo/a profesional' },
  { value: 'INTERN',        label: 'Practicante supervisado' },
  { value: 'RECEPTIONIST',  label: 'Recepcionista' },
];

const ASSIGNABLE_ROLES = [
  { value: 'CLINIC_ADMIN',   label: 'Administrador' },
  { value: 'PROFESSIONAL',   label: 'Psicólogo/a profesional' },
  { value: 'INTERN',         label: 'Practicante supervisado' },
  { value: 'RECEPTIONIST',   label: 'Recepcionista' },
];

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  CLINIC_ADMIN:  { label: 'Admin',          color: '#0369a1', bg: '#e0f2fe' },
  PROFESSIONAL:  { label: 'Profesional',    color: '#065f46', bg: '#d1fae5' },
  INTERN:        { label: 'Practicante',    color: '#92400e', bg: '#fef3c7' },
  RECEPTIONIST:  { label: 'Recepcionista',  color: '#4a4560', bg: '#f4eedd' },
};

function TeamCard({ selfId }: { selfId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['org-users'],
    queryFn: () => authApi.listOrgUsers().then(r => r.items),
  });
  const users = data ?? [];
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [pendingRemove, setPendingRemove] = useState<typeof users[0] | null>(null);
  const [reactivatingRole, setReactivatingRole] = useState<Record<string, string>>({});
  const [reactivating, setReactivating] = useState<string | null>(null);

  const changeRole = async (userId: string, roleName: string) => {
    setRowErr(e => ({ ...e, [userId]: '' }));
    try {
      await authApi.changeUserRole(userId, roleName);
      qc.invalidateQueries({ queryKey: ['org-users'] });
    } catch (ex) {
      setRowErr(e => ({ ...e, [userId]: ex instanceof Error ? ex.message : 'Error al cambiar rol' }));
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    setRowErr(e => ({ ...e, [pendingRemove.id]: '' }));
    try {
      await authApi.deactivateUser(pendingRemove.id);
      qc.invalidateQueries({ queryKey: ['org-users'] });
    } catch (ex) {
      setRowErr(e => ({ ...e, [pendingRemove.id]: ex instanceof Error ? ex.message : 'Error al eliminar' }));
    } finally {
      setPendingRemove(null);
    }
  };

  const handleReactivate = async (u: typeof users[0]) => {
    const role = reactivatingRole[u.id] ?? 'PROFESSIONAL';
    setReactivating(u.id);
    setRowErr(e => ({ ...e, [u.id]: '' }));
    try {
      await authApi.reactivateUser(u.id, role);
      qc.invalidateQueries({ queryKey: ['org-users'] });
    } catch (ex) {
      setRowErr(e => ({ ...e, [u.id]: ex instanceof Error ? ex.message : 'Error al reincorporar' }));
    } finally {
      setReactivating(null);
    }
  };

  return (
    <SectionCard title="Equipo" icon={Users} color="#0ea5e9">
      {pendingRemove && (
        <ConfirmByTextModal
          title="Eliminar del equipo"
          description={`"${pendingRemove.display_name || pendingRemove.email}" no podrá iniciar sesión. Su historial clínico se conserva y puede reincorporarse después.`}
          confirmText={pendingRemove.email}
          confirmLabel="Eliminar"
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
      {isLoading ? (
        <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : users.length === 0 ? (
        <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--s400)' }}>No hay usuarios en la organización.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 8 }}>
          {users.map(u => {
            const isSelf = u.id === selfId;
            const isActive = u.is_active;
            const badge = ROLE_BADGE[u.role_name] ?? { label: u.role_name, color: '#4a4560', bg: '#f4eedd' };
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--s100)', opacity: isActive ? 1 : 0.65 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: isActive ? 'var(--s800)' : 'var(--s400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.display_name || u.email}
                    {!isActive && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: 99 }}>Inactivo</span>}
                  </div>
                  {u.display_name && <div style={{ fontSize: 11.5, color: 'var(--s400)' }}>{u.email}</div>}
                </div>
                {isActive ? (
                  <>
                    <Badge label={badge.label} color={badge.color} bg={badge.bg} />
                    <select
                      disabled={isSelf}
                      value={u.role_name}
                      onChange={e => changeRole(u.id, e.target.value)}
                      title={isSelf ? 'No puedes cambiar tu propio rol' : 'Cambiar rol'}
                      style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid var(--s200)', fontSize: 12.5, color: 'var(--s700)', cursor: isSelf ? 'not-allowed' : 'pointer', background: isSelf ? 'var(--s100)' : '#fff' }}>
                      {ASSIGNABLE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    {!isSelf && (
                      <button
                        onClick={() => setPendingRemove(u)}
                        title="Eliminar del equipo"
                        style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, fontSize: 15, lineHeight: 1 }}>
                        ✕
                      </button>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <select
                      value={reactivatingRole[u.id] ?? 'PROFESSIONAL'}
                      onChange={e => setReactivatingRole(prev => ({ ...prev, [u.id]: e.target.value }))}
                      style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid var(--s200)', fontSize: 12.5, color: 'var(--s700)', background: '#fff' }}>
                      {ASSIGNABLE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button
                      onClick={() => handleReactivate(u)}
                      disabled={reactivating === u.id}
                      style={{ border: 'none', background: '#dcfce7', color: '#16a34a', cursor: reactivating === u.id ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 7 }}>
                      {reactivating === u.id ? '…' : 'Reincorporar'}
                    </button>
                  </div>
                )}
                {rowErr[u.id] && <div style={{ fontSize: 11.5, color: 'var(--red)' }}>{rowErr[u.id]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export function UsersSection() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('CLINIC_ADMIN') ?? false;
  const isProfessional = user?.roles?.includes('PROFESSIONAL') ?? false;
  // Only admins and practitioners may invite; interns/receptionists cannot.
  const canInvite = isAdmin || isProfessional;
  // A non-admin professional can invite support roles only; an admin, any role.
  const availableRoles = isAdmin ? ROLES : ROLES.filter(r => r.value !== 'PROFESSIONAL');
  const [roleName,     setRoleName]     = useState(isAdmin ? 'PROFESSIONAL' : 'INTERN');
  const [inviteCode,   setInviteCode]   = useState('');
  const [inviteExp,    setInviteExp]    = useState('');
  const [inviteLoading,setInviteLoading]= useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteErr,    setInviteErr]    = useState('');

  // Seat usage (paid plans): shown so the admin knows how many professionals
  // the plan still allows before generating invites that will be rejected.
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    billingApi.plan().then(setPlan).catch(() => {});
  }, [isAdmin]);

  const [resetEmail,   setResetEmail]   = useState('');
  const [resetPwd,     setResetPwd]     = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone,    setResetDone]    = useState(false);
  const [resetErr,     setResetErr]     = useState('');

  const handleGenerateInvite = async () => {
    setInviteLoading(true); setInviteCode(''); setInviteCopied(false); setInviteErr('');
    try {
      const { authApi } = await import('@/api/auth');
      const res = await authApi.invite(roleName);
      setInviteCode(res.invite_code);
      setInviteExp(new Date(res.expires_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }));
    } catch (ex) {
      setInviteErr(ex instanceof Error && ex.message ? ex.message : 'No se pudo generar la invitación.');
    } finally {
      setInviteLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErr(''); setResetDone(false); setResetLoading(true);
    try {
      const { authApi } = await import('@/api/auth');
      await authApi.resetPassword(resetEmail.trim(), resetPwd);
      setResetDone(true); setResetEmail(''); setResetPwd('');
      setTimeout(() => setResetDone(false), 3000);
    } catch (err: unknown) {
      setResetErr(err instanceof Error ? err.message : 'Error al restablecer');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      {canInvite && (
      <SectionCard title="Invitar nuevo usuario" icon={Plus} color="#0ea5e9">
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 14, lineHeight: 1.6 }}>
            Genera un código de invitación de un solo uso (válido 48 horas). El nuevo usuario lo ingresa en la pantalla de registro.
            {plan && plan.subscription_status === 'active' && (
              <> Asientos de profesional: <strong>{plan.seats_used} de {plan.seat_limit}</strong> en uso.</>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Rol a asignar</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {availableRoles.map(r => (
                <button key={r.value} onClick={() => setRoleName(r.value)} style={{
                  padding: '6px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all .12s',
                  border: `1.5px solid ${roleName === r.value ? '#0ea5e9' : 'var(--s200)'}`,
                  background: roleName === r.value ? '#e0f2fe' : '#fff',
                  color: roleName === r.value ? '#0369a1' : 'var(--s600)',
                }}>{r.label}</button>
              ))}
            </div>
          </div>
          <button onClick={handleGenerateInvite} disabled={inviteLoading} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
            background: inviteLoading ? 'var(--s200)' : '#0ea5e9', color: inviteLoading ? 'var(--s400)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: inviteLoading ? 'not-allowed' : 'pointer', marginBottom: inviteCode || inviteErr ? 14 : 0,
          }}>
            {inviteLoading
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Generando…</>
              : <><Plus size={14} />Generar código de invitación</>}
          </button>

          {inviteErr && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, fontSize: 12.5, color: '#dc2626' }}>
              {inviteErr}
            </div>
          )}

          {inviteCode && inviteCode !== 'ERROR' && (
            <div style={{ padding: '14px 16px', background: '#f0f9ff', border: '1.5px solid #7dd3fc', borderRadius: 11 }}>
              <div style={{ fontSize: 11.5, color: '#0369a1', fontWeight: 600, marginBottom: 6 }}>Código generado — expira el {inviteExp}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 900, letterSpacing: 6, color: '#0c4a6e', flex: 1 }}>
                  {inviteCode}
                </div>
                <button onClick={copyCode} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: `1.5px solid ${inviteCopied ? '#10b981' : '#7dd3fc'}`,
                  background: inviteCopied ? '#ecfdf5' : '#fff',
                  color: inviteCopied ? '#059669' : '#0369a1',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                }}>
                  {inviteCopied ? <><CheckCircle size={13} />Copiado</> : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
      )}

      {isAdmin && <SectionCard title="Restablecer contraseña" icon={Key} color="#ef4444">
        <form onSubmit={handleResetPassword} style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 14, lineHeight: 1.6 }}>
            Como administrador puedes restablecer la contraseña de cualquier usuario de tu organización.
            Cada usuario también puede hacerlo por su cuenta desde <b>"¿Olvidaste tu contraseña?"</b> en el inicio de sesión.
          </div>
          <div className="grid-2" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Correo del usuario</div>
              <input value={resetEmail} onChange={e => setResetEmail(e.target.value)} type="email" required
                placeholder="usuario@clinica.co"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Nueva contraseña</div>
              <input value={resetPwd} onChange={e => setResetPwd(e.target.value)} type="password" required minLength={8}
                placeholder="Mínimo 8 caracteres"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          {resetErr && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{resetErr}</div>}
          {resetDone && <div style={{ fontSize: 12.5, color: '#10b981', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={13} />Contraseña restablecida correctamente.</div>}
          <button type="submit" disabled={resetLoading} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
            background: resetLoading ? 'var(--s200)' : '#ef4444', color: resetLoading ? 'var(--s400)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: resetLoading ? 'not-allowed' : 'pointer',
          }}>
            {resetLoading
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Restableciendo…</>
              : <><Key size={14} />Restablecer contraseña</>}
          </button>
        </form>
      </SectionCard>}

      {!canInvite && !isAdmin && (
        <SectionCard title="Usuarios" icon={Users} color="#0ea5e9">
          <div style={{ padding: '16px 0', fontSize: 13.5, color: 'var(--s500)', lineHeight: 1.6 }}>
            No tienes permisos para invitar o administrar usuarios. Si necesitas dar acceso a alguien,
            pídeselo al administrador o al profesional de tu consultorio.
          </div>
        </SectionCard>
      )}

      {isAdmin && <TeamCard selfId={user?.user_id ?? ''} />}
    </>
  );
}

// ── Billing / service-rate catalogue section ──────────────────────────────────

