import { useAuth0 } from "@auth0/auth0-react";

const Profile = () => {
  const { user, isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return <div className="auth__loading">Loading...</div>;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="auth__profile-card">
      <img className="auth__avatar" src={user.picture} alt={user.name} />
      <div>
        <h2 className="auth__profile-name">{user.name}</h2>
        <p className="auth__profile-email">{user.email}</p>
      </div>
    </div>
  );
};

export default Profile;
