import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo } = await params

    if (!codigo || !codigo.trim()) {
      return NextResponse.json({ error: "Código não fornecido" }, { status: 400 })
    }

    // Bloqueia tentativas de varredura por ID sequencial puramente numérico
    if (/^\d+$/.test(codigo.trim())) {
      return NextResponse.json(
        {
          valid: false,
          error: "Formato de código inválido. Informe o código de autenticação completo (ex: RAR-... ou RMPS-...).",
        },
        { status: 400 }
      )
    }

    // ===== Relatório Mensal de Prestação de Serviços (RMPS) =====
    // Código no formato RMPS-{exercicio}-{numero}-{id} (id garante unicidade).
    // Fallback legado: RMPS-{exercicio}-{numero} (documentos emitidos antes do id).
    if (/^RMPS-/i.test(codigo)) {
      const partes = codigo.toUpperCase().replace(/^RMPS-/, "").split("-")
      const exercicio = parseInt(partes[0])
      const numero = parseInt(partes[1])
      const idAlvo = partes.length >= 3 ? parseInt(partes[partes.length - 1]) : null

      const rows = idAlvo
        ? await sql`
            SELECT a.*, c.nome_fantasia AS cliente_nome, c.razao_social AS cliente_razao,
              c.cnpj AS cliente_cnpj, c.cidade AS cliente_cidade, c.estado AS cliente_estado
            FROM apuracao_relatorios a
            LEFT JOIN clientes c ON c.id = a.cliente_id
            WHERE a.id = ${idAlvo}
          `
        : await sql`
            SELECT a.*, c.nome_fantasia AS cliente_nome, c.razao_social AS cliente_razao,
              c.cnpj AS cliente_cnpj, c.cidade AS cliente_cidade, c.estado AS cliente_estado
            FROM apuracao_relatorios a
            LEFT JOIN clientes c ON c.id = a.cliente_id
            WHERE a.exercicio = ${exercicio} AND a.numero = ${numero}
            ORDER BY a.id ASC
            LIMIT 1
          `

      if (rows.length === 0) {
        return NextResponse.json(
          {
            valid: false,
            error: "Relatório não encontrado",
          },
          { status: 404 }
        )
      }

      const a = rows[0]
      const numeroTexto = a.numero_texto || String(a.numero).padStart(3, "0")
      const parseJson = (v: any) => {
        if (!v) return []
        try {
          return typeof v === "string" ? JSON.parse(v) : v
        } catch {
          return []
        }
      }

      return NextResponse.json({
        valid: true,
        tipo: "apuracao",
        apuracao: {
          id: a.id,
          numero_autenticacao: `RMPS-${a.exercicio}-${numeroTexto}-${a.id}`,
          numero: a.numero,
          numero_texto: numeroTexto,
          exercicio: a.exercicio,
          competencia: a.competencia,
          data_emissao: a.data_emissao,
          destinatario_nome: a.destinatario_nome,
          destinatario_cargo: a.destinatario_cargo,
          sigla_orgao: a.sigla_orgao,
          numero_contrato_texto: a.numero_contrato_texto,
          municipio: a.municipio,
          cliente_nome: a.cliente_nome,
          cliente_razao: a.cliente_razao,
          cliente_cnpj: a.cliente_cnpj,
          cliente_cidade: a.cliente_cidade,
          cliente_estado: a.cliente_estado,
          modo_valor: a.modo_valor,
          valor_global: a.valor_global,
          valor_total: a.valor_total,
          texto: a.texto,
          observacoes: a.observacoes,
          modalidade_remoto: a.modalidade_remoto,
          modalidade_presencial: a.modalidade_presencial,
          origem: a.origem,
          status: a.status,
          itens: parseJson(a.itens),
          itens_servico: parseJson(a.itens_servico),
          created_at: a.created_at,
        },
      })
    }

    // Buscar relatório estritamente pelo número de autenticação oficial (evita enumeração por ID)
    const relatorios = await sql`
      SELECT r.*, 
        t.nome as tecnico_nome,
        t.email as tecnico_email,
        c.nome_fantasia as cliente_nome,
        c.razao_social as cliente_razao_social,
        c.cnpj as cliente_cnpj,
        c.endereco as cliente_endereco,
        c.cidade as cliente_cidade,
        c.estado as cliente_estado,
        tc.nome as tecnico_cliente_nome,
        tc.email as tecnico_cliente_email,
        tc.cpf as tecnico_cliente_cpf
      FROM relatorios_visitas r
      LEFT JOIN tecnicos_rarotec t ON r.tecnico_rarotec_id = t.id
      LEFT JOIN clientes c ON r.cliente_id = c.id
      LEFT JOIN tecnicos_clientes tc ON r.tecnico_cliente_id = tc.id
      WHERE r.numero_autenticacao = ${codigo.trim().toUpperCase()}
    `

    if (relatorios.length === 0) {
      return NextResponse.json(
        {
          valid: false,
          error: "Relatório não encontrado",
        },
        { status: 404 }
      )
    }

    const relatorio = relatorios[0]

    // Buscar nomes dos técnicos Rarotec
    let tecnicosRarotecNomes: any[] = []
    if (relatorio.tecnicos_rarotec_ids) {
      try {
        const ids = typeof relatorio.tecnicos_rarotec_ids === 'string' 
          ? JSON.parse(relatorio.tecnicos_rarotec_ids) 
          : relatorio.tecnicos_rarotec_ids
        
        if (ids.length > 0) {
          tecnicosRarotecNomes = await sql`
            SELECT id, nome, email FROM tecnicos_rarotec WHERE id = ANY(${ids})
          `
        }
      } catch (e) {
        console.error("Erro ao parsear tecnicos_rarotec_ids:", e)
      }
    }

    // Parse modulos
    let modulos: string[] = []
    if (relatorio.modulos) {
      try {
        modulos = typeof relatorio.modulos === 'string' 
          ? JSON.parse(relatorio.modulos) 
          : relatorio.modulos
      } catch { modulos = [] }
    }

    // Parse entidades (orgaos)
    let entidades: any[] = []
    if (relatorio.entidades) {
      try {
        entidades = typeof relatorio.entidades === 'string' 
          ? JSON.parse(relatorio.entidades) 
          : relatorio.entidades
      } catch { entidades = [] }
    }

    // Buscar anexos da tabela relatorios_anexos
    let anexos: any[] = []
    try {
      anexos = await sql`
        SELECT id, nome_arquivo, tipo_arquivo, url, created_at
        FROM relatorios_anexos
        WHERE relatorio_id = ${relatorio.id}
        ORDER BY created_at ASC
      `
    } catch (e) {
      // Tabela pode não existir ou estar vazia
      console.log("Erro ao buscar anexos:", e)
    }

    // Buscar representantes do cliente (tecnicos_clientes) se tiver IDs
    let tecnicosClienteList: any[] = []
    if (relatorio.tecnicos_cliente_ids) {
      try {
        const tcIds = typeof relatorio.tecnicos_cliente_ids === 'string' 
          ? JSON.parse(relatorio.tecnicos_cliente_ids) 
          : relatorio.tecnicos_cliente_ids
        
        if (tcIds && tcIds.length > 0) {
          tecnicosClienteList = await sql`
            SELECT id, nome, email, cpf, telefone FROM tecnicos_clientes WHERE id = ANY(${tcIds})
          `
        }
      } catch (e) {
        console.error("Erro ao parsear tecnicos_cliente_ids:", e)
      }
    }
    // Fallback para tecnico_cliente_id singular
    if (tecnicosClienteList.length === 0 && relatorio.tecnico_cliente_nome) {
      tecnicosClienteList = [{
        nome: relatorio.tecnico_cliente_nome,
        email: relatorio.tecnico_cliente_email,
        cpf: relatorio.tecnico_cliente_cpf
      }]
    }
    
    // Também verificar tecnicos_cliente_info (JSONB)
    if (tecnicosClienteList.length === 0 && relatorio.tecnicos_cliente_info) {
      try {
        const info = typeof relatorio.tecnicos_cliente_info === 'string'
          ? JSON.parse(relatorio.tecnicos_cliente_info)
          : relatorio.tecnicos_cliente_info
        tecnicosClienteList = info.map((t: any) => ({ nome: t.nome, cpf: t.cpf, email: t.email }))
      } catch (e) {
        console.error("Erro ao parsear tecnicos_cliente_info:", e)
      }
    }
    
    // Processar orgao_atendido para corrigir nomes "undefined"
    let orgaosProcessados = relatorio.orgao_atendido
    if (relatorio.orgao_atendido) {
      const partes = String(relatorio.orgao_atendido).split("; ")
      const partesProcessadas = await Promise.all(partes.map(async (parte: string) => {
        const match = parte.match(/^(.+?) \(CNPJ: (.+?)\)$/)
        if (match) {
          const nomeAtual = match[1]
          const cnpj = match[2]
          // Se o nome está como "undefined" ou vazio, buscar pelo CNPJ
          if (nomeAtual === "undefined" || !nomeAtual.trim()) {
            try {
              const orgaos = await sql`
                SELECT nome FROM orgaos_cliente WHERE cnpj = ${cnpj} LIMIT 1
              `
              if (orgaos.length > 0 && orgaos[0].nome) {
                return `${orgaos[0].nome} (CNPJ: ${cnpj})`
              }
            } catch (e) {
              // Ignorar erro
            }
          }
        }
        return parte
      }))
      orgaosProcessados = partesProcessadas.join("; ")
    }

    return NextResponse.json({
      valid: true,
      relatorio: {
        id: relatorio.id,
        numero_autenticacao: relatorio.numero_autenticacao,
        data_visita: relatorio.data_visita,
        data_fim: relatorio.data_fim,
        hora_inicio: relatorio.hora_inicio,
        hora_fim: relatorio.hora_fim,
        data_relatorio: relatorio.data_relatorio,
        municipio: relatorio.municipio,
        estado: relatorio.estado,
        cliente_nome: relatorio.cliente_nome,
        cliente_cnpj: relatorio.cliente_cnpj,
        cliente_endereco: relatorio.cliente_endereco,
        cliente_cidade: relatorio.cliente_cidade,
        cliente_estado: relatorio.cliente_estado,
        orgao_atendido: orgaosProcessados,
        entidades: entidades,
        tipo_servico: relatorio.tipo_servico,
        tema: relatorio.tema,
        modulos: modulos,
        tecnicos_rarotec: tecnicosRarotecNomes.length > 0 
          ? tecnicosRarotecNomes 
          : relatorio.tecnico_nome 
            ? [{ nome: relatorio.tecnico_nome, email: relatorio.tecnico_email }]
            : [],
        tecnicos_cliente: tecnicosClienteList,
        tecnicos_cliente_info: relatorio.tecnicos_cliente_info,
        tecnico_cliente: relatorio.tecnico_cliente_nome 
          ? { nome: relatorio.tecnico_cliente_nome, email: relatorio.tecnico_cliente_email, cpf: relatorio.tecnico_cliente_cpf }
          : null,
        descricao_servicos: relatorio.historico || relatorio.descricao_servicos || relatorio.descricao_servico || "",
        observacoes: relatorio.observacoes || "",
        anexos: anexos,
        created_at: relatorio.created_at,
        status: relatorio.status
      }
    })
  } catch (error) {
    console.error("Erro ao validar relatório:", error)
    return NextResponse.json({ 
      valid: false, 
      error: "Erro ao validar relatório" 
    }, { status: 500 })
  }
}
