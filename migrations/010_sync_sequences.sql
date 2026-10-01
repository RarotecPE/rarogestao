-- Migration 010: Sincronização de sequências (auto-increment) de tabelas com dados pré-existentes
-- Corrige o erro "duplicate key value violates unique constraint" ao inserir novos registros

SELECT setval(pg_get_serial_sequence('relatorios_visitas', 'id'), COALESCE(MAX(id), 1)) FROM relatorios_visitas;
SELECT setval(pg_get_serial_sequence('relatorios_anexos', 'id'), COALESCE(MAX(id), 1)) FROM relatorios_anexos;
SELECT setval(pg_get_serial_sequence('tecnicos_clientes', 'id'), COALESCE(MAX(id), 1)) FROM tecnicos_clientes;
SELECT setval(pg_get_serial_sequence('clientes', 'id'), COALESCE(MAX(id), 1)) FROM clientes;
SELECT setval(pg_get_serial_sequence('clientes_modulos', 'id'), COALESCE(MAX(id), 1)) FROM clientes_modulos;
SELECT setval(pg_get_serial_sequence('agenda_abonos', 'id'), COALESCE(MAX(id), 1)) FROM agenda_abonos;
SELECT setval(pg_get_serial_sequence('agenda_solicitacoes', 'id'), COALESCE(MAX(id), 1)) FROM agenda_solicitacoes;
SELECT setval(pg_get_serial_sequence('agenda_trabalhista', 'id'), COALESCE(MAX(id), 1)) FROM agenda_trabalhista;
SELECT setval(pg_get_serial_sequence('apuracao_modelos', 'id'), COALESCE(MAX(id), 1)) FROM apuracao_modelos;
SELECT setval(pg_get_serial_sequence('apuracao_relatorios', 'id'), COALESCE(MAX(id), 1)) FROM apuracao_relatorios;
SELECT setval(pg_get_serial_sequence('capacitacoes', 'id'), COALESCE(MAX(id), 1)) FROM capacitacoes;
SELECT setval(pg_get_serial_sequence('checklist_execucao_itens', 'id'), COALESCE(MAX(id), 1)) FROM checklist_execucao_itens;
SELECT setval(pg_get_serial_sequence('checklist_execucoes', 'id'), COALESCE(MAX(id), 1)) FROM checklist_execucoes;
SELECT setval(pg_get_serial_sequence('checklist_legado_importacao', 'id'), COALESCE(MAX(id), 1)) FROM checklist_legado_importacao;
SELECT setval(pg_get_serial_sequence('documentos_institucionais', 'id'), COALESCE(MAX(id), 1)) FROM documentos_institucionais;
SELECT setval(pg_get_serial_sequence('documentos_medicos', 'id'), COALESCE(MAX(id), 1)) FROM documentos_medicos;
SELECT setval(pg_get_serial_sequence('ouve_manifestacoes', 'id'), COALESCE(MAX(id), 1)) FROM ouve_manifestacoes;
SELECT setval(pg_get_serial_sequence('responsaveis_importacao', 'id'), COALESCE(MAX(id), 1)) FROM responsaveis_importacao;
SELECT setval(pg_get_serial_sequence('responsaveis_modulos', 'id'), COALESCE(MAX(id), 1)) FROM responsaveis_modulos;
SELECT setval(pg_get_serial_sequence('responsaveis_modulos_historico', 'id'), COALESCE(MAX(id), 1)) FROM responsaveis_modulos_historico;
