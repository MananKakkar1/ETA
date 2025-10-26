import io
import datetime
import uuid
from os import environ as env
import os
from anyio import Path
import pypdf
import PyPDF2
import boto3
from boto3.dynamodb.conditions import Key
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import find_dotenv, load_dotenv
from elevenlabs import ElevenLabsModule
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
                'ChatHistory': [],
                'Context': [],
                'Uploads': [],
            }
        )

        status_code = response.get(
            "ResponseMetadata", {}).get("HTTPStatusCode")
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
        data = request.get_json()
        # Assume that the etaID is already provided
        user_id = data.get(PRIMARY_KEY)
        user = table.get_item(KeyConditionExpression=Key(
            PRIMARY_KEY).eq(user_id), Limit=1, ScanIndexForward=False)
        chats = user.get("Items", [])[0].get("ChatHistory", [])
        if not chats:
            return jsonify({"error": "No chat history found for user"}), 404
        new_thread = {'ChatID': len(chats), 'Messages': []}
        chats.append(new_thread)
        table.update_item(
            Key={
                PRIMARY_KEY: user_id,
                'UploadDate': user.get("Items", [])[0].get("UploadDate"),
            },
            UpdateExpression="SET ChatHistory = :chats",
            ExpressionAttributeValues={":chats": chats}
        )
        return jsonify({"message": "Chat thread created successfully", "chat_id": new_thread['ChatID']}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/thread/get_chat_thread/", methods=["GET"])
def get_chat_thread():
    try:
        data = request.get_json()
        eta_id = data.get(PRIMARY_KEY)
        chat_id = data.get("chatID")
        if not eta_id:
            return jsonify({"error": "Missing etaId parameter"}), 400

        response = table.query(
            KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            return jsonify({"error": "User not found"}), 404

        chat_history = items[0].get("ChatHistory", [])
        for thread in chat_history:
            if str(thread.get("ChatID")) == chat_id:
                return jsonify({"chat_thread": thread}), 200

        return jsonify({"error": "Chat thread not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Queries user message to model, then asks model for assistant response and adds both to thread


@app.route("/thread/add_message", methods=["POST"])
def add_message_to_thread():
    try:
        data = request.get_json()
        eta_id = data.get(PRIMARY_KEY)
        chat_id = data.get("chatID")
        message = data.get("message")
        if not all([eta_id, chat_id, message]):
            return jsonify({"error": "Missing required fields"}), 400
        response = table.query(
            KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            return jsonify({"error": "User not found"}), 404
        chat_history = items[0].get("ChatHistory", [])
        if not chat_history:
            return jsonify({"error": "No chat history found for user"}), 404
        for thread in chat_history:
            if str(thread.get("ChatID")) == chat_id:
                thread.append(('User', message))
                break
        if len(thread) > 20:
            thread = thread[-20:]
        table.update_item(
            Key={
                PRIMARY_KEY: eta_id,
                'UploadDate': items[0].get("UploadDate"),
            },
            UpdateExpression="SET ChatHistory = :chats",
            ExpressionAttributeValues={":chats": chat_history}
        )
        return jsonify({"message": "Message added successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/thread/generate_ai_response", methods=["POST"])
def generate_ai_response(eta_id, chat_id, message, chat_history, items):
    try:
        data = request.get_json()
        eta_id = data.get(PRIMARY_KEY)
        chat_id = data.get("chatID")
        message = data.get("message")
        if not all([eta_id, chat_id, message]):
            return jsonify({"error": "Missing required fields"}), 400
        response = table.query(
            KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            return jsonify({"error": "User not found"}), 404
        chat_history = items[0].get("ChatHistory", [])
        if not chat_history:
            return jsonify({"error": "No chat history found for user"}), 404
        try:
            prompt = ("You are an educational assistant. Respond to the user's message thoughtfully and helpfully."
                      "Ensure your response is clear, concise, and informative, while maintaining a friendly and approachable tone.")
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    {
                        "role": "user",
                        "parts": [{"text": prompt,
                                   "text": message}],
                    }
                ],
            )
            candidate = response.candidates[0]
            assistant_message = "".join(
                part.text for part in candidate.content.parts).strip()
        except Exception as exc:
            assistant_message = "I'm sorry, I couldn't process your request at the moment."
        for thread in chat_history:
            if str(thread.get("ChatID")) == chat_id:
                thread.append(('User', message))
                thread.append(('Assistant', assistant_message))
                break
        if len(thread) > 20:
            thread = thread[-20:]
        table.update_item(
            Key={
                PRIMARY_KEY: eta_id,
                'UploadDate': items[0].get("UploadDate"),
            },
            UpdateExpression="SET ChatHistory = :chats",
            ExpressionAttributeValues={":chats": chat_history}
        )
        return jsonify({"message": "Message added successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/generate-practice-problems", methods=["POST"])
def generate_practice_problems():
    try:
        eta_id = request.form.get("etaId")
        chat_id = request.form.get("chatId")
        message = request.form.get("message")

        if not all([eta_id, chat_id]):
            return jsonify({"error": "Missing required fields"}), 400
        response = table.query(
            KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            return jsonify({"error": "User not found"}), 404
        chat_history = items[0].get("ChatHistory", [])
        context = items[0].get("Context", [])
        if not chat_history or not context:
            return jsonify({"error": "No chat history found for user"}), 404
        # Then get the assistant's response from the AI model
        try:
            prompt = ("You are an educational assistant. Respond to the user's message thoughtfully and helpfully."
                      "Given the current chat history and the context, generate problems based on the context that will give the user a light challenge to enhance their learning.")
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    {
                        "role": "user",
                        "parts": [{"text": prompt,
                                   "text": message}],
                    }
                ],
            )
            candidate = response.candidates[0]
            assistant_message = "".join(
                part.text for part in candidate.content.parts).strip()
        except Exception as exc:
            assistant_message = "I'm sorry, I couldn't process your request at the moment."
        for thread in chat_history:
            if str(thread.get("ChatID")) == chat_id:
                messages = thread.get("Messages", [])
                if not messages:
                    []
                messages.append(('Assistant', assistant_message))
                break
        else:
            return jsonify({"error": "Chat thread not found"}), 404

        table.update_item(
            Key={
                PRIMARY_KEY: eta_id,
                'UploadDate': items[0].get("UploadDate"),
            },
            UpdateExpression="SET ChatHistory = :chats",
            ExpressionAttributeValues={":chats": chat_history}
        )
        return jsonify({"message": "Message added successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    except Exception as exc:
        return jsonify({"error"})


@app.route("/generate-weekly-plan", methods=["POST"])
def generate_weekly_plan():
    try:
        eta_id = request.form.get("etaId")
        chat_id = request.form.get("chatId")
        if not all([eta_id, chat_id]):
            return jsonify({"error": "Missing required fields"}), 400
        response = table.query(
            KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            return jsonify({"error": "User not found"}), 404
        chat_history = items[0].get("ChatHistory", [])
        context = items[0].get("Context", [])
        if not chat_history or not context:
            return jsonify({"error": "No chat history/context found for user"}), 404
        thread = None
        for t in chat_history:
            if str(t.get("ChatID")) == chat_id:
                thread = t
                break
        if not thread:
            return jsonify({"error": "Chat thread not found"}), 404
        # Then get the assistant's response from the AI model
        try:
            prompt = ("You are an educational assistant. Based on the user's context, generate a detailed weekly study plan to help them effectively learn the material. "
                      "Break down the content into manageable sections and suggest daily study goals, including time allocations and key focus areas."
                      "Ensure that the plan is realistic and adaptable to the user's schedule, and ensure that the plan remains clear and concise, without losing details.")
            history = ""
            messages = thread.get("Messages", [])
            for role, msg in messages:
                history += f"{role}: {msg}\n"
            context_string = ""
            for ctx in context:
                context_string += f"{ctx.get('summary', '')}\n"
            prompt += f"\n\nContext:\n{context_string}"
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    {
                        "text": prompt,
                        "text": history,
                        "text": context_string,
                    }
                ]
            )
            candidate = response.candidates[0]
            assistant_message = "".join(
                part.text for part in candidate.content.parts).strip()
        except Exception as exc:
            assistant_message = "I'm sorry, I couldn't process your request at the moment."
        messages.append(('Assistant', assistant_message))
        thread.Messages = messages
        table.update_item(
            Key={
                PRIMARY_KEY: eta_id,
                'UploadDate': items[0].get("UploadDate"),
            },
            UpdateExpression="SET ChatHistory = :chats",
            ExpressionAttributeValues={":chats": chat_history}
        )
        return jsonify({"message": "Weekly plan generated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/generate-notes", methods=["POST"])
def generate_notes():
    eta_id = request.form.get("etaId")
    chat_id = request.form.get("chatId")
    try:
        if not eta_id or not chat_id:
            return jsonify({"error": "Missing etaId or chat_id parameter"}), 400

        # Query the user's chat history
        response = table.query(
            KeyConditionExpression=Key(PRIMARY_KEY).eq(eta_id),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            return jsonify({"error": "User not found"}), 404

        chat_history = items[0].get("ChatHistory", [])
        chat_thread = None
        for thread in chat_history:
            if str(thread.get("ChatID")) == chat_id:
                chat_thread = thread
                break

        if not chat_thread:
            return jsonify({"error": "Chat thread not found"}), 404

        # Combine user and assistant messages
        all_messages = []
        for user_msg, assistant_msg in zip(
            chat_thread.get("User", []),
            chat_thread.get("Assistant", [])
        ):
            all_messages.append(f"User: {user_msg}")
            all_messages.append(f"Assistant: {assistant_msg}")

        if not all_messages:
            return jsonify({"error": "No messages found in chat thread"}), 404

        notes = " ".join(all_messages)
        summary = notes[:1000]
        chat_thread["Notes"] = summary
        table.update_item(
            Key={
                PRIMARY_KEY: eta_id,
                "UploadDate": items[0].get("UploadDate"),
            },
            UpdateExpression="SET ChatHistory = :chats",
            ExpressionAttributeValues={":chats": chat_history},
        )

        return jsonify({
            "message": "Notes generated successfully",
            "notes": summary
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/voice-response", methods=["POST"])
def get_voice_response() -> bytes:
    data = request.get_json()
    question = data.get("question")
    persona = data.get("persona")
    chat_id = request.form.get("chatId")
    # TODO: Give all context before asking for a reply.
    if not question or not persona:
        return jsonify({"error": "Missing question or persona"}), 400
    module = ElevenLabsModule()
    module.load_env()
    # env = Path(file).with_name(".env")
    # if env.exists():
    #     load_dotenv(env)
    personaPrompt, personaResolved = module.resolve_persona(
        persona, os.getenv("SYSTEM_PROMPT"))
    ans = module.gemini_reply(question, system_prompt=personaPrompt)
    animation = module.gemini_reply_emotion(ans)
    voiceBytes = module.elevenlabs_speech(
        ans, output=Path("output.mp3"), voice_id=personaResolved)
    return voiceBytes, animation


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env.get("PORT", 3000)))
