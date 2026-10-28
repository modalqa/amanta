import "server-only";
import PDFDocument from "pdfkit";

/** pdfkit's standard fonts use WinAnsi; replace characters outside it to avoid garbled output. */
export function pdfSafe(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[≤]/g, "<=").replace(/[≥]/g, ">=").replace(/[→]/g, "->")
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—‘’“”•…€]/g, "?");
}

export type Column = { header: string; width: number; get: (row: never) => string };

export class PdfReport {
  doc: PDFKit.PDFDocument;
  private chunks: Buffer[] = [];
  private done: Promise<Buffer>;
  constructor(title: string, subtitle: string, opts: { landscape?: boolean } = {}) {
    this.doc = new PDFDocument({ size: "A4", layout: opts.landscape ? "landscape" : "portrait", margin: 40, info: { Title: pdfSafe(title), Producer: "Amanta", Creator: "Amanta" }, bufferPages: true });
    this.done = new Promise((resolve, reject) => {
      this.doc.on("data", (c: Buffer) => this.chunks.push(c));
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)));
      this.doc.on("error", reject);
    });
    this.doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f5132").text(pdfSafe(title));
    this.doc.font("Helvetica").fontSize(9).fillColor("#555").text(pdfSafe(subtitle));
    this.doc.moveDown(0.8).fillColor("#000");
  }

  heading(text: string) {
    this.ensureSpace(40);
    this.doc.moveDown(0.5).font("Helvetica-Bold").fontSize(12).fillColor("#0f5132").text(pdfSafe(text)).fillColor("#000").moveDown(0.3);
    return this;
  }

  paragraph(text: string, size = 9) {
    this.doc.font("Helvetica").fontSize(size).text(pdfSafe(text), { align: "left" }).moveDown(0.3);
    return this;
  }

  keyValues(rows: Array<[string, string]>) {
    for (const [k, v] of rows) {
      this.ensureSpace(14);
      this.doc.font("Helvetica-Bold").fontSize(9).text(pdfSafe(k) + ": ", { continued: true }).font("Helvetica").text(pdfSafe(v));
    }
    this.doc.moveDown(0.3);
    return this;
  }

  table<T>(columns: Array<{ header: string; width: number; get: (row: T) => string }>, rows: T[]) {
    const x0 = this.doc.page.margins.left;
    const fontSize = 7.5;
    const pad = 3;
    const drawHeader = () => {
      let x = x0;
      const h = 16;
      this.doc.rect(x0, this.doc.y, columns.reduce((a, c) => a + c.width, 0), h).fill("#e8f3ee").fillColor("#000");
      const y = this.doc.y;
      for (const c of columns) {
        this.doc.font("Helvetica-Bold").fontSize(fontSize).text(pdfSafe(c.header), x + pad, y + 4, { width: c.width - pad * 2, lineBreak: false, ellipsis: true });
        x += c.width;
      }
      this.doc.y = y + h;
    };
    drawHeader();
    if (rows.length === 0) {
      this.doc.font("Helvetica-Oblique").fontSize(8).text("—", x0 + pad, this.doc.y + 3);
      this.doc.moveDown(0.5);
      return this;
    }
    for (const row of rows) {
      const cells = columns.map((c) => pdfSafe(c.get(row)));
      this.doc.font("Helvetica").fontSize(fontSize);
      const height = Math.max(...cells.map((t, i) => this.doc.heightOfString(t || " ", { width: columns[i].width - pad * 2 }))) + pad * 2;
      if (this.doc.y + height > this.doc.page.height - this.doc.page.margins.bottom - 20) {
        this.doc.addPage();
        drawHeader();
      }
      const y = this.doc.y;
      let x = x0;
      cells.forEach((t, i) => {
        this.doc.text(t, x + pad, y + pad, { width: columns[i].width - pad * 2 });
        x += columns[i].width;
      });
      this.doc.moveTo(x0, y + height).lineTo(x, y + height).strokeColor("#dddddd").lineWidth(0.5).stroke();
      this.doc.y = y + height;
      this.doc.x = x0;
    }
    this.doc.moveDown(0.5);
    return this;
  }

  ensureSpace(h: number) {
    if (this.doc.y + h > this.doc.page.height - this.doc.page.margins.bottom - 20) this.doc.addPage();
  }

  async finish(footer: string): Promise<Buffer> {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);
      const bottom = this.doc.page.height - 25;
      this.doc.font("Helvetica").fontSize(7).fillColor("#777")
        .text(`${pdfSafe(footer)}  |  ${i + 1}/${range.count}`, this.doc.page.margins.left, bottom, { width: this.doc.page.width - this.doc.page.margins.left * 2, align: "center", lineBreak: false });
    }
    this.doc.end();
    return this.done;
  }
}
