import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useNavigate } from "react-router-dom";

import LoginButton from "../components/login/loginButton";
import LogoutButton from "../components/login/logoutButton";
import Profile from "../components/login/profile.jsx";
import "./loginPage.css";

function LoginPage() {
  const { isAuthenticated } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="auth">
      <div>
        <h1 className="auth__title">
          {isAuthenticated ? "Welcome back" : "Sign in"}
        </h1>
        <p className="auth__subtitle">
          Connect to unlock your personalized sessions and persona settings.
        </p>
      </div>

      <div className="auth__form">
        {isAuthenticated ? (
          <>
            <Profile />
            <LogoutButton className="cta cta--secondary auth__submit" />
          </>
        ) : (
          <LoginButton className="cta cta--primary auth__submit" />
        )}
      </div>

      <div className="auth__footer">
        Need an access invite?{" "}
        <a href="mailto:team@eta.app">Contact the ETA squad</a>.
      </div>
    </div>
  );
}

export default LoginPage;
