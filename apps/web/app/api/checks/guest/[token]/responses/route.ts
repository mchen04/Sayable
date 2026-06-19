import { type NextRequest } from "next/server";
import { hashToken, submitResponse } from "@/src/lib/store";
import { responseCreateSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "guest_response_submit", { limit: 20, windowMs: 60_000 });
    const input = await parseJson(request, responseCreateSchema);
    const { token } = await params;
    const { response, responseToken } = await submitResponse(token, input, hashToken(input.clientNonce));
    return json(
      {
        responseToken,
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
