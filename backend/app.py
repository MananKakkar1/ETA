from flask import Flask, redirect, render_template, request, session, url_for, jsonify
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from flask_cors import CORS

from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv, find_dotenv

from google import genai

ENV_FILE = find_dotenv()
if ENV_FILE:
    load_dotenv(ENV_FILE)

app = Flask(__name__)
client = genai.Client(api_key=env.get("GEMINI_API_KEY"))
CORS(app, origins=["http://localhost:3001"], supports_credentials=True)
app.secret_key = env.get("APP_SECRET_KEY")

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
@app.route('/api/auth/login')
def auth_login():
    return jsonify({
        'login_url': url_for('login', _external=True)
    })
# Callback route
@app.route('/api/auth/user')
def auth_user():
    if 'user' in session:
        return jsonify({
            'authenticated': True,
            'user': session['user']['userinfo']
        })
    return jsonify({
        'authenticated': False
    }), 401

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

