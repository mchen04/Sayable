import { type NextRequest } from "next/server";
import { getTheme } from "@sayable/core";
import { getPreviewByToken, StoreError } from "@/src/lib/store";
import { enforceRateLimit } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapWords(value: string, maxChars: number, maxLines: number): string[] {
  const words = value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .flatMap((word) => {
      if (word.length <= maxChars) {
        return [word];
      }
      const chunks: string[] = [];
      for (let index = 0; index < word.length; index += maxChars - 1) {
        chunks.push(`${word.slice(index, index + maxChars - 1)}${index + maxChars - 1 < word.length ? "-" : ""}`);
      }
      return chunks;
    });
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current) {
      lines.push(word);
      continue;
    }
    if (`${current} ${word}`.length <= maxChars) {
      lines[lines.length - 1] = `${current} ${word}`;
      continue;
    }
    if (lines.length < maxLines) {
      lines.push(word);
      continue;
    }
    const trimmed = `${current} ${word}`;
    lines[lines.length - 1] = `${trimmed.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
    break;
  }
  return lines.slice(0, maxLines);
}

function svgTextLines(lines: string[], x: number, y: number, lineHeight: number): string {
  return lines
    .map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}">${escapeSvg(line)}</tspan>`)
    .join("");
}

function svgTemplate(input: {
  title: string;
  eyebrow: string;
  detail: string;
  accent: string;
  soft: string;
  paper: string;
  ink: string;
}) {
  const title = escapeSvg(input.title).slice(0, 100);
  const eyebrow = escapeSvg(input.eyebrow).slice(0, 80);
  const titleLines = svgTextLines(wrapWords(input.title, 27, 2), 96, 336, 68);
  const detailLines = svgTextLines(wrapWords(input.detail, 56, 2), 100, 452, 42);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${title}">
  <rect width="1200" height="630" fill="${input.paper}"/>
  <rect x="56" y="56" width="1088" height="518" rx="28" fill="#fffefb" stroke="${input.soft}" stroke-width="4"/>
  <rect x="88" y="88" width="1024" height="164" rx="22" fill="${input.accent}"/>
  <circle cx="1010" cy="170" r="68" fill="${input.soft}" opacity="0.72"/>
  <circle cx="930" cy="120" r="34" fill="#ffffff" opacity="0.28"/>
  <text x="128" y="160" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800">Sayable</text>
  <text x="128" y="212" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="28">${eyebrow}</text>
  <text fill="${input.ink}" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="900">${titleLines}</text>
  <text fill="#56635f" font-family="Arial, Helvetica, sans-serif" font-size="32">${detailLines}</text>
  <text x="100" y="550" fill="${input.accent}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800">Private answers. Group-safe result. No guest account needed.</text>
</svg>`;
}

function isActiveForPreview(check: { status: string; expiresAt: string }): boolean {
  return check.status === "active" && new Date(check.expiresAt).getTime() >= Date.now();
}

function unavailablePayload(detail = "This link is expired, deleted, or no longer public.") {
  return {
    title: "Comfort Check unavailable",
    eyebrow: "Sayable",
    detail,
    ...getTheme("sayable_default")
  };
}

function svgResponse(payload: Parameters<typeof svgTemplate>[0], status = 200): Response {
  return new Response(svgTemplate(payload), {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "og_preview", { limit: 120, windowMs: 60_000 });
    const { token } = await params;
    let payload = {
      title: "Comfort Check",
      eyebrow: "Private group-chat planning",
      detail: "Open the guest link to answer without an account.",
      ...getTheme("sayable_default")
    };

    if (token !== "default") {
      try {
        const preview = await getPreviewByToken(token);
        const theme = getTheme(preview.check.themeId);
        if (preview.kind === "result") {
          payload = {
            title: preview.check.title,
            eyebrow: `${preview.check.draft.activityLabel} Comfort Check result`,
            detail: preview.result.publicSnapshot.detail,
            ...theme,
            ...(preview.check.customTheme ? { accent: preview.check.customTheme.accent } : {})
          };
        } else {
          const isActive = isActiveForPreview(preview.check);
          payload = {
            title: isActive ? preview.check.title : "Comfort Check unavailable",
            eyebrow: `${preview.check.draft.activityLabel} Comfort Check${isActive ? "" : " unavailable"}`,
            detail:
              isActive
                ? "Private answers, group-safe result."
                : "This Sayable guest link is no longer accepting responses.",
            ...theme,
            ...(preview.check.customTheme ? { accent: preview.check.customTheme.accent } : {})
          };
        }
      } catch {
        payload = unavailablePayload();
      }
    }

    return svgResponse(payload);
  } catch (error) {
    const status = error instanceof StoreError ? error.status : 500;
    const detail = status === 429 ? "Too many preview requests. Try again in a moment." : undefined;
    return svgResponse(unavailablePayload(detail), status);
  }
}
