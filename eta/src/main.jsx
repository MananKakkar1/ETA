import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { Auth0Provider } from "@auth0/auth0-react";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router";

// Page Imports
import LoginPage from "./pages/loginPage.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Auth0Provider
      domain="dev-eta.ca.auth0.com"
      clientId="Rgq8OF7zgiCBvbpAN4oa3CDmRjouNxA4"
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: "https://dev-eta.ca.auth0.com/api/v2/",
        scope: "open_id profile email",
      }}
    >
      <RouterProvider router={router} />
    </Auth0Provider>
  </StrictMode>
);
