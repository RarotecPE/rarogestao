// Utilitários de exportação (Excel/PDF) do RaroGestão.
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface ExportColumn {
  header: string
  key: string
  width?: number
}

interface ExportOptions {
  filename: string
  title: string
  subtitle?: string
  columns: ExportColumn[]
  data: Record<string, any>[]
}

// Formatar valor para exibição
function formatValue(value: any): string {
  if (value === null || value === undefined) return "-"
  if (typeof value === "boolean") return value ? "Sim" : "Não"
  if (value instanceof Date) {
    return format(value, "dd/MM/yyyy", { locale: ptBR })
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      return format(new Date(value), "dd/MM/yyyy", { locale: ptBR })
    } catch {
      return value
    }
  }
  return String(value)
}

// Exportar para Excel
export function exportToExcel(options: ExportOptions) {
  const { filename, title, columns, data } = options

  // Criar dados para a planilha
  const worksheetData = [
    // Título
    [title],
    // Subtítulo com data de geração
    [`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`],
    // Linha vazia
    [],
    // Cabeçalhos
    columns.map(col => col.header),
    // Dados
    ...data.map(row => columns.map(col => formatValue(row[col.key])))
  ]

  // Criar workbook e worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
  const workbook = XLSX.utils.book_new()
  
  // Definir larguras das colunas
  worksheet["!cols"] = columns.map(col => ({ wch: col.width || 20 }))
  
  // Mesclar células do título
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } }
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, "Dados")
  
  // Gerar arquivo
  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
  const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, `${filename}-${format(new Date(), "yyyy-MM-dd")}.xlsx`)
}

// Exportar para PDF
export function exportToPDF(options: ExportOptions) {
  const { filename, title, subtitle, columns, data } = options

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  })

  // Configurar fonte
  doc.setFont("helvetica")

  // Título
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(title, 14, 15)

  // Subtítulo
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(100)
  const subtitleText = subtitle || `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
  doc.text(subtitleText, 14, 22)

  // Tabela
  autoTable(doc, {
    startY: 28,
    head: [columns.map(col => col.header)],
    body: data.map(row => columns.map(col => formatValue(row[col.key]))),
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [37, 99, 235], // blue-600
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    margin: { top: 28 },
  })

  // Rodapé
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Página ${i} de ${pageCount} - RaroGestão - Sistema de Gestão Administrativa da Rarotec`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    )
  }

  doc.save(`${filename}-${format(new Date(), "yyyy-MM-dd")}.pdf`)
}

// ---------------------------------------------------------------------------
// Relatório gerencial de Produtividade (capa institucional + KPIs + ranking)
// ---------------------------------------------------------------------------

interface ProdutividadeGrupo {
  id?: number
  nome: string
  atendidos: number
  nao_atendidos: number
  pendentes: number
  nao_se_aplica: number
  pendencia_externa: number
  execucoes: number
  concluidas: number
  produtividade: number
}

interface ProdutividadePDFOptions {
  periodo: string
  gestor: boolean
  dimensao: string
  resumo: ProdutividadeGrupo
  conclusao: number
  linhas: ProdutividadeGrupo[]
  filtros: { municipio: string | null; faixa: string | null }
}

// Cor por faixa de desempenho (RGB), usada no ranking e nas células de índice.
function corFaixa(p: number): [number, number, number] {
  if (p >= 85) return [22, 163, 74] // emerald-600
  if (p >= 60) return [217, 119, 6] // amber-600
  return [220, 38, 38] // red-600
}

function rotuloFaixa(p: number): string {
  if (p >= 85) return "Alta"
  if (p >= 60) return "Média"
  return "Baixa"
}

export function exportProdutividadePDF(options: ProdutividadePDFOptions) {
  const { periodo, dimensao, resumo, conclusao, linhas, filtros } = options
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const largura = doc.internal.pageSize.width
  const azul: [number, number, number] = [30, 58, 138] // blue-900

  // ---- Cabeçalho institucional (faixa) ----
  doc.setFillColor(...azul)
  doc.rect(0, 0, largura, 30, "F")
  doc.setTextColor(255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("Relatório de Produtividade", 14, 14)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("RaroGestão - Sistema de Gestão Administrativa da Rarotec", 14, 21)
  doc.setFontSize(9)
  doc.text(`Competência: ${periodo}`, 14, 27)
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    largura - 14,
    27,
    { align: "right" },
  )

  // ---- Filtros aplicados ----
  let y = 38
  const filtrosTexto = [
    filtros.municipio ? `Município: ${filtros.municipio}` : null,
    filtros.faixa ? `Faixa: ${filtros.faixa}` : null,
  ].filter(Boolean).join("   •   ")
  if (filtrosTexto) {
    doc.setTextColor(100)
    doc.setFontSize(8)
    doc.text(`Filtros — ${filtrosTexto}`, 14, y)
    y += 6
  }

  // ---- Bloco de KPIs ----
  const kpis: { label: string; valor: string; cor: [number, number, number] }[] = [
    { label: "Índice geral", valor: `${resumo.produtividade}%`, cor: corFaixa(resumo.produtividade) },
    { label: "Conclusão", valor: `${conclusao}%`, cor: azul },
    { label: "Atendidos", valor: String(resumo.atendidos), cor: [22, 163, 74] },
    { label: "Não atendidos", valor: String(resumo.nao_atendidos), cor: [220, 38, 38] },
    { label: "Pendentes", valor: String(resumo.pendentes), cor: [217, 119, 6] },
    { label: "Pend. externa", valor: String(resumo.pendencia_externa), cor: [2, 132, 199] },
  ]
  const margem = 14
  const gap = 4
  const colunas = 3
  const larguraCard = (largura - margem * 2 - gap * (colunas - 1)) / colunas
  const alturaCard = 20
  kpis.forEach((kpi, index) => {
    const linha = Math.floor(index / colunas)
    const coluna = index % colunas
    const x = margem + coluna * (larguraCard + gap)
    const cardY = y + linha * (alturaCard + gap)
    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, cardY, larguraCard, alturaCard, 2, 2, "FD")
    doc.setTextColor(...kpi.cor)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(15)
    doc.text(kpi.valor, x + 4, cardY + 10)
    doc.setTextColor(100)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.text(kpi.label, x + 4, cardY + 16)
  })
  y += Math.ceil(kpis.length / colunas) * (alturaCard + gap) + 4

  // ---- Ranking (top desempenho colorido por faixa) ----
  const ranking = [...linhas].sort((a, b) => b.produtividade - a.produtividade)
  doc.setTextColor(30)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text(`Ranking por ${dimensao.toLowerCase()}`, 14, y)
  y += 3

  autoTable(doc, {
    startY: y + 2,
    head: [["#", dimensao, "Faixa", "Produtividade", "Concluídos", "Atend.", "Não atend.", "Pend.", "Externa", "N/A"]],
    body: ranking.map((item, index) => [
      String(index + 1),
      item.nome,
      rotuloFaixa(item.produtividade),
      `${item.produtividade}%`,
      `${item.concluidas}/${item.execucoes}`,
      String(item.atendidos),
      String(item.nao_atendidos),
      String(item.pendentes),
      String(item.pendencia_externa),
      String(item.nao_se_aplica),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: azul, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      2: { halign: "center" },
      3: { halign: "center", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
    // Colore a coluna de faixa e de produtividade conforme o desempenho.
    didParseCell: (data) => {
      if (data.section !== "body") return
      const item = ranking[data.row.index]
      if (!item) return
      if (data.column.index === 2 || data.column.index === 3) {
        data.cell.styles.textColor = corFaixa(item.produtividade)
        data.cell.styles.fontStyle = "bold"
      }
    },
  })

  // ---- Rodapé com paginação ----
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Página ${i} de ${pageCount} - RaroGestão - Sistema de Gestão Administrativa da Rarotec`,
      largura / 2,
      doc.internal.pageSize.height - 8,
      { align: "center" },
    )
  }

  doc.save(`produtividade-${format(new Date(), "yyyy-MM-dd")}.pdf`)
}

// Exportar múltiplas planilhas (para clientes com órgãos)
export function exportToExcelMultiSheet(
  filename: string,
  sheets: { name: string; title: string; columns: ExportColumn[]; data: Record<string, any>[] }[]
) {
  const workbook = XLSX.utils.book_new()

  sheets.forEach(sheet => {
    const worksheetData = [
      [sheet.title],
      [`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`],
      [],
      sheet.columns.map(col => col.header),
      ...sheet.data.map(row => sheet.columns.map(col => formatValue(row[col.key])))
    ]

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    worksheet["!cols"] = sheet.columns.map(col => ({ wch: col.width || 20 }))
    worksheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: sheet.columns.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: sheet.columns.length - 1 } }
    ]

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.substring(0, 31)) // Excel limita nome da aba a 31 chars
  })

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
  const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, `${filename}-${format(new Date(), "yyyy-MM-dd")}.xlsx`)
}

// Exportar PDF com múltiplas seções
export function exportToPDFMultiSection(
  filename: string,
  title: string,
  sections: { title: string; columns: ExportColumn[]; data: Record<string, any>[] }[]
) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  })

  doc.setFont("helvetica")
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text(title, 14, 15)

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(100)
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 22)

  let startY = 30

  sections.forEach((section, index) => {
    if (index > 0) {
      // Verificar se precisa nova página
      if (startY > doc.internal.pageSize.height - 40) {
        doc.addPage()
        startY = 15
      }
    }

    // Título da seção
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(0)
    doc.text(section.title, 14, startY)
    startY += 5

    // Tabela da seção
    autoTable(doc, {
      startY: startY,
      head: [section.columns.map(col => col.header)],
      body: section.data.map(row => section.columns.map(col => formatValue(row[col.key]))),
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didDrawPage: (data) => {
        startY = (data.cursor?.y || 0) + 10
      }
    })

    // Atualizar posição Y para próxima seção
    startY = (doc as any).lastAutoTable.finalY + 15
  })

  // Rodapé
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Página ${i} de ${pageCount} - RaroGestão - Sistema de Gestão Administrativa da Rarotec`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    )
  }

  doc.save(`${filename}-${format(new Date(), "yyyy-MM-dd")}.pdf`)
}
