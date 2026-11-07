export type ThumbnailArtifact = {
  schema_version: 1;
  renderer: "radar-thumbnail-v1";
  width: 1280;
  height: 720;
  theme: "signal_aperture";
  title_variants: string[];
  story_title: string;
  factual_status: "confirmed" | "disputed" | "inferred" | "unverified" | "satire" | "mixed";
  source_count: number;
  evidence_item_count: number;
  evidence_hash: string;
  human_approval_required: true;
};

const factualStatuses = new Set<ThumbnailArtifact["factual_status"]>([
  "confirmed",
  "disputed",
  "inferred",
  "unverified",
  "satire",
  "mixed",
]);

export function parseThumbnailArtifact(value: unknown): ThumbnailArtifact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const artifact = value as Record<string, unknown>;
  const titles = artifact.title_variants;
  if (
    artifact.schema_version !== 1
    || artifact.renderer !== "radar-thumbnail-v1"
    || artifact.width !== 1280
    || artifact.height !== 720
    || artifact.theme !== "signal_aperture"
    || artifact.human_approval_required !== true
    || !Array.isArray(titles)
    || titles.length < 1
    || titles.length > 10
    || titles.some((title) => typeof title !== "string" || !title.trim() || title.length > 160)
    || typeof artifact.story_title !== "string"
    || !artifact.story_title.trim()
    || artifact.story_title.length > 280
    || typeof artifact.factual_status !== "string"
    || !factualStatuses.has(artifact.factual_status as ThumbnailArtifact["factual_status"])
    || !Number.isInteger(artifact.source_count)
    || Number(artifact.source_count) < 1
    || Number(artifact.source_count) > 100_000
    || !Number.isInteger(artifact.evidence_item_count)
    || Number(artifact.evidence_item_count) < 1
    || Number(artifact.evidence_item_count) > 1_000_000
    || typeof artifact.evidence_hash !== "string"
    || !/^[a-f0-9]{64}$/i.test(artifact.evidence_hash)
  ) return null;
  return artifact as ThumbnailArtifact;
}

function isRtl(value: string): boolean {
  return /[\u0590-\u08ff\ufb1d-\ufefc]/u.test(value);
}

function textSegments(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

function wrappedLines(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const segments = textSegments(value.trim());
  const lines: string[] = [];
  let line = "";
  for (const segment of segments) {
    const candidate = `${line}${segment}`.trimStart();
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line.trim());
      line = segment.trimStart();
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  const consumed = lines.join("").replaceAll(/\s/gu, "").length;
  const original = value.replaceAll(/\s/gu, "").length;
  if (lines.length === maxLines && consumed < original) {
    let last = lines[maxLines - 1];
    while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

export function renderThumbnailCanvas(
  canvas: HTMLCanvasElement,
  artifact: ThumbnailArtifact,
  headlineIndex: number,
): void {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot render the thumbnail canvas.");
  const headline = artifact.title_variants[headlineIndex];
  if (!headline) throw new Error("Choose a valid grounded headline before exporting.");
  canvas.width = artifact.width;
  canvas.height = artifact.height;
  context.clearRect(0, 0, artifact.width, artifact.height);
  context.fillStyle = "#07080c";
  context.fillRect(0, 0, artifact.width, artifact.height);

  const glow = context.createRadialGradient(1080, 160, 10, 1080, 160, 520);
  glow.addColorStop(0, "rgba(120, 102, 255, 0.96)");
  glow.addColorStop(0.28, "rgba(59, 103, 246, 0.56)");
  glow.addColorStop(0.72, "rgba(18, 34, 76, 0.16)");
  glow.addColorStop(1, "rgba(7, 8, 12, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, artifact.width, artifact.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.12)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(1080, 160, 114, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(1080, 160, 66, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#f8f9ff";
  context.beginPath();
  context.arc(1080, 160, 13, 0, Math.PI * 2);
  context.fill();

  const rtl = isRtl(headline);
  context.direction = rtl ? "rtl" : "ltr";
  context.textAlign = rtl ? "right" : "left";
  const textX = rtl ? 1198 : 72;
  context.font = "700 64px ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  context.fillStyle = "#ffffff";
  const lines = wrappedLines(context, headline, 980, 4);
  lines.forEach((line, index) => context.fillText(line, textX, 215 + (index * 78)));

  context.direction = "ltr";
  context.textAlign = "left";
  context.font = "700 22px ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const status = artifact.factual_status.replaceAll("_", " ").toUpperCase();
  const statusWidth = context.measureText(status).width + 38;
  context.fillStyle = artifact.factual_status === "confirmed" ? "#6ee7b7" : "#c4b5fd";
  context.beginPath();
  context.roundRect(72, 70, statusWidth, 42, 21);
  context.fill();
  context.fillStyle = "#0b0d12";
  context.fillText(status, 91, 98);

  context.strokeStyle = "rgba(255, 255, 255, 0.14)";
  context.beginPath();
  context.moveTo(72, 590);
  context.lineTo(1208, 590);
  context.stroke();
  context.fillStyle = "rgba(255, 255, 255, 0.72)";
  context.font = "500 22px ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  context.fillText(
    `${artifact.evidence_item_count} evidence item${artifact.evidence_item_count === 1 ? "" : "s"} · ${artifact.source_count} source${artifact.source_count === 1 ? "" : "s"}`,
    72,
    640,
  );
  context.textAlign = "right";
  context.fillText("X Master · Human review", 1208, 640);
}

export function canvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the thumbnail as a PNG."));
    }, "image/png");
  });
}
