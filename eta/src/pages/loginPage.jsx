import React, { use } from "react";

function LoginPage() {
    let username, password = useState(getUserName, getPassword);

    useEffect(() => {
        username = getUserName();
        password = getPassword();
    }, []);
    return <div>
        <h1>Login Page</h1>
        <form>
            <label>
                Username:
                <input type="text" name="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <br />
            <label>
                Password:
                <input type="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <br />
            <button type="submit">Login</button>
        </form>
    </div>;
}