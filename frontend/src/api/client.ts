const API_URL = "http://127.0.0.1:8000";
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
