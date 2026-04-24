-- Reverses migration 000001
-- NOTE: ENUMs cannot be dropped while any table uses them; drop tables first.

DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS domain_events CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS patient_billing_profiles CASCADE;
DROP TABLE IF EXISTS service_rates CASCADE;
DROP TABLE IF EXISTS ai_drafts CASCADE;
DROP TABLE IF EXISTS consents CASCADE;
DROP TABLE IF EXISTS treatment_plans CASCADE;
DROP TABLE IF EXISTS patient_assessments CASCADE;
DROP TABLE IF EXISTS assessment_scales CASCADE;
DROP TABLE IF EXISTS clinical_records CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS patient_staff_rel CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS encryption_keys CASCADE;
DROP TABLE IF EXISTS professional_profiles CASCADE;
DROP TABLE IF EXISTS supervision_rel CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS specialties CASCADE;
DROP TABLE IF EXISTS document_types CASCADE;

DROP TYPE IF EXISTS treatment_plan_status;
DROP TYPE IF EXISTS payment_method_type;
DROP TYPE IF EXISTS invoice_status;
DROP TYPE IF EXISTS staff_relation_type;
DROP TYPE IF EXISTS consent_signing_method;
DROP TYPE IF EXISTS consent_type;
DROP TYPE IF EXISTS ai_draft_status;
DROP TYPE IF EXISTS record_status;
DROP TYPE IF EXISTS record_type;
DROP TYPE IF EXISTS appointment_status;
DROP TYPE IF EXISTS appointment_modality;
DROP TYPE IF EXISTS license_state;
DROP TYPE IF EXISTS plan_tier;
