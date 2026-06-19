import { type NextRequest } from "next/server";
import { deleteResponse, getResponse, updateResponse } from "@/src/lib/store";
import { responseUpdateSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

function serializeResponse(response: Awaited<ReturnType<typeof getResponse>>) {
  return {
    status: response.status,
    tierId: response.tierId,
    constraintIds: response.constraintIds,
    privateNote: response.privateNote || "",
    deletedAt: response.deletedAt || null
  };
}

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "response_get", { limit: 60, windowMs: 60_000 });
    const { token } = await params;
    const response = await getResponse(token);
    return json(serializeResponse(response));
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "response_update", { limit: 30, windowMs: 60_000 });
    const input = await parseJson(request, responseUpdateSchema);
    const { token } = await params;
    const response = await updateResponse(token, input);
    return json(serializeResponse(response));
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "response_delete", { limit: 20, windowMs: 60_000 });
    const { token } = await params;
    const response = await deleteResponse(token);
    return json({ deletedAt: response.deletedAt });
  } catch (error) {
    return handleApiError(error, request);
  }
}
