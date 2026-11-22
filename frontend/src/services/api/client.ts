const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const ACCESS_TOKEN_KEY = "dyxersignature.demo-token";

export type DemoSession = {
  accessToken: string;
  tokenType: string;
  expiresAtUtc: string;
};

export async function initializeDemoSession(): Promise<DemoSession> {
  const response = await fetch(`${API_BASE_URL}/auth/dev-token`, {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(`No se pudo iniciar la sesión de demostración (HTTP ${response.status}).`);
  }

  const session = (await response.json()) as DemoSession;
  sessionStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  return session;
}

export function clearDemoSession() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  const isFormData = init?.body instanceof FormData;
  if (init?.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    if (response.status === 401) clearDemoSession();
    let message = `HTTP ${response.status}`;
    try {
      const problem = (await response.json()) as { detail?: string; title?: string };
      message = problem.detail ?? problem.title ?? message;
    } catch {
      // Keep the HTTP status when a non-JSON error body is returned.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  return (await response.text()) as T;
}



/** Fetches the PDF using the same JWT as the rest of the API.
 * Neither the S3 object key nor an internal SeaweedFS URL leaves the backend.
 */
export async function getDocumentPdf(versionId: string): Promise<Blob> {
  const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) throw new Error("La sesión ha expirado. Actualiza la página e inténtalo nuevamente.");
  const response = await fetch(
    `${API_BASE_URL}/documents/${encodeURIComponent(versionId)}/file`,
    {headers:{Authorization:`Bearer ${token}`},cache:"no-store"}
  );
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "El documento no está disponible en el almacenamiento."
        : `No se pudo recuperar el documento (HTTP ${response.status}).`
    );
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/pdf"))
    throw new Error("El servidor no devolvió un archivo PDF.");
  return response.blob();
}
