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
import { NewClinicalRecordPage } from '@/pages/ClinicalRecords/NewClinicalRecordPage';
import { BookingPage } from '@/pages/Booking/BookingPage';
import { ConsentSignPage } from '@/pages/Public/ConsentSignPage';
import { BookingRequestsPage } from '@/pages/BookingRequests/BookingRequestsPage';
import { EvaluationsPage } from '@/pages/Evaluations/EvaluationsPage';
import { BillingPage } from '@/pages/Billing/BillingPage';
import { SettingsPage } from '@/pages/Settings/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      {/* Public booking page — no auth required */}
      <Route path="/booking" element={<BookingPage />} />
      {/* Public remote consent signature — the single-use token is the credential */}
      <Route path="/sign/:token" element={<ConsentSignPage />} />

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
                <Route path="patients/:id/records/new" element={<NewClinicalRecordPage />} />
                <Route path="appointments/new" element={<NewAppointmentPage />} />
                <Route path="appointments/:id" element={<AppointmentPage />} />
                <Route path="ai-drafts/:id" element={<AIDraftPage />} />
                <Route path="clinical-records/:id" element={<ClinicalRecordPage />} />
                <Route path="booking-requests" element={<BookingRequestsPage />} />
                <Route path="evaluations" element={<EvaluationsPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
