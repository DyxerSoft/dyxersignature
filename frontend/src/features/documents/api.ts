import { apiRequest } from "../../services/api/client";

export type TemplateDocument = {
  id: string;
  name: string;
  fileName: string;
  contentType: string;
  category: string;
  tags: string[];
  createdAtUtc: string;
};

export function getDocuments() {
  return apiRequest<TemplateDocument[]>("/documents");
}

export async function uploadDocument(file: File, name: string, category: string, tags: string[]) {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("category", category);
  form.append("tags", tags.join(","));
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/documents`, {
    method: "POST", credentials: "include", body: form
  });
  if (!response.ok) throw new Error(`No se pudo guardar el documento (HTTP ${response.status}).`);
  return response.json() as Promise<TemplateDocument>;
}

export function documentFileUrl(id: string, action: "view" | "download") {
  return `${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/documents/${id}/${action}`;
}
