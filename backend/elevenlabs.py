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

CREATE_ENDPOINTS = (
    (
        f"{CONVAI_BASE_URL}/conversation",
        {"agent_id": AGENT_ID},
        f"{CONVAI_BASE_URL}/conversation/{{conversation_id}}/stream",
    ),
    (
        f"{CONVAI_BASE_URL}/conversations",
        {"agent_id": AGENT_ID},
        f"{CONVAI_BASE_URL}/conversations/{{conversation_id}}/stream",
    ),
    (
        f"{CONVAI_BASE_URL}/agents/{AGENT_ID}/conversation",
        {},
        f"{CONVAI_BASE_URL}/conversation/{{conversation_id}}/stream",
    ),
    (
        f"{CONVAI_BASE_URL}/agents/{AGENT_ID}/conversations",
        {},
        f"{CONVAI_BASE_URL}/conversations/{{conversation_id}}/stream",
    ),
)


def create_conversation() -> tuple[str, str]:
    """Create a new conversation and return the id and matching stream URL."""
    errors: list[str] = []

    for url, payload, stream_template in CREATE_ENDPOINTS:
        response = requests.post(
            url,
            headers={
                "xi-api-key": API_KEY,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload or None,
            timeout=15,
        )
        if response.ok:
            data = response.json()
            conversation_id = (
                data.get("conversation_id")
                or data.get("conversation", {}).get("id")
                or data.get("id")
            )
            if not conversation_id:
                errors.append(f"{url} -> missing conversation_id in {data}")
                continue
            return conversation_id, stream_template.format(
                conversation_id=conversation_id
            )

        allow = response.headers.get("Allow")
        errors.append(
            f"{url} -> {response.status_code}, allow={allow}, body={response.text}"
        )

    raise RuntimeError(
        "Unable to create ElevenLabs conversation via documented endpoints. "
        + " | ".join(errors)
    )


def fetch_agent_audio(prompt: str) -> Iterator[bytes]:
    """Yield audio chunks returned by the ElevenLabs agent."""
    conversation_id, stream_url = create_conversation()

    with requests.post(
        stream_url,
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
