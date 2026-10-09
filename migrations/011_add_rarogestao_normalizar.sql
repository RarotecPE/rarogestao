-- Migration 011: Criação da função de normalização de texto (rarogestao_normalizar)
-- Mantém retrocompatibilidade total com sisgar_normalizar

BEGIN;

CREATE OR REPLACE FUNCTION rarogestao_normalizar(valor TEXT)
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

-- Garante que sisgar_normalizar continua existindo como alias para chamadas legadas
CREATE OR REPLACE FUNCTION sisgar_normalizar(valor TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT rarogestao_normalizar(valor);
$$;

COMMIT;

