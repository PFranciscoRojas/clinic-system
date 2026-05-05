import { useState } from 'react';
import { Brain, Mail, Lock, Building2, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Field } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';

type Step = 'login' | 'onboarding-1' | 'onboarding-2' | 'onboarding-3' | 'onboarding-complete';

const ONBOARDING_STEPS = [
  {
    step: 1,
    title: '¿Cómo prefieres que te llamemos?',
    subtitle: 'Usaremos este nombre en tus reportes y comunicaciones.',
  },
  {
    step: 2,
    title: 'Tu especialidad principal',
    subtitle: 'Esto nos ayuda a personalizar las plantillas clínicas.',
  },
  {
    step: 3,
    title: 'Configura tu firma digital',
    subtitle: 'Se usará para firmar las historias clínicas electrónicamente.',
  },
];

const SPECIALTIES = [
  'Psicología Clínica',
  'Neuropsicología',
  'Psicología Infantil y Adolescente',
  'Psicología Organizacional',
  'Psicología Forense',
  'Otra especialidad',
];

export function LoginPage() {
  const { login } = useAuth();
  const [step, setStep]         = useState<Step>('login');
  const [org, setOrg]           = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [specialty, setSpecialty]     = useState('');
  const [signature, setSignature]     = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org.trim() || !email.trim() || !password) {
      setError('Todos los campos son requeridos');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(org.trim().toLowerCase(), email.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión';
      setError(msg.includes('401') || msg.includes('invalid') ? 'Credenciales incorrectas' : msg);
    } finally {
      setLoading(false);
    }
  };

  if (step !== 'login') {
    return <OnboardingFlow step={step} setStep={setStep} displayName={displayName} setDisplayName={setDisplayName} specialty={specialty} setSpecialty={setSpecialty} signature={signature} setSignature={setSignature} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--teal) 0%, #0d9488 40%, var(--teal-dark) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background blobs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: 600, height: 600, background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-15%', left: '-5%', width: 400, height: 400, background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '40%', left: '30%', width: 200, height: 200, background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 440, animation: 'fadeUp .4s ease' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, background: 'rgba(255,255,255,0.15)',
            borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          }}>
            <Brain size={32} color="#fff" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>SGHCP</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: '6px 0 0' }}>
            Sistema de Gestión de Historias Clínicas Psicológicas
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          borderRadius: 20,
          padding: 36,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', margin: '0 0 6px' }}>
            Bienvenido de vuelta
          </h2>
          <p style={{ fontSize: 14, color: 'var(--s400)', margin: '0 0 28px' }}>
            Ingresa con tus credenciales institucionales
          </p>

          <form onSubmit={handleLogin}>
            <Field
              label="Organización"
              value={org}
              onChange={setOrg}
              icon={Building2}
              placeholder="slug-de-tu-clinica"
              required
              autoComplete="organization"
            />
            <Field
              label="Correo electrónico"
              value={email}
              onChange={setEmail}
              icon={Mail}
              type="email"
              placeholder="tu@clinica.com"
              required
              autoComplete="email"
            />
            <Field
              label="Contraseña"
              value={password}
              onChange={setPassword}
              icon={Lock}
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 10, padding: '10px 14px', marginBottom: 18,
                fontSize: 13, color: 'var(--red)',
              }}>
                <AlertCircle size={15} color="var(--red)" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '13px', borderRadius: 11,
                background: loading ? 'var(--s200)' : 'var(--teal)',
                color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all .15s',
              }}
            >
              {loading ? <Spinner size={18} color="#fff" /> : (
                <>Ingresar <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button
              style={{ fontSize: 13, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
              onClick={() => {/* TODO: forgot password flow */}}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20 }}>
          Protegido bajo la Ley 1581/2012 · Res. 1995/1999
        </p>
      </div>
    </div>
  );
}

interface OnboardingProps {
  step: Step;
  setStep: (s: Step) => void;
  displayName: string; setDisplayName: (v: string) => void;
  specialty: string; setSpecialty: (v: string) => void;
  signature: string; setSignature: (v: string) => void;
}

function OnboardingFlow({ step, setStep, displayName, setDisplayName, specialty, setSpecialty, signature, setSignature }: OnboardingProps) {
  const stepNum = step === 'onboarding-1' ? 1 : step === 'onboarding-2' ? 2 : step === 'onboarding-3' ? 3 : 4;
  const isComplete = step === 'onboarding-complete';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--teal) 0%, #0d9488 40%, var(--teal-dark) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 480, animation: 'fadeUp .3s ease' }}>
        {isComplete ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: 48, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ width: 64, height: 64, background: '#d1fae5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 size={32} color="#059669" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 10px' }}>¡Todo listo!</h2>
            <p style={{ color: 'var(--s500)', fontSize: 14, margin: '0 0 28px' }}>
              Tu cuenta está configurada. Puedes empezar a usar SGHCP.
            </p>
            <button
              onClick={() => window.location.replace('/')}
              style={{
                padding: '12px 32px', borderRadius: 10, background: 'var(--teal)',
                color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600,
              }}
            >
              Ir al sistema
            </button>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 20, padding: 36, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            {/* Progress */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= stepNum ? 'var(--teal)' : 'var(--s100)', transition: 'background .3s' }} />
              ))}
            </div>

            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 8px' }}>
              Paso {stepNum} de 3
            </p>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', margin: '0 0 6px' }}>
              {ONBOARDING_STEPS[stepNum - 1].title}
            </h2>
            <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 24px' }}>
              {ONBOARDING_STEPS[stepNum - 1].subtitle}
            </p>

            {step === 'onboarding-1' && (
              <Field label="Nombre para mostrar" value={displayName} onChange={setDisplayName} placeholder="Dra. María González" required />
            )}
            {step === 'onboarding-2' && (
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 10 }}>
                  Especialidad <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {SPECIALTIES.map(s => (
                    <button
                      key={s}
                      onClick={() => setSpecialty(s)}
                      style={{
                        padding: '10px 12px', borderRadius: 10, textAlign: 'left', fontSize: 13,
                        border: `1.5px solid ${specialty === s ? 'var(--teal)' : 'var(--s200)'}`,
                        background: specialty === s ? 'rgba(20,184,166,0.06)' : '#fff',
                        color: specialty === s ? 'var(--teal)' : 'var(--s600)',
                        cursor: 'pointer', fontWeight: specialty === s ? 600 : 400, transition: 'all .15s',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 'onboarding-3' && (
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 8 }}>
                  Firma digital
                </label>
                <div style={{
                  border: '1.5px dashed var(--s200)', borderRadius: 11, padding: 20,
                  background: 'var(--s50)', textAlign: 'center',
                }}>
                  {signature ? (
                    <div style={{ fontFamily: 'cursive', fontSize: 28, color: 'var(--s700)' }}>{signature}</div>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: 'var(--s400)', margin: '0 0 12px' }}>
                        Escribe tu nombre completo como firma
                      </p>
                      <input
                        value={signature}
                        onChange={e => setSignature(e.target.value)}
                        placeholder="Tu nombre completo"
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--s200)',
                          fontSize: 14, background: '#fff', boxSizing: 'border-box',
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                if (step === 'onboarding-1') setStep('onboarding-2');
                else if (step === 'onboarding-2') setStep('onboarding-3');
                else setStep('onboarding-complete');
              }}
              style={{
                width: '100%', padding: 13, borderRadius: 11, background: 'var(--teal)',
                color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {step === 'onboarding-3' ? 'Finalizar configuración' : 'Continuar'} <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
