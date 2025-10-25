import os
import subprocess
import tempfile
from pathlib import Path
from typing import Iterator

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

API_KEY = os.environ["ELEVENLABS_API_KEY"]
AGENT_ID = os.environ["ELEVENLABS_AGENT_ID"]
CONVAI_BASE_URL = "https://api.elevenlabs.io/v1/convai"
CONVAI_CREATE_URL = f"{CONVAI_BASE_URL}/conversation"
CONVAI_STREAM_URL = (
    f"{CONVAI_BASE_URL}/conversation/{{conversation_id}}/stream"
)


def create_conversation() -> str:
    """Create a new conversation for the configured agent."""
    response = requests.post(
        CONVAI_CREATE_URL,
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
        },
        json={"agent_id": AGENT_ID},
        timeout=15,
    )
    if response.status_code >= 400:
        allow = response.headers.get("Allow")
        raise RuntimeError(
            "Failed to create conversation "
            f"({response.status_code}, allow={allow}): {response.text}"
        )
    data = response.json()
    return data["conversation_id"]


def fetch_agent_audio(prompt: str) -> Iterator[bytes]:
    """Yield audio chunks returned by the ElevenLabs agent."""
    conversation_id = create_conversation()

    with requests.post(
        CONVAI_STREAM_URL.format(conversation_id=conversation_id),
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "agent_id": AGENT_ID,
            "conversation_id": conversation_id,
            "input": prompt,
            "modalities": ["audio"],
        },
        stream=True,
        timeout=60,
    ) as response:
        if response.status_code >= 400:
            allow = response.headers.get("Allow")
            raise RuntimeError(
                "Failed to stream audio "
                f"({response.status_code}, allow={allow}): {response.text}"
            )
        for chunk in response.iter_content(chunk_size=4096):
            if chunk:
                yield chunk


def speak_with_agent(prompt: str) -> None:
    """Send text to the ElevenLabs agent, save the reply, and play it."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_file:
        for chunk in fetch_agent_audio(prompt):
            tmp_file.write(chunk)
        temp_path = tmp_file.name

    try:
        subprocess.run(["afplay", temp_path], check=True)
    finally:
        os.remove(temp_path)


if __name__ == "__main__":
    speak_with_agent("Teach me about the theory of relativity in simple terms.")
