import { useMemo, useState } from "react";
import "./chat.css";

const DUMMY_THREADS = [
  {
    id: "relativity",
    title: "Special Relativity",
    summary: "Lorentz transforms · Time dilation · Twin paradox",
  },
  {
    id: "calculus-review",
    title: "Calculus Review",
    summary: "Limits · Derivatives · Integrals",
  },
  {
    id: "exam-prep",
    title: "Exam Coaching",
    summary: "Mock questions · Rapid recall · Motivation bursts",
  },
];

const PERSONAS = [
  { id: "professor", label: "Professor", accent: "Prof." },
  { id: "study-buddy", label: "Study Buddy", accent: "Buddy" },
  { id: "exam-coach", label: "Exam Coach", accent: "Coach" },
];

function PersonaTabs({ activePersona, onSelect }) {
  return (
    <div className="chat__personas">
      {PERSONAS.map((persona) => (
        <button
          key={persona.id}
          type="button"
          className={`chat__persona-btn${
            activePersona === persona.id ? " chat__persona-btn--active" : ""
          }`}
          onClick={() => onSelect(persona.id)}
        >
          <span className="chat__persona-accent">{persona.accent}</span>
          {persona.label}
        </button>
      ))}
    </div>
  );
}

function ChatSidebar({ onSelectThread }) {
  return (
    <aside className="chat__sidebar">
      <header className="chat__sidebar-header">
        <h2>Sessions</h2>
        <button type="button" className="cta cta--secondary chat__new-session">
          New Session
        </button>
      </header>
      <ul className="chat__thread-list">
        {DUMMY_THREADS.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              className="chat__thread-card"
              onClick={() => onSelectThread(thread.id)}
            >
              <h3>{thread.title}</h3>
              <p>{thread.summary}</p>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function MessageBubble({ role, content }) {
  const isAgent = role === "assistant";
  return (
    <div className={`chat__bubble${isAgent ? " chat__bubble--agent" : ""}`}>
      <div className="chat__bubble-meta">
        {isAgent ? "ETA" : "You"}
      </div>
      <p>{content}</p>
    </div>
  );
}

function ChatMessages({ messages }) {
  return (
    <div className="chat__messages">
      {messages.map((message, index) => (
        <MessageBubble key={`${message.role}-${index}`} {...message} />
      ))}
    </div>
  );
}

function Composer({ input, onChange, onSend, disabled }) {
  return (
    <form
      className="chat__composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <textarea
        value={input}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask your teaching assistant anything…"
        rows={2}
        disabled={disabled}
      />
      <div className="chat__composer-actions">
        <button className="cta cta--secondary" type="button" disabled>
          Attach
        </button>
        <button className="cta cta--primary" type="submit" disabled={disabled}>
          Send
        </button>
      </div>
    </form>
  );
}

function Chat() {
  const [persona, setPersona] = useState("professor");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      content:
        "Welcome back! Ready to continue your session? Choose a topic or ask away.",
    },
  ]);

  const personaDescriptor = useMemo(() => {
    switch (persona) {
      case "study-buddy":
        return "Friendly study buddy";
      case "exam-coach":
        return "High-energy exam coach";
      default:
        return "Structured professor";
    }
  }, [persona]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: input.trim() },
      {
        role: "assistant",
        content: `(${personaDescriptor}) I’ll log this question and fetch a response from ETA shortly.`,
      },
    ]);
    setInput("");
  };

  return (
    <div className="chat">
      <ChatSidebar onSelectThread={(thread) => console.log("open", thread)} />
      <section className="chat__panel">
        <header className="chat__header">
          <div>
            <h1>ETA Conversation</h1>
            <p>
              Persona: <strong>{personaDescriptor}</strong>
            </p>
          </div>
          <PersonaTabs activePersona={persona} onSelect={setPersona} />
        </header>

        <ChatMessages messages={messages} />

        <Composer
          input={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={false}
        />
      </section>
    </div>
  );
}

export default Chat;
