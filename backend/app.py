from flask import Flask, redirect, render_template, request, session, url_for
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode

from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv, find_dotenv

from google import genai

ENV_FILE = find_dotenv()
if ENV_FILE:
    load_dotenv(ENV_FILE)

app = Flask(__name__)
app.secret_key = env.get("APP_SECRET_KEY")
client = genai.Client(api_key=env.get("GEMINI_API_KEY"))

# Set up the OAuth instance
oauth = OAuth(app)
oauth.register(
    "auth0",
    client_id=env.get("AUTH0_CLIENT_ID"),
    client_secret=env.get("AUTH0_CLIENT_SECRET"),
    client_kwargs={
        "scope": "openid profile email",
    },
    server_metadata_url=f"https://{env.get('AUTH0_DOMAIN')}/.well-known/openid-configuration",
)
# Login route
@app.route('/login')
def login():
    return oauth.auth0.authorize_redirect(
        redirect_uri=url_for('callback', _external=True)
    )
# Callback route
@app.route('/callback')
def callback():
    token = oauth.auth0.authorize_access_token()
    userinfo = oauth.auth0.parse_id_token(token)
    session['user'] = {
        'userinfo': userinfo,
        'token': token
    }
    return redirect('/')
# Logout route
@app.route('/logout')
def logout():
    session.clear()
    return redirect(
        "https://"
        + env.get("AUTH0_DOMAIN")
        + "/v2/logout?"
        + urlencode(
            {
                "returnTo": url_for("home", _external=True),
                "client_id": env.get("AUTH0_CLIENT_ID"),
            },
            quote_via=quote_plus,
        )
    )

@app.route('/')
def home():
    return render_template("index.html", session=session.get('user'), pretty=json.dumps(session.get('user'), indent=4))

if __name__ == "__main__":
    # How to use the Gemini client to generate content.
    
    # response = client.models.generate_content(
    #     model="gemini-2.5-flash-lite",
    #     contents="Write a short poem about the sea.",
    # )
    # print(response.text)
    app.run(host="0.0.0.0", port=env.get("PORT", 3000))

