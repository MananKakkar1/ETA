import React from "react";
import ReactDOM from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import LoginButton from "../components/login/loginButton";
import LogoutButton from "../components/login/logoutButton";
import Profile from "../components/login/profile";

const API_BASE_URL = "http://localhost:3000";

function LoginPage() {
  return (
    <div>
      <h1>Welcome, User!</h1>
      <LoginButton />
      <LogoutButton />
      <Profile />
    </div>
  );
}

export default LoginPage;
