import "server-only";

export const RESUME_MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
export const RESUME_TYPES: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function resumeKind(file: { name: string; type: string }): "pdf" | "docx" | null {
  return RESUME_TYPES[file.type] ?? (/\.pdf$/i.test(file.name) ? "pdf" : /\.docx$/i.test(file.name) ? "docx" : null);
}

/** Plain text from a PDF or DOCX, whitespace-normalised and capped for the model. */
export async function extractResumeText(bytes: Uint8Array, kind: "pdf" | "docx"): Promise<string> {
  let text: string;
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const r = await extractText(pdf, { mergePages: true });
    text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
  } else {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = r.value;
  }
  return normaliseResumeText(text);
}

export function normaliseResumeText(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
}
