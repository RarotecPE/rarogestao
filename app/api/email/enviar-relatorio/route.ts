import { NextResponse } from "next/server"
import { Resend } from "resend"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { buildSisgarUrl } from "@/lib/app-url"
import { RelatorioEmail } from "@/lib/email-templates/relatorio-email"
import { sendEmailViaNexus } from "@/lib/nexus-email"

// Lazy initialization of Resend to avoid build errors (usado como fallback)
let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set")
    }
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "SISGAR <onboarding@resend.dev>"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { relatorioId, destinatarios } = await request.json()

    if (!relatorioId) {
      return NextResponse.json({ error: "ID do relatório é obrigatório" }, { status: 400 })
    }

    if (!destinatarios || destinatarios.length === 0) {
      return NextResponse.json({ error: "Selecione pelo menos um destinatário" }, { status: 400 })
    }

    // Buscar dados do relatório
    const relatorios = await sql<any>`
      SELECT 
        r.*,
        t.nome as tecnico_nome,
        t.email as tecnico_email,
        COALESCE(c.nome_fantasia, c.razao_social) as cliente_nome,
        c.email as cliente_email,
        c.cidade as cliente_cidade
      FROM relatorios_visitas r
      LEFT JOIN tecnicos_rarotec t ON r.tecnico_rarotec_id = t.id
      LEFT JOIN clientes c ON r.cliente_id = c.id
      WHERE r.id = ${relatorioId}
    `

    if (relatorios.length === 0) {
      return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })
    }

    const relatorio = relatorios[0]

    // Obter dados do técnico (singular ou múltiplos)
    let tecnicoNome = relatorio.tecnico_nome || "Não informado"
    let tecnicoEmail = relatorio.tecnico_email

    if (!relatorio.tecnico_nome && relatorio.tecnicos_rarotec_ids) {
      try {
        const ids = typeof relatorio.tecnicos_rarotec_ids === "string"
          ? JSON.parse(relatorio.tecnicos_rarotec_ids)
          : relatorio.tecnicos_rarotec_ids
        if (Array.isArray(ids) && ids.length > 0) {
          const tecs = await sql`SELECT nome, email FROM tecnicos_rarotec WHERE id = ANY(${ids})`
          if (tecs.length > 0) {
            tecnicoNome = tecs.map((t: any) => t.nome).join(", ")
            if (!tecnicoEmail) tecnicoEmail = tecs[0].email
          }
        }
      } catch (e) {
        console.error("Erro ao parsear tecnicos_rarotec_ids:", e)
      }
    }

    // Formatar data da visita
    const dataBruta = relatorio.data_visita || relatorio.data_relatorio
    let dataVisita = "Não informada"
    if (dataBruta) {
      const s = String(dataBruta).split("T")[0]
      const partes = s.split("-")
      if (partes.length === 3) {
        dataVisita = `${partes[2]}/${partes[1]}/${partes[0]}`
      } else {
        dataVisita = new Date(dataBruta).toLocaleDateString("pt-BR")
      }
    }

    // URL de validação
    const validacaoUrl = buildSisgarUrl(`/validar/${relatorio.numero_autenticacao}`)

    // Coletar emails dos destinatários
    const emails: string[] = []

    if (destinatarios.includes("tecnico") && tecnicoEmail) {
      emails.push(tecnicoEmail)
    }

    if (destinatarios.includes("cliente") && relatorio.cliente_email) {
      emails.push(relatorio.cliente_email)
    }

    // Adicionar emails personalizados ou diretos passados no array
    const emailsPersonalizados = destinatarios.filter(
      (d: string) => d !== "tecnico" && d !== "cliente" && d.includes("@")
    )
    emails.push(...emailsPersonalizados)

    // Deduplicar e normalizar
    const destinatariosUnicos = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()))).filter(Boolean)

    if (destinatariosUnicos.length === 0) {
      return NextResponse.json({ 
        error: "Nenhum email válido encontrado para os destinatários selecionados" 
      }, { status: 400 })
    }

    const subject = `Relatório de ${relatorio.tipo_servico || "Visita Técnica"} - ${relatorio.cliente_nome || "Cliente"}`

    // 1. Tentar envio prioritário via Central de E-mails do RaroNexus
    try {
      const bodyHtml = `
        <div style="margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 18px;">Detalhes do Atendimento</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">
            Código de Autenticação: <strong style="color: #0f172a;">${relatorio.numero_autenticacao}</strong>
          </p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 18px 0;">
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Cliente/Órgão:</strong> ${relatorio.cliente_nome || "Não informado"}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Tipo de Serviço:</strong> ${relatorio.tipo_servico || "Visita Técnica"}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Data da Visita:</strong> ${dataVisita}</p>
          ${(relatorio.municipio || relatorio.cliente_cidade) ? `<p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Município:</strong> ${relatorio.municipio || relatorio.cliente_cidade}</p>` : ""}
          <p style="margin: 0; font-size: 14px;"><strong>Técnico Responsável:</strong> ${tecnicoNome}</p>
        </div>

        ${(relatorio.historico || relatorio.descricao_servico) ? `
        <div style="margin: 20px 0;">
          <h3 style="color: #0f172a; font-size: 15px; margin-bottom: 8px;">Resumo dos Serviços</h3>
          <p style="color: #334155; font-size: 14px; line-height: 1.5; white-space: pre-wrap; background: #ffffff; padding: 12px; border-left: 3px solid #0f766e; border-radius: 4px; margin: 0;">
            ${String(relatorio.historico || relatorio.descricao_servico).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </p>
        </div>
        ` : ""}

        <div style="margin: 24px 0; text-align: center;">
          <a href="${validacaoUrl}" style="display: inline-block; background-color: #0f766e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Visualizar Relatório Completo
          </a>
        </div>

        <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 16px;">
          Para validar a autenticidade, acesse: <a href="${validacaoUrl}" style="color: #0f766e;">${validacaoUrl}</a>
        </p>
      `

      const nexusResult = await sendEmailViaNexus({
        to: destinatariosUnicos,
        subject,
        body: bodyHtml,
        metadata: {
          relatorio_id: relatorioId,
          numero_autenticacao: relatorio.numero_autenticacao,
        },
      }, "relatorio-visita")

      return NextResponse.json({
        success: true,
        message: `Email enviado com sucesso via RaroNexus para ${destinatariosUnicos.length} destinatário(s)`,
        emailId: nexusResult.messageId,
        provider: "raronexus",
        destinatarios: destinatariosUnicos,
      })
    } catch (nexusError: any) {
      console.warn("Falha no envio via RaroNexus, verificando fallback:", nexusError?.message)

      // 2. Fallback para Resend se configurado
      if (process.env.RESEND_API_KEY) {
        try {
          const { data, error } = await getResend().emails.send({
            from: FROM_EMAIL,
            to: destinatariosUnicos,
            subject,
            react: RelatorioEmail({
              tecnicoNome,
              clienteNome: relatorio.cliente_nome || "Não informado",
              tipoServico: relatorio.tipo_servico || "Visita Técnica",
              dataVisita,
              municipio: relatorio.municipio || relatorio.cliente_cidade || undefined,
              numeroAutenticacao: relatorio.numero_autenticacao,
              resumoServico: relatorio.historico || relatorio.descricao_servico || undefined,
              validacaoUrl,
            }),
          })

          if (error) {
            throw new Error(error.message)
          }

          return NextResponse.json({
            success: true,
            message: `Email enviado com sucesso via Resend para ${destinatariosUnicos.length} destinatário(s)`,
            emailId: data?.id,
            provider: "resend",
            destinatarios: destinatariosUnicos,
          })
        } catch (resendError: any) {
          console.error("Falha no fallback Resend:", resendError?.message)
        }
      }

      return NextResponse.json(
        { error: nexusError?.message || "Erro ao enviar e-mail pela Central do RaroNexus." },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("[v0] Erro geral no envio de email:", error)
    return NextResponse.json(
      { error: error?.message || "Erro interno ao enviar email" },
      { status: 500 }
    )
  }
}
