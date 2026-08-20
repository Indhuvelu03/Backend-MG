// Best-effort invoice line-item parser. The original OCR text remains stored
// alongside these items so an operator can always trace parsed values back to
// the source document.
const amountPattern = /(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi;

const parseAmount = (value) => Number(String(value).replace(/,/g, ""));

export const parseInvoiceLineItems = (text = "") => {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    const amounts = [...line.matchAll(amountPattern)].map((match) => parseAmount(match[1]));
    if (!amounts.length) continue;

    const code = line.match(/\b[A-Z]{2,}[\-\/]?[A-Z0-9]{2,}\b/)?.[0] || null;
    const description = line
      .replace(amountPattern, "")
      .replace(/^\s*(?:\d+[.)-]?\s*)/, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (description.length < 3) continue;
    const amount = amounts[amounts.length - 1];
    items.push({
      type: /labou?r|service charge|technician/i.test(line) ? "LABOR" : "PART_OR_SERVICE",
      code,
      description,
      amount,
      rawLine: line,
    });
  }

  return items.slice(0, 200);
};
