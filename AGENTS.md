<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Tools disponiveis em /tools

Antes de explorar o projeto manualmente, sempre verifique se um dos scripts abaixo resolve a necessidade. Eles sao otimizados para este projeto e reduzem consumo de contexto.

- `.\tools\search_symbol.ps1 <termo>` - busca configurada com contexto e filtros de extensao/pastas.
- `.\tools\find_usages.ps1 <simbolo>` - referencias por palavra inteira com saida compacta por arquivo.
- `.\tools\list_changed_files.ps1 [ref]` - arquivos modificados desde `HEAD` ou ref informada.
- `.\tools\summarize_file.ps1 <caminho>` - primeiras 40 linhas, ultimas 20 e total de linhas.

### Regra de uso obrigatoria

1. Use `search_symbol.ps1` ou `find_usages.ps1` antes de abrir arquivos por exploracao ampla.
2. Use `summarize_file.ps1` antes de ler arquivos grandes por completo.
3. Use `list_changed_files.ps1` no inicio de tarefas de revisao ou debugging.
4. Leia arquivos completos apenas quando o resumo/ferramentas nao forem suficientes.

### Fluxos recomendados

- Analise de impacto: `find_usages.ps1 <simbolo>` -> `summarize_file.ps1` nos arquivos relevantes -> leitura pontual.
- Debugging: `list_changed_files.ps1` -> `search_symbol.ps1 <termo>` -> `summarize_file.ps1` nos candidatos.
- Refatoracao: `search_symbol.ps1 <simbolo>` -> `find_usages.ps1 <simbolo>` -> leitura focada dos call sites.

## Docs como base do projeto

Antes de implementar ou alterar funcionalidades no RaroGestão, consulte os arquivos relevantes em `docs/` como referencia base do projeto. Eles descrevem padroes de layout, autenticacao, integracao com RaroNexus e decisoes de produto que devem orientar novas construcoes.

Use especialmente:

- `docs/styling.schema.json` para padronizacao visual, tema, shell, login, componentes e comportamento responsivo.
- `docs/raronexus-login-standard-prompt.md` para fluxos de login, sessao e experiencia de autenticacao alinhados ao RaroNexus.
- `docs/raronexus-integration-prompt.md` para integracoes SSO, contratos, perfis, aplicativos e comunicacao com o RaroNexus.

Ao iniciar tarefas de layout, autenticacao, permissoes, integracao, shell ou navegacao, leia primeiro o documento de `docs/` mais relacionado. Se houver conflito entre o codigo atual e os docs, preserve o comportamento funcional existente e use os docs como direcao de arquitetura, perguntando ao usuario somente quando a decisao puder quebrar uma regra de negocio.
