import { useState, useEffect } from "react";
import Login from "./Login.jsx";
import CxpApp from "./CxpApp.jsx";
import { setAuditUser } from "./db.js";

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem("cxp_user");
      const u = saved ? JSON.parse(saved) : null;
      if (u) setAuditUser(u);
      return u;
    } catch { return null; }
  });

  const handleLogin = (userData) => {
    setUser(userData);
    setAuditUser(userData);
    try { sessionStorage.setItem("cxp_user", JSON.stringify(userData)); } catch {}
  };

  const handleLogout = () => {
    setUser(null);
    setAuditUser(null);
    try { sessionStorage.removeItem("cxp_user"); } catch {}
  };

  if (!user) return <Login onLogin={handleLogin} />;
  return <CxpApp user={user} onLogout={handleLogout} />;
}
