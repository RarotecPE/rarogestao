import { jsPDF } from "jspdf"
import QRCode from "qrcode"
import { PDFDocument } from "pdf-lib"
import { saveAs } from "file-saver"
import { buildRaroGestaoUrl } from "./app-url"
import { fetchInstitucionalInfo, type InstitucionalInfo, normalizeInstitucional } from "./institucional"

// Cores da Rarotec
const COLORS = {
  primary: [30, 83, 146] as [number, number, number],     // Azul Rarotec #1E5392
  dark: [33, 33, 33] as [number, number, number],         // Texto escuro
  gray: [100, 100, 100] as [number, number, number],      // Texto secundário
  lightGray: [240, 240, 240] as [number, number, number], // Bordas
  white: [255, 255, 255] as [number, number, number],
}

interface RelatorioData {
  tiposRelatorio: string[]
  dataInicio: string
  dataFim: string
  horaInicio: string
  horaFim: string
  estado: string
  municipio: string
  cliente: {
    nome: string
    cnpj?: string
    endereco?: string
  } | null
  entidades: { tipo: string; cnpj: string; nome?: string }[]
  modulos: string[]
  servicos: string[]
  tecnicosRarotec: { nome: string; email?: string }[]
  tecnicosCliente: { nome: string; cpf?: string; email?: string }[]
  descricaoServicos: string
  observacoes: string
  anexos: { name: string; type: string }[]
  anexosFiles?: File[]
  numeroAutenticacao?: string
  // Rastreabilidade
  usuarioEmissor?: string        // Quem criou o relatório
  dataEmissaoRelatorio?: string  // Quando foi criado
  usuarioDownload?: string       // Quem está baixando
  // Dados institucionais / Empresa responsável (opcional, busca da constante se omitido)
  empresaResponsavel?: Partial<InstitucionalInfo>
}

export async function generateRelatorioPDF(data: RelatorioData): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin
  let yPos = margin
  let currentPage = 1

  // Obter informações institucionais obrigatórias da constante do RaroNexus
  const institucional: InstitucionalInfo = data.empresaResponsavel
    ? normalizeInstitucional(data.empresaResponsavel)
    : await fetchInstitucionalInfo()

  // Formatar data - aceita tanto Date, quanto ISO ou dd/mm/yyyy
  const formatDate = (dateStr: any) => {
    if (!dateStr) return "-"
    if (dateStr instanceof Date) {
      if (isNaN(dateStr.getTime())) return "-"
      const day = String(dateStr.getDate()).padStart(2, "0")
      const month = String(dateStr.getMonth() + 1).padStart(2, "0")
      const year = dateStr.getFullYear()
      return `${day}/${month}/${year}`
    }
    const s = String(dateStr)
    // Se já está no formato brasileiro (dd/mm/yyyy), retorna direto
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      return s
    }
    try {
      // Se for formato ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS), extrair partes diretamente
      // para evitar problemas de fuso horário
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        const [, year, month, day] = isoMatch
        return `${day}/${month}/${year}`
      }
      
      const date = new Date(s)
      if (isNaN(date.getTime())) return s
      return date.toLocaleDateString("pt-BR")
    } catch {
      return s
    }
  }

  // Verificar quebra de página
  const checkPageBreak = (height: number) => {
    if (yPos + height > pageHeight - 25) {
      doc.addPage()
      currentPage++
      yPos = margin
      return true
    }
    return false
  }

  // Título de seção (barra azul)
  const addSectionHeader = (title: string) => {
    checkPageBreak(14)
    
    doc.setFillColor(...COLORS.primary)
    doc.rect(margin, yPos, contentWidth, 8, "F")
    
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text(title, margin + 3, yPos + 5.5)
    
    yPos += 11
  }

  // Campo simples (label + valor abaixo)
  const addField = (label: string, value: string, x: number, maxWidth: number): number => {
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.dark)
    doc.text(label, x, yPos)
    
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.gray)
    const lines = doc.splitTextToSize(value || "-", maxWidth)
    doc.text(lines, x, yPos + 4)
    
    return 4 + (lines.length * 4)
  }

  // Linha com 2 colunas
  const addRow2Cols = (label1: string, value1: string, label2: string, value2: string) => {
    checkPageBreak(16)
    const colWidth = (contentWidth - 10) / 2
    const startY = yPos
    
    const h1 = addField(label1, value1, margin, colWidth)
    yPos = startY
    const h2 = addField(label2, value2, margin + colWidth + 10, colWidth)
    
    yPos = startY + Math.max(h1, h2) + 4
  }

  // Campo de largura total
  const addFullField = (label: string, value: string) => {
    checkPageBreak(16)
    addField(label, value, margin, contentWidth)
    yPos += 8
  }

  // Texto longo (descrição)
  const addLongText = (text: string) => {
    if (!text) return
    
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.dark)
    
    const lines = doc.splitTextToSize(text, contentWidth)
    lines.forEach((line: string) => {
      checkPageBreak(5)
      doc.text(line, margin, yPos)
      yPos += 4.5
    })
    yPos += 3
  }

  // Data/hora do download
  const dataDownload = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
  })

  // Footer com rastreabilidade
  const addFooter = (pageNum: number, totalPages: number) => {
    const footerY = pageHeight - 8
    
    // Linha separadora
    doc.setDrawColor(...COLORS.lightGray)
    doc.setLineWidth(0.3)
    doc.line(margin, footerY - 12, pageWidth - margin, footerY - 12)
    
    // Linha 1: Emissão
    doc.setFontSize(6)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.gray)
    
    const emissaoText = data.usuarioEmissor 
      ? `Emitido por: ${data.usuarioEmissor}${data.dataEmissaoRelatorio ? ` em ${data.dataEmissaoRelatorio}` : ""}`
      : data.dataEmissaoRelatorio 
        ? `Emitido em: ${data.dataEmissaoRelatorio}`
        : ""
    
    if (emissaoText) {
      doc.text(emissaoText, margin, footerY - 8)
    }
    
    // Linha 1: Download (direita)
    const downloadText = data.usuarioDownload
      ? `Download por: ${data.usuarioDownload} em ${dataDownload}`
      : `Download em: ${dataDownload}`
    doc.text(downloadText, pageWidth - margin, footerY - 8, { align: "right" })
    
    // Linha 2: Nome da empresa e paginação
    doc.setFontSize(7)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.primary)
    doc.text((institucional.nome || "RAROTEC").toUpperCase(), margin, footerY - 2)
    
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.gray)
    doc.setFontSize(6)
    const sistemaTexto = `Relatório gerado pelo ${institucional.sistema?.nome || "RaroGestão"} - ${institucional.sistema?.descricao || "Sistema de Gestão Administrativa da Rarotec"}`
    doc.text(sistemaTexto, pageWidth / 2, footerY - 2, { align: "center" })
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, footerY - 2, { align: "right" })
  }

  // ========== HEADER COM QR CODE ==========
  // Parsear data que pode vir como Date, "15/05/2026" ou "2026-05-15"
  const parseDateForHeader = (dateStr: any): Date => {
    if (!dateStr) return new Date()
    if (dateStr instanceof Date) {
      return isNaN(dateStr.getTime()) ? new Date() : dateStr
    }
    const s = String(dateStr)
    // Se está no formato brasileiro dd/mm/yyyy
    const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (brMatch) {
      const [, dia, mes, ano] = brMatch
      return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia))
    }
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      const [, ano, mes, dia] = isoMatch
      return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia))
    }
    const parsed = new Date(s)
    return isNaN(parsed.getTime()) ? new Date() : parsed
  }
  
  const mesAno = data.dataInicio 
    ? parseDateForHeader(data.dataInicio).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
    : new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })

  const dataEmissao = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  })

  // Gerar QR Code no header (canto superior direito)
  const qrSize = 28
  let qrDataUrl: string | null = null
  let validationUrl = ""
  
  if (data.numeroAutenticacao) {
    validationUrl = typeof window !== "undefined"
      ? `${window.location.origin}/validar/${data.numeroAutenticacao}`
      : buildRaroGestaoUrl(`/validar/${data.numeroAutenticacao}`)
    try {
      qrDataUrl = await QRCode.toDataURL(validationUrl, {
        width: 120,
        margin: 1,
        color: { dark: "#1E5392", light: "#FFFFFF" }
      })
    } catch (error) {
      console.warn("Aviso ao gerar QR Code:", error)
    }
  }

  // Carregar logo da Rarotec
  let logoDataUrl: string | null = null
  try {
    if (typeof window === "undefined") {
      const fs = await import("node:fs/promises")
      const path = await import("node:path")
      const logoPath = path.join(process.cwd(), "public", "logo.png")
      const logoBuffer = await fs.readFile(logoPath).catch(() => null)
      if (logoBuffer) {
        logoDataUrl = `data:image/png;base64,${logoBuffer.toString("base64")}`
      }
    } else {
      const logoResponse = await fetch("/logo.png")
      if (logoResponse.ok) {
        const logoBlob = await logoResponse.blob()
        logoDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => resolve("")
          reader.readAsDataURL(logoBlob)
        })
      }
    }
  } catch (error) {
    console.warn("Aviso ao carregar logo:", error)
  }

  // Logo (esquerda) - imagem ou texto fallback
  let logoHeight = 18
  let logoWidth = 18
  let logoRendered = false

  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl)
      logoWidth = (logoHeight * props.width) / props.height
      if (logoWidth > 24) {
        logoWidth = 24
        logoHeight = (logoWidth * props.height) / props.width
      }
      doc.addImage(logoDataUrl, "PNG", margin, yPos, logoWidth, logoHeight)
      logoRendered = true
    } catch (e) {
      console.warn("Aviso ao renderizar imagem do logo no PDF, usando texto fallback:", e)
    }
  }

  if (!logoRendered) {
    // Fallback para texto se não carregar a imagem
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.primary)
    doc.text((institucional.nome || "RAROTEC").toUpperCase(), margin, yPos + 6)
    
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...COLORS.gray)
    doc.text("Tecnologia para Gestão Pública", margin, yPos + 11)
  }

  // Título e data (centro)
  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.dark)
  doc.text("Relatório de Visita Técnica", pageWidth / 2, yPos + 6, { align: "center" })
  
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(mesAno, pageWidth / 2, yPos + 12, { align: "center" })

  // QR Code (direita)
  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, "PNG", pageWidth - margin - qrSize, yPos - 2, qrSize, qrSize)
    } catch (error) {
      console.warn("Aviso ao adicionar QR Code:", error)
    }
  }

  yPos += qrSize + 4

  // Linha com código de autenticação e data de emissão
  doc.setDrawColor(...COLORS.lightGray)
  doc.setLineWidth(0.5)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 5

  doc.setFontSize(8)
  if (data.numeroAutenticacao) {
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...COLORS.primary)
    doc.text(`Autenticação: ${data.numeroAutenticacao}`, margin, yPos)
  }
  
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(`Emitido em: ${dataEmissao}`, pageWidth - margin, yPos, { align: "right" })
  
  yPos += 8

  // ========== EMPRESA RESPONSÁVEL ==========
  addSectionHeader("Empresa responsável")
  addRow2Cols("Nome", institucional.nome, "Razão social", institucional.razao_social)
  addRow2Cols("E-mail de contato", institucional.email, "Telefone", institucional.telefone)
  addRow2Cols("CNPJ", institucional.cnpj, "Endereço", institucional.endereco)

  // ========== CLIENTE ==========
  if (data.cliente) {
    addSectionHeader("Cliente")
    addRow2Cols("Nome", data.cliente.nome, "Localização", `${data.municipio} - ${data.estado}`)
    if (data.cliente.cnpj || data.cliente.endereco) {
      addRow2Cols("CNPJ", data.cliente.cnpj || "-", "Endereço", data.cliente.endereco || "-")
    }
  }

  // ========== ENTIDADES/ÓRGÃOS ATENDIDOS ==========
  if (data.entidades.length > 0) {
    addSectionHeader("Órgãos atendidos")
    data.entidades.forEach((ent, i) => {
      // Filtrar "undefined" e remover CNPJ do nome se existir
      let nomeOrgao = ent.nome || ent.tipo || ""
      // Remover "(CNPJ: xxx)" do nome se existir (dados antigos podem ter isso)
      nomeOrgao = nomeOrgao.replace(/\s*\(CNPJ:\s*[\d./-]+\)\s*$/i, "").trim()
      if (nomeOrgao === "undefined" || !nomeOrgao) {
        nomeOrgao = `Órgão ${i + 1}`
      }
      // Garantir que CNPJ não contenha o nome junto
      let cnpjOrgao = ent.cnpj || "-"
      if (cnpjOrgao.includes("(") || cnpjOrgao.length > 20) {
        // Extrair apenas o CNPJ se vier junto com outras coisas
        const cnpjMatch = cnpjOrgao.match(/[\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2}/)
        cnpjOrgao = cnpjMatch ? cnpjMatch[0] : "-"
      }
      addRow2Cols("Nome", nomeOrgao, "CNPJ", cnpjOrgao)
    })
  }

  // ========== DADOS DO ATENDIMENTO ==========
  addSectionHeader("Dados do atendimento")
  
  // Município e Estado atendido - sempre mostrar
  addRow2Cols("Município", data.municipio || "-", "Estado", data.estado || "-")
  
  const periodoTexto = data.dataFim && data.dataFim !== data.dataInicio
    ? `${formatDate(data.dataInicio)} a ${formatDate(data.dataFim)}`
    : formatDate(data.dataInicio)
  
  addFullField("Data do atendimento", periodoTexto)
  
  if (data.tiposRelatorio.length > 0) {
    addFullField("Tipo(s) de relatório", data.tiposRelatorio.join(", "))
  }

  // ========== MÓDULOS ==========
  if (data.modulos.length > 0) {
    addSectionHeader("Módulos atendidos")
    addFullField("Módulos", data.modulos.join(", "))
  }

  // ========== EQUIPE TÉCNICA RAROTEC ==========
  if (data.tecnicosRarotec.length > 0) {
    addSectionHeader("Equipe técnica Rarotec")
    data.tecnicosRarotec.forEach((tec, i) => {
      addRow2Cols(
        `Técnico ${i + 1}`, 
        tec.nome, 
        "E-mail", 
        tec.email || "-"
      )
    })
  }

  // ========== REPRESENTANTES DO CLIENTE ==========
  if (data.tecnicosCliente.length > 0) {
    addSectionHeader("Representantes do cliente")
    data.tecnicosCliente.forEach((tec, i) => {
      const cpfEmail = [tec.cpf, tec.email].filter(Boolean).join(" | ") || "-"
      addRow2Cols(
        `Representante ${i + 1}`, 
        tec.nome, 
        "CPF / E-mail", 
        cpfEmail
      )
    })
  }

  // ========== DESCRIÇÃO ==========
  if (data.descricaoServicos) {
    addSectionHeader("Descrição dos serviços")
    addLongText(data.descricaoServicos)
  }

  // ========== OBSERVAÇÕES ==========
  if (data.observacoes) {
    addSectionHeader("Observações")
    addLongText(data.observacoes)
  }

  // ========== ANEXOS ==========
  if (data.anexos.length > 0) {
    addSectionHeader("Anexos")
    addFullField(`${data.anexos.length} arquivo(s)`, data.anexos.map(a => a.name).join(", "))
  }

  // ========== PÁGINAS DE ANEXOS (IMAGENS) ==========
  if (data.anexosFiles && data.anexosFiles.length > 0) {
    const imageFiles = data.anexosFiles.filter(f => 
      f.type.startsWith("image/")
    )
    
    for (const file of imageFiles) {
      try {
        // Converter File para base64
        const base64 = await fileToBase64(file)
        
        // Adicionar nova página para a imagem
        doc.addPage()
        currentPage++
        yPos = margin
        
        // Título da página de anexo
        doc.setFillColor(...COLORS.primary)
        doc.rect(margin, yPos, contentWidth, 8, "F")
        doc.setTextColor(...COLORS.white)
        doc.setFontSize(10)
        doc.setFont("helvetica", "bold")
        doc.text(`Anexo: ${file.name}`, margin + 3, yPos + 5.5)
        yPos += 15
        
        // Calcular dimensões da imagem para caber na página
        const maxWidth = contentWidth
        const maxHeight = pageHeight - yPos - 30 // Espaço para footer
        
        // Adicionar imagem
        const imgFormat = file.type.includes("png") ? "PNG" : "JPEG"
        doc.addImage(base64, imgFormat, margin, yPos, maxWidth, maxHeight, undefined, "FAST")
        
      } catch (error) {
        console.error(`Erro ao adicionar anexo ${file.name}:`, error)
      }
    }
  }

  // ========== FOOTERS ==========
  const totalPages = doc.internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(i, totalPages)
  }

  // Gerar o PDF do relatório
  const reportPdfBytes = doc.output("arraybuffer")
  
  // Se houver PDFs anexados, mesclar com o relatório
  if (data.anexosFiles && data.anexosFiles.length > 0) {
    const pdfFiles = data.anexosFiles.filter(f => f.type === "application/pdf")
    
    if (pdfFiles.length > 0) {
      try {
        // Criar documento PDF final
        const mergedPdf = await PDFDocument.load(reportPdfBytes)
        
        // Adicionar cada PDF anexado
        for (const pdfFile of pdfFiles) {
          try {
            const pdfBytes = await pdfFile.arrayBuffer()
            const attachedPdf = await PDFDocument.load(pdfBytes)
            
            // Copiar todas as páginas do PDF anexado
            const copiedPages = await mergedPdf.copyPages(attachedPdf, attachedPdf.getPageIndices())
            copiedPages.forEach((page) => {
              mergedPdf.addPage(page)
            })
          } catch (error) {
            console.error(`Erro ao mesclar PDF ${pdfFile.name}:`, error)
          }
        }
        
        // Retornar o PDF mesclado
        const mergedPdfBytes = await mergedPdf.save()
        return new Blob([mergedPdfBytes], { type: "application/pdf" })
      } catch (error) {
        console.error("Erro ao mesclar PDFs:", error)
        // Se falhar, retornar apenas o relatório
        return new Blob([reportPdfBytes], { type: "application/pdf" })
      }
    }
  }

  return new Blob([reportPdfBytes], { type: "application/pdf" })
}

// Helper function para converter File em base64
async function fileToBase64(file: File): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}`
}

export function downloadPDF(blob: Blob, filename: string) {
  if (typeof window === "undefined") return
  try {
    saveAs(blob, filename)
  } catch {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}

/**
 * Monta o RelatorioData (usado por generateRelatorioPDF) a partir de um
 * registro cru de relatorio de visita (como retornado por /api/relatorios/:id).
 * Reaproveitado para gerar e anexar PDFs de visita dentro da apuracao mensal.
 */
export async function buildRelatorioPdfDataFromRecord(
  relatorio: any,
  preloadedAnexosFiles?: File[]
): Promise<RelatorioData> {
  const parseOrgaos = (orgaoStr: string | undefined) => {
    if (!orgaoStr) return []
    return orgaoStr.split("; ").map((o) => {
      const match = o.match(/^(.+?) \(CNPJ: (.+?)\)$/)
      if (match) {
        const nome = match[1] === "undefined" ? "" : match[1]
        return { tipo: nome, nome, cnpj: match[2] }
      }
      return { tipo: o, nome: o, cnpj: "-" }
    })
  }

  const parseTecnicosCliente = () => {
    if (relatorio.tecnicos_cliente_info) {
      const info =
        typeof relatorio.tecnicos_cliente_info === "string"
          ? JSON.parse(relatorio.tecnicos_cliente_info)
          : relatorio.tecnicos_cliente_info
      return info.map((t: any) => ({ nome: t.nome, cpf: t.cpf, email: t.email }))
    }
    if (relatorio.tecnico_cliente_nome) {
      return [
        {
          nome: relatorio.tecnico_cliente_nome,
          cpf: relatorio.tecnico_cliente_cpf,
          email: relatorio.tecnico_cliente_email || undefined,
        },
      ]
    }
    return []
  }

  const modulos =
    typeof relatorio.modulos === "string" ? JSON.parse(relatorio.modulos) : relatorio.modulos || []

  const anexos = Array.isArray(relatorio.anexos) ? relatorio.anexos : []
  const anexosFiles: File[] = preloadedAnexosFiles ? [...preloadedAnexosFiles] : []
  if (anexosFiles.length === 0 && typeof window !== "undefined") {
    for (const anexo of anexos) {
      try {
        const response = await fetch(`/api/relatorios/anexos/${anexo.id}`)
        if (!response.ok) continue
        const blob = await response.blob()
        anexosFiles.push(
          new File([blob], anexo.nome_arquivo, {
            type: anexo.tipo_arquivo || blob.type || "application/pdf",
          }),
        )
      } catch (error) {
        console.error(`Erro ao buscar anexo ${anexo.nome_arquivo}:`, error)
      }
    }
  }

  return {
    tiposRelatorio: relatorio.tema
      ? relatorio.tema.split(", ")
      : [relatorio.tipo_servico || "Visita Técnica"],
    dataInicio: relatorio.data_visita
      ? relatorio.data_visita instanceof Date
        ? relatorio.data_visita.toISOString()
        : String(relatorio.data_visita)
      : relatorio.data_relatorio
        ? relatorio.data_relatorio instanceof Date
          ? relatorio.data_relatorio.toISOString()
          : String(relatorio.data_relatorio)
        : "",
    dataFim: relatorio.data_fim
      ? relatorio.data_fim instanceof Date
        ? relatorio.data_fim.toISOString()
        : String(relatorio.data_fim)
      : relatorio.data_visita
        ? relatorio.data_visita instanceof Date
          ? relatorio.data_visita.toISOString()
          : String(relatorio.data_visita)
        : "",
    horaInicio: relatorio.hora_inicio || "",
    horaFim: relatorio.hora_fim || "",
    estado: relatorio.cliente_estado || relatorio.estado || "PE",
    municipio: relatorio.municipio || relatorio.cliente_cidade || "",
    cliente: relatorio.cliente_nome
      ? {
          nome: relatorio.cliente_nome,
          cnpj: relatorio.cliente_cnpj || "-",
          endereco: relatorio.cliente_endereco,
        }
      : null,
    entidades: parseOrgaos(relatorio.orgao_atendido),
    modulos,
    servicos: relatorio.tema ? relatorio.tema.split(", ") : [],
    tecnicosRarotec:
      relatorio.tecnicos_rarotec_nomes && relatorio.tecnicos_rarotec_nomes.length > 0
        ? relatorio.tecnicos_rarotec_nomes.map((t: any) => ({ nome: t.nome, email: t.email }))
        : relatorio.tecnico_nome
          ? [{ nome: relatorio.tecnico_nome, email: relatorio.tecnico_email || undefined }]
          : [],
    tecnicosCliente: parseTecnicosCliente(),
    numeroAutenticacao: relatorio.numero_autenticacao || undefined,
    descricaoServicos: relatorio.historico || relatorio.descricao_servico || "",
    observacoes: relatorio.observacoes || "",
    anexos: anexos.map((a: any) => ({ name: a.nome_arquivo, type: a.tipo_arquivo })),
    anexosFiles,
    usuarioEmissor: relatorio.criado_por_nome || "Não registrado",
    dataEmissaoRelatorio: relatorio.created_at
      ? new Date(relatorio.created_at).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : undefined,
  }
}
