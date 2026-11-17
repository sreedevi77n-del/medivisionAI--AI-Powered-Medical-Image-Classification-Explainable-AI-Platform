export type Region = { label: string; x: number; y: number; width: number; height: number; influence: number };
export type Analysis = {
  classification: "Normal" | "Abnormal";
  confidence: number;
  probabilities: { normal: number; abnormal: number };
  findings: string[];
  impression: string;
  regions: Region[];
};

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const clamp01 = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0));

function buildPrompt(modality: string) {
  return `You are assisting an academic medical-imaging decision-support demo. This is not a diagnosis.
Review this ${modality} image and reply with JSON only, in exactly this shape:
{
  "classification": "Normal" or "Abnormal",
  "confidence": number between 0 and 1 for your chosen classification,
  "findings": [short plain-language observations, 2 to 5 items],
  "impression": "one or two plain-language sentences summarising the findings",
  "regions": [
    { "label": "short name of the area", "x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1, "influence": 0-1 }
  ]
}
Region coordinates are fractions of the image width and height, measured from the top-left corner.
List up to 5 regions that most influenced your classification, with the highest influence first.
If the image is not a medical ${modality} image, set classification to "Normal", confidence to 0, and explain in the impression.`;
}

export async function analyzeImage(bytes: ArrayBuffer, mimeType: string, modality: string): Promise<Analysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add it in Netlify environment variables.");
  const base = process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";

  const res = await fetch(`${base}/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(24_000),
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildPrompt(modality) },
            { inline_data: { mime_type: mimeType, data: Buffer.from(bytes).toString("base64") } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`The AI model returned an error (${res.status}). Try again.`);

  const payload: any = await res.json();
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("The AI model returned no result. Try again.");

  let raw: any;
  try {
    raw = JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("The AI model returned an unreadable result. Try again.");
  }

  const classification = raw.classification === "Abnormal" ? "Abnormal" : "Normal";
  const confidence = clamp01(raw.confidence);
  const regions: Region[] = (Array.isArray(raw.regions) ? raw.regions : [])
    .map((r: any) => {
      const x = clamp01(r.x);
      const y = clamp01(r.y);
      return {
        label: String(r.label ?? "Region").slice(0, 80),
        x,
        y,
        width: Math.min(clamp01(r.width), 1 - x),
        height: Math.min(clamp01(r.height), 1 - y),
        influence: clamp01(r.influence),
      };
    })
    .filter((r: Region) => r.width > 0 && r.height > 0)
    .sort((a: Region, b: Region) => b.influence - a.influence)
    .slice(0, 5);

  return {
    classification,
    confidence,
    probabilities:
      classification === "Abnormal"
        ? { abnormal: confidence, normal: 1 - confidence }
        : { normal: confidence, abnormal: 1 - confidence },
    findings: (Array.isArray(raw.findings) ? raw.findings : []).map(String).slice(0, 6),
    impression: String(raw.impression ?? "").slice(0, 1000),
    regions,
  };
}
