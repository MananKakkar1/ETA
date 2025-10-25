import io
import datetime
import uuid
from os import environ as env
import pypdf
import PyPDF2
import boto3
from boto3.dynamodb.conditions import Key
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import find_dotenv, load_dotenv

from google import genai

ENV_FILE = find_dotenv()
if ENV_FILE:
    load_dotenv(ENV_FILE)

app = Flask(__name__)
client = genai.Client(api_key=env.get("GEMINI_API_KEY"))
CORS(app, origins=["http://localhost:3001"], supports_credentials=True)
app.secret_key = env.get("APP_SECRET_KEY")
PRIMARY_KEY = "ElectronincTeachingAssistantMaterialID"

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table = dynamodb.Table('ETA')


def extract_text_from_pdf(file_bytes: bytes) -> tuple[str, dict]:
    """Extract UTF-8 text from a PDF binary payload.

    Returns a `(text, debug)` tuple so callers can inspect why extraction
    succeeded or failed.
    """
    debug: dict[str, object] = {
        "size_bytes": len(file_bytes),
        "pypdf": None,
        "pypdf_pages": 0,
        "pypdf_error": None,
        "pypdf_text_len": 0,
        "pypdf2": None,
        "pypdf2_pages": 0,
        "pypdf2_error": None,
        "pypdf2_text_len": 0,
        "literal_matches": 0,
    }

    collected_text: list[str] = []

    try:
        debug["pypdf"] = "available"
        try:
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            debug["pypdf_pages"] = len(reader.pages)
            for page in reader.pages:
                extracted = page.extract_text() or ""
                if extracted:
                    collected_text.append(extracted)
        except Exception as exc:  # pragma: no cover - diagnostic
            debug["pypdf_error"] = str(exc)
        else:
            debug["pypdf_text_len"] = sum(len(t) for t in collected_text)
    except ModuleNotFoundError:
        debug["pypdf"] = "missing"

    if collected_text:
        return "\n".join(collected_text), debug

    try:

        debug["pypdf2"] = "available"
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            debug["pypdf2_pages"] = len(reader.pages)
            for page in reader.pages:
                extracted = page.extract_text() or ""
                if extracted:
                    collected_text.append(extracted)
        except Exception as exc:  # pragma: no cover - diagnostic
            debug["pypdf2_error"] = str(exc)
        else:
            debug["pypdf2_text_len"] = sum(len(t) for t in collected_text)
    except ModuleNotFoundError:
        debug["pypdf2"] = "missing"

    if collected_text:
        return "\n".join(collected_text), debug

    # Fallback: simple text extraction from literal strings in content stream.
    try:
        data = file_bytes.decode("latin-1", errors="ignore")
        literals = []
        buffer = []
        escaping = False
        recording = False
        for char in data:
            if char == "(" and not recording:
                recording = True
                buffer = []
                escaping = False
                continue
            if recording:
                if escaping:
                    buffer.append(char)
                    escaping = False
                elif char == "\\":
                    escaping = True
                elif char == ")":
                    recording = False
                    literal = "".join(buffer).strip()
                    if literal:
                        literals.append(literal)
                else:
                    buffer.append(char)
        debug["literal_matches"] = len(literals)
        if literals:
            return "\n".join(literals), debug
    except Exception as exc:  # pragma: no cover - diagnostic
        debug["literal_error"] = str(exc)

    return "", debug


@app.route("/generate-user", methods=["POST"])
def generate_new_user():
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "Invalid input"}), 400

        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip()

        if not name or not email:
            return jsonify({"error": "Missing required fields"}), 400

        eta_id = str(uuid.uuid4())
        upload_date = datetime.datetime.now(datetime.timezone.utc).isoformat()

        response = table.put_item(
            Item={
                PRIMARY_KEY: eta_id,
                'UploadDate': upload_date,
                'Name': name,
                'Email': email,
                'ChatHistory': [{'User': [], 'Assistant': []}],
                'Context': [],
                'Uploads': [],
            }
        )

        status_code = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status_code != 200:
            return jsonify({"error": "Failed to store user"}), 500

        return jsonify({
            "message": "User stored successfully",
            "user_id": eta_id,
            "upload_date": upload_date
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/get-user/<eta_id>", methods=["GET"])
def get_user(eta_id):
    try:
        upload_date = request.args.get("upload_date")

        if upload_date:
            response = table.get_item(
                Key={
                    PRIMARY_KEY: eta_id,
                    'UploadDate': upload_date,
                }
            )
            item = response.get("Item")
            if not item:
                return jsonify({"error": "User not found"}), 404
            return jsonify(item), 200

        response = table.query(
            KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            return jsonify({"error": "User not found"}), 404
        return jsonify(items[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/upload-context", methods=["POST"])
def upload_context():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part in the request"}), 400
        file = request.files['file']
        eta_id = (request.form.get("etaId") or "").strip()
        if file.filename == '' or not eta_id:
            return jsonify({"error": "No selected file"}), 400

        if not file.filename.lower().endswith('.pdf'):
            return jsonify({"error": "Unsupported file type"}), 400

        pdf_content = file.read()
        pdf_text, debug = extract_text_from_pdf(pdf_content)
        pdf_text = pdf_text.strip()
        if not pdf_text:
            return jsonify({"error": "Failed to extract text from PDF", "debug": debug}), 500

        summary_text = pdf_text
        try:
            prompt = (
                "Provide a detailed yet concise summary that preserves every key "
                "detail, definition, and enumerated point from the provided PDF "
                "content."
            )
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    {
                        "role": "user",
                        "parts": [
                            {"text": prompt},
                            {"text": pdf_text[:100000]},
                        ],
                    }
                ],
            )
            candidate = response.candidates[0]
            summary_text = "".join(part.text for part in candidate.content.parts).strip() or pdf_text
        except Exception as exc:  # pragma: no cover - diagnostic
            debug.setdefault("summary_error", str(exc))

        upload_date = (request.form.get("uploadDate") or "").strip()

        if upload_date:
            key = {PRIMARY_KEY: eta_id, 'UploadDate': upload_date}
        else:
            latest = table.query(
                KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
                ScanIndexForward=False,
                Limit=1,
            )
            items = latest.get("Items", [])
            if not items:
                return jsonify({"error": "User not found for provided etaId"}), 404
            upload_date = items[0]['UploadDate']
            key = {PRIMARY_KEY: eta_id, 'UploadDate': upload_date}

        table.update_item(
            Key=key,
            UpdateExpression=(
                "SET #ctx = list_append(if_not_exists(#ctx, :empty), :ctx_value), "
                "#uploads = list_append(if_not_exists(#uploads, :empty), :upload_value)"
            ),
            ExpressionAttributeNames={
                '#ctx': 'Context',
                '#uploads': 'Uploads',
            },
            ExpressionAttributeValues={
                ':empty': [],
                ':ctx_value': [{
                    'type': 'pdf',
                    'filename': file.filename,
                    'summary': summary_text.strip(),
                    'uploaded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'debug': debug,
                }],
                ':upload_value': [{
                    'filename': file.filename,
                    'size_bytes': len(pdf_content),
                    'uploaded_at': datetime.datetime.now(datetime.timezone.utc).isoformat()
                }],
            }
        )

        return jsonify({
            "message": "Context uploaded successfully",
            "eta_id": eta_id,
            "upload_date": upload_date,
            "debug": debug,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/get-context/<eta_id>", methods=["GET"])
def get_context(eta_id):
    try:
        upload_date = request.args.get("upload_date")

        if not upload_date:
            latest = table.query(
                KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
                ScanIndexForward=False,
                Limit=1,
            )
            items = latest.get("Items", [])
            if not items:
                return jsonify({"error": "User not found"}), 404
            upload_date = items[0]['UploadDate']

        response = table.get_item(
            Key={
                PRIMARY_KEY: eta_id,
                'UploadDate': upload_date,
            }
        )
        item = response.get("Item")
        if not item:
            return jsonify({"error": "User not found"}), 404

        context = item.get("Context", [])
        return jsonify({"context": context}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env.get("PORT", 3000)))
