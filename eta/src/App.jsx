import { Routes, Route, Outlet, NavLink } from "react-router-dom";

import Home from "./pages/home.jsx";
import LoginPage from "./pages/loginPage.jsx";
import Chat from "./pages/chat.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import "./App.css";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/chat", label: "Chat" },
  { to: "/lessons", label: "Lessons" },
  { to: "/login", label: "Login" },
];

function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-shell__nav">
        <div className="app-shell__logo">
          <span className="logo-mark">E</span>
          <span className="logo-text">TA Nexus</span>
        </div>
        <nav className="app-shell__links">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-link${isActive ? " nav-link--active" : ""}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-shell__content">
        <Outlet />
      </main>
      <footer className="app-shell__footer">
        <span>
          © {new Date().getFullYear()} ETA · Persona-inspired learning companion
        </span>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/lessons" element={<Home />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/chat" element={<Chat />} />
        </Route>
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}

export default App;
