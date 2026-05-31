import { useState, useEffect } from "react";
import Home from "./pages/Home";
import Admin from "./pages/Admin";

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  if (currentPath === "/admin") {
    return <Admin />;
  }

  return <Home />;
}
