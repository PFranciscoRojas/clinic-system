-- 000067: retire widget fields from ACTIVE record templates.
--
-- Every ACTIVE template that still contains {widget:...} sections gets a new
-- version (archive-and-insert, same semantics as recordtemplates.Update from
-- PR #200 — never mutate a row in place, records stay anchored to the schema
-- they were signed with):
--   * widget:mental_exam    -> expanded into 9 generic fields faithful to the
--                              physical Formato 1 checklist (porte, orientación,
--                              áreas, afecto, pensamiento, percepción,
--                              especificación, ideación suicida, intento previo)
--   * widget:risk           -> dropped; risk_level is a fixed system control of
--                              the record form now (never template content)
--   * widget:treatment_plan -> dropped; panel lives in the patient profile
--   * widget:diagnoses      -> dropped; panel lives in the patient profile
--   * any other legacy widget -> converted to a plain {text} field so the
--                              professional keeps a place to write; nothing lost
--
-- Keys are precomputed with the exact slugify() the Go parser uses (ASCII
-- letters/digits kept, anything else collapses to a single underscore), so a
-- later round-trip through the parser reproduces the same keys.

-- Migrations run as the table owner, which bypasses RLS unless FORCE is on.
ALTER TABLE clinical_record_templates NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  tpl RECORD;
  sec jsonb;
  new_schema jsonb;
  new_markdown text;
  block text;
  opts text;
  mental_exam_fields CONSTANT jsonb := jsonb_build_array(
    jsonb_build_object('key','examen_mental_porte_y_actitud','label','Examen mental: porte y actitud',
      'required',false,'collapsed',false,'type','multiselect',
      'options',jsonb_build_array('Adecuado','Colaborador','Ansioso','Hostil','Inhibido'),'display','pills'),
    jsonb_build_object('key','examen_mental_orientaci_n','label','Examen mental: orientación',
      'required',false,'collapsed',false,'type','select',
      'options',jsonb_build_array('Orientado','Desorientado'),'display','pills'),
    jsonb_build_object('key','examen_mental_reas_de_desorientaci_n','label','Examen mental: áreas de desorientación',
      'hint','Solo si está desorientado.','required',false,'collapsed',false,'type','multiselect',
      'options',jsonb_build_array('Tiempo','Espacio','Persona'),'display','pills'),
    jsonb_build_object('key','examen_mental_afecto','label','Examen mental: afecto',
      'required',false,'collapsed',false,'type','multiselect',
      'options',jsonb_build_array('Eutímico (Estable)','Depresivo','Ansioso','Irritable','Aplanado'),'display','pills'),
    jsonb_build_object('key','examen_mental_pensamiento','label','Examen mental: pensamiento',
      'required',false,'collapsed',false,'type','multiselect',
      'options',jsonb_build_array('Lógico / Coherente','Ideas de minusvalía','Ideas obsesivas','Ideas delirantes'),'display','pills'),
    jsonb_build_object('key','examen_mental_percepci_n','label','Examen mental: percepción',
      'required',false,'collapsed',false,'type','select',
      'options',jsonb_build_array('Sin alteraciones','Alucinaciones'),'display','pills'),
    jsonb_build_object('key','examen_mental_especificaci_n_de_la_percepci_n','label','Examen mental: especificación de la percepción',
      'hint','Si hay alucinaciones, especifica cuáles.','required',false,'collapsed',false,'type','text'),
    jsonb_build_object('key','examen_mental_ideaci_n_suicida','label','Examen mental: ideación suicida',
      'required',false,'collapsed',false,'type','select',
      'options',jsonb_build_array('Ausente','Pasiva (deseos de morir)','Activa con plan estructurado'),'display','pills'),
    jsonb_build_object('key','examen_mental_intento_previo_de_suicidio','label','Examen mental: intento previo de suicidio',
      'required',false,'collapsed',false,'type','select',
      'options',jsonb_build_array('Sí','No'),'display','pills')
  );
BEGIN
  FOR tpl IN
    SELECT id, organization_id, name, record_type, schema, version, is_default, created_by
    FROM clinical_record_templates
    WHERE status = 'ACTIVE'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(schema) e WHERE e->>'type' = 'widget'
      )
    FOR UPDATE
  LOOP
    -- 1. Transform the schema.
    new_schema := '[]'::jsonb;
    FOR sec IN SELECT * FROM jsonb_array_elements(tpl.schema)
    LOOP
      IF sec->>'type' <> 'widget' THEN
        new_schema := new_schema || jsonb_build_array(sec);
      ELSIF sec->>'widget' = 'mental_exam' THEN
        new_schema := new_schema || mental_exam_fields;
      ELSIF sec->>'widget' IN ('risk','treatment_plan','diagnoses') THEN
        CONTINUE;
      ELSE
        -- Legacy widget name still active somewhere: keep the slot as text.
        new_schema := new_schema || jsonb_build_array(
          jsonb_build_object(
            'key', sec->>'key', 'label', sec->>'label',
            'required', COALESCE((sec->>'required')::bool, false),
            'collapsed', COALESCE((sec->>'collapsed')::bool, false),
            'type', 'text'
          ) || CASE WHEN COALESCE(sec->>'hint','') <> '' THEN jsonb_build_object('hint', sec->>'hint') ELSE '{}'::jsonb END
        );
      END IF;
    END LOOP;

    -- A template that was only widgets must not end up empty (the parser
    -- requires at least one section on any later edit).
    IF jsonb_array_length(new_schema) = 0 THEN
      new_schema := jsonb_build_array(
        jsonb_build_object('key','notas_de_la_sesi_n','label','Notas de la sesión',
          'required',false,'collapsed',false,'type','text')
      );
    END IF;

    -- 2. Regenerate source_markdown in the exact syntax the parser reads and
    -- the visual builder serializes (heading + annotations, hint line below,
    -- blank line between blocks, trailing newline; no annotation for text).
    new_markdown := '';
    FOR sec IN SELECT * FROM jsonb_array_elements(new_schema)
    LOOP
      block := '## ' || (sec->>'label');
      IF sec->>'type' IN ('select','multiselect') THEN
        SELECT string_agg(o, '|') INTO opts FROM jsonb_array_elements_text(sec->'options') o;
        block := block || ' {' || (sec->>'type') || ':' || opts || '}';
      ELSIF sec->>'type' = 'scale' THEN
        block := block || ' {scale:' || (sec->>'scale_min') || '-' || (sec->>'scale_max') || '}';
      ELSIF sec->>'type' = 'checklist' THEN
        block := block || ' {checklist}';
      END IF;
      IF sec->>'display' = 'pills' THEN block := block || ' {pills}'; END IF;
      IF COALESCE((sec->>'allow_other')::bool, false) THEN block := block || ' {allow_other}'; END IF;
      IF COALESCE((sec->>'required')::bool, false) THEN block := block || ' {required}'; END IF;
      IF COALESCE((sec->>'collapsed')::bool, false) THEN block := block || ' {collapsed}'; END IF;
      IF COALESCE(sec->>'hint','') <> '' THEN block := block || E'\n' || (sec->>'hint'); END IF;
      new_markdown := new_markdown || CASE WHEN new_markdown = '' THEN '' ELSE E'\n\n' END || block;
    END LOOP;
    new_markdown := new_markdown || E'\n';

    -- 3. Archive-and-insert, mirroring recordtemplates.Update.
    UPDATE clinical_record_templates
    SET status = 'ARCHIVED', is_default = false, updated_at = now()
    WHERE id = tpl.id;

    INSERT INTO clinical_record_templates
      (organization_id, name, record_type, source_markdown, schema, version, status, is_default, created_by)
    VALUES
      (tpl.organization_id, tpl.name, tpl.record_type, new_markdown, new_schema,
       tpl.version + 1, 'ACTIVE', tpl.is_default, tpl.created_by);
  END LOOP;
END $$;

ALTER TABLE clinical_record_templates FORCE ROW LEVEL SECURITY;
