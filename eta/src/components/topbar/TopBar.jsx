 import { useState, useEffect, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Link } from "react-router-dom";

const getInitials = (name = "") => {
  const parts = name.trim().split(" ");
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

function TopBar() {
  const { isAuthenticated, user, loginWithRedirect, logout } = useAuth0();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleLogout = () =>
    logout({ logoutParams: { returnTo: window.location.origin } });

  return (
    <header className="topbar">
      <Link to="/chat" className="topbar__logo">
        <span className="logo-mark">E</span>
        <span className="logo-text">TA Nexus</span>
      </Link>
      <div className="topbar__actions">
        {isAuthenticated ? (
          <div className="topbar__profile" ref={menuRef}>
            <button
              type="button"
              className="topbar__profile-btn"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {user?.picture ? (
                <img
                  className="topbar__profile-avatar"
                  src={user.picture}
                  alt={user.name}
                />
              ) : (
                getInitials(user?.name || user?.email)
              )}
            </button>
            {menuOpen && (
              <div className="topbar__dropdown">
                <div className="topbar__dropdown-header">
                  <p className="topbar__dropdown-name">
                    {user?.name || "User"}
                  </p>
                  {user?.email && (
                    <p className="topbar__dropdown-email">{user.email}</p>
                  )}
                </div>
                <Link to="/chat">Chat</Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    console.info("Settings panel coming soon.");
                  }}
                >
                  Settings · coming soon
                </button>
                <button type="button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="cta cta--secondary"
            onClick={() =>
              loginWithRedirect({
                appState: { returnTo: "/chat" },
              })
            }
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}

export default TopBar;
