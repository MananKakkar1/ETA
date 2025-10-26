import io
import datetime
import uuid
from os import environ as env
import os
from anyio import Path
import pypdf
import PyPDF2
import boto3
from boto3.dynamodb.conditions import Key, Attr
from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from dotenv import find_dotenv, load_dotenv
from elevenlabs import ElevenLabsModule
from google import genai

ENV_FILE = find_dotenv()
if ENV_FILE:
    load_dotenv(ENV_FILE)

app = Flask(__name__)
client = genai.Client(api_key=env.get("GEMINI_API_KEY"))
allowed_origins = [
    origin.strip()
    for origin in (env.get("ALLOWED_ORIGINS") or "http://localhost:3001,http://localhost:5173").split(",")
    if origin.strip()
]
CORS(app, resources={r"/*": {"origins": allowed_origins}}, supports_credentials=True)
app.secret_key = env.get("APP_SECRET_KEY")
PRIMARY_KEY = "ElectronincTeachingAssistantMaterialID"

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table = dynamodb.Table('ETA')


def _fetch_latest_user_item(eta_id: str) -> tuple[dict | None, str | None]:
    if not eta_id:
        return None, None

    response = table.query(
        KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
        ScanIndexForward=False,
        Limit=1,
    )
    items = response.get("Items", [])
    if not items:
        return None, None

    item = items[0]
    return item, item.get("UploadDate")


def _scan_for_user_by(field_name: str, value: str) -> tuple[dict | None, str | None]:
    if not value:
        return None, None

    scan_kwargs = {
        "FilterExpression": Attr(field_name).eq(value),
    }
    last_evaluated_key = None

    while True:
        if last_evaluated_key:
            scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
        response = table.scan(**scan_kwargs)
        items = response.get("Items", [])
        if items:
            item = items[0]
            return item, item.get("UploadDate")
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    return None, None


def _to_iso_timestamp() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _normalize_message_entry(entry) -> dict | None:
    if isinstance(entry, dict):
        role = entry.get("role") or entry.get("Role")
        content = entry.get("content") or entry.get("message") or entry.get("text")
        timestamp = entry.get("timestamp") or entry.get("created_at")
    elif isinstance(entry, (list, tuple)) and entry:
        role = entry[0] if len(entry) > 0 else None
        content = entry[1] if len(entry) > 1 else None
        timestamp = entry[2] if len(entry) > 2 else None
    else:
        return None

    content = (content or "").strip()
    if not content:
        return None

    role = (role or "assistant").strip().lower()
    if role not in {"assistant", "user", "system"}:
        role = "assistant" if role.startswith("assist") else "user"

    return {
        "role": role,
        "content": content,
        "timestamp": timestamp or _to_iso_timestamp(),
    }


def _migrate_thread_messages(thread: dict) -> list:
    messages = thread.get("Messages")
    if isinstance(messages, list) and messages:
        return messages

    user_msgs = thread.get("User") or []
    assistant_msgs = thread.get("Assistant") or []
    migrated: list = []
    max_len = max(len(user_msgs), len(assistant_msgs))
    for idx in range(max_len):
        if idx < len(user_msgs):
            migrated.append(("user", user_msgs[idx]))
        if idx < len(assistant_msgs):
            migrated.append(("assistant", assistant_msgs[idx]))
    return migrated


def _normalize_thread(thread: dict, fallback_index: int = 0) -> dict:
    thread = dict(thread or {})
    chat_id = str(thread.get("ChatID") or fallback_index)
    messages = _migrate_thread_messages(thread)
    normalized_messages: list[dict] = []
    for entry in messages or []:
        normalized = _normalize_message_entry(entry)
        if normalized:
            normalized_messages.append(normalized)

    thread["ChatID"] = chat_id
    thread["Messages"] = normalized_messages
    thread.setdefault("Title", f"Session {fallback_index + 1}")
    thread.setdefault("CreatedAt", thread.get(
        "CreatedAt") or _to_iso_timestamp())
    return thread


def _normalize_chat_history(chat_history: list | None) -> list[dict]:
    normalized = []
    for index, thread in enumerate(chat_history or []):
        if not isinstance(thread, dict):
            continue
        normalized.append(_normalize_thread(thread, index))
    return normalized


def _persist_chat_history(eta_id: str, upload_date: str, chat_history: list[dict]):
    table.update_item(
        Key={
            PRIMARY_KEY: eta_id,
            "UploadDate": upload_date,
        },
        UpdateExpression="SET ChatHistory = :chats",
        ExpressionAttributeValues={":chats": chat_history},
    )


def _append_message(thread: dict, role: str, content: str):
    thread.setdefault("Messages", [])
    thread["Messages"].append({
        "role": role,
        "content": content,
        "timestamp": _to_iso_timestamp(),
    })


def _create_user_record(name: str, email: str, auth0_sub: str | None = None) -> dict:
    eta_id = str(uuid.uuid4())
    upload_date = _to_iso_timestamp()
    item = {
        PRIMARY_KEY: eta_id,
        "UploadDate": upload_date,
        "Name": name,
        "Email": email,
        "ChatHistory": [],
        "Context": [],
        "Uploads": [],
    }
    if auth0_sub:
        item["Auth0Sub"] = auth0_sub

    response = table.put_item(Item=item)
    status_code = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    if status_code != 200:
        raise RuntimeError("Failed to store user")
    return item


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
        email = (data.get("email") or "").strip().lower()
        auth0_sub = (data.get("auth0_sub") or "").strip() or None

        if not name or not email:
            return jsonify({"error": "Missing required fields"}), 400

        item = _create_user_record(name, email, auth0_sub)
        return jsonify({
            "message": "User stored successfully",
            "user": item,
            "user_id": item[PRIMARY_KEY],
            "upload_date": item["UploadDate"]
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


@app.route("/user/sync", methods=["POST"])
def sync_user():
    try:
        data = request.get_json(force=True, silent=True) or {}
        provided_eta = (data.get(PRIMARY_KEY) or data.get("eta_id") or
                        data.get("etaId") or "").strip()
        email = (data.get("email") or "").strip().lower()
        name = (data.get("name") or "").strip()
        auth0_sub = (data.get("auth0_sub") or
                     data.get("auth0Sub") or "").strip()

        if not any([provided_eta, email, auth0_sub]):
            return jsonify({"error": "Missing identifier to locate user"}), 400

        item, upload_date = _fetch_latest_user_item(provided_eta)
        if not item and auth0_sub:
            item, upload_date = _scan_for_user_by("Auth0Sub", auth0_sub)
        if not item and email:
            item, upload_date = _scan_for_user_by("Email", email)

        if not item:
            if not email or not name:
                return jsonify({"error": "Missing name or email for new user"}), 400
            item = _create_user_record(name, email, auth0_sub or None)
            upload_date = item["UploadDate"]
        else:
            eta_id = item[PRIMARY_KEY]
            update_fields: dict[str, str] = {}
            if name and name != item.get("Name"):
                update_fields["Name"] = name
            if email and email != (item.get("Email") or "").lower():
                update_fields["Email"] = email
            if auth0_sub and auth0_sub != item.get("Auth0Sub"):
                update_fields["Auth0Sub"] = auth0_sub

            if update_fields:
                update_expression = "SET " + \
                    ", ".join(f"{key} = :{key}" for key in update_fields)
                expression_values = {
                    f":{key}": value for key, value in update_fields.items()}
                table.update_item(
                    Key={
                        PRIMARY_KEY: eta_id,
                        "UploadDate": upload_date,
                    },
                    UpdateExpression=update_expression,
                    ExpressionAttributeValues=expression_values,
                )
                item.update(update_fields)

        eta_id = item[PRIMARY_KEY]
        normalized_history = _normalize_chat_history(
            item.get("ChatHistory", []))
        if normalized_history != item.get("ChatHistory"):
            _persist_chat_history(eta_id, upload_date, normalized_history)
            item["ChatHistory"] = normalized_history
        else:
            item["ChatHistory"] = normalized_history

        payload = {
            "user": item,
            "eta_id": eta_id,
            "upload_date": upload_date,
        }
        return jsonify(payload), 200
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
                "content. Make sure to include all important information without omitting any context."
                "Summarize in a manner that is concise and doesnt use any bullet points or decorative formatting. "
                "The summary should be in plain text format with no spaces or newlines."
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
            summary_text = "".join(
                part.text for part in candidate.content.parts).strip() or pdf_text
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
            # "debug": debug,
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


@app.route("/thread/create_chat_thread", methods=["POST"])
def create_chat_thread():
    try:
        data = request.get_json(force=True, silent=True) or {}
        eta_id = (data.get(PRIMARY_KEY) or data.get("eta_id") or
                  data.get("etaId") or "").strip()
        if not eta_id:
            return jsonify({"error": "Missing eta_id"}), 400

        item, upload_date = _fetch_latest_user_item(eta_id)
        if not item:
            return jsonify({"error": "User not found"}), 404

        chat_history = _normalize_chat_history(item.get("ChatHistory", []))
        proposed_chat_id = str(
            data.get("chatID") or data.get("chatId") or uuid.uuid4())
        existing_ids = {thread["ChatID"] for thread in chat_history}
        while proposed_chat_id in existing_ids:
            proposed_chat_id = str(uuid.uuid4())

        title = (data.get("title") or "").strip()
        new_thread = {
            "ChatID": proposed_chat_id,
            "Title": title or f"Session {len(chat_history) + 1}",
            "CreatedAt": _to_iso_timestamp(),
            "Messages": [],
        }
        chat_history.append(new_thread)
        _persist_chat_history(eta_id, upload_date, chat_history)
        return jsonify({"thread": new_thread}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/thread/get_chat_thread/", methods=["GET"])
def get_chat_thread():
    try:
        eta_id = (request.args.get(PRIMARY_KEY) or request.args.get("eta_id")
                  or request.args.get("etaId") or "").strip()
        chat_id = (request.args.get("chatID") or
                   request.args.get("chatId") or "").strip()
        if not eta_id or not chat_id:
            return jsonify({"error": "Missing etaId or chatID parameter"}), 400

        item, upload_date = _fetch_latest_user_item(eta_id)
        if not item:
            return jsonify({"error": "User not found"}), 404

        chat_history = _normalize_chat_history(item.get("ChatHistory", []))
        if chat_history != item.get("ChatHistory"):
            _persist_chat_history(eta_id, upload_date, chat_history)

        for thread in chat_history:
            if str(thread.get("ChatID")) == chat_id:
                return jsonify({"thread": thread}), 200

        return jsonify({"error": "Chat thread not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Queries user message to model, then asks model for assistant response and adds both to thread


@app.route("/thread/add_message", methods=["POST"])
def add_message_to_thread():
    try:
        data = request.get_json(force=True, silent=True) or {}
        eta_id = (data.get(PRIMARY_KEY) or data.get("eta_id") or
                  data.get("etaId") or "").strip()
        chat_id = (data.get("chatID") or data.get("chatId") or "").strip()
        message = (data.get("message") or "").strip()
        persona = (data.get("persona") or data.get("persona_id")
                   or data.get("personaId") or "").strip().lower()

        if not all([eta_id, chat_id, message]):
            return jsonify({"error": "Missing required fields"}), 400

        item, upload_date = _fetch_latest_user_item(eta_id)
        if not item:
            return jsonify({"error": "User not found"}), 404

        chat_history = _normalize_chat_history(item.get("ChatHistory", []))
        thread = next(
            (t for t in chat_history if str(t.get("ChatID")) == chat_id), None)

        if not thread:
            return jsonify({"error": "Chat thread not found"}), 404

        context = item.get("Context", [])
        persona_prompts = {
            "professor": "You are a structured, thoughtful professor guiding a student through complex material with clarity.",
            "study-buddy": "You are a supportive study buddy who keeps explanations friendly, collaborative, and encouraging.",
            "exam-coach": "You are a high-energy exam coach focused on concise strategies, confidence, and rapid recall.",
        }
        persona_prompt = persona_prompts.get(
            persona, persona_prompts["professor"])

        _append_message(thread, "user", message)

        recent_messages = thread["Messages"][-12:]
        history_lines = []
        for entry in recent_messages:
            speaker = "User" if entry["role"] == "user" else "Assistant"
            history_lines.append(f"{speaker}: {entry['content']}")
        history_text = "\n".join(history_lines)

        context_snippets = []
        for ctx in context or []:
            if isinstance(ctx, dict):
                snippet = ctx.get("summary") or ctx.get("content")
            else:
                snippet = str(ctx)
            if snippet:
                context_snippets.append(str(snippet))
        context_text = "\n".join(context_snippets)

        full_prompt = (
            f"{persona_prompt}\n\n"
            "Relevant context (you may reference this if it helps):\n"
            f"{context_text or 'No additional context has been provided.'}\n\n"
            "Conversation so far:\n"
            f"{history_text}\n\n"
            "Respond as the assistant to the final user message, in a way that aligns with your persona. "
            "Keep the response concise but thorough enough to be useful."
        )

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    {
                        "role": "user",
                        "parts": [{"text": full_prompt}],
                    }
                ],
            )
            candidate = response.candidates[0]
            assistant_message = "".join(
                part.text for part in candidate.content.parts).strip()
        except Exception as exc:  # pragma: no cover - API fallback
            app.logger.warning(
                "Gemini generation failed: %s", exc, exc_info=True)
            assistant_message = "I'm sorry, I couldn't process that just yet. Could you try rephrasing or asking again?"

        if assistant_message:
            _append_message(thread, "assistant", assistant_message)

        thread["Messages"] = thread["Messages"][-40:]
        thread["UpdatedAt"] = _to_iso_timestamp()
        _persist_chat_history(eta_id, upload_date, chat_history)

        payload = {
            "thread": thread,
            "assistant_message": assistant_message,
        }
        return jsonify(payload), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/thread/generate_ai_response", methods=["POST"])
def generate_ai_response():
    return jsonify({
        "error": "This endpoint has been replaced by /thread/add_message."
    }), 410


@app.route("/generate-practice-problems", methods=["POST"])
def generate_practice_problems():
    try:
        payload = request.get_json(silent=True) or {}
        eta_id = (payload.get(PRIMARY_KEY) or payload.get("eta_id") or payload.get("etaId") or
                  request.form.get(PRIMARY_KEY) or request.form.get("etaId") or "").strip()
        chat_id = (payload.get("chatID") or payload.get("chatId") or
                   request.form.get("chatID") or request.form.get("chatId") or "").strip()
        message = (payload.get("message") or request.form.get("message") or "").strip()

        if not eta_id or not chat_id:
            return jsonify({"error": "Missing required fields"}), 400

        item, upload_date = _fetch_latest_user_item(eta_id)
        if not item:
            return jsonify({"error": "User not found"}), 404

        chat_history = _normalize_chat_history(item.get("ChatHistory", []))
        context = item.get("Context", [])
        thread = next(
            (t for t in chat_history if str(t.get("ChatID")) == chat_id), None)
        if not thread:
            return jsonify({"error": "Chat thread not found"}), 404

        history_lines = []
        for entry in thread.get("Messages", [])[-12:]:
            speaker = "User" if entry["role"] == "user" else "Assistant"
            history_lines.append(f"{speaker}: {entry['content']}")
        history_text = "\n".join(history_lines)

        context_snippets = []
        for ctx in context or []:
            if isinstance(ctx, dict):
                snippet = ctx.get("summary") or ctx.get("content")
            else:
                snippet = str(ctx)
            if snippet:
                context_snippets.append(str(snippet))
        context_text = "\n".join(context_snippets)

        user_request = message or "Prepare a short set of practice problems that reinforce the key concepts we've discussed."
        prompt = (
            "You are an educational assistant crafting targeted practice problems.\n"
            "Use the conversation history and context below to generate concise, solvable problems. "
            "Provide numbered problems and keep explanations short unless requested otherwise.\n\n"
            f"Conversation history:\n{history_text or 'No prior conversation.'}\n\n"
            f"Context:\n{context_text or 'No additional context provided.'}\n\n"
            f"User request: {user_request}\n"
            "Respond with the practice problems only."
        )

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    {
                        "role": "user",
                        "parts": [{"text": prompt}],
                    }
                ],
            )
            candidate = response.candidates[0]
            assistant_message = "".join(
                part.text for part in candidate.content.parts).strip()
        except Exception as exc:
            app.logger.warning(
                "Gemini practice generation failed: %s", exc, exc_info=True)
            assistant_message = "I wasn't able to generate practice problems right now. Please try again shortly."

        if assistant_message:
            _append_message(thread, "assistant", assistant_message)
            thread["Messages"] = thread["Messages"][-40:]
            thread["UpdatedAt"] = _to_iso_timestamp()
            _persist_chat_history(eta_id, upload_date, chat_history)

        return jsonify({
            "message": "Practice problems generated successfully",
            "practice_problems": assistant_message,
            "thread": thread,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/generate-weekly-plan", methods=["POST"])
def generate_weekly_plan():
    try:
        payload = request.get_json(silent=True) or {}
        eta_id = (payload.get(PRIMARY_KEY) or payload.get("eta_id") or payload.get("etaId") or
                  request.form.get(PRIMARY_KEY) or request.form.get("etaId") or "").strip()
        chat_id = (payload.get("chatID") or payload.get("chatId") or
                   request.form.get("chatID") or request.form.get("chatId") or "").strip()
        if not eta_id or not chat_id:
            return jsonify({"error": "Missing required fields"}), 400

        item, upload_date = _fetch_latest_user_item(eta_id)
        if not item:
            return jsonify({"error": "User not found"}), 404

        chat_history = _normalize_chat_history(item.get("ChatHistory", []))
        context = item.get("Context", [])
        thread = next(
            (t for t in chat_history if str(t.get("ChatID")) == chat_id), None)
        if not thread:
            return jsonify({"error": "Chat thread not found"}), 404

        messages = thread.get("Messages", [])
        history_lines = []
        for entry in messages[-16:]:
            speaker = "User" if entry["role"] == "user" else "Assistant"
            history_lines.append(f"{speaker}: {entry['content']}")
        history_text = "\n".join(history_lines)

        context_lines = []
        for ctx in context or []:
            if isinstance(ctx, dict):
                snippet = ctx.get("summary") or ctx.get("content")
            else:
                snippet = str(ctx)
            if snippet:
                context_lines.append(str(snippet))
        context_text = "\n".join(context_lines)

        prompt = (
            "You are an educational assistant creating a concise yet actionable weekly study plan.\n"
            "Consider the learner's recent conversation and their stored context to produce a plan covering seven days. "
            "Each day should include focus topics, estimated time, and a quick rationale. "
            "Keep the tone encouraging and organized with clear headings.\n\n"
            f"Conversation history:\n{history_text or 'No recent conversation available.'}\n\n"
            f"Context:\n{context_text or 'No additional context provided.'}\n\n"
            "Deliver the weekly plan now."
        )

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    {
                        "role": "user",
                        "parts": [{"text": prompt}],
                    }
                ]
            )
            candidate = response.candidates[0]
            assistant_message = "".join(
                part.text for part in candidate.content.parts).strip()
        except Exception as exc:
            app.logger.warning(
                "Gemini weekly plan generation failed: %s", exc, exc_info=True)
            assistant_message = "I wasn't able to prepare the weekly plan just now. Please give it another go soon."

        if assistant_message:
            _append_message(thread, "assistant", assistant_message)
            thread["Messages"] = thread["Messages"][-40:]
            thread["UpdatedAt"] = _to_iso_timestamp()
            _persist_chat_history(eta_id, upload_date, chat_history)

        return jsonify({
            "message": "Weekly plan generated successfully",
            "weekly_plan": assistant_message,
            "thread": thread,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/generate-notes", methods=["POST"])
def generate_notes():
    try:
        payload = request.get_json(silent=True) or {}
        eta_id = (payload.get(PRIMARY_KEY) or payload.get("eta_id") or payload.get("etaId") or
                  request.form.get(PRIMARY_KEY) or request.form.get("etaId") or "").strip()
        chat_id = (payload.get("chatID") or payload.get("chatId") or
                   request.form.get("chatID") or request.form.get("chatId") or "").strip()
        if not eta_id or not chat_id:
            return jsonify({"error": "Missing etaId or chat_id parameter"}), 400

        item, upload_date = _fetch_latest_user_item(eta_id)
        if not item:
            return jsonify({"error": "User not found"}), 404

        chat_history = _normalize_chat_history(item.get("ChatHistory", []))
        chat_thread = next(
            (t for t in chat_history if str(t.get("ChatID")) == chat_id), None)
        if not chat_thread:
            return jsonify({"error": "Chat thread not found"}), 404

        assistant_messages = [
            entry["content"] for entry in chat_thread.get("Messages", [])
            if entry["role"] == "assistant"
        ]

        if not assistant_messages:
            return jsonify({"error": "No messages found in chat thread"}), 404

        notes = "\n\n".join(assistant_messages)
        summary = notes[:3000]
        chat_thread["Notes"] = summary
        chat_thread["UpdatedAt"] = _to_iso_timestamp()
        _persist_chat_history(eta_id, upload_date, chat_history)

        return jsonify({
            "message": "Notes generated successfully",
            "notes": summary
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/voice-response", methods=["POST"])
def get_voice_response() -> bytes:
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    persona = (payload.get("persona") or "").strip()
    eta_id = (payload.get(PRIMARY_KEY) or payload.get("eta_id") or payload.get("etaId") or
              request.form.get(PRIMARY_KEY) or request.form.get("etaId") or "").strip()
    chat_id = (payload.get("chatID") or payload.get("chatId") or
               request.form.get("chatID") or request.form.get("chatId") or "").strip()

    if not all([eta_id, chat_id]):
        return jsonify({"error": "Missing etaId or chat_id parameter"}), 400

    item, _ = _fetch_latest_user_item(eta_id)
    if not item:
        return jsonify({"error": "User not found"}), 404
    
    item, upload_date = _fetch_latest_user_item(eta_id)
    chat_history = _normalize_chat_history(item.get("ChatHistory", []))
    thread = next(
        (t for t in chat_history if str(t.get("ChatID")) == chat_id), None)
    if not thread:
        return jsonify({"error": "Chat thread not found"}), 404

    context = item.get("Context", [])
    history_lines = []
    for entry in thread.get("Messages", [])[-16:]:
        speaker = "User" if entry["role"] == "user" else "Assistant"
        history_lines.append(f"{speaker}: {entry['content']}")
    history = "\n".join(history_lines)

    context_lines = []
    for ctx in context or []:
        if isinstance(ctx, dict):
            snippet = ctx.get("summary") or ctx.get("content")
        else:
            snippet = str(ctx)
        if snippet:
            context_lines.append(str(snippet))
    context_string = "\n".join(context_lines)

    if not question or not persona:
        return jsonify({"error": "Missing question or persona"}), 400

    module = ElevenLabsModule()
    module.load_env()
    persona_prompt, persona_voice = module.resolve_persona(
        persona, os.getenv("SYSTEM_PROMPT"))
    system_prompt = "\n\n".join(
        part for part in [persona_prompt, history, context_string] if part)

    ans = module.gemini_reply(question, system_prompt=system_prompt)
    animation = module.gemini_reply_emotion(ans)
    table.update_item(
        Key={
            PRIMARY_KEY: eta_id,
            "UploadDate": upload_date,
        },
        UpdateExpression="SET #ctx = list_append(if_not_exists(#ctx, :empty), :new)",
        ExpressionAttributeNames={"#ctx": "Context"},
        ExpressionAttributeValues={
            ":empty": [],
            ":new": [{
                "type": "voice_reply",
                "summary": ans,
                "uploaded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }],
        },
    )
    voiceBytes = module.elevenlabs_speech(
        ans, voice_id=persona_voice)
    response = make_response(voiceBytes)
    response.headers["Content-Type"] = "audio/mpeg"
    if animation:
        response.headers["X-Animation"] = animation
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env.get("PORT", 3000)))
