import { useAuth0 } from "@auth0/auth0-react";

const LogoutButton = ({ className }) => {
  const { logout } = useAuth0();

  return (
    <button
      className={className}
      type="button"
      onClick={() =>
        logout({ logoutParams: { returnTo: window.location.origin } })
      }
    >
      Log Out
    </button>
  );
};

export default LogoutButton;
