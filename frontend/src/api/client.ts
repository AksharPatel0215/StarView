const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
export type Project = { name: string; root: string };
export type DirectoryListing = {
  path: string;
  parent: string | null;
  directories: { name: string; path: string }[];
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === "string" ? detail : detail?.stderr || detail?.stdout || "Request failed");
  }
  return data;
}
const filePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const projectPath = (name: string) => `/projects/${encodeURIComponent(name)}`;
export async function getHealth(): Promise<string> {
  return (await request<{ status: string }>("/health")).status;
}
export const getProjects = () => request<Project[]>("/projects");
export const browseDirectories = (path?: string) => request<DirectoryListing>(
  `/projects/local-directories${path ? `?path=${encodeURIComponent(path)}` : ""}`
);
export const openProject = (name: string, root: string) => request<Project>("/projects", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, root }),
});
export const getProjectFiles = (name: string) => request<string[]>(`${projectPath(name)}/files`);
export async function getProjectFile(name: string, path: string): Promise<string> {
  return (await request<{ content: string }>(`${projectPath(name)}/files/${filePath(path)}`)).content;
}
export async function saveProjectFile(name: string, path: string, content: string): Promise<void> {
  await request(`${projectPath(name)}/files/${filePath(path)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}
export async function compileProjectFile(name: string, path: string): Promise<string> {
  const result = await request<{ pdf: string | null }>(`${projectPath(name)}/compile/${filePath(path)}`, { method: "POST" });
  if (!result.pdf) throw new Error("Compilation did not produce a PDF");
  return result.pdf;
}
export const getPdfUrl = (name: string, path: string, version: number) =>
  `${API_URL}/api${projectPath(name)}/pdf/${filePath(path)}?v=${version}`;

export type DocumentNode = { path: string; title: string; is_main: boolean; tags: string[] };
export type DocumentLink = { source: string; target: string; missing: boolean; kind?: "inline" | "both"; labels?: string[]; color?: string | null };
export type KnowledgeGraph = { documents: DocumentNode[]; links: DocumentLink[]; styles?: GraphStyles };
export const getConnections = (name: string) => request<KnowledgeGraph>(`${projectPath(name)}/connections`);
export const connectDocuments = (name: string, source: string, target: string, remove = false) => request<KnowledgeGraph>(`${projectPath(name)}/connections`, {
  method: remove ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, target }),
});
export const getAssetUrl = (name: string, path: string) => `${API_URL}/api${projectPath(name)}/assets/${filePath(path)}`;

export type FileLabels = Record<string, { folder: string; custom: string[] }>;
export const chooseFolder = () => request<{ path: string | null }>("/projects/choose-folder", { method: "POST" });
export const getTags = (name: string) => request<FileLabels>(`${projectPath(name)}/tags`);
export const updateTags = (name: string, path: string, tags: string[]) => request<FileLabels>(`${projectPath(name)}/tags/${filePath(path)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags }) });

export type GraphStyles = { tag_colors: Record<string, string>; relationship_colors: Record<string, string>; node_colors: Record<string, string> };
export const labelConnection = (name: string, source: string, target: string, labels: string[], color: string | null) => request<KnowledgeGraph>(`${projectPath(name)}/connections/labels`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, target, labels, color }) });
export const setGraphColor = (name: string, kind: "tag" | "relationship" | "node", key: string, color: string | null) => request<KnowledgeGraph>(`${projectPath(name)}/graph/colors`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, key, color }) });
