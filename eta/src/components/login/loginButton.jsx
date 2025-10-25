import { useAuth0 } from "@auth0/auth0-react";

const LoginButton = ({ className }) => {
  const { loginWithRedirect } = useAuth0();
  return (
    <button
      className={className}
      type="button"
      onClick={() =>
        loginWithRedirect({
          appState: { returnTo: "/chat" },
        })
      }
    >
      Log In
    </button>
  );
};

export default LoginButton;
