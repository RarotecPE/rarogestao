import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { auditClient, getRequestContext } from "@/lib/audit"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cnpj = searchParams.get("cnpj")?.replace(/\D/g, "")

    if (!cnpj || cnpj.length !== 14) {
      return NextResponse.json(
        { error: "CNPJ invalido" },
        { status: 400 }
      )
    }

    const user = await getSession().catch(() => null)
    const actor = user
      ? {
          type: "user" as const,
          userId: String(user.id),
          name: user.nome,
          email: user.email,
          role: user.cargo,
        }
      : {
          type: "anonymous" as const,
          name: "Consulta CNPJ",
        }

    // Usando a API publica da ReceitaWS
    const response = await fetch(
      `https://receitaws.com.br/v1/cnpj/${cnpj}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      // Tentar API alternativa (BrasilAPI)
      const brasilApiResponse = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`
      )

      if (!brasilApiResponse.ok) {
        return NextResponse.json(
          { error: "CNPJ nao encontrado" },
          { status: 404 }
        )
      }

      const brasilData = await brasilApiResponse.json()
      
      // Formata telefone da BrasilAPI
      let telefone = ""
      if (brasilData.ddd_telefone_1) {
        const ddd = brasilData.ddd_telefone_1.substring(0, 2)
        const numero = brasilData.ddd_telefone_1.substring(2).replace(/\D/g, "")
        telefone = `(${ddd}) ${numero}`
      }

      const payload = {
        razao_social: brasilData.razao_social || "",
        nome_fantasia: brasilData.nome_fantasia || "",
        cnpj: cnpj,
        logradouro: brasilData.logradouro || "",
        numero: brasilData.numero || "",
        complemento: brasilData.complemento || "",
        bairro: brasilData.bairro || "",
        cidade: brasilData.municipio || "",
        estado: brasilData.uf || "",
        cep: brasilData.cep?.replace(/\D/g, "") || "",
        telefone: telefone,
        email: brasilData.email?.toLowerCase() || "",
        situacao: brasilData.descricao_situacao_cadastral || "",
        data_abertura: brasilData.data_inicio_atividade || "",
        capital_social: brasilData.capital_social || "",
        porte: brasilData.porte || "",
        natureza_juridica: brasilData.natureza_juridica || "",
      }

      auditClient.log({
        category: "clients",
        action: "client.cnpj_validated",
        severity: "INFO",
        actor,
        targets: [
          {
            type: "cnpj",
            id: cnpj,
            label: `${payload.nome_fantasia || payload.razao_social || cnpj} (${cnpj})`,
          },
        ],
        context: getRequestContext(request),
        details: {
          cnpj,
          razao_social: payload.razao_social,
          nome_fantasia: payload.nome_fantasia,
          cidade: payload.cidade,
          estado: payload.estado,
          situacao: payload.situacao,
          provedor: "BrasilAPI",
        },
      })
      
      return NextResponse.json(payload)
    }

    const data = await response.json()

    if (data.status === "ERROR") {
      return NextResponse.json(
        { error: data.message || "CNPJ nao encontrado" },
        { status: 404 }
      )
    }

    // Formata telefone da ReceitaWS (vem no formato "(XX) XXXX-XXXX" ou "XXXX-XXXX")
    let telefone = data.telefone || ""
    if (telefone) {
      // Remove espacos extras e formata
      telefone = telefone.replace(/\s+/g, " ").trim()
      // Se tiver mais de um telefone, pega o primeiro
      if (telefone.includes("/")) {
        telefone = telefone.split("/")[0].trim()
      }
    }

    const payload = {
      razao_social: data.nome || "",
      nome_fantasia: data.fantasia || "",
      cnpj: cnpj,
      logradouro: data.logradouro || "",
      numero: data.numero || "",
      complemento: data.complemento || "",
      bairro: data.bairro || "",
      cidade: data.municipio || "",
      estado: data.uf || "",
      cep: data.cep?.replace(/\D/g, "") || "",
      telefone: telefone,
      email: data.email?.toLowerCase() || "",
      situacao: data.situacao || "",
      data_abertura: data.abertura || "",
      capital_social: data.capital_social || "",
      porte: data.porte || "",
      natureza_juridica: data.natureza_juridica || "",
    }

    auditClient.log({
      category: "clients",
      action: "client.cnpj_validated",
      severity: "INFO",
      actor,
      targets: [
        {
          type: "cnpj",
          id: cnpj,
          label: `${payload.nome_fantasia || payload.razao_social || cnpj} (${cnpj})`,
        },
      ],
      context: getRequestContext(request),
      details: {
        cnpj,
        razao_social: payload.razao_social,
        nome_fantasia: payload.nome_fantasia,
        cidade: payload.cidade,
        estado: payload.estado,
        situacao: payload.situacao,
        provedor: "ReceitaWS",
      },
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error("Erro ao buscar CNPJ:", error)
    return NextResponse.json(
      { error: "Erro ao consultar CNPJ" },
      { status: 500 }
    )
  }
}
