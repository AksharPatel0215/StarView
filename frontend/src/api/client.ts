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

export async function getProjectFile(
  projectName: string,
  filePath: string
): Promise<string>
{
  const response = await fetch(
    `${API_URL}/api/projects/${encodeURIComponent(projectName)}/files/${filePath}`
  );

  if (!response.ok)
  {
    throw new Error("Failed to fetch project file");
  }

  const data = await response.json();

  return data.content;
}

export async function saveProjectFile(
  projectName: string,
  filePath: string,
  content: string
): Promise<void>
{
  const response = await fetch(
    `${API_URL}/api/projects/${encodeURIComponent(projectName)}/files/${filePath}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
      }),
    }
  );

  if (!response.ok)
  {
    throw new Error("Failed to save project file");
  }
}