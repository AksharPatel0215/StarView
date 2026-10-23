const API_URL = import.meta.env.VITE_API_URL || "";
export type Project = { name: string; root: string };
export type DirectoryListing = {
  path: string;
  parent: string | null;
  directories: { name: string; path: string }[];
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.method && !['GET','HEAD'].includes(options.method) && csrf) headers.set('X-CSRF-Token',csrf);
  const response = await fetch(`${API_URL}/api${path}`, {...options,headers,credentials:'include'});
  if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('starview-session-expired'));
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

export type DocumentNode = { provisional?:boolean; path: string; title: string; is_main: boolean; tags: string[]; kind?: "document" | "dashboard" | "data" | "flashcards" };
export type DocumentLink = { provisional?:boolean;draft_action?:string; source: string; target: string; missing: boolean; kind?: "inline" | "both" | "workspace"; labels?: string[]; color?: string | null };
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

export type Session = { authenticated: boolean; setup_required: boolean; name: string | null; csrf: string | null };
let csrf = '';
const session = (value:Session)=>{csrf=value.csrf||'';return value;};
export const authStatus = async()=>session(await request<Session>('/auth/status'));
export const signIn = async(name:string,password:string,setup=false)=>session(await request<Session>(`/auth/${setup?'setup':'login'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,password})}));
export const signOut = ()=>request('/auth/logout',{method:'POST'});
export const changePassword = async(current:string,password:string)=>session(await request<Session>('/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current,password})}));
export type CloudResource = {provider:'google'|'microsoft';id:string;name:string;kind:'sheet'|'document';mime:string};
export type WorkspaceNode = {id:string;title:string;kind:'dashboard'|'data'|'flashcards';targets:string[];cards?:Flashcard[];resource:CloudResource|null};
export type WorkspaceStats = {documents:number;connections:number;isolated:number;unresolved:number;data_nodes:number;dashboards:number;assets:number|null;tags:{name:string;count:number}[];hubs:{path:string;title:string;connections:number}[]};
export type AccountConnection = {provider:'google'|'microsoft';connected:boolean;configured:boolean};
export type ResourceListing = {items:{id:string;name:string;folder:boolean}[];cursor:string};
export type ResourcePreview = {kind:'pdf'|'document'|'sheet';paragraphs?:string[];sheets?:{name:string;rows:string[][];truncated:boolean}[];truncated?:boolean};
export const getWorkspaceNodes=(name:string)=>request<WorkspaceNode[]>(`${projectPath(name)}/workspace/nodes`);
export const createWorkspaceNode=(name:string,node:{kind:'dashboard'|'data'|'flashcards';title:string;targets:string[];resource?:{provider:string;id:string}})=>request<WorkspaceNode>(`${projectPath(name)}/workspace/nodes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(node)});
export const updateWorkspaceNode=(name:string,node:WorkspaceNode)=>request<WorkspaceNode>(`${projectPath(name)}/workspace/nodes`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:node.id,title:node.title,targets:node.targets})});
export const getStats=(name:string,node?:string)=>request<WorkspaceStats>(`${projectPath(name)}/workspace/stats${node?`?node=${encodeURIComponent(node)}`:''}`);
export const getAccounts=()=>request<AccountConnection[]>('/accounts');
export const connectAccount=(provider:string)=>request<{url:string}>(`/accounts/${provider}/connect`,{method:'POST'});
export const disconnectAccount=(provider:string)=>request<AccountConnection[]>(`/accounts/${provider}`,{method:'DELETE'});
export const getResources=(provider:string,folder='',cursor='')=>request<ResourceListing>(`/accounts/${provider}/resources?folder=${encodeURIComponent(folder)}&cursor=${encodeURIComponent(cursor)}`);
export const getResourcePreview=(name:string,id:string)=>request<ResourcePreview>(`${projectPath(name)}/workspace/preview?id=${encodeURIComponent(id)}`);
export const resourcePdfUrl=(name:string,id:string)=>`${API_URL}/api${projectPath(name)}/workspace/preview?id=${encodeURIComponent(id)}&pdf=true`;

export const createProjectFile = (name: string, path: string, content: string) => request<{path:string}>(`${projectPath(name)}/files`, {
  method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({path,content}),
});
export type TrashItem={id:string;path:string;deleted_at:string};
export const moveFile=(name:string,source:string,target:string)=>request<{path:string}>(`${projectPath(name)}/file-actions/move`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,target})});
export const deleteFile=(name:string,source:string)=>request<TrashItem>(`${projectPath(name)}/file-actions/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source})});
export const getTrash=(name:string)=>request<TrashItem[]>(`${projectPath(name)}/trash`);
export const restoreFile=(name:string,id:string)=>request<{path:string}>(`${projectPath(name)}/trash/${id}/restore`,{method:'POST'});

export type AgentChange={kind:'create_note'|'update_note'|'connect'|'disconnect'|'label_connection';path:string;content:string;source:string;target:string;labels:string[];reason:string};
export type AgentProposal={id:string;status:string;created_at:string;answer:string;citations:string[];changes:AgentChange[];before:Record<string,string|null>;before_edges?:DocumentLink[]};
export type AgentSource={path:string;title:string;line_start:number;line_end:number;excerpt:string};
export type AgentReply={grounding?:{method:string;quotes_verified:boolean;verification:string;steps:{source:string;target:string;status:string;claims:unknown[]}[]};concept_path?:{endpoints:string[];paths:string[];found:boolean}|null;answer:string;citations:string[];sources:AgentSource[];proposal:AgentProposal|null;model:string;timing?:{elapsed_seconds:number;prompt_tokens:number|null;output_tokens:number|null}};
export type AgentStatus={available:boolean;models:string[];default_model:string;message:string};
export const getAgentStatus=()=>request<AgentStatus>('/agent/status');
export const getAgentProposals=(name:string)=>request<AgentProposal[]>(`${projectPath(name)}/agent/proposals`);
export const askAgent=(name:string,prompt:string,model:string,current:string,history:{role:string;content:string}[])=>request<AgentReply>(`${projectPath(name)}/agent/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,model,current,history})});
export const reviewAgentProposal=(name:string,id:string,approve:boolean,changes?:AgentChange[])=>request<AgentProposal>(`${projectPath(name)}/agent/proposals/${id}/${approve?'approve':'reject'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(approve?{changes}: {})});

export async function previewAgentDraft(name:string,path:string,content:string):Promise<Blob>{
 const response=await fetch(`${API_URL}/api${projectPath(name)}/agent/preview`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify({path,content})});
 if(!response.ok){const data=await response.json();throw new Error(typeof data.detail==='string'?data.detail:data.detail?.stdout||data.detail?.stderr||'Could not preview this draft');}
 return response.blob();
}

export type Flashcard={id:string;kind:'definition'|'problem';front:string;back:string;labels?:string[]};
export const saveFlashcards=(name:string,id:string,cards:Flashcard[])=>request<WorkspaceNode>(`${projectPath(name)}/workspace/flashcards`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,cards})});
