import type { CareData } from "@/lib/types";

export async function carePlanPdfBytes(data: CareData, createdAt?: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  function newPage() {
    doc.addPage();
    y = margin;
  }

  function ensure(height: number) {
    if (y + height > pageHeight - margin) newPage();
  }

  function heading(text: string) {
    ensure(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(36, 120, 92);
    doc.text(text, margin, y);
    y += 8;
    doc.setDrawColor(215, 235, 225);
    doc.setLineWidth(0.6);
    doc.line(margin, y, margin + contentWidth, y);
    y += 16;
  }

  function paragraph(text: string, indent = 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40, 48, 44);
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    ensure(lines.length * 15 + 4);
    doc.text(lines, margin + indent, y);
    y += lines.length * 15 + 4;
  }

  function bullet(title: string, detail?: string) {
    paragraph(`•  ${title}`);
    if (detail) paragraph(detail, 14);
  }

  doc.setFillColor(36, 120, 92);
  doc.rect(0, 0, pageWidth, 72, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("AveLoop", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Care plan for a caregiver", margin, 52);
  y = 96;

  const when = createdAt ? new Date(createdAt) : new Date();
  const stamp = Number.isNaN(when.getTime()) ? "" : when.toLocaleString();
  if (stamp) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 120, 116);
    doc.text(`Shared ${stamp}`, margin, y);
    y += 22;
  }

  const medications = data.medications ?? [];
  const followups = data.followups ?? [];
  const warnings = data.warnings ?? [];
  const instructions = data.care_instructions ?? [];
  const actions = data.actions ?? [];

  if (medications.length) {
    heading("Medications");
    for (const med of medications) {
      const duration = med.duration_days ? ` for ${med.duration_days} days` : "";
      bullet(`${med.name} — ${med.dose}`, `${med.schedule}${duration}`);
    }
    y += 6;
  }

  if (followups.length) {
    heading("Follow-ups");
    for (const visit of followups) {
      const where = visit.clinic ? ` at ${visit.clinic}` : "";
      bullet(visit.reason, `${visit.date}${where}`);
    }
    y += 6;
  }

  if (warnings.length) {
    heading("When to seek help");
    for (const warning of warnings) bullet(warning);
    y += 6;
  }

  if (instructions.length) {
    heading("Care instructions");
    for (const instruction of instructions) bullet(instruction);
    y += 6;
  }

  if (actions.length) {
    heading("Next steps");
    for (const action of actions) {
      const when = [action.filledDate, action.filledTimes?.filter(Boolean).join(", "), action.filledClinic]
        .filter(Boolean)
        .join(" · ");
      bullet(action.label, [action.instruction, when].filter(Boolean).join(" "));
    }
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}

export async function downloadCarePlanPdf(data: CareData, createdAt?: string) {
  const bytes = await carePlanPdfBytes(data, createdAt);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aveloop-care-plan.pdf";
  link.click();
  URL.revokeObjectURL(url);
}
