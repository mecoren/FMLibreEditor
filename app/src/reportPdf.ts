// A scout report as a PDF: one A4 page with the report's picture on it, as a JPEG (which PDF takes as it is), so that
// no library is needed. The picture is opaque, so nothing is lost by leaving out its transparency.

/** An A4 page in points, and the margin around the picture. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 36;

/** The canvas as JPEG bytes. */
function jpegOf(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject) : reject(new Error("no image"))),
      "image/jpeg",
      0.92,
    ),
  );
}

/** A PDF file of one page with the canvas on it, as wide as the page's margins let it be. */
export async function pdfOf(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const jpeg = await jpegOf(canvas);
  const scale = Math.min((PAGE_WIDTH - 2 * MARGIN) / canvas.width, (PAGE_HEIGHT - 2 * MARGIN) / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  const x = (PAGE_WIDTH - width) / 2;
  const y = PAGE_HEIGHT - MARGIN - height;
  const drawing = `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const add = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (body: string) => {
    offsets.push(length);
    add(`${offsets.length} 0 obj\n${body}\nendobj\n`);
  };

  // The header, with a comment of bytes above 127 that tells readers the file is binary.
  add("%PDF-1.4\n");
  add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object("<< /Type /Catalog /Pages 2 0 R >>");
  object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  offsets.push(length);
  add(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  add(jpeg);
  add("\nendstream\nendobj\n");
  object(`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`);

  const xref = length;
  const entries = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  add(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${entries}`);
  add(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
