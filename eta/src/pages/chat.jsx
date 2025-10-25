import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Avatar } from "../Avatar.jsx";
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
  {
    id: "professor",
    tabLabel: "Professor",
    accent: "Prof.",
    displayLabel: "ETA (Professor)",
    summary: "Structured professor",
  },
  {
    id: "study-buddy",
    tabLabel: "Study Buddy",
    accent: "Buddy",
    displayLabel: "ETA (Study Buddy)",
    summary: "Friendly study buddy",
  },
  {
    id: "exam-coach",
    tabLabel: "Exam Coach",
    accent: "Coach",
    displayLabel: "ETA (Exam Coach)",
    summary: "High-energy exam coach",
  },
];

const PERSONA_MAP = PERSONAS.reduce((acc, persona) => {
  acc[persona.id] = persona;
  return acc;
}, {});

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
          {persona.tabLabel}
        </button>
      ))}
    </div>
  );
}

function ChatSidebar({ onSelectThread, personaLabel, isSpeaking }) {
  return (
    <aside className="chat__sidebar">
      <div className="chat__avatar-shell">
        <AvatarPreview isSpeaking={isSpeaking} personaLabel={personaLabel} />
      </div>
      <div className="chat__sessions-card">
        <header className="chat__sessions-header">
          <h2>Sessions</h2>
          <button type="button" className="chat__new-session">
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
      </div>
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
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={listRef} className="chat__messages">
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

function AvatarPreview({ isSpeaking, personaLabel }) {
  return (
    <div className="chat__avatar-card">
      <div className="chat__avatar-wrapper">
        <Canvas camera={{ position: [0, 1.4, 2.2], fov: 38 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[2.5, 4, 3]} intensity={0.9} />
          <Avatar position={[0, -1.05, 0]} isSpeaking={isSpeaking} />
          <OrbitControls enablePan={false} enableZoom={false} />
          <Environment preset="city" />
        </Canvas>
      </div>
      <div className="chat__avatar-caption">
        <span className="chat__avatar-label">Active Persona</span>
        <p>{personaLabel}</p>
      </div>
    </div>
  );
}

function Chat() {
  const [persona, setPersona] = useState("professor");
  const [input, setInput] = useState("");
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const speakingTimerRef = useRef(null);
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      content:
        "Welcome back! Ready to continue your session? Choose a topic or ask away.",
    },
  ]);

  const personaDetails = useMemo(
    () => PERSONA_MAP[persona] ?? PERSONA_MAP["professor"],
    [persona]
  );

  useEffect(
    () => () => {
      if (speakingTimerRef.current) {
        clearTimeout(speakingTimerRef.current);
      }
    },
    []
  );

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: input.trim() },
      {
        role: "assistant",
        content: `${personaDetails.displayLabel}: I’ll log this question and fetch a response shortly with a ${personaDetails.summary.toLowerCase()} tone.`,
      },
    ]);
    setInput("");

    setIsAvatarSpeaking(true);
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
    }
    speakingTimerRef.current = setTimeout(
      () => setIsAvatarSpeaking(false),
      5000
    );
  };

  return (
    <div className="chat">
      <ChatSidebar
        onSelectThread={(thread) => console.log("open", thread)}
        personaLabel={personaDetails.displayLabel}
        isSpeaking={isAvatarSpeaking}
      />
      <section className="chat__panel">
        <header className="chat__header">
          <div className="chat__header-copy">
            <h1>ETA Conversation</h1>
            <p className="chat__persona-line">
              Persona: <strong>{personaDetails.displayLabel}</strong>
            </p>
            <p className="chat__tone-line">
              Tone: {personaDetails.summary}. Ask a question to keep the
              session moving.
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
