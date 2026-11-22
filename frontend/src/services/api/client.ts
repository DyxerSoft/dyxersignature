const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export async function apiRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(response.status === 502
      ? "La API no está disponible. Verifica que el servidor esté iniciado y vuelve a intentarlo."
      : `La solicitud no se completó (HTTP ${response.status}).`);
  }

  return response.json() as Promise<T>;
}
