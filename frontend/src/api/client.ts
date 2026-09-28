const API_URL = "http://127.0.0.1:8000";


export async function getHealth(): Promise<string>
{
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok)
  {
    throw new Error("Backend request failed");
  }

  const data = await response.json();

  return data.status;
}


export async function getProjectFiles(projectName: string): Promise<string[]>
{
  const response = await fetch(
    `${API_URL}/api/projects/${encodeURIComponent(projectName)}/files`
  );

  if (!response.ok)
  {
    throw new Error("Failed to fetch project files");
  }

  return response.json();
}