import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from "@react-email/components"

interface RelatorioEmailProps {
  tecnicoNome: string
  clienteNome: string
  tipoServico: string
  dataVisita: string
  municipio?: string
  numeroAutenticacao: string
  resumoServico?: string
  validacaoUrl: string
  logoUrl?: string
  anexos?: string[]
}

export function RelatorioEmail({
  tecnicoNome,
  clienteNome,
  tipoServico,
  dataVisita,
  municipio,
  numeroAutenticacao,
  resumoServico,
  validacaoUrl,
  logoUrl,
  anexos,
}: RelatorioEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Relatório de {tipoServico} - {clienteNome}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            {logoUrl ? <Img src={logoUrl} alt="RaroGestão" width="72" height="72" style={logoImage} /> : null}
            <Heading style={logoText}>RaroGestão</Heading>
            <Text style={logoSubtext}>Sistema de Gestão e Acompanhamento Rarotec</Text>
          </Section>

          {/* Título */}
          <Section style={heroSection}>
            <Heading style={heroTitle}>Relatório de Visita Técnica</Heading>
            <Text style={heroSubtitle}>
              Código: <strong>{numeroAutenticacao}</strong>
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Informações do Relatório */}
          <Section style={infoSection}>
            <Heading as="h2" style={sectionTitle}>
              Detalhes do Atendimento
            </Heading>

            <Row style={infoRow}>
              <Column style={infoLabel}>Cliente/Órgão:</Column>
              <Column style={infoValue}>{clienteNome}</Column>
            </Row>

            <Row style={infoRow}>
              <Column style={infoLabel}>Tipo de Serviço:</Column>
              <Column style={infoValue}>{tipoServico}</Column>
            </Row>

            <Row style={infoRow}>
              <Column style={infoLabel}>Data da Visita:</Column>
              <Column style={infoValue}>{dataVisita}</Column>
            </Row>

            {municipio && (
              <Row style={infoRow}>
                <Column style={infoLabel}>Município:</Column>
                <Column style={infoValue}>{municipio}</Column>
              </Row>
            )}

            <Row style={infoRow}>
              <Column style={infoLabel}>Técnico Responsável:</Column>
              <Column style={infoValue}>{tecnicoNome}</Column>
            </Row>
          </Section>

          {resumoServico && (
            <>
              <Hr style={divider} />
              <Section style={infoSection}>
                <Heading as="h2" style={sectionTitle}>
                  Resumo do Serviço
                </Heading>
                <Text style={resumoText}>{resumoServico}</Text>
              </Section>
            </>
          )}

          {anexos && anexos.length > 0 && (
            <>
              <Hr style={divider} />
              <Section style={infoSection}>
                <Heading as="h2" style={sectionTitle}>
                  Anexos Incluídos ({anexos.length})
                </Heading>
                <div style={{ margin: "8px 0" }}>
                  {anexos.map((anexo, idx) => (
                    <Text key={idx} style={{ fontSize: "13px", color: "#334155", margin: "4px 0" }}>
                      📎 {anexo}
                    </Text>
                  ))}
                </div>
              </Section>
            </>
          )}

          <Hr style={divider} />

          {/* CTA de Validação */}
          <Section style={ctaSection}>
            <Text style={ctaText}>
              Para visualizar o relatório completo, validar sua autenticidade e baixar o PDF, acesse:
            </Text>
            <Text style={ctaLink}>{validacaoUrl}</Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Este é um email automático enviado pelo RaroGestão.
            </Text>
            <Text style={footerText}>
              © {new Date().getFullYear()} Rarotec - Todos os direitos reservados
            </Text>
            <Text style={footerContact}>
              Em caso de dúvidas, entre em contato com a equipe técnica.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Estilos
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "0",
  maxWidth: "600px",
  borderRadius: "8px",
  overflow: "hidden" as const,
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
}

const header = {
  backgroundColor: "#0f172a",
  padding: "24px 32px",
  textAlign: "center" as const,
}

const logoImage = {
  display: "block",
  margin: "0 auto 12px auto",
  borderRadius: "16px",
}

const logoText = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: "bold",
  margin: "0",
  letterSpacing: "2px",
}

const logoSubtext = {
  color: "#94a3b8",
  fontSize: "12px",
  margin: "4px 0 0 0",
  letterSpacing: "0.5px",
}

const heroSection = {
  padding: "32px",
  textAlign: "center" as const,
  backgroundColor: "#f8fafc",
}

const heroTitle = {
  color: "#1e293b",
  fontSize: "24px",
  fontWeight: "600",
  margin: "0 0 8px 0",
}

const heroSubtitle = {
  color: "#64748b",
  fontSize: "14px",
  margin: "0",
}

const divider = {
  borderColor: "#e2e8f0",
  margin: "0",
}

const infoSection = {
  padding: "24px 32px",
}

const sectionTitle = {
  color: "#1e293b",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0 0 16px 0",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
}

const infoRow = {
  marginBottom: "12px",
}

const infoLabel = {
  color: "#64748b",
  fontSize: "14px",
  width: "40%",
  verticalAlign: "top" as const,
}

const infoValue = {
  color: "#1e293b",
  fontSize: "14px",
  fontWeight: "500",
  width: "60%",
  verticalAlign: "top" as const,
}

const resumoText = {
  color: "#475569",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
}

const ctaSection = {
  padding: "24px 32px",
  textAlign: "center" as const,
  backgroundColor: "#f0fdf4",
}

const ctaText = {
  color: "#166534",
  fontSize: "14px",
  margin: "0 0 12px 0",
}

const ctaLink = {
  color: "#15803d",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0",
  wordBreak: "break-all" as const,
}

const footer = {
  padding: "24px 32px",
  backgroundColor: "#f8fafc",
  textAlign: "center" as const,
}

const footerText = {
  color: "#94a3b8",
  fontSize: "12px",
  margin: "0 0 4px 0",
}

const footerContact = {
  color: "#94a3b8",
  fontSize: "11px",
  margin: "8px 0 0 0",
}

export default RelatorioEmail
