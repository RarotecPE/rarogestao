# RaroGestão — Sistema de Gestão Administrativa e Atendimentos Técnicos

O **RaroGestão** é a plataforma corporativa da **Rarotec** para gestão técnica em campo, relacionamento e controle contratual com a administração pública municipal (Prefeituras, Câmaras e Autarquias), comprovação de serviços prestados (Fé Pública) e apuração mensal de contratos administrativos.

O sistema integra o ecossistema de software da Rarotec, autenticando-se de forma centralizada pelo **RaroNexus** (IdP/SSO).
---

## 🚀 Principais Módulos

- **Gestão de Clientes e Órgãos**: Cadastro de entidades públicas municipais, seus órgãos atendidos (Secretarias, Fundos Municipais), múltiplos contratos administrativos e aditivos com vigência e anexos.
- **Técnicos Rarotec e Técnicos Clientes**: Gestão de colaboradores de campo com vinculação fixa por cliente, histórico de atendimentos e contatos locais dos órgãos atendidos.
- **Agenda e Planejamento Matricial**: Agendamento de visitas técnicas com visão matricial (grade por técnico, data, cliente e deslocamento) e fluxo de solicitação e aprovação de alterações de agenda.
- **Relatórios de Visita Técnica (Fé Pública)**: Emissão de relatórios técnicos em campo com múltiplos módulos e serviços, histórico de atendimento, geração de PDF oficial com hash de autenticação criptográfica e QR Code para validação pública (`/validar/[codigo]`).
- **Auditoria de Atendimentos ("Batimento")**: Cruzamento inteligente e automatizado entre a Agenda Prevista e os Relatórios Efetivamente Emitidos, identificando faltas, visitas não planejadas e divergências.
- **Apuração Mensal (RMPS)**: Relatório Mensal de Prestação de Serviços estruturado para instruir processos de liquidação e empenho no setor público, suportando valoração global, por módulo ou por item de serviço.
- **Documentos Médicos**: Registro de atestados e licenças de técnicos para abono justificado de ausências no batimento de agenda.
- **Documentos Institucionais & Atas**: Repositório de governança interna com regras, organogramas e atas de reuniões setorizadas com controle estrito de permissões.
- **OuveRarotec (Canal de Denúncias e Ouvidoria)**: Canal seguro em conformidade com a NR-01 para relatos anônimos ou identificados, com fluxo de acompanhamento confidencial por protocolo.

---

## 🛠️ Stack Tecnológica

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Biblioteca UI**: [React 19](https://react.dev/)
- **Estilização**: Tailwind CSS v4, Radix UI Primitives, Lucide Icons, Sonner (Toasts)
- **Linguagem**: TypeScript 5
- **Banco de Dados**: PostgreSQL (Driver SQL compilado com Pool `pg` / `@neondatabase/serverless`)
- **Storage de Arquivos**: Cloudflare R2 (S3-compatible SDK) / Vercel Blob
- **Geração de Documentos**: `jspdf`, `jspdf-autotable`, `pdf-lib` (lazy loaded sob demanda)
- **E-mails**: Resend & React Email / EmailJS
- **Autenticação**: SSO integrado ao **RaroNexus** (OAuth2 / Global Session Cookie)

---

## 💻 Instalação e Execução

### Pré-requisitos
- Node.js 20+ ou 22 LTS
- Gerenciador de pacotes `npm` ou `pnpm`
- Instância ativa do PostgreSQL
- Instância do **RaroNexus** em execução (padrão porta 3001) para fluxos de autenticação

### 1. Instalar Dependências
```bash
npm install
```

### 2. Executar em Desenvolvimento
```bash
npm run dev
```
> O script lê `RAROGESTAO_BASE_URL` do `.env.local` e inicializa o servidor automaticamente na porta correspondente (padrão: `http://localhost:3004`).

### 3. Verificar Tipagem e Qualidade
```bash
npx tsc --noEmit
npm run lint
```

### 4. Build de Produção
```bash
npm run build
npm run start
```

---

## 🔐 Fluxo de Autenticação e Perfis (RaroNexus SSO)

1. O RaroGestão não gerencia senhas locais.
2. Ao acessar a aplicação, a sessão global é verificada de forma transparente via `iframe` ou popup integrado com o **RaroNexus**.
3. Os perfis de acesso mapeados a partir do RaroNexus são:
   - **Administrador / Diretor / Gerente / Coordenador** (`isGestor`): Acesso irrestrito a configurações, cadastro de técnicos Rarotec, apurações contratuais, batimento e relatórios de auditoria.
   - **Técnico / Operador**: Acesso à agenda de visitas, emissão e edição de relatórios técnicos próprios e ouvidoria.
   - **Visualizador**: Acesso de somente leitura a consultas permitidas.