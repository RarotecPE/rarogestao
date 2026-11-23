-- Preferencias individuais da Central de Avisos por usuario.
-- Armazena a lista JSON de chaves de avisos ocultados pelo usuario (NULL/[] = todos ativos por padrao).
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS central_avisos_ocultos JSONB;
