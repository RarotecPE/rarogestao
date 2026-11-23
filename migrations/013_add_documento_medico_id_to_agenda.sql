-- Vincula eventos da agenda gerados automaticamente a partir de um documento medico validado.
-- Permite atualizar ou reverter exatamente os dias criados pelo documento quando ele for recusado, revertido ou excluido.
ALTER TABLE agenda_trabalhista
  ADD COLUMN IF NOT EXISTS documento_medico_id INTEGER REFERENCES documentos_medicos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agenda_trabalhista_documento_medico_id
  ON agenda_trabalhista (documento_medico_id);
