import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { loadSavedAccent } from '@/lib/theme';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui/Spinner';
import { LoginPage } from '@/pages/Login/LoginPage';
import { DashboardPage } from '@/pages/Dashboard/DashboardPage';
import { PatientsPage } from '@/pages/Patients/PatientsPage';
import { PatientProfilePage } from '@/pages/Patients/PatientProfilePage';
import { NewPatientPage } from '@/pages/Patients/NewPatientPage';
import { NewAppointmentPage } from '@/pages/Appointments/NewAppointmentPage';
import { AppointmentPage } from '@/pages/Appointments/AppointmentPage';
import { AIDraftPage } from '@/pages/AIDrafts/AIDraftPage';
import { ClinicalRecordPage } from '@/pages/ClinicalRecords/ClinicalRecordPage';
import { ConsentSignPage } from '@/pages/Public/ConsentSignPage';
import { ResetPasswordPage } from '@/pages/Public/ResetPasswordPage';
import { SignupPage } from '@/pages/Public/SignupPage';
import { VerifyEmailPage } from '@/pages/Public/VerifyEmailPage';
import { VerifyEmailChangePage } from '@/pages/Public/VerifyEmailChangePage';
import { BillingReturnPage } from '@/pages/Public/BillingReturnPage';
import { BookingWizardPage } from '@/pages/Public/BookingWizardPage';
import { BookingPaymentReturnPage } from '@/pages/Public/BookingPaymentReturnPage';
import { TermsPage } from '@/pages/Public/legal/TermsPage';
import { PrivacyPage } from '@/pages/Public/legal/PrivacyPage';
import { ClinicalPage } from '@/pages/Clinical/ClinicalPage';
import { BillingPage } from '@/pages/Billing/BillingPage';
import { SettingsPage } from '@/pages/Settings/SettingsPage';
import { SuperAdminPage } from '@/pages/Admin/SuperAdminPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={32} color="var(--teal)" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, isLoading } = useAuth();

  useEffect(() => { loadSavedAccent(user?.user_id); }, [user?.user_id]);

  if (isLoading) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={32} color="var(--teal)" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user && localStorage.getItem(`sghcp_onboarding_done_${user.user_id}`) ? <Navigate to="/" replace /> : <LoginPage />}
      />
      {/* Public remote consent signature — the single-use token is the credential */}
      <Route path="/sign/:token" element={<ConsentSignPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-email-change" element={<VerifyEmailChangePage />} />
      <Route path="/billing/return" element={<BillingReturnPage />} />
      <Route path="/book/return" element={<BookingPaymentReturnPage />} />
      <Route path="/book/:slug" element={<BookingWizardPage />} />
      <Route path="/legal/terminos" element={<TermsPage />} />
      <Route path="/legal/privacidad" element={<PrivacyPage />} />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route index element={<DashboardPage />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="patients/new" element={<NewPatientPage />} />
                <Route path="patients/:id" element={<PatientProfilePage />} />
                <Route path="appointments/new" element={<NewAppointmentPage />} />
                <Route path="appointments/:id" element={<AppointmentPage />} />
                <Route path="clinical" element={<ClinicalPage />} />
                <Route path="ai-drafts/:id" element={<AIDraftPage />} />
                <Route path="clinical-records/:id" element={<ClinicalRecordPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="admin" element={<SuperAdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
