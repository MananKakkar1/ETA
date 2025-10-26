import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";

import "./index.css";
import App from "./App.jsx";

const onRedirectCallback = (appState) => {
  const target = appState?.returnTo ?? "/chat";
  window.history.replaceState({}, document.title, target);
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Auth0Provider
      domain="dev-eta.ca.auth0.com"
      clientId="Rgq8OF7zgiCBvbpAN4oa3CDmRjouNxA4"
      authorizationParams={{
        redirect_uri: `${window.location.origin}/chat`,
        audience: "https://dev-eta.ca.auth0.com/api/v2/",
        scope: "openid profile email",
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      useRefreshTokensFallback
      onRedirectCallback={onRedirectCallback}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Auth0Provider>
  </StrictMode>
);
