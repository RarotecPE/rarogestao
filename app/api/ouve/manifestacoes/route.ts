import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { isOuveAtivo } from "@/lib/app-config"
import { gerarCodigoOuve, type OuveManifestacao } from "@/lib/ouve-rarotec"

// Remove dados de identificacao de uma manifestacao conforme o tipo de sigilo
// e o papel de quem visualiza (gestor ou nao).
function sanitizarParaQuadro(m: any, isUserGestor: boolean, userId?: number): OuveManifestacao {
  const base = { ...m }
  const ehAutor = userId != null && m.autor_id === userId
  if (m.tipo_sigilo === "anonima") {
    // Ninguem ve identificacao (nao existe mesmo)
    base.autor_id = null
    base.autor_nome = null
    base.autor_email = null
    base.autor_cargo = null
  } else if (m.tipo_sigilo === "identificavel_sigilosa" && !isUserGestor && !ehAutor) {
    // Nao-gestor (que nao seja o proprio autor) nao ve os dados do autor
    base.autor_id = null
    base.autor_nome = null
    base.autor_email = null
    base.autor_cargo = null
  }
  return base as OuveManifestacao
}

// GET /api/ouve/manifestacoes -> quadro interno
// - abertas: todos veem (com identificacao)
// - sigilosas: SOMENTE gestores veem (com autor)
// - anonimas: SOMENTE gestores veem (apenas codigo + conteudo, sem identificacao)
// - o proprio autor sempre ve as manifestacoes que ele criou (qualquer tipo, exceto anonima que nao tem autor)
export async function GET() {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }
  if (!(await isOuveAtivo())) {
    return NextResponse.json({ ativo: false, manifestacoes: [] })
  }

  const userIsGestor = isGestor(user.nome, user.cargo)

  try {
    let rows
    if (userIsGestor) {
      // Gestor ve todas
      rows = await sql`
        SELECT * FROM ouve_manifestacoes ORDER BY created_at DESC
      `
    } else {
      // Nao-gestor ve: todas as abertas + as proprias (sigilosas que ele mesmo criou).
      // Sigilosas de terceiros e anonimas NAO aparecem.
      rows = await sql`
        SELECT * FROM ouve_manifestacoes
        WHERE tipo_sigilo = 'identificavel_aberta'
           OR (tipo_sigilo = 'identificavel_sigilosa' AND autor_id = ${user.id})
        ORDER BY created_at DESC
      `
    }
    const manifestacoes = rows.map((m) => sanitizarParaQuadro(m, userIsGestor, user.id))
    return NextResponse.json({ ativo: true, manifestacoes, isGestor: userIsGestor })
  } catch (error) {
    console.error("Error fetching manifestacoes:", error)
    return NextResponse.json({ error: "Erro ao buscar manifestacoes" }, { status: 500 })
  }
}

// POST /api/ouve/manifestacoes -> criar
// Body: { tipo_sigilo, natureza, categoria, tipo_vida, mensagem, setor?, anexos?: [{pathname,nome,tipo,tamanho}] }
export async function POST(request: Request) {
  if (!(await isOuveAtivo())) {
    return NextResponse.json({ error: "O modulo OuveRarotec nao esta ativo" }, { status: 403 })
  }
  // Precisa estar logado para criar (mesmo anonima: nao gravamos o autor, mas exige sessao)
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  try {
    const data = await request.json()
    const { tipo_sigilo, natureza, categoria, tipo_vida, mensagem, setor, anexos } = data

    if (!tipo_sigilo || !natureza || !categoria || !tipo_vida || !mensagem?.trim()) {
      return NextResponse.json({ error: "Campos obrigatorios ausentes" }, { status: 400 })
    }
    if (!["identificavel_aberta", "identificavel_sigilosa", "anonima"].includes(tipo_sigilo)) {
      return NextResponse.json({ error: "tipo_sigilo invalido" }, { status: 400 })
    }

    // So grava dados do autor se NAO for anonima
    const anonima = tipo_sigilo === "anonima"

    // Gera codigo unico (tenta ate 5x)
    let codigo = gerarCodigoOuve()
    for (let i = 0; i < 5; i++) {
      const existe = await sql`SELECT 1 FROM ouve_manifestacoes WHERE codigo = ${codigo} LIMIT 1`
      if (existe.length === 0) break
      codigo = gerarCodigoOuve()
    }

    const result = await sql`
      INSERT INTO ouve_manifestacoes (
        codigo, tipo_sigilo, natureza, categoria, tipo_vida, mensagem, setor,
        autor_id, autor_nome, autor_email, autor_cargo, status
      ) VALUES (
        ${codigo}, ${tipo_sigilo}, ${natureza}, ${categoria}, ${tipo_vida}, ${mensagem}, ${setor || null},
        ${anonima ? null : user.id}, ${anonima ? null : user.nome},
        ${anonima ? null : user.email}, ${anonima ? null : user.cargo}, 'aberta'
      )
      RETURNING id, codigo
    `
    const manifestacaoId = result[0].id

    // Anexos (ate 4)
    if (Array.isArray(anexos) && anexos.length > 0) {
      for (const a of anexos.slice(0, 4)) {
        if (!a?.pathname) continue
        await sql`
          INSERT INTO ouve_anexos (manifestacao_id, blob_pathname, nome_arquivo, tipo_arquivo, tamanho)
          VALUES (${manifestacaoId}, ${a.pathname}, ${a.nome || null}, ${a.tipo || null}, ${a.tamanho || null})
        `
      }
    }

    auditClient.log({
      category: "ombudsman",
      action: "ombudsman.opened",
      severity: "INFO",
      actor: anonima
        ? { type: "system", systemName: "whistleblower_anonymous" }
        : {
            type: "user",
            userId: String(user.id),
            name: user.nome,
            email: user.email,
            role: user.cargo,
          },
      targets: [
        {
          type: "ombudsman_complaint",
          id: String(manifestacaoId),
          label: `Manifestação ${codigo} (${natureza})`,
        },
      ],
      context: getRequestContext(request),
      details: {
        codigo,
        tipo_sigilo,
        natureza,
        categoria,
        tipo_vida,
        setor: setor || null,
        anexos_count: Array.isArray(anexos) ? anexos.length : 0,
      },
    })

    return NextResponse.json({ id: manifestacaoId, codigo: result[0].codigo })
  } catch (error) {
    console.error("Error creating manifestacao:", error)
    return NextResponse.json({ error: "Erro ao criar manifestacao" }, { status: 500 })
  }
}
