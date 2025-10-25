from flask import Flask, redirect, render_template, request, session, url_for, jsonify
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from flask_cors import CORS
import boto3
import uuid
import datetime

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

@app.route("/generate-user", methods=["POST"])
def generate_new_user(eta_id, upload_date, name, email):
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "Invalid input"}), 400
        
        name = data.get("name")
        email = data.get("email")
        # eta_id = data.get("etaId")
        # upload_date = data.get("uploadDate")
        
        if not all([name, email, eta_id, upload_date]):
            return jsonify({"error": "Missing required fields"}), 400
        
        eta_id = str(uuid.uuid4())
        upload_date = datetime.datetime.now().isoformat()
        
        response = table.put_item(
        Item={
                'ElectronicTeachingAssistantMaterialID': eta_id,
                "UploadDate": upload_date,
                'Name': name,
                'Email': email,
                'ChatHistory': [{'User':[], 'Assistant': []}],
                'Context': [],
                'Uploads': [],
                }
            )
        if response['ResponseMetadata']['HTTPStatusCode'] != 200:
            return jsonify({
                "message": "User stored successfully",
                "user_id": eta_id,
                "upload_date": upload_date
            }), 200
        return jsonify({"message": "User stored successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # How to use the Gemini client to generate content.
    
    # response = client.models.generate_content(
    #     model="gemini-2.5-flash-lite",
    #     contents="Write a short poem about the sea.",
    # )
    # print(response.text)
    app.run(host="0.0.0.0", port=env.get("PORT", 3000))

