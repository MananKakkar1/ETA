import os
from pathlib import Path

import requests
from dotenv import load_dotenv
import google.generativeai as genai

DEFAULT_SYSTEM_PROMPT = (
    "You are ETA, a concise teaching assistant who explains concepts clearly."
)
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2"
DEFAULT_ELEVEN_MODEL = "eleven_multilingual_v2"

PERSONAS = {
    "professor": {
        "voice_env": "ELEVENLABS_VOICE_PROFESSOR",
        "prompt_suffix": (
            "Adopt the voice of a thoughtful professor—structured, calm, and "
            "paced to unpack theory step by step."
        ),
    },
    "study buddy": {
        "voice_env": "ELEVENLABS_VOICE_STUDY_BUDDY",
        "prompt_suffix": (
            "Speak like a friendly study buddy, conversational and reassuring, "
            "highlighting key takeaways with relatable examples."
        ),
    },
    "exam coach": {
        "voice_env": "ELEVENLABS_VOICE_EXAM_COACH",
        "prompt_suffix": (
            "Sound like a high-energy exam coach who motivates, keeps momentum, "
            "and emphasises actionable tips."
        ),
    },
}

class ElevenLabsModule:
    def __init__(self):
        pass

    def load_env(self) -> None:
        env = Path(__file__).with_name(".env")
        if env.exists():
            load_dotenv(env)


    def resolve_persona(self,
        persona_name: str | None, base_prompt: str
    ) -> tuple[str, str]:
        fallback_voice = os.getenv("ELEVENLABS_VOICE_ID", DEFAULT_VOICE_ID)
        if not persona_name:
            return base_prompt, fallback_voice

        persona = PERSONAS.get(persona_name.lower())
        if not persona:
            return base_prompt, fallback_voice

        persona_voice = os.getenv(persona["voice_env"], fallback_voice)
        persona_prompt = f"{base_prompt}\n\nPersona instructions: {persona['prompt_suffix']}"
        return persona_prompt, persona_voice


    def gemini_reply(self, question: str, system_prompt: str) -> str:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY missing")

        model_name = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
        genai.configure(api_key=key)
        model = genai.GenerativeModel(model_name)

        result = model.generate_content(
            [
                {"role": "user", "parts": [system_prompt]},
                {"role": "user", "parts": [question]},
            ]
        )
        text = (result.text or "").strip()
        if not text:
            raise RuntimeError("Gemini returned empty text")
        return text


    def elevenlabs_speech(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        model_id: str | None = None,
    ) -> bytes:
        api_key = os.getenv("ELEVENLABS_API_KEY")
        if not api_key:
            raise RuntimeError("ELEVENLABS_API_KEY missing")

        resolved_voice = voice_id or os.getenv("ELEVENLABS_VOICE_ID", DEFAULT_VOICE_ID)
        resolved_model = model_id or os.getenv("ELEVENLABS_MODEL_ID", DEFAULT_ELEVEN_MODEL)

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{resolved_voice}/stream"
        response = requests.post(
            url,
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={"text": text, "model_id": resolved_model},
            stream=True,
            timeout=60,
        )
        response.raise_for_status()

        audio_chunks = bytearray()
        for chunk in response.iter_content(8192):
            if chunk:
                audio_chunks.extend(chunk)
        return bytes(audio_chunks)


    def prompt_for_persona(self, default: str | None) -> str | None:
        if default:
            return default

        print("Available personas: Professor, Study Buddy, Exam Coach")
        choice = input("Choose a persona (press enter for default voice): ").strip()
        return choice or None


# def main() -> None:
#     load_env()

#     question = os.getenv("QUESTION") or input("Enter your question: ").strip()
#     if not question:
#         raise RuntimeError("Need a question")

#     base_prompt = os.getenv("SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT)
#     persona_choice = prompt_for_persona(os.getenv("ELEVENLABS_PERSONA"))
#     persona_prompt, persona_voice = resolve_persona(persona_choice, base_prompt)

#     print("Generating answer...")
#     answer = gemini_reply(question, persona_prompt)

#     print("Generating audio...")
#     audio_path = Path(os.getenv("ELEVENLABS_OUTPUT_FILE", "elevenlabs_response.mp3"))
#     elevenlabs_speech(answer, audio_path, voice_id=persona_voice)

#     print(f"Synthesized audio saved to {audio_path.resolve()}")
