import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { MODULOS_SISTEMA } from "@/lib/constants"

// Mantem apenas digitos do CNPJ (armazenamos sem mascara, como os registros existentes).
function limparCnpj(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "")
}

// Normaliza para casar nomes de modulo ignorando acento/caixa/espacos.
function normalizarModulo(s: string): string {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

// Mapa: nome normalizado -> nome canonico oficial do modulo.
const MODULOS_CANONICOS = new Map<string, string>(
  MODULOS_SISTEMA.map((m) => [normalizarModulo(m), m])
)

interface LinhaCliente {
  razao_social?: string
  nome_fantasia?: string
  cnpj?: string
  cidade?: string
  estado?: string
  telefone?: string
  email?: string
  modulos?: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(session.nome, session.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem importar clientes em lote" }, { status: 403 })
    }

    const body = await request.json()
    const clientes: LinhaCliente[] = Array.isArray(body?.clientes) ? body.clientes : []

    if (clientes.length === 0) {
      return NextResponse.json({ error: "Nenhum cliente enviado" }, { status: 400 })
    }

    // CNPJs ja cadastrados: importacao NUNCA remove ou sobrescreve registros existentes,
    // apenas adiciona os novos. Duplicados sao ignorados.
    const existentesRows = await sql`SELECT cnpj FROM clientes WHERE cnpj IS NOT NULL`
    const cnpjsExistentes = new Set(existentesRows.map((r: any) => limparCnpj(r.cnpj)).filter(Boolean))
    const cnpjsNoLote = new Set<string>()

    let inseridos = 0
    let ignorados = 0
    let modulosVinculados = 0
    const erros: { linha: number; motivo: string }[] = []
    const avisos: { linha: number; motivo: string }[] = []

    for (let i = 0; i < clientes.length; i++) {
      const linha = clientes[i]
      const numeroLinha = i + 1
      const razaoSocial = String(linha.razao_social ?? "").trim()

      if (!razaoSocial) {
        erros.push({ linha: numeroLinha, motivo: "Razao social e obrigatoria" })
        continue
      }

      const cnpjLimpo = limparCnpj(linha.cnpj)
      if (cnpjLimpo) {
        if (cnpjLimpo.length !== 14) {
          erros.push({ linha: numeroLinha, motivo: "CNPJ invalido (deve ter 14 digitos)" })
          continue
        }
        if (cnpjsExistentes.has(cnpjLimpo) || cnpjsNoLote.has(cnpjLimpo)) {
          ignorados++
          continue
        }
        cnpjsNoLote.add(cnpjLimpo)
      }

      try {
        const inserido = await sql`
          INSERT INTO clientes (
            razao_social, nome_fantasia, cnpj, cidade, estado, telefone, email, ativo
          ) VALUES (
            ${razaoSocial},
            ${String(linha.nome_fantasia ?? "").trim() || null},
            ${cnpjLimpo || null},
            ${String(linha.cidade ?? "").trim() || null},
            ${String(linha.estado ?? "").trim().toUpperCase().slice(0, 2) || null},
            ${String(linha.telefone ?? "").trim() || null},
            ${String(linha.email ?? "").trim() || null},
            true
          )
          RETURNING id
        `
        inseridos++
        const clienteId = inserido[0]?.id

        // Vincula os modulos informados (coluna "Módulos", separados por ; ou ,).
        // Nomes invalidos sao ignorados e reportados como aviso; o cliente segue importado.
        const modulosBrutos = String(linha.modulos ?? "")
          .split(/[;,]/)
          .map((m) => m.trim())
          .filter(Boolean)

        if (clienteId && modulosBrutos.length > 0) {
          const invalidos: string[] = []
          const canonicosUnicos = new Set<string>()

          for (const bruto of modulosBrutos) {
            const canonico = MODULOS_CANONICOS.get(normalizarModulo(bruto))
            if (!canonico) {
              invalidos.push(bruto)
              continue
            }
            canonicosUnicos.add(canonico)
          }

          for (const modulo of canonicosUnicos) {
            try {
              const res = await sql`
                INSERT INTO clientes_modulos (cliente_id, modulo, adicionado_por, adicionado_por_nome)
                VALUES (${clienteId}, ${modulo}, ${session?.id ?? null}, ${session?.nome ?? "Importação em lote"})
                ON CONFLICT (cliente_id, modulo) DO NOTHING
                RETURNING id
              `
              if (res.length > 0) modulosVinculados++
            } catch (e) {
              console.error(`Erro ao vincular modulo "${modulo}" na linha ${numeroLinha}:`, e)
            }
          }

          if (invalidos.length > 0) {
            avisos.push({
              linha: numeroLinha,
              motivo: `Módulo(s) não reconhecido(s) e ignorado(s): ${invalidos.join(", ")}`,
            })
          }
        }
      } catch (error) {
        console.error(`Erro ao inserir cliente na linha ${numeroLinha}:`, error)
        erros.push({ linha: numeroLinha, motivo: "Erro ao inserir no banco de dados" })
      }
    }

    return NextResponse.json({ inseridos, ignorados, modulos_vinculados: modulosVinculados, erros, avisos })
  } catch (error) {
    console.error("Erro na importacao em lote de clientes:", error)
    return NextResponse.json({ error: "Erro ao importar clientes" }, { status: 500 })
  }
}
