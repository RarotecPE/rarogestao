import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { isTipoMedico } from "@/lib/documentos-medicos"
import { auditClient, getRequestContext } from "@/lib/audit"

// GET - Listar solicitações
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const paramTecnicoId = searchParams.get('tecnico_id')
    const status = searchParams.get('status')
    const pendentesGestor = searchParams.get('pendentes_gestor')
    const userIsGestor = isGestor(user.nome, user.cargo)

    // Buscar técnico associado ao usuário caso não seja gestor
    let ownTecnicoId: number | null = null
    if (!userIsGestor) {
      const tecRow = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      ownTecnicoId = tecRow.length > 0 ? Number(tecRow[0].id) : null
    }

    let query: any[] = []
    
    const targetTecnicoId = userIsGestor 
      ? (paramTecnicoId ? parseInt(paramTecnicoId) : null)
      : ownTecnicoId

    if (pendentesGestor === 'true' && userIsGestor) {
      // Gestores veem todas as solicitações pendentes
      query = await sql`
        SELECT 
          s.*,
          t.nome as tecnico_nome,
          a.titulo as evento_titulo,
          a.data_inicio as evento_data,
          a.tipo as evento_tipo,
          a.local as evento_local,
          a.cliente_id as evento_cliente_id,
          c.nome_fantasia as evento_cliente_nome
        FROM agenda_solicitacoes s
        LEFT JOIN tecnicos_rarotec t ON s.tecnico_solicitante_id = t.id
        LEFT JOIN agenda_trabalhista a ON s.agenda_evento_id = a.id
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE s.status = 'pendente'
        ORDER BY s.created_at DESC
      `
    } else if (targetTecnicoId) {
      // Técnico vê suas próprias solicitações (ou gestor filtrando por técnico específico)
      query = await sql`
        SELECT 
          s.*,
          t.nome as tecnico_nome,
          a.titulo as evento_titulo,
          a.data_inicio as evento_data
        FROM agenda_solicitacoes s
        LEFT JOIN tecnicos_rarotec t ON s.tecnico_solicitante_id = t.id
        LEFT JOIN agenda_trabalhista a ON s.agenda_evento_id = a.id
        WHERE s.tecnico_solicitante_id = ${targetTecnicoId}
        ${status ? sql`AND s.status = ${status}` : sql``}
        ORDER BY s.created_at DESC
      `
    } else if (userIsGestor) {
      // Listar todas (apenas para gestores sem filtro)
      query = await sql`
        SELECT 
          s.*,
          t.nome as tecnico_nome,
          a.titulo as evento_titulo,
          a.data_inicio as evento_data
        FROM agenda_solicitacoes s
        LEFT JOIN tecnicos_rarotec t ON s.tecnico_solicitante_id = t.id
        LEFT JOIN agenda_trabalhista a ON s.agenda_evento_id = a.id
        ORDER BY s.created_at DESC
      `
    } else {
      query = []
    }
    
    return NextResponse.json(query)
  } catch (error) {
    console.error("Erro ao listar solicitações:", error)
    return NextResponse.json({ error: "Erro ao listar solicitações" }, { status: 500 })
  }
}

// POST - Criar nova solicitação
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const { agenda_evento_id, tecnico_solicitante_id, tipo_solicitacao, descricao, dados_alteracao } = body
    
    // Para solicitacoes de novos eventos, agenda_evento_id pode ser null
    if (!tecnico_solicitante_id || !tipo_solicitacao) {
      return NextResponse.json({ error: "Campos obrigatórios não preenchidos" }, { status: 400 })
    }

    const userIsGestor = isGestor(user.nome, user.cargo)
    if (!userIsGestor) {
      const tecRow = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      const ownTecId = tecRow.length > 0 ? tecRow[0].id : null
      if (!ownTecId || ownTecId !== Number(tecnico_solicitante_id)) {
        return NextResponse.json({ error: "Você só pode criar solicitações para o seu próprio perfil" }, { status: 403 })
      }
    }
    
    const result = await sql`
      INSERT INTO agenda_solicitacoes (
        agenda_evento_id, 
        tecnico_solicitante_id, 
        tipo_solicitacao, 
        descricao, 
        dados_alteracao
      )
      VALUES (
        ${agenda_evento_id || null}, 
        ${tecnico_solicitante_id}, 
        ${tipo_solicitacao}, 
        ${descricao || null}, 
        ${dados_alteracao ? JSON.stringify(dados_alteracao) : null}
      )
      RETURNING *
    `
    
    const newRequest = result[0]
    const tRows = await sql`SELECT nome FROM tecnicos_rarotec WHERE id = ${tecnico_solicitante_id} LIMIT 1`
    const tecName = String(tRows[0]?.nome || `Técnico #${tecnico_solicitante_id}`)

    auditClient.log({
      category: "schedule",
      action: "schedule_request.created",
      severity: "INFO",
      actor: {
        type: "user",
        userId: String(user.id),
        name: user.nome,
        email: user.email,
        role: user.cargo,
      },
      targets: [
        {
          type: "schedule_request",
          id: String(newRequest.id),
          label: `Solicitação: ${tipo_solicitacao} (${tecName})`,
        },
        {
          type: "technician",
          id: String(tecnico_solicitante_id),
          label: tecName,
        },
      ],
      context: getRequestContext(request),
      details: {
        tipo_solicitacao,
        tecnico_solicitante_id,
        tecnico_nome: tecName,
        agenda_evento_id,
        descricao,
      },
    })
    
    return NextResponse.json(newRequest, { status: 201 })
  } catch (error) {
    console.error("Erro ao criar solicitação:", error)
    return NextResponse.json({ error: "Erro ao criar solicitação" }, { status: 500 })
  }
}

// PATCH - Aprovar/Rejeitar solicitação
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem aprovar ou rejeitar solicitações" }, { status: 403 })
    }

    const body = await request.json()
    const { id, status, motivo_rejeicao } = body
    const aprovadoPor = user.nome
    const reqContext = getRequestContext(request)
    
    if (!id || !status || !['aprovado', 'rejeitado'].includes(status)) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const beforeReqRows = await sql`
      SELECT s.*, t.nome AS tecnico_nome
      FROM agenda_solicitacoes s
      LEFT JOIN tecnicos_rarotec t ON t.id = s.tecnico_solicitante_id
      WHERE s.id = ${id}
      LIMIT 1
    `
    if (beforeReqRows.length === 0) {
      return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 })
    }
    const beforeReq = beforeReqRows[0]
    const tecName = String(beforeReq.tecnico_nome || `Técnico #${beforeReq.tecnico_solicitante_id}`)
    
    // Atualizar solicitação
    const result = await sql`
      UPDATE agenda_solicitacoes
      SET 
        status = ${status},
        aprovado_por = ${aprovadoPor},
        data_aprovacao = NOW(),
        motivo_rejeicao = ${motivo_rejeicao || null},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    
    console.log("[v0] Solicitacao atualizada:", JSON.stringify(result[0]))
    
    if (result.length === 0) {
      return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 })
    }

    let generatedEventId: number | null = result[0].agenda_evento_id ? Number(result[0].agenda_evento_id) : null
    
    // Se aprovado, aplicar alteração na agenda
    if (status === 'aprovado' && result[0].dados_alteracao) {
      const alteracao = typeof result[0].dados_alteracao === 'string' 
        ? JSON.parse(result[0].dados_alteracao)
        : result[0].dados_alteracao
      
      const tipoSolicitacao = result[0].tipo_solicitacao
      
      console.log("[v0] Tipo solicitacao:", tipoSolicitacao, "Alteracao:", JSON.stringify(alteracao))
      
      // Para solicitações de NOVO agendamento, criar o evento na agenda
      if (tipoSolicitacao === 'novo') {
        const tipoEvento = alteracao.tipo_evento || 'visita'
        const tipoLabel = tipoEvento === 'visita' ? 'Visita Tecnica' 
          : tipoEvento === 'treinamento' ? 'Treinamento'
          : tipoEvento === 'reuniao' ? 'Reuniao'
          : tipoEvento === 'interno' ? 'Interno'
          : tipoEvento === 'folga' ? 'Folga'
          : tipoEvento === 'ferias' ? 'Ferias'
          : tipoEvento === 'atestado' ? 'Atestado Medico'
          : tipoEvento === 'consulta_medica' ? 'Consulta Medica'
          : tipoEvento === 'licenca_medica' ? 'Licenca Medica'
          : tipoEvento === 'licenca_maternidade' ? 'Lic. Maternidade'
          : tipoEvento === 'feriado' ? 'Feriado'
          : 'Visita Tecnica'
        
        let municipio = alteracao.municipio
        let clienteNome: string | null = null
        if (alteracao.cliente_id) {
          const clienteResult = await sql`
            SELECT cidade, COALESCE(nome_fantasia, razao_social) AS nome FROM clientes WHERE id = ${alteracao.cliente_id}
          `
          if (!municipio && clienteResult[0]?.cidade) {
            municipio = clienteResult[0].cidade
          }
          clienteNome = clienteResult[0]?.nome ? String(clienteResult[0].nome) : null
        }
        
        const titulo = municipio 
          ? `${tipoLabel} - ${municipio}`
          : tipoLabel
        
        console.log("[v0] Criando evento - titulo:", titulo, "data:", alteracao.data_sugerida, "tecnico:", result[0].tecnico_solicitante_id)
        
        const insertResult = await sql`
          INSERT INTO agenda_trabalhista (
            titulo,
            tipo,
            data_inicio,
            data_fim,
            local,
            tecnico_rarotec_id,
            cliente_id,
            status
          ) VALUES (
            ${titulo},
            ${tipoEvento},
            ${alteracao.data_sugerida + 'T09:00:00'},
            ${alteracao.data_sugerida + 'T18:00:00'},
            ${municipio || null},
            ${result[0].tecnico_solicitante_id},
            ${alteracao.cliente_id || null},
            'agendado'
          )
          RETURNING *
        `
        const createdEvent = insertResult[0]
        generatedEventId = createdEvent?.id ? Number(createdEvent.id) : null
        console.log("[v0] Evento criado com ID:", createdEvent?.id)

        if (createdEvent) {
          auditClient.log({
            category: "schedule",
            action: "schedule.created",
            severity: "INFO",
            actor: {
              type: "user",
              userId: String(user.id),
              name: user.nome,
              email: user.email,
              role: user.cargo,
            },
            targets: [
              { type: "schedule", id: String(createdEvent.id), label: `${titulo} (${tecName})` },
              { type: "technician", id: String(result[0].tecnico_solicitante_id), label: tecName },
              ...(alteracao.cliente_id && clienteNome
                ? [{ type: "client", id: String(alteracao.cliente_id), label: clienteNome }]
                : []),
            ],
            context: reqContext,
            details: {
              origem: "aprovacao_solicitacao",
              solicitacao_id: id,
              titulo: createdEvent.titulo,
              tipo: createdEvent.tipo,
              data_inicio: createdEvent.data_inicio,
              data_fim: createdEvent.data_fim,
              local: createdEvent.local,
              tecnico_rarotec_id: result[0].tecnico_solicitante_id,
              tecnico_nome: tecName,
              cliente_id: alteracao.cliente_id || null,
              cliente_nome: clienteNome,
            },
          })
        }

        if (isTipoMedico(tipoEvento)) {
          const dataInicio = alteracao.data_inicio || alteracao.data_sugerida
          const dataFim = alteracao.data_fim || alteracao.data_sugerida
          const docInsert = await sql`
            INSERT INTO documentos_medicos (
              tecnico_rarotec_id, tipo, data_inicio, data_fim, descricao,
              blob_pathname, nome_arquivo, tipo_arquivo, tamanho, agenda_evento_id, created_by
            ) VALUES (
              ${result[0].tecnico_solicitante_id}, ${tipoEvento}, ${dataInicio}, ${dataFim},
              ${result[0].descricao || null},
              ${alteracao.anexo_pathname || null}, ${alteracao.anexo_nome || null},
              ${alteracao.anexo_tipo || null}, ${alteracao.anexo_tamanho || null},
              ${createdEvent?.id || null}, ${result[0].aprovado_por || null}
            )
            RETURNING *
          `
          const createdDoc = docInsert[0]
          if (createdDoc) {
            auditClient.log({
              category: "medical_docs",
              action: "medical_doc.uploaded",
              severity: "INFO",
              actor: {
                type: "user",
                userId: String(user.id),
                name: user.nome,
                email: user.email,
                role: user.cargo,
              },
              targets: [
                { type: "medical_doc", id: String(createdDoc.id), label: `${tipoEvento} - ${tecName}` },
                { type: "technician", id: String(result[0].tecnico_solicitante_id), label: tecName },
              ],
              context: reqContext,
              details: {
                origem: "aprovacao_solicitacao_agenda",
                solicitacao_id: id,
                documento_id: createdDoc.id,
                tecnico_rarotec_id: result[0].tecnico_solicitante_id,
                tecnico_nome: tecName,
                tipo: tipoEvento,
                data_inicio: dataInicio,
                data_fim: dataFim,
                hasAttachment: Boolean(alteracao.anexo_pathname || alteracao.anexo_nome),
                nome_arquivo: alteracao.anexo_nome || null,
                storagePath: alteracao.anexo_pathname || null,
              },
            })
          }
          console.log("[v0] Documento medico criado (anexo:", !!alteracao.anexo_pathname, ")")
        }
      } else if (tipoSolicitacao === 'alteracao' && result[0].agenda_evento_id) {
        const prevEventRows = await sql`SELECT * FROM agenda_trabalhista WHERE id = ${result[0].agenda_evento_id} LIMIT 1`
        const beforeEvent = prevEventRows[0] || null

        const tipoEvento = alteracao.tipo_evento || 'visita'
        const tipoLabel = tipoEvento === 'visita' ? 'Visita Tecnica' 
          : tipoEvento === 'treinamento' ? 'Treinamento'
          : tipoEvento === 'reuniao' ? 'Reuniao'
          : tipoEvento === 'interno' ? 'Interno'
          : tipoEvento === 'folga' ? 'Folga'
          : tipoEvento === 'ferias' ? 'Ferias'
          : tipoEvento === 'atestado' ? 'Atestado Medico'
          : tipoEvento === 'consulta_medica' ? 'Consulta Medica'
          : tipoEvento === 'licenca_medica' ? 'Licenca Medica'
          : tipoEvento === 'licenca_maternidade' ? 'Lic. Maternidade'
          : tipoEvento === 'feriado' ? 'Feriado'
          : 'Visita Tecnica'
        
        let municipio = alteracao.municipio
        let clienteNome: string | null = null
        if (alteracao.cliente_id) {
          const clienteResult = await sql`
            SELECT cidade, COALESCE(nome_fantasia, razao_social) AS nome FROM clientes WHERE id = ${alteracao.cliente_id}
          `
          if (!municipio && clienteResult[0]?.cidade) {
            municipio = clienteResult[0].cidade
          }
          clienteNome = clienteResult[0]?.nome ? String(clienteResult[0].nome) : null
        }
        
        const titulo = municipio 
          ? `${tipoLabel} - ${municipio}`
          : tipoLabel
        
        console.log("[v0] Atualizando evento ID:", result[0].agenda_evento_id, "com:", {
          titulo,
          tipoEvento,
          data: alteracao.data_sugerida,
          municipio: municipio,
          cliente: alteracao.cliente_id
        })
        
        const updatedEventRows = await sql`
          UPDATE agenda_trabalhista
          SET 
            titulo = ${titulo},
            tipo = ${tipoEvento},
            data_inicio = ${alteracao.data_sugerida + 'T09:00:00'},
            data_fim = ${alteracao.data_sugerida + 'T18:00:00'},
            local = ${municipio || null},
            cliente_id = ${alteracao.cliente_id || null},
            updated_at = NOW()
          WHERE id = ${result[0].agenda_evento_id}
          RETURNING *
        `
        const updatedEvent = updatedEventRows[0]
        if (beforeEvent && updatedEvent) {
          auditClient.log({
            category: "schedule",
            action: "schedule.updated",
            severity: "INFO",
            actor: {
              type: "user",
              userId: String(user.id),
              name: user.nome,
              email: user.email,
              role: user.cargo,
            },
            targets: [
              { type: "schedule", id: String(updatedEvent.id), label: `${titulo} (${tecName})` },
              { type: "technician", id: String(result[0].tecnico_solicitante_id), label: tecName },
              ...(alteracao.cliente_id && clienteNome
                ? [{ type: "client", id: String(alteracao.cliente_id), label: clienteNome }]
                : []),
            ],
            context: reqContext,
            diff: {
              before: beforeEvent,
              after: updatedEvent,
            },
            details: {
              origem: "aprovacao_solicitacao",
              solicitacao_id: id,
              evento_id: updatedEvent.id,
              titulo: updatedEvent.titulo,
              tipo: updatedEvent.tipo,
              tecnico_rarotec_id: result[0].tecnico_solicitante_id,
              tecnico_nome: tecName,
              cliente_id: alteracao.cliente_id || null,
              cliente_nome: clienteNome,
            },
          })
        }
        
        console.log("[v0] Evento atualizado com sucesso")

        if (isTipoMedico(tipoEvento) && alteracao.anexo_pathname) {
          const dataInicio = alteracao.data_inicio || alteracao.data_sugerida
          const dataFim = alteracao.data_fim || alteracao.data_sugerida
          const docInsert = await sql`
            INSERT INTO documentos_medicos (
              tecnico_rarotec_id, tipo, data_inicio, data_fim, descricao,
              blob_pathname, nome_arquivo, tipo_arquivo, tamanho, agenda_evento_id, created_by
            ) VALUES (
              ${result[0].tecnico_solicitante_id}, ${tipoEvento}, ${dataInicio}, ${dataFim},
              ${result[0].descricao || null},
              ${alteracao.anexo_pathname}, ${alteracao.anexo_nome || null},
              ${alteracao.anexo_tipo || null}, ${alteracao.anexo_tamanho || null},
              ${result[0].agenda_evento_id}, ${result[0].aprovado_por || null}
            )
            RETURNING *
          `
          const createdDoc = docInsert[0]
          if (createdDoc) {
            auditClient.log({
              category: "medical_docs",
              action: "medical_doc.uploaded",
              severity: "INFO",
              actor: {
                type: "user",
                userId: String(user.id),
                name: user.nome,
                email: user.email,
                role: user.cargo,
              },
              targets: [
                { type: "medical_doc", id: String(createdDoc.id), label: `${tipoEvento} - ${tecName}` },
                { type: "technician", id: String(result[0].tecnico_solicitante_id), label: tecName },
              ],
              context: reqContext,
              details: {
                origem: "aprovacao_solicitacao_agenda",
                solicitacao_id: id,
                documento_id: createdDoc.id,
                tecnico_rarotec_id: result[0].tecnico_solicitante_id,
                tecnico_nome: tecName,
                tipo: tipoEvento,
                data_inicio: dataInicio,
                data_fim: dataFim,
                hasAttachment: Boolean(alteracao.anexo_pathname || alteracao.anexo_nome),
                nome_arquivo: alteracao.anexo_nome || null,
                storagePath: alteracao.anexo_pathname || null,
              },
            })
          }
          console.log("[v0] Documento medico criado (alteracao) com anexo")
        }
      } else if (result[0].agenda_evento_id) {
        const prevEventRows = await sql`SELECT * FROM agenda_trabalhista WHERE id = ${result[0].agenda_evento_id} LIMIT 1`
        const beforeEvent = prevEventRows[0] || null

        const updatedEventRows = await sql`
          UPDATE agenda_trabalhista
          SET 
            titulo = COALESCE(${alteracao.titulo || null}, titulo),
            data_inicio = COALESCE(${alteracao.data_inicio || null}, data_inicio),
            data_fim = COALESCE(${alteracao.data_fim || null}, data_fim),
            local = COALESCE(${alteracao.local || null}, local),
            updated_at = NOW()
          WHERE id = ${result[0].agenda_evento_id}
          RETURNING *
        `
        const updatedEvent = updatedEventRows[0]
        if (beforeEvent && updatedEvent) {
          auditClient.log({
            category: "schedule",
            action: "schedule.updated",
            severity: "INFO",
            actor: {
              type: "user",
              userId: String(user.id),
              name: user.nome,
              email: user.email,
              role: user.cargo,
            },
            targets: [
              { type: "schedule", id: String(updatedEvent.id), label: `${updatedEvent.titulo} (${tecName})` },
              { type: "technician", id: String(result[0].tecnico_solicitante_id), label: tecName },
            ],
            context: reqContext,
            diff: {
              before: beforeEvent,
              after: updatedEvent,
            },
            details: {
              origem: "aprovacao_solicitacao",
              solicitacao_id: id,
              evento_id: updatedEvent.id,
              titulo: updatedEvent.titulo,
              tecnico_rarotec_id: result[0].tecnico_solicitante_id,
              tecnico_nome: tecName,
            },
          })
        }
      }
    }

    auditClient.log({
      category: "schedule",
      action: "schedule_request.reviewed",
      severity: status === "rejeitado" ? "WARNING" : "INFO",
      actor: {
        type: "user",
        userId: String(user.id),
        name: user.nome,
        email: user.email,
        role: user.cargo,
      },
      targets: [
        {
          type: "schedule_request",
          id: String(id),
          label: `Solicitação: ${result[0].tipo_solicitacao} - ${tecName} (${status})`,
        },
        {
          type: "technician",
          id: String(result[0].tecnico_solicitante_id),
          label: tecName,
        },
      ],
      context: reqContext,
      diff: {
        before: {
          status: beforeReq.status || "pendente",
          aprovado_por: beforeReq.aprovado_por || null,
          motivo_rejeicao: beforeReq.motivo_rejeicao || null,
        },
        after: {
          status,
          aprovado_por: aprovadoPor,
          motivo_rejeicao: motivo_rejeicao || null,
        },
      },
      details: {
        solicitacao_id: id,
        status,
        aprovado_por: aprovadoPor,
        motivo_rejeicao: motivo_rejeicao || null,
        tipo_solicitacao: result[0].tipo_solicitacao,
        tecnico_solicitante_id: result[0].tecnico_solicitante_id,
        tecnico_nome: tecName,
        agenda_evento_id: generatedEventId,
      },
    })
    
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Erro ao processar solicitação:", error)
    return NextResponse.json({ error: "Erro ao processar solicitação" }, { status: 500 })
  }
}
