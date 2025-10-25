from flask import Flask, redirect, render_template, request, session, url_for, jsonify
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from flask_cors import CORS
import boto3

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
dynamodb = boto3.resource('dynamodb', region_name='us-east-2')

table = dynamodb.Table('ETA')

@app.route("/generate", methods=["POST"])

def store_user():
    response = table.put_item(
       Item={
            'user_id': '123',
            'name': 'John Doe',
            'email': 'john.doe@example.com'
            }
        )
    if response['ResponseMetadata']['HTTPStatusCode'] != 200:
        return jsonify({"error": "Failed to store user"}), 500
    return jsonify({"message": "User stored successfully"}), 200

if __name__ == "__main__":
    # How to use the Gemini client to generate content.
    
    # response = client.models.generate_content(
    #     model="gemini-2.5-flash-lite",
    #     contents="Write a short poem about the sea.",
    # )
    # print(response.text)
    app.run(host="0.0.0.0", port=env.get("PORT", 3000))

