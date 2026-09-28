import { useEffect, useState } from "react";
import { getHealth } from "./api/client";


function App()
{
  const [status, setStatus] = useState("Connecting...");

  useEffect(() =>
  {
    getHealth()
      .then(setStatus)
      .catch(() => setStatus("Connection failed"));
  }, []);

  return (
    <div>
      <h1>StarView</h1>
      <p>Backend status: {status}</p>
    </div>
  );
}


export default App;