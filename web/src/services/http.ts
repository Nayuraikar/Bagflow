/** An error response from the API, or a failure to reach it (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const UNREACHABLE = "API not reachable. Start it with: cargo run --release -p bagflow-api";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "unreachable", UNREACHABLE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { code: string; message: string } } | null)?.error;
    // every API error has this shape, so anything else comes from the dev proxy or another server
    if (!error) throw new ApiError(response.status, "unreachable", UNREACHABLE);
    throw new ApiError(response.status, error.code, error.message);
  }
  if (body === null) throw new ApiError(response.status, "bad_response", `${path} did not return JSON`);
  return body as T;
}

export const postJson = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
