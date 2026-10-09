import { jsPDF } from "jspdf"
import QRCode from "qrcode"
import { PDFDocument } from "pdf-lib"
import {
  competenciaLabel,
  formatBRL,
  fileUrl,
  totalItensServico,
  valorUnitarioItemServico,
  type ApuracaoRelatorio,
} from "@/lib/apuracao"
import { generateRelatorioPDF, buildRelatorioPdfDataFromRecord } from "@/lib/pdf-generator"
import { buildRaroGestaoUrl } from "@/lib/app-url"
import { fetchInstitucionalInfo, type InstitucionalInfo, normalizeInstitucional } from "@/lib/institucional"

const COLORS = {
  primary: [30, 83, 146] as [number, number, number],
  primaryDark: [21, 59, 105] as [number, number, number],
  dark: [38, 44, 53] as [number, number, number],
  gray: [110, 118, 128] as [number, number, number],
  border: [222, 226, 230] as [number, number, number],
  softBg: [246, 248, 250] as [number, number, number],
  zebra: [250, 251, 252] as [number, number, number],
  success: [22, 128, 84] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
}

export interface ApuracaoPdfData extends ApuracaoRelatorio {
  cliente_nome?: string
  cliente_razao?: string
  cliente_cnpj?: string
  cliente_cidade?: string
  cliente_estado?: string
  cliente_endereco?: string
  usuarioEmissor?: string
  usuarioDownload?: string
  empresaResponsavel?: Partial<InstitucionalInfo>
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Gera uma contra-capa (página separadora) que antecede os anexos do RMPS,
 * listando os documentos que seguem anexados. Retorna os bytes do PDF (1 página).
 */
async function buildContraCapaAnexos(opts: {
  competencia: string
  numeroAutenticacao: string
  documentos: string[]
  empresaNome?: string
}): Promise<ArrayBuffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - 2 * margin

  // Moldura decorativa da página
  doc.setDrawColor(...COLORS.primary)
  doc.setLineWidth(0.6)
  doc.rect(margin - 6, margin - 6, pageWidth - 2 * (margin - 6), pageHeight - 2 * (margin - 6))

  let yPos = margin + 6

  // Logo centralizado
  const logoDataUrl = await fetchAsDataUrl("/logo.png")
  if (logoDataUrl) {
    let logoW = 50
    let logoH = 15
    try {
      const props = doc.getImageProperties(logoDataUrl)
      logoH = (logoW * props.height) / props.width
      if (logoH > 18) {
        logoH = 18
        logoW = (logoH * props.width) / props.height
      }
    } catch {
      /* usa fallback */
    }
    doc.addImage(logoDataUrl, "PNG", pageWidth / 2 - logoW / 2, yPos, logoW, logoH)
    yPos += logoH + 6
  } else {
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.primary)
    doc.text((opts.empresaNome || "RAROTEC").toUpperCase(), pageWidth / 2, yPos + 10, { align: "center" })
    yPos += 20
  }

  // Bloco central com o título
  const centerY = pageHeight / 2 - 20
  yPos = centerY

  doc.setDrawColor(...COLORS.primary)
  doc.setLineWidth(1.2)
  doc.line(pageWidth / 2 - 22, yPos - 12, pageWidth / 2 + 22, yPos - 12)

  doc.setFontSize(30)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.primaryDark)
  doc.text("ANEXOS", pageWidth / 2, yPos, { align: "center" })

  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text("Documentos complementares deste relatório", pageWidth / 2, yPos + 9, {
    align: "center",
  })

  doc.setDrawColor(...COLORS.primary)
  doc.setLineWidth(1.2)
  doc.line(pageWidth / 2 - 22, yPos + 16, pageWidth / 2 + 22, yPos + 16)

  yPos += 30

  // Referência da competência / autenticação
  doc.setFontSize(9.5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.dark)
  doc.text(`Competência: ${opts.competencia}`, pageWidth / 2, yPos, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(`Autenticação: ${opts.numeroAutenticacao}`, pageWidth / 2, yPos + 5.5, {
    align: "center",
  })

  // Lista dos documentos anexados
  if (opts.documentos.length > 0) {
    yPos += 18
    doc.setFontSize(8.5)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.primaryDark)
    doc.text("DOCUMENTOS A SEGUIR", pageWidth / 2, yPos, { align: "center" })
    yPos += 7

    const listWidth = Math.min(contentWidth, 150)
    const listX = pageWidth / 2 - listWidth / 2
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    opts.documentos.forEach((docNome, idx) => {
      const linhas = doc.splitTextToSize(`${idx + 1}. ${docNome}`, listWidth - 6) as string[]
      const rowH = Math.max(8, linhas.length * 4.4 + 3)
      doc.setFillColor(...COLORS.zebra)
      doc.setDrawColor(...COLORS.border)
      doc.setLineWidth(0.2)
      doc.roundedRect(listX, yPos, listWidth, rowH, 1, 1, "FD")
      doc.setTextColor(...COLORS.dark)
      let ty = yPos + 5
      for (const ln of linhas) {
        doc.text(ln, listX + 3, ty)
        ty += 4.4
      }
      yPos += rowH + 2
    })
  }

  return doc.output("arraybuffer")
}

export async function generateApuracaoPDF(data: ApuracaoPdfData): Promise<Blob> {
  // Obter informações institucionais obrigatórias da constante do RaroNexus
  const institucional: InstitucionalInfo = data.empresaResponsavel
    ? normalizeInstitucional(data.empresaResponsavel)
    : await fetchInstitucionalInfo()

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - 2 * margin
  const footerReserve = 20
  let yPos = margin

  const numeroTexto = data.numero_texto || String(data.numero).padStart(3, "0")
  // O sufixo -{id} garante unicidade do codigo: dois relatorios podem ter o mesmo
  // numero/exercicio (numeracao e por contrato/modelo), entao o id resolve a ambiguidade.
  const numeroAutenticacao = `RMPS-${data.exercicio}-${numeroTexto}-${data.id}`
  const dataDownload = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  const dataEmissao =
    data.data_emissao?.slice(0, 10).split("-").reverse().join("/") ||
    new Date().toLocaleDateString("pt-BR")

  const checkPageBreak = (height: number) => {
    if (yPos + height > pageHeight - footerReserve) {
      doc.addPage()
      yPos = margin
      return true
    }
    return false
  }

  // Cabeçalho de seção: barra fina + título em maiúsculas
  const addSectionHeader = (title: string) => {
    checkPageBreak(16)
    yPos += 2
    doc.setFillColor(...COLORS.primary)
    doc.rect(margin, yPos, 3, 6, "F")
    doc.setTextColor(...COLORS.primaryDark)
    doc.setFontSize(10.5)
    doc.setFont("helvetica", "bold")
    doc.text(title, margin + 6, yPos + 4.8)
    yPos += 7
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 5
  }

  const addParagraph = (text: string, opts?: { size?: number; gap?: number }) => {
    const size = opts?.size ?? 9.5
    doc.setFontSize(size)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.dark)
    const lines = doc.splitTextToSize(text, contentWidth) as string[]
    const lineHeight = size * 0.52
    for (const line of lines) {
      checkPageBreak(lineHeight + 1)
      doc.text(line, margin, yPos, { align: "justify", maxWidth: contentWidth })
      yPos += lineHeight
    }
    yPos += opts?.gap ?? 3
  }

  // ===== HEADER =====
  const validationUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/validar/${numeroAutenticacao}`
      : buildRaroGestaoUrl(`/validar/${numeroAutenticacao}`)
  let qrDataUrl: string | null = null
  try {
    qrDataUrl = await QRCode.toDataURL(validationUrl, {
      width: 120,
      margin: 0,
      color: { dark: "#1E5392", light: "#FFFFFF" },
    })
  } catch {
    qrDataUrl = null
  }

  const qrSize = 22
  const logoDataUrl = await fetchAsDataUrl("/logo.png")
  if (logoDataUrl) {
    let logoW = 42
    let logoH = 12
    try {
      const props = doc.getImageProperties(logoDataUrl)
      logoH = (logoW * props.height) / props.width
      if (logoH > 16) {
        logoH = 16
        logoW = (logoH * props.width) / props.height
      }
    } catch {
      /* usa fallback */
    }
    doc.addImage(logoDataUrl, "PNG", margin, yPos, logoW, logoH)
  } else {
    doc.setFontSize(18)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.primary)
    doc.text((institucional.nome || "RAROTEC").toUpperCase(), margin, yPos + 8)
  }

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, "PNG", pageWidth - margin - qrSize, yPos, qrSize, qrSize)
    doc.setFontSize(5.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.gray)
    doc.text("Autenticação", pageWidth - margin - qrSize / 2, yPos + qrSize + 2.5, {
      align: "center",
    })
  }

  // Título centralizado
  doc.setFontSize(15)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.dark)
  doc.text("Relatório Mensal de", pageWidth / 2, yPos + 6, { align: "center" })
  doc.text("Prestação dos Serviços", pageWidth / 2, yPos + 12.5, { align: "center" })

  yPos += 26
  doc.setDrawColor(...COLORS.primary)
  doc.setLineWidth(0.8)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 8

  // ===== Faixa de metadados (competência / número / emissão) =====
  const metaH = 16
  doc.setFillColor(...COLORS.softBg)
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, yPos, contentWidth, metaH, 1.5, 1.5, "FD")

  const metaCol = contentWidth / 3
  const metaLabel = (label: string, value: string, cx: number, align: "left" | "center" | "right") => {
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.gray)
    doc.text(label.toUpperCase(), cx, yPos + 6, { align })
    doc.setFontSize(10.5)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.primaryDark)
    doc.text(value, cx, yPos + 12, { align })
  }
  metaLabel("Competência", competenciaLabel(data.competencia), margin + 5, "left")
  metaLabel("Relatório Nº", `${numeroTexto}/${data.exercicio}`, margin + metaCol + metaCol / 2, "center")
  metaLabel("Emissão", dataEmissao, pageWidth - margin - 5, "right")

  // divisores verticais da faixa
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.line(margin + metaCol, yPos + 3, margin + metaCol, yPos + metaH - 3)
  doc.line(margin + 2 * metaCol, yPos + 3, margin + 2 * metaCol, yPos + metaH - 3)
  yPos += metaH + 6

  // ===== DESTINATÁRIO (card) =====
  addSectionHeader("DESTINATÁRIO")
  const nomesClientes =
    Array.isArray(data.clientes_nomes) && data.clientes_nomes.length > 0
      ? data.clientes_nomes
      : [data.cliente_nome || data.cliente_razao || ""].filter(Boolean)

  const destLinhas: { label?: string; value: string; bold?: boolean }[] = []
  if (nomesClientes.length === 1) {
    destLinhas.push({ value: nomesClientes[0], bold: true })
  } else if (nomesClientes.length > 1) {
    destLinhas.push({ value: `${nomesClientes.length} órgãos atendidos:`, bold: true })
    nomesClientes.forEach((n) => destLinhas.push({ value: `• ${n}` }))
  }
  if (data.municipio) destLinhas.push({ label: "Município", value: data.municipio })
  if (data.sigla_orgao) destLinhas.push({ label: "Órgão", value: data.sigla_orgao })
  if (data.destinatario_nome)
    destLinhas.push({
      label: "A/C",
      value: `${data.destinatario_nome}${data.destinatario_cargo ? ` — ${data.destinatario_cargo}` : ""}`,
    })
  if (data.numero_contrato_texto)
    destLinhas.push({ label: "Contrato Nº", value: data.numero_contrato_texto })
  if (data.cliente_cnpj) destLinhas.push({ label: "CNPJ", value: data.cliente_cnpj })

  const lineH = 5.4
  const cardPad = 4
  const cardH = destLinhas.length * lineH + cardPad * 2
  checkPageBreak(cardH + 4)
  const cardTop = yPos
  doc.setFillColor(...COLORS.softBg)
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, cardTop, contentWidth, cardH, 1.5, 1.5, "FD")
  let cy = cardTop + cardPad + 3
  for (const l of destLinhas) {
    if (l.label) {
      doc.setFontSize(7.5)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...COLORS.gray)
      doc.text(`${l.label.toUpperCase()}`, margin + cardPad, cy)
      doc.setFontSize(9.5)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...COLORS.dark)
      doc.text(l.value, margin + cardPad + 26, cy)
    } else {
      doc.setFontSize(l.bold ? 10.5 : 9.5)
      doc.setFont("helvetica", l.bold ? "bold" : "normal")
      doc.setTextColor(...(l.bold ? COLORS.dark : COLORS.dark))
      doc.text(l.value, margin + cardPad, cy)
    }
    cy += lineH
  }
  yPos = cardTop + cardH + 2

  // ===== PRESTAÇÃO DOS SERVIÇOS =====
  if (data.texto) {
    addSectionHeader("PRESTAÇÃO DOS SERVIÇOS")
    addParagraph(data.texto)

    const modalidades: string[] = []
    if (data.modalidade_remoto) modalidades.push("Remoto")
    if (data.modalidade_presencial) modalidades.push("Presencial")
    if (modalidades.length) {
      checkPageBreak(8)
      const txt = `Modalidade de atendimento: ${modalidades.join(" e ")}`
      doc.setFontSize(8.5)
      doc.setFont("helvetica", "bold")
      const tw = doc.getTextWidth(txt) + 6
      doc.setFillColor(...COLORS.primary)
      doc.roundedRect(margin, yPos, tw, 6.5, 3.25, 3.25, "F")
      doc.setTextColor(...COLORS.white)
      doc.text(txt, margin + 3, yPos + 4.5)
      yPos += 11
    }
  }

  const porItem = data.modo_valor === "por_item"
  const itensServico = Array.isArray(data.itens_servico) ? data.itens_servico : []

  // ===== ITENS DA PRESTAÇÃO DOS SERVIÇOS (tabela) =====
  if (porItem) {
    addSectionHeader("ITENS DA PRESTAÇÃO DOS SERVIÇOS")
    const headH = 9
    const valW = 32 // VALOR total (R$)
    const unitValW = 28 // VLR. UNIT. (R$)
    const qtyW = 16 // QTD.
    const unitW = 18 // UNID.
    const descW = contentWidth - valW - unitValW - qtyW - unitW
    const descX = margin + 3
    const qtyCx = margin + descW + qtyW / 2
    const unitCx = margin + descW + qtyW + unitW / 2
    // Coluna de valor unitário: alinhada à direita, com folga antes da coluna VALOR total.
    const unitValRightX = pageWidth - margin - valW - 3
    const valX = pageWidth - margin - 3

    // Cabeçalho
    checkPageBreak(headH + 4)
    doc.setFillColor(...COLORS.primary)
    doc.rect(margin, yPos, contentWidth, headH, "F")
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.white)
    doc.text("ITEM / DESCRIÇÃO", descX, yPos + headH / 2 + 1.6)
    doc.text("QTD.", qtyCx, yPos + headH / 2 + 1.6, { align: "center" })
    doc.text("UNID.", unitCx, yPos + headH / 2 + 1.6, { align: "center" })
    doc.text("VLR. UNIT. (R$)", unitValRightX, yPos + headH / 2 + 1.6, { align: "right" })
    doc.text("VALOR (R$)", valX, yPos + headH / 2 + 1.6, { align: "right" })
    yPos += headH

    doc.setFont("helvetica", "normal")
    itensServico.forEach((item, idx) => {
      doc.setFontSize(8.5)
      const texto = `${idx + 1}. ${item.descricao || "-"}`
      const linhas = doc.splitTextToSize(texto, descW - 5) as string[]
      const lineH = 4.4
      const rowHi = Math.max(9, linhas.length * lineH + 4)
      checkPageBreak(rowHi)
      if (idx % 2 === 1) {
        doc.setFillColor(...COLORS.zebra)
        doc.rect(margin, yPos, contentWidth, rowHi, "F")
      }
      // descrição (multi-linha)
      doc.setTextColor(...COLORS.dark)
      let ty = yPos + 5
      for (const ln of linhas) {
        doc.text(ln, descX, ty)
        ty += lineH
      }
      const midY = yPos + rowHi / 2 + 1.4
      // quantidade
      doc.text(String(item.quantidade ?? 0), qtyCx, midY, { align: "center" })
      // unidade
      doc.text(item.unidade || "-", unitCx, midY, { align: "center" })
      // valor unitário (derivado do próprio item; só quando houver valor)
      const vUnit = valorUnitarioItemServico(item)
      if (vUnit > 0) {
        doc.setTextColor(...COLORS.gray)
        doc.text(formatBRL(vUnit), unitValRightX, midY, { align: "right" })
        doc.setTextColor(...COLORS.dark)
      }
      // valor total do item (apenas quando houver)
      if (Number(item.valor) > 0) {
        doc.setFont("helvetica", "bold")
        doc.text(formatBRL(item.valor), valX, midY, { align: "right" })
        doc.setFont("helvetica", "normal")
      }
      // divisórias
      doc.setDrawColor(...COLORS.border)
      doc.setLineWidth(0.2)
      doc.line(margin, yPos + rowHi, pageWidth - margin, yPos + rowHi)
      yPos += rowHi
    })
    // divisórias verticais das colunas
    yPos += 4
  }

  // ===== MÓDULOS AFERIDOS (tabela) =====
  if (!porItem) {
  addSectionHeader("MÓDULOS AFERIDOS")
  const itens = Array.isArray(data.itens) ? data.itens : []
  const porModulo = data.modo_valor === "por_modulo"
  const rowH = 8
  const valueColW = 42
  const valueColX = pageWidth - margin - valueColW

  // Cabeçalho da tabela
  checkPageBreak(rowH + 4)
  doc.setFillColor(...COLORS.primary)
  doc.rect(margin, yPos, contentWidth, rowH, "F")
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.white)
  doc.text("MÓDULO / SISTEMA", margin + 4, yPos + rowH / 2 + 1.6)
  doc.text(porModulo ? "VALOR (R$)" : "SITUAÇÃO", pageWidth - margin - 4, yPos + rowH / 2 + 1.6, {
    align: "right",
  })
  yPos += rowH

  doc.setFont("helvetica", "normal")
  itens.forEach((item, idx) => {
    checkPageBreak(rowH)
    if (idx % 2 === 1) {
      doc.setFillColor(...COLORS.zebra)
      doc.rect(margin, yPos, contentWidth, rowH, "F")
    }
    // nome
    doc.setTextColor(...COLORS.dark)
    doc.setFontSize(9.5)
    doc.text(item.nome, margin + 4, yPos + rowH / 2 + 1.6)
    // valor ou situação
    if (porModulo) {
      doc.setTextColor(...COLORS.dark)
      doc.setFont("helvetica", "bold")
      doc.text(formatBRL(item.valor), pageWidth - margin - 4, yPos + rowH / 2 + 1.6, {
        align: "right",
      })
      doc.setFont("helvetica", "normal")
    } else {
      // "badge" Aferido
      const badge = "Aferido"
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      const bw = doc.getTextWidth(badge) + 6
      const bx = pageWidth - margin - 4 - bw
      const by = yPos + (rowH - 5) / 2
      doc.setFillColor(...COLORS.success)
      doc.roundedRect(bx, by, bw, 5, 2.5, 2.5, "F")
      doc.setTextColor(...COLORS.white)
      doc.text(badge, bx + 3, by + 3.5)
      doc.setFont("helvetica", "normal")
    }
    // linha divisória
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.2)
    doc.line(margin, yPos + rowH, pageWidth - margin, yPos + rowH)
    yPos += rowH
  })
  // moldura da tabela
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  yPos += 4
  }

  // ===== TOTAL =====
  checkPageBreak(13)
  const totalH = 11
  doc.setFillColor(...COLORS.primaryDark)
  doc.roundedRect(margin, yPos, contentWidth, totalH, 1.5, 1.5, "F")
  doc.setTextColor(...COLORS.white)
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("VALOR TOTAL DA COMPETÊNCIA", margin + 5, yPos + totalH / 2 + 1.8)
  doc.setFontSize(13)
  doc.text(formatBRL(data.valor_total ?? data.valor_global), pageWidth - margin - 5, yPos + totalH / 2 + 1.9, {
    align: "right",
  })
  yPos += totalH + 4

  // ===== RELATÓRIOS DE VISITA =====
  const anexos = Array.isArray(data.anexos_pdf) ? data.anexos_pdf : []
  const visitasIds = Array.isArray(data.visitas_ids) ? data.visitas_ids : []
  if (visitasIds.length > 0 || anexos.length > 0) {
    addSectionHeader("RELATÓRIOS DE VISITA NA COMPETÊNCIA")
    if (visitasIds.length > 0) {
      addParagraph(
        `Foram consolidados ${visitasIds.length} relatório(s) de visita técnica nesta competência, cujos documentos seguem anexados a este relatório.`,
      )
    }
    for (const a of anexos) {
      checkPageBreak(6)
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.gray)
      doc.text(`-  ${a.nome}`, margin + 2, yPos)
      yPos += 5.4
    }
    yPos += 2
  }

  // ===== OBSERVAÇÕES =====
  if (data.observacoes) {
    addSectionHeader("OBSERVAÇÕES")
    addParagraph(data.observacoes)
  }

  // ===== EVIDÊNCIAS =====
  const imagens = Array.isArray(data.imagens) ? data.imagens : []
  if (imagens.length > 0) {
    addSectionHeader("EVIDÊNCIAS")
    for (const img of imagens) {
        const dataUrl = await fetchAsDataUrl(fileUrl(img.url))
      if (!dataUrl) continue
      let drawW = contentWidth
      let drawH = 80
      try {
        const props = doc.getImageProperties(dataUrl)
        drawH = (drawW * props.height) / props.width
        if (drawH > 105) {
          drawH = 105
          drawW = (drawH * props.width) / props.height
        }
      } catch {
        /* usa padrão */
      }
      checkPageBreak(drawH + 10)
      const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG"
      try {
        const ix = margin + (contentWidth - drawW) / 2
        doc.addImage(dataUrl, fmt, ix, yPos, drawW, drawH, undefined, "FAST")
        doc.setDrawColor(...COLORS.border)
        doc.setLineWidth(0.3)
        doc.rect(ix, yPos, drawW, drawH)
        yPos += drawH + 2
        if (img.legenda) {
          doc.setFontSize(8)
          doc.setFont("helvetica", "italic")
          doc.setTextColor(...COLORS.gray)
          doc.text(img.legenda, margin + (contentWidth) / 2, yPos + 3, { align: "center" })
          yPos += 7
        } else {
          yPos += 3
        }
      } catch {
        /* ignora imagem inválida */
      }
    }
  }

  // ===== ASSINATURA ELETRÔNICA =====
  // Reproducao visual do carimbo de assinatura digital, sempre com a data/hora de geracao.
  {
    checkPageBreak(58)
    addSectionHeader("Assinatura Eletrônica")

    // Data/hora de geracao no fuso de Brasilia (-03'00')
    const agora = new Date()
    const dataBR = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) // YYYY-MM-DD
    const horaBR = agora.toLocaleTimeString("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour12: false,
    }) // HH:MM:SS
    const carimboData = `${dataBR.replace(/-/g, ".")} ${horaBR} -03'00'`

    const blocoY = yPos + 2
    const colDir = margin + contentWidth * 0.52

    // Identificação do titular da assinatura digital (Razão Social : CNPJ numérico)
    const cnpjNumeros = (institucional.cnpj || "").replace(/\D/g, "")
    const razaoSocialUpper = (institucional.razao_social || institucional.nome || "RAROTEC").toUpperCase()
    const tituloCarimbo = cnpjNumeros ? `${razaoSocialUpper}:${cnpjNumeros}` : razaoSocialUpper

    // "A" estilizado ao fundo (marca de assinatura), em tom suave
    doc.setFont("times", "italic")
    doc.setFontSize(52)
    doc.setTextColor(233, 205, 205)
    doc.text("A", colDir - 6, blocoY + 20)

    // Coluna esquerda: identificacao em destaque (quebra automática de texto)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.setTextColor(...COLORS.dark)
    const linhasTituloEsq = doc.splitTextToSize(tituloCarimbo, colDir - margin - 6) as string[]
    linhasTituloEsq.slice(0, 3).forEach((linha, idx) => {
      doc.text(linha, margin, blocoY + 6 + idx * 7)
    })

    // Coluna direita: texto do carimbo digital
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...COLORS.dark)
    doc.text("Assinado de forma digital por", colDir, blocoY + 3)
    const linhasCarimboDir = doc.splitTextToSize(tituloCarimbo, contentWidth * 0.48) as string[]
    linhasCarimboDir.slice(0, 2).forEach((linha, idx) => {
      doc.text(linha, colDir, blocoY + 8 + idx * 5)
    })
    doc.text(`Dados: ${carimboData}`, colDir, blocoY + 18)

    // Linha divisoria sob o bloco de identificacao
    const linhaY = blocoY + 24
    doc.setDrawColor(...COLORS.dark)
    doc.setLineWidth(0.6)
    doc.line(margin, linhaY, colDir - 4, linhaY)

    // Razao social e CNPJ abaixo da linha
    doc.setFont("helvetica", "normal")
    doc.setFontSize(13)
    doc.setTextColor(...COLORS.dark)
    doc.text(institucional.razao_social || institucional.nome, margin, linhaY + 8)
    doc.text(institucional.cnpj || "-", margin, linhaY + 15)

    yPos = linhaY + 20
  }

  // ===== RODAPÉ =====
  const addFooter = (pageNum: number, totalPages: number) => {
    const footerY = pageHeight - 10
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.3)
    doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3)

    doc.setFontSize(7)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.primary)
    doc.text((institucional.nome || "RAROTEC").toUpperCase(), margin, footerY + 1)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.5)
    doc.setTextColor(...COLORS.gray)
    const sistemaTexto = `Relatório gerado pelo ${institucional.sistema?.nome || "RaroGestão"} — ${institucional.sistema?.descricao || "Sistema de Gestão Administrativa da Rarotec"}`
    doc.text(
      sistemaTexto,
      pageWidth / 2,
      footerY + 1,
      { align: "center" },
    )
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, footerY + 1, {
      align: "right",
    })

    doc.setFontSize(6)
    const linhaInfo: string[] = []
    if (data.usuarioEmissor) linhaInfo.push(`Emitido por: ${data.usuarioEmissor}`)
    linhaInfo.push(
      data.usuarioDownload
        ? `Download por ${data.usuarioDownload} em ${dataDownload}`
        : `Download em ${dataDownload}`,
    )
    linhaInfo.push(`Autenticação: ${numeroAutenticacao}`)
    doc.setTextColor(...COLORS.gray)
    doc.text(linhaInfo.join("   •   "), pageWidth / 2, footerY + 5, { align: "center" })
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(i, totalPages)
  }

  const reportPdfBytes = doc.output("arraybuffer")

  // Merge dos documentos: relatórios de visita técnica (gerados) + anexos manuais
  const temVisitas = visitasIds.length > 0
  const temAnexos = anexos.length > 0
  if (temVisitas || temAnexos) {
    try {
      const mergedPdf = await PDFDocument.load(reportPdfBytes)

      // 1) Gera o PDF de cada relatório de visita e coleta rótulos p/ a contra-capa
      const visitasPreparadas: { bytes: ArrayBuffer; label: string }[] = []
      for (const visitaId of visitasIds) {
        try {
          const res = await fetch(`/api/relatorios/${visitaId}`)
          if (!res.ok) {
            console.error("Visita não encontrada:", visitaId)
            continue
          }
          const registro = await res.json()
          const pdfData = await buildRelatorioPdfDataFromRecord(registro)
          const visitaBlob = await generateRelatorioPDF({
            ...pdfData,
            empresaResponsavel: institucional,
          })
          const bytes = await visitaBlob.arrayBuffer()
          const tipo = (pdfData.tiposRelatorio || []).join(", ") || "Relatório de visita técnica"
          const auth = registro.numero_autenticacao ? ` (${registro.numero_autenticacao})` : ""
          const dataVisita = pdfData.dataInicio
            ? ` — ${String(pdfData.dataInicio).slice(0, 10).split("-").reverse().join("/")}`
            : ""
          visitasPreparadas.push({ bytes, label: `${tipo}${dataVisita}${auth}` })
        } catch (e) {
          console.error("Falha ao gerar relatório de visita:", visitaId, e)
        }
      }

      // 2) Contra-capa listando os documentos que seguem anexados
      const documentos = [
        ...visitasPreparadas.map((v) => v.label),
        ...anexos.map((a) => a.nome || "Documento anexado"),
      ]
      if (documentos.length > 0) {
        try {
          const capaBytes = await buildContraCapaAnexos({
            competencia: competenciaLabel(data.competencia),
            numeroAutenticacao,
            documentos,
            empresaNome: institucional.nome,
          })
          const capaDoc = await PDFDocument.load(capaBytes)
          const capaPages = await mergedPdf.copyPages(capaDoc, capaDoc.getPageIndices())
          capaPages.forEach((p) => mergedPdf.addPage(p))
        } catch (e) {
          console.error("Falha ao gerar contra-capa dos anexos:", e)
        }
      }

      // 3) Anexa as páginas dos relatórios de visita
      for (const v of visitasPreparadas) {
        try {
          const attached = await PDFDocument.load(v.bytes)
          const copied = await mergedPdf.copyPages(attached, attached.getPageIndices())
          copied.forEach((p) => mergedPdf.addPage(p))
        } catch (e) {
          console.error("Falha ao anexar relatório de visita:", v.label, e)
        }
      }

      // 4) Anexa os PDFs adicionados manualmente
      for (const a of anexos) {
        try {
          const res = await fetch(fileUrl(a.url))
          const bytes = await res.arrayBuffer()
          const attached = await PDFDocument.load(bytes)
          const copied = await mergedPdf.copyPages(attached, attached.getPageIndices())
          copied.forEach((p) => mergedPdf.addPage(p))
        } catch (e) {
          console.error("Falha ao anexar PDF:", a.nome, e)
        }
      }

      const mergedBytes = await mergedPdf.save()
      return new Blob([mergedBytes], { type: "application/pdf" })
    } catch (e) {
      console.error("Falha no merge:", e)
      return new Blob([reportPdfBytes], { type: "application/pdf" })
    }
  }

  return new Blob([reportPdfBytes], { type: "application/pdf" })
}
