const escapePdfText = (value) => String(value || "")
  .replace(/\\/g, "\\\\")
  .replace(/[()]/g, "\\$&")
  .replace(/[^\x20-\x7E]/g, "?");

const wrap = (value, width = 88) => {
  const words = String(value || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width) {
      if (line) lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
};

// Generates a portable one-page PDF without adding a native runtime dependency.
export const generateAuditReportPdf = ({ customer, complaint, invoice, comparison }) => {
  const lines = [
    "AUTOAUDIT AI - SERVICE AUDIT REPORT",
    "",
    `Customer: ${customer.name}`,
    `Vehicle: ${complaint.vehicleNumber}`,
    `Service centre: ${customer.serviceCenter || customer.service_center || "-"}`,
    `Audit result: ${comparison.status} (${comparison.score}%)`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "CUSTOMER FEEDBACK",
    ...wrap(complaint.transcript),
    "",
    "INVOICE EXTRACTION",
    `Method: ${invoice.extractionMethod || "-"}`,
    `Structured line items: ${(invoice.extractedItems || []).length}`,
    "",
    "AI SUMMARY",
    ...wrap(comparison.summary),
    "",
    `Matched: ${(comparison.matchedIssues || []).join("; ") || "None"}`,
    `Missing from invoice: ${(comparison.missingIssues || []).join("; ") || "None"}`,
    `Extra invoice items: ${(comparison.extraInvoiceItems || []).join("; ") || "None"}`,
  ].slice(0, 50);

  const content = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"];
  lines.forEach((line) => content.push(`(${escapePdfText(line)}) Tj`, "T*"));
  content.push("ET");
  const stream = content.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
};
