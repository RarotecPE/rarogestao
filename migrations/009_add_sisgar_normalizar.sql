-- Migration 009: Criação da função de normalização de texto (sisgar_normalizar)
-- Utilizada para buscas flexíveis e conciliação de municípios, clientes e responsáveis sem distinção de acentos ou caracteres especiais.

BEGIN;

CREATE OR REPLACE FUNCTION sisgar_normalizar(valor TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT LOWER(
    REGEXP_REPLACE(
      TRANSLATE(
        COALESCE(valor, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
        'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
      ),
      '[^a-zA-Z0-9]+',
      ' ',
      'g'
    )
  );
$$;

COMMIT;
