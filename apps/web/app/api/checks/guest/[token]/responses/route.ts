import { type NextRequest } from "next/server";
import { hashToken, submitResponse } from "@/src/lib/store";
import { responseSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "guest_response_submit", { limit: 20, windowMs: 60_000 });
    const input = await parseJson(request, responseSchema);
    const { token } = await params;
    const { response } = await submitResponse(token, input, input.clientNonce ? hashToken(input.clientNonce) : undefined);
    return json(
      {
        responseToken: response.responseTokenHash,
        status: response.status,
        tierId: response.tierId,
        constraintIds: response.constraintIds
      },
      201
    );
  } catch (error) {
    return handleApiError(error, request);
  }
}
