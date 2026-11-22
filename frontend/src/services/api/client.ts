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
    let message = `HTTP ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson?.detail) {
        message = errorJson.detail;
      } else if (errorJson?.title) {
        message = errorJson.title;
      }
    } catch {
      // Fallback to HTTP status
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
