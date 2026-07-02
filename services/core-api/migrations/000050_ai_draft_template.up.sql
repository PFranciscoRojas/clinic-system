-- The custom template used when a recording was initiated only traveled in the
-- Redis job, so the review page could never render the draft with its real
-- format (it always fell back to the hardcoded integrated sections). Persist it
-- on the draft row, same semantics as clinical_records.template_id:
-- NULL = integrated format.
ALTER TABLE ai_drafts
    ADD COLUMN template_id UUID REFERENCES clinical_record_templates(id);
