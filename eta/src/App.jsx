import { Routes, Route, Outlet } from "react-router-dom";

import Chat from "./pages/chat.jsx";
import LoginPage from "./pages/loginPage.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import TopBar from "./components/topbar/TopBar.jsx";
import "./App.css";

function AppLayout() {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-shell__content">
        <div className="app-shell__viewport">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route index element={<Chat />} />
          <Route path="chat" element={<Chat />} />
          <Route path="*" element={<Chat />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
