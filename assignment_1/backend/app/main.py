from __future__ import annotations

import os
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .personas import PERSONAS

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "").strip()
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

LOCAL_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}


def parse_origins(value: str) -> list[str]:
    configured = {origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()}
    return sorted(LOCAL_ORIGINS | configured)

app = FastAPI(
    title="Scaler Persona Chatbot",
    description="A persona-based AI chatbot for Assignment 01.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_origins(FRONTEND_ORIGIN),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    persona: str
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=20)


class ChatResponse(BaseModel):
    reply: str


def build_gemini_contents(messages: list[ChatMessage]) -> list[dict]:
    contents = []
    for message in messages:
        role = "user" if message.role == "user" else "model"
        contents.append({"role": role, "parts": [{"text": message.content}]})
    return contents


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/personas")
def list_personas() -> dict:
    return {
        "personas": [
            {
                "id": persona.id,
                "name": persona.name,
                "shortTitle": persona.short_title,
                "suggestions": persona.suggestions,
            }
            for persona in PERSONAS.values()
        ]
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    persona = PERSONAS.get(request.persona)
    if persona is None:
        raise HTTPException(status_code=404, detail="That persona is not available.")

    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key is missing. Add GEMINI_API_KEY to your .env file.",
        )

    payload = {
        "system_instruction": {"parts": [{"text": persona.system_prompt}]},
        "contents": build_gemini_contents(request.messages),
        "generationConfig": {
            "temperature": persona.temperature,
            "topP": 0.9,
            "maxOutputTokens": 700,
        },
    }
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }
    url = GEMINI_ENDPOINT.format(model=GEMINI_MODEL)

    try:
        async with httpx.AsyncClient(timeout=35) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        detail = "Gemini could not answer right now. Please check your API key, model, or quota."
        try:
            api_error = exc.response.json().get("error", {}).get("message")
            if api_error:
                detail = f"Gemini error: {api_error}"
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not reach Gemini. Please check your internet connection and try again.",
        ) from exc

    try:
        reply = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Gemini returned an unexpected response. Please try again.",
        ) from exc

    if not reply:
        raise HTTPException(status_code=502, detail="Gemini returned an empty response.")

    return ChatResponse(reply=reply)
