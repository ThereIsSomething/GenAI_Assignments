import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

function App() {
  const [personas, setPersonas] = useState([]);
  const [activePersonaId, setActivePersonaId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const messagesRef = useRef(null);

  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === activePersonaId),
    [activePersonaId, personas]
  );

  useEffect(() => {
    async function loadPersonas() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/personas`);
        if (!response.ok) throw new Error("Could not load personas from the backend.");
        const data = await response.json();
        setPersonas(data.personas);
        setActivePersonaId(data.personas[0]?.id || "");
      } catch (error) {
        setLoadError(error.message || "Backend is not reachable right now.");
      }
    }

    loadPersonas();
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  function switchPersona(personaId) {
    if (personaId === activePersonaId || isSending) return;
    setActivePersonaId(personaId);
    setMessages([]);
    setDraft("");
  }

  async function sendMessage(text = draft) {
    const content = text.trim();
    if (!content || !activePersona || isSending) return;

    const nextMessages = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: activePersona.id,
          messages: nextMessages,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "The chatbot could not respond right now.");
      }

      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "system",
          content:
            error.message ||
            "Something went wrong. Check the backend URL, Render env vars, and Gemini key.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <main className="app-shell">
      <aside className="side-panel">
        <div>
          <p className="eyebrow">Assignment 01</p>
          <h1>Scaler Persona Chat</h1>
          <p className="intro">
            Three researched mentor-style prompts, one clean chat surface.
          </p>
        </div>

        <div className="persona-list" aria-label="Choose persona">
          {personas.map((persona) => (
            <button
              className={`persona-button ${persona.id === activePersonaId ? "active" : ""}`}
              key={persona.id}
              type="button"
              onClick={() => switchPersona(persona.id)}
              disabled={isSending}
            >
              <span>{persona.name}</span>
              <small>{persona.shortTitle}</small>
            </button>
          ))}
        </div>

        <div className="active-card">
          <p className="eyebrow">Active persona</p>
          <strong>{activePersona?.name || "Loading..."}</strong>
          <span>{activePersona?.shortTitle || "Connecting to backend"}</span>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-topbar">
          <div>
            <p className="eyebrow">Conversation</p>
            <h2>{activePersona?.name || "Loading personas"}</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setMessages([])}
            disabled={isSending}
          >
            Reset
          </button>
        </header>

        <div className="messages" ref={messagesRef}>
          {loadError ? (
            <Message role="system" content={loadError} />
          ) : messages.length === 0 ? (
            <Message
              role="assistant"
              content={
                activePersona
                  ? `Ready as ${activePersona.name}. Pick a suggestion or ask a question.`
                  : "Loading personas from the backend..."
              }
            />
          ) : (
            messages.map((message, index) => (
              <Message key={`${message.role}-${index}`} {...message} />
            ))
          )}

          {isSending && (
            <div className="message assistant">
              <div className="typing" aria-label="Typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        <div className="suggestions" aria-label="Suggested questions">
          {activePersona?.suggestions.map((question) => (
            <button
              className="suggestion-chip"
              key={question}
              type="button"
              onClick={() => sendMessage(question)}
              disabled={isSending}
            >
              {question}
            </button>
          ))}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about learning, careers, projects, or interviews..."
            rows={1}
            maxLength={1200}
            disabled={isSending || Boolean(loadError)}
          />
          <button type="submit" disabled={isSending || !draft.trim() || Boolean(loadError)}>
            Send
          </button>
        </form>
      </section>
    </main>
  );
}

function Message({ role, content }) {
  return <div className={`message ${role}`}>{content}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
