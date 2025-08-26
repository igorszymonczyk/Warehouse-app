import { useEffect, useState } from "react";

function App() {
  const [msg, setMsg] = useState("Loading...");

  useEffect(() => {
    // dzięki "proxy" to trafi na http://localhost:5000/
    fetch("/")
      .then((r) => r.json())
      .then((data) => setMsg(data.message))
      .catch(() => setMsg("Backend unreachable"));
  }, []);

  return (
    <div style={{ textAlign: "center", marginTop: 40 }}>
      <h1>Warehouse App Frontend</h1>
      <p>Backend says: <b>{msg}</b></p>
    </div>
  );
}

export default App;
