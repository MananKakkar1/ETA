import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls, Environment } from '@react-three/drei';
import { useAuth0 } from '@auth0/auth0-react';
import { Avatar } from '../Avatar.jsx';
import {
  syncUserProfile,
  fetchUser,
  createThread as apiCreateThread,
  sendChatMessage as apiSendChatMessage,
  fetchThread as apiFetchThread,
  generateNotes as apiGenerateNotes,
  generatePracticeProblems as apiGeneratePracticeProblems,
  requestVoiceResponse as apiRequestVoiceResponse,
  uploadContext as apiUploadContext,
  storeEtaId,
  getStoredEtaId,
} from '../lib/api.js';
import './chat.css';

const PERSONAS = [
  {
    id: 'professor',
    tabLabel: 'Professor',
    accent: 'Prof.',
    displayLabel: 'ETA (Professor)',
    summary: 'Structured professor',
  },
  {
    id: 'study-buddy',
    tabLabel: 'Study Buddy',
    accent: 'Buddy',
    displayLabel: 'ETA (Study Buddy)',
    summary: 'Friendly study buddy',
  },
  {
    id: 'exam-coach',
    tabLabel: 'Exam Coach',
    accent: 'Coach',
    displayLabel: 'ETA (Exam Coach)',
    summary: 'High-energy exam coach',
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
          className={`chat__persona-btn${activePersona === persona.id
              ? ' chat__persona-btn--active'
              : ''
            }`}
          onClick={() => onSelect(persona.id)}
        >
          <span className="chat__persona-accent">
            {persona.accent}
          </span>
          {persona.tabLabel}
        </button>
      ))}
    </div>
  );
}

function ThreadsModal({
  isOpen,
  onClose,
  threads,
  onSelectThread,
  onCreateThread,
  isCreatingThread,
}) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden'; // Prevent background scroll
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleThreadSelect = (threadId) => {
    onSelectThread?.(threadId);
    onClose();
  };

  const handleNewSession = async () => {
    if (!onCreateThread) {
      return;
    }
    try {
      const result = await onCreateThread({ activate: true });
      if (result) {
        onClose();
      }
    } catch (error) {
      console.error('Unable to create new session from modal:', error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>All Sessions</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="threads-grid">
            {threads.length === 0 ? (
              <div className="thread-modal-card thread-modal-card--empty">
                <h3>No sessions yet</h3>
                <p>Create a session to start your conversation.</p>
              </div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className="thread-modal-card"
                  onClick={() => handleThreadSelect(thread.id)}
                >
                  <h3>{thread.title}</h3>
                  <p>{thread.summary}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="cta cta--secondary"
            onClick={onClose}
          >
            Close
          </button>
          {onCreateThread ? (
            <button
              type="button"
              className="cta cta--primary"
              onClick={handleNewSession}
              disabled={isCreatingThread}
            >
              {isCreatingThread ? 'Creating…' : 'New Session'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChatSidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  personaLabel,
  isSpeaking,
  isCreatingThread,
  animationOverride,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  return (
    <aside className="chat__sidebar">
      <div className="chat__avatar-shell">
        <AvatarPreview
          isSpeaking={isSpeaking}
          personaLabel={personaLabel}
          animationOverride={animationOverride}
        />
      </div>
      <div className="chat__sessions-card">
        <header className="chat__sessions-header">
          <h2>Sessions</h2>
          <button
            type="button"
            className="chat__new-session"
            onClick={openModal}
          >
            See all
          </button>
          {onCreateThread ? (
            <button
              type="button"
              className="chat__new-session"
              onClick={() => onCreateThread({ activate: true })}
              disabled={isCreatingThread}
            >
              {isCreatingThread ? 'Creating…' : 'New Session'}
            </button>
          ) : null}
        </header>
        <div className="chat__thread-list-wrapper">
          <ul className="chat__thread-list">
            {threads.length === 0 ? (
              <li className="chat__thread-empty">
                No sessions yet. Create one to begin.
              </li>
            ) : (
              threads.slice(0, 6).map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    className={`chat__thread-card${thread.id === activeThreadId ? ' chat__thread-card--active' : ''
                      }`}
                    onClick={() => onSelectThread(thread.id)}
                  >
                    <h3>{thread.title}</h3>
                    <p>{thread.summary}</p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <ThreadsModal
        isOpen={isModalOpen}
        onClose={closeModal}
        threads={threads}
        onSelectThread={onSelectThread}
        onCreateThread={onCreateThread}
        isCreatingThread={isCreatingThread}
      />
    </aside>
  );
}

function MessageBubble({ role, content, onClick }) {
  const isAgent = role === 'assistant';
  const isClickable =
    isAgent && typeof onClick === 'function' && typeof content === 'string';

  const handleKeyDown = (event) => {
    if (!isClickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`chat__bubble${isAgent ? ' chat__bubble--agent' : ''}${isClickable ? ' chat__bubble--clickable' : ''
        }`}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="chat__bubble-meta">{isAgent ? 'ETA' : 'You'}</div>
      <p>{content}</p>
    </div>
  );
}

function ChatMessages({ messages, onMessageClick, isLoading }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const visibleMessages = isLoading ? [] : messages;

  return (
    <div ref={listRef} className="chat__messages">
      {isLoading ? (
        <div className="chat__messages-status">Loading conversation…</div>
      ) : null}
      {visibleMessages.map((message, index) => (
        <MessageBubble
          key={
            message.timestamp
              ? `${message.role}-${message.timestamp}-${index}`
              : `${message.role}-${index}`
          }
          {...message}
          onClick={
            message.role === 'assistant'
              ? () => onMessageClick?.(message)
              : undefined
          }
        />
      ))}
    </div>
  );
}

function Composer({
  input,
  onChange,
  onPrimaryAction,
  selectedAction,
  onSelectAction,
  onUploadContext,
  inputDisabled,
  actionDisabled,
  uploadDisabled,
  uploadLabel,
  primaryDisabled,
  primaryLabel,
}) {
  return (
    <form
      className="chat__composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!primaryDisabled) {
          onPrimaryAction();
        }
      }}
    >
      <textarea
        value={input}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask your teaching assistant anything…"
        rows={2}
        disabled={inputDisabled}
      />
      <div className="chat__composer-actions">
        <fieldset
          className="chat__composer-actions-group"
          disabled={actionDisabled}
        >
          <legend className="chat__composer-legend">Assistant action</legend>
          <label className="chat__composer-option">
            <input
              type="radio"
              name="assistant-action"
              value="send"
              checked={selectedAction === 'send'}
              onChange={() => onSelectAction('send')}
            />
            <span>Chat Reply</span>
          </label>
          <label className="chat__composer-option">
            <input
              type="radio"
              name="assistant-action"
              value="notes"
              checked={selectedAction === 'notes'}
              onChange={() => onSelectAction('notes')}
            />
            <span>Generate Notes</span>
          </label>
          <label className="chat__composer-option">
            <input
              type="radio"
              name="assistant-action"
              value="practice"
              checked={selectedAction === 'practice'}
              onChange={() => onSelectAction('practice')}
            />
            <span>Generate Problems</span>
          </label>
          <label className="chat__composer-option">
            <input
              type="radio"
              name="assistant-action"
              value="voice"
              checked={selectedAction === 'voice'}
              onChange={() => onSelectAction('voice')}
            />
            <span>Voice Reply</span>
          </label>
        </fieldset>
        <button
          type="button"
          className="cta cta--ghost"
          onClick={onUploadContext}
          disabled={uploadDisabled}
        >
          {uploadLabel}
        </button>
        <button
          className="cta cta--primary"
          type="button"
          disabled={primaryDisabled}
          onClick={onPrimaryAction}
        >
          {primaryLabel}
        </button>
      </div>
    </form>
  );
}

// Camera that smoothly follows a target's X position and looks toward the target
function CameraFollow({ targetRef, lerp = 0.08, lookOffset = [0, 0.9, 0] }) {
  const { camera } = useThree();
  const tmpVec = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!targetRef?.current) return;

    // get target world position
    targetRef.current.getWorldPosition(tmpVec.current);
    const targetPos = tmpVec.current;

    // Smoothly interpolate camera X toward target X
    const desiredX = targetPos.x;
    camera.position.x += (desiredX - camera.position.x) * lerp;

    // Optionally keep the existing camera Y/Z (or adjust if you want)
    // Keep camera Y/Z as configured on Canvas; only follow X by default.

    // Make camera look at the target (with offset so head is centered)
    camera.lookAt(
      targetPos.x + lookOffset[0],
      targetPos.y + lookOffset[1],
      targetPos.z + lookOffset[2]
    );
  });

  return null;
}

function AvatarPreview({ isSpeaking, personaLabel, animationOverride }) {
  // ref to pass into Avatar so CameraFollow can track it
  const avatarRef = useRef();

  return (
    <div className="chat__avatar-card">
      <div className="chat__avatar-wrapper">
        <Canvas camera={{ position: [0, 1.4, 2.2], fov: 38 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[2.5, 4, 3]} intensity={0.9} />
          {/* pass externalRef to Avatar so we can read its world position */}
          <Avatar
            externalRef={avatarRef}
            position={[0, -1.05, 0]}
            isSpeaking={isSpeaking}
            animationOverride={animationOverride}
          />
          {/* CameraFollow will only move camera.x (smooth) and keep other axes stable */}
          <CameraFollow
            targetRef={avatarRef}
            lerp={0.08}
            lookOffset={[0, 0.9, 0]}
          />
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            enableRotate={false}
          />
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

function ExpandedMessageOverlay({ message, onClose }) {
  useEffect(() => {
    if (!message) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [message, onClose]);

  if (!message) return null;

  const renderContent = () => {
    if (typeof message.content !== 'string') {
      return <pre>{JSON.stringify(message.content, null, 2)}</pre>;
    }

    return message.content.split('\n').map((line, lineIndex) => {
      if (!line.trim()) {
        return <br key={`line-${lineIndex}`} />;
      }

      return (
        <p
          key={`line-${lineIndex}`}
          className="message-overlay__paragraph"
        >
          {line}
        </p>
      );
    });
  };

  return (
    <div className="message-overlay" onClick={onClose}>
      <div
        className="message-overlay__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="message-overlay__header">
          <div>
            <span className="message-overlay__label">
              Expanded Response
            </span>
            <h2 className="message-overlay__title">
              Generated Notes
            </h2>
          </div>
          <button
            type="button"
            className="message-overlay__close"
            onClick={onClose}
            aria-label="Close expanded message"
          >
            ×
          </button>
        </div>
        <div className="message-overlay__body">{renderContent()}</div>
        <div className="message-overlay__footer">
          <button
            type="button"
            className="cta cta--primary"
            onClick={onClose}
          >
            Back to Chat
          </button>
        </div>
      </div>
    </div>
  );
}

const MESSAGE_PREVIEW_LIMIT = 140;

function formatMessagePreview(text) {
  if (!text) return 'No messages yet.';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'No messages yet.';
  return clean.length > MESSAGE_PREVIEW_LIMIT
    ? `${clean.slice(0, MESSAGE_PREVIEW_LIMIT - 1)}…`
    : clean;
}

function normalizeMessagesFromBackend(entries = []) {
  return entries
    .map((entry) => {
      if (!entry) return null;
      if (Array.isArray(entry) && entry.length >= 2) {
        const [roleRaw, contentRaw, timestampRaw] = entry;
        const role =
          typeof roleRaw === 'string' &&
          roleRaw.toLowerCase().startsWith('user')
            ? 'user'
            : 'assistant';
        const content = contentRaw != null ? String(contentRaw) : '';
        if (!content.trim()) {
          return null;
        }
        return {
          role,
          content,
          timestamp: timestampRaw ? String(timestampRaw) : undefined,
        };
      }

      if (typeof entry === 'object') {
        const roleRaw =
          entry.role ?? entry.Role ?? entry.author ?? entry.speaker;
        const contentRaw =
          entry.content ?? entry.message ?? entry.text ?? entry.body;
        const timestampRaw =
          entry.timestamp ?? entry.created_at ?? entry.time ?? entry.date;
        const content = contentRaw != null ? String(contentRaw) : '';
        if (!content.trim()) {
          return null;
        }
        const role =
          typeof roleRaw === 'string' &&
          roleRaw.toLowerCase().startsWith('user')
            ? 'user'
            : 'assistant';
        return {
          role,
          content,
          timestamp: timestampRaw ? String(timestampRaw) : undefined,
        };
      }

      if (typeof entry === 'string') {
        return {
          role: 'assistant',
          content: entry,
          timestamp: undefined,
        };
      }

      return null;
    })
    .filter(Boolean);
}

function hydrateThreadFromBackend(thread, index = 0) {
  if (!thread || typeof thread !== 'object') return null;
  const id = String(thread.ChatID ?? index);
  const messages = normalizeMessagesFromBackend(thread.Messages || []);
  const lastAssistant = [...messages]
    .reverse()
    .find((msg) => msg.role === 'assistant');
  const previewSource =
    lastAssistant?.content ||
    messages[messages.length - 1]?.content ||
    '';

  return {
    id,
    title: thread.Title || `Session ${index + 1}`,
    messages,
    createdAt: thread.CreatedAt ?? null,
    updatedAt: thread.UpdatedAt ?? null,
    summary: formatMessagePreview(previewSource),
    raw: thread,
  };
}

function Chat() {
  const { user: authUser, isAuthenticated, isLoading: authLoading } =
    useAuth0();
  const [persona, setPersona] = useState('professor');
  const [input, setInput] = useState('');
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const speakingTimerRef = useRef(null);
  const audioRef = useRef(null);
  const voiceCleanupRef = useRef(null);
  const fileInputRef = useRef(null);
  const [etaProfile, setEtaProfile] = useState(null);
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [expandedMessage, setExpandedMessage] = useState(null);
  const [isFetchingThreads, setIsFetchingThreads] = useState(false);
  const [loadingThreadId, setLoadingThreadId] = useState(null);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [isGeneratingPractice, setIsGeneratingPractice] = useState(false);
  const [isRequestingVoice, setIsRequestingVoice] = useState(false);
  const [isUploadingContext, setIsUploadingContext] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const ensuredInitialThreadRef = useRef(false);
  const [selectedAction, setSelectedAction] = useState('send');
  const [voiceFallback, setVoiceFallback] = useState(null);
  const [animationOverride, setAnimationOverride] = useState(null);

  const personaDetails = useMemo(
    () => PERSONA_MAP[persona] ?? PERSONA_MAP['professor'],
    [persona]
  );

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  const activeMessages = activeThread?.messages ?? [];
  const trimmedInput = input.trim();

  const applyThreadUpdate = useCallback(
    (rawThread, fallbackThreadId) => {
      if (!rawThread) return;
      const resolvedId = String(
        rawThread.ChatID ?? fallbackThreadId ?? ''
      );
      if (!resolvedId) return;

      setThreads((prev) => {
        const index = prev.findIndex((thread) => thread.id === resolvedId);
        const normalized = hydrateThreadFromBackend(
          rawThread,
          index >= 0 ? index : prev.length
        );
        if (!normalized) return prev;
        const next = [...prev];
        if (index === -1) {
          next.push(normalized);
        } else {
          next[index] = normalized;
        }
        return next;
      });
      setActiveThreadId((current) => current ?? resolvedId);
    },
    []
  );

  useEffect(
    () => () => {
      if (speakingTimerRef.current) {
        clearTimeout(speakingTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      setEtaProfile(null);
      setThreads([]);
      setActiveThreadId(null);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !authUser) {
      return;
    }

    let cancelled = false;
    const storedEtaId = getStoredEtaId();

    if (!storedEtaId && !authUser.email) {
      setErrorNotice(
        'An email address is required to create your ETA workspace. Please update your profile and try again.'
      );
      return;
    }

    const sync = async () => {
      try {
        const response = await syncUserProfile({
          name:
            authUser.name ||
            authUser.nickname ||
            authUser.email ||
            'Learner',
          email: authUser.email || undefined,
          auth0Sub: authUser.sub || '',
          etaId: storedEtaId || undefined,
        });
        if (cancelled) return;
        setEtaProfile(response);
        if (response?.etaId) {
          storeEtaId(response.etaId);
        }
        setErrorNotice('');
      } catch (error) {
        console.error('Failed to sync profile', error);
        if (!cancelled) {
          setErrorNotice(
            error.message ||
              'Unable to connect to ETA services right now.'
          );
        }
      }
    };

    sync();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, authUser]);

  useEffect(() => {
    if (!etaProfile?.etaId) {
      setThreads([]);
      setActiveThreadId(null);
      return;
    }

    let cancelled = false;
    setIsFetchingThreads(true);

    const loadThreads = async () => {
      try {
        const data = await fetchUser(etaProfile.etaId);
        if (cancelled) return;
        const chatHistory = Array.isArray(data?.ChatHistory)
          ? data.ChatHistory
          : [];
        const normalized = chatHistory
          .map((thread, index) => hydrateThreadFromBackend(thread, index))
          .filter(Boolean);

        ensuredInitialThreadRef.current = normalized.length > 0;
        setThreads(normalized);

        if (!normalized.length) {
          setActiveThreadId(null);
        } else if (
          normalized.length &&
          !normalized.some((thread) => thread.id === activeThreadId)
        ) {
          setActiveThreadId(normalized[0].id);
        }
        setErrorNotice('');
      } catch (error) {
        console.error('Failed to load threads', error);
        if (!cancelled) {
          setErrorNotice(
            error.message || 'Unable to load your sessions.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsFetchingThreads(false);
        }
      }
    };

    loadThreads();

    return () => {
      cancelled = true;
    };
  }, [etaProfile?.etaId, activeThreadId]);

  const handleCreateThread = useCallback(
    async ({ activate = true } = {}) => {
      if (!etaProfile?.etaId) return null;
      setIsCreatingThread(true);
      try {
        const response = await apiCreateThread({
          etaId: etaProfile.etaId,
        });

        let createdThread = null;
        setThreads((prev) => {
          const next = [...prev];
          createdThread = hydrateThreadFromBackend(
            response.thread,
            next.length
          );
          if (createdThread) {
            next.push(createdThread);
          }
          return next;
        });

        if (activate && createdThread) {
          setActiveThreadId(createdThread.id);
          setExpandedMessage(null);
        }
        setErrorNotice('');
        ensuredInitialThreadRef.current = true;
        return createdThread;
      } catch (error) {
        console.error('Failed to create thread', error);
        setErrorNotice(
          error.message || 'Unable to start a new session right now.'
        );
        return null;
      } finally {
        setIsCreatingThread(false);
      }
    },
    [etaProfile?.etaId]
  );

  const ensureThreadId = useCallback(async () => {
    if (activeThreadId) {
      return activeThreadId;
    }
    const created = await handleCreateThread({ activate: true });
    return created?.id ?? null;
  }, [activeThreadId, handleCreateThread]);

  // useEffect(() => {
  //   if (
  //     !etaProfile?.etaId ||
  //     isFetchingThreads ||
  //     isCreatingThread ||
  //     threads.length > 0 ||
  //     ensuredInitialThreadRef.current
  //   ) {
  //     return;
  //   }
  //   ensuredInitialThreadRef.current = true;
  //   handleCreateThread({ activate: true });
  // }, [
  //   etaProfile?.etaId,
  //   isFetchingThreads,
  //   isCreatingThread,
  //   threads.length,
  //   handleCreateThread,
  // ]);

  const handleSelectThread = useCallback(
    async (threadId) => {
      if (!threadId || !etaProfile?.etaId) return;
      setActiveThreadId(threadId);
      setExpandedMessage(null);
      setLoadingThreadId(threadId);
      try {
        const response = await apiFetchThread({
          etaId: etaProfile.etaId,
          chatId: threadId,
        });
        applyThreadUpdate(response.thread, threadId);
        setErrorNotice('');
      } catch (error) {
        console.error('Failed to load thread', error);
        setErrorNotice(
          error.message || 'Unable to open that session right now.'
        );
      } finally {
        setLoadingThreadId(null);
      }
    },
    [etaProfile?.etaId, applyThreadUpdate]
  );

  const handleSend = useCallback(async () => {
    const trimmed = trimmedInput;
    if (!trimmed || !etaProfile?.etaId || isSendingMessage) {
      return;
    }

    const targetThreadId = await ensureThreadId();
    if (!targetThreadId) {
      setErrorNotice(
        'Unable to start a new session. Please try again in a moment.'
      );
      return;
    }

    setInput('');
    setExpandedMessage(null);
    setErrorNotice('');

    const optimisticId = `local-${Date.now()}`;
    const optimisticMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      optimisticId,
    };

    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === targetThreadId
          ? {
              ...thread,
              messages: [...thread.messages, optimisticMessage],
              summary: formatMessagePreview(trimmed),
            }
          : thread
      )
    );

    setIsSendingMessage(true);
    setIsAvatarSpeaking(true);
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
    }

    try {
      const response = await apiSendChatMessage({
        etaId: etaProfile.etaId,
        chatId: targetThreadId,
        message: trimmed,
        persona,
      });

      applyThreadUpdate(response.thread, targetThreadId);
    } catch (error) {
      console.error('Failed to send message', error);
      setErrorNotice(
        error.message || 'Message failed to send. Please try again.'
      );
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === targetThreadId
            ? {
                ...thread,
                messages: thread.messages.filter(
                  (msg) => msg.optimisticId !== optimisticId
                ),
              }
            : thread
        )
      );
    } finally {
      setIsSendingMessage(false);
      speakingTimerRef.current = setTimeout(
        () => setIsAvatarSpeaking(false),
        2000
      );
    }
  }, [
    trimmedInput,
    etaProfile?.etaId,
    ensureThreadId,
    persona,
    isSendingMessage,
    applyThreadUpdate,
  ]);

  const handleMessageClick = useCallback((message) => {
    setExpandedMessage(message);
  }, []);

  const handleCloseExpandedMessage = useCallback(() => {
    setExpandedMessage(null);
  }, []);

  const clearVoiceFallback = useCallback(() => {
    if (voiceCleanupRef.current) {
      try {
        voiceCleanupRef.current();
      } catch {
        /* ignore */
      }
      voiceCleanupRef.current = null;
    }
    if (voiceFallback?.release) {
      try {
        voiceFallback.release();
      } catch {
        /* ignore */
      }
    }
    setVoiceFallback(null);
    setIsAvatarSpeaking(false);
    setAnimationOverride(null);
  }, [voiceFallback]);

  const handleVoiceFallbackPlay = useCallback(
    (event) => {
      const element = event.currentTarget;
      audioRef.current = element;
      setIsAvatarSpeaking(true);
      const anim = element.getAttribute('data-animation') || 'talking';
      setAnimationOverride(anim);
      voiceCleanupRef.current = () => {
        try {
          element.pause();
          element.currentTime = 0;
        } catch {
          /* ignore */
        }
        audioRef.current = null;
        if (voiceFallback?.release) {
          voiceFallback.release();
        }
        setVoiceFallback(null);
      };
    },
    [voiceFallback]
  );

  const handleUploadContext = useCallback(() => {
    if (!etaProfile?.etaId || isUploadingContext) {
      if (!etaProfile?.etaId) {
        setErrorNotice('Please sign in before uploading context.');
      }
      return;
    }
    fileInputRef.current?.click();
  }, [etaProfile?.etaId, isUploadingContext]);

  const handleContextFileChange = useCallback(
    async (event) => {
      const inputEl = event.target;
      const file = inputEl?.files?.[0];
      if (!file) return;
      if (!etaProfile?.etaId) {
        setErrorNotice('Please sign in before uploading context.');
        if (inputEl) {
          inputEl.value = '';
        }
        return;
      }

      setIsUploadingContext(true);
      try {
        await apiUploadContext({ etaId: etaProfile.etaId, file });
        setErrorNotice('');
        setExpandedMessage({
          role: 'assistant',
          content:
            'Context uploaded successfully. Future responses will incorporate the new material.',
        });
      } catch (error) {
        console.error('Failed to upload context', error);
        setErrorNotice(
          error.message || 'Context upload failed. Please try again.'
        );
      } finally {
        setIsUploadingContext(false);
        if (inputEl) {
          // allow the same file to be selected again
          inputEl.value = '';
        }
      }
    },
    [etaProfile?.etaId]
  );

  const handleGenerateNotes = useCallback(async () => {
    if (!etaProfile?.etaId || isGeneratingNotes) {
      return;
    }

    const targetThreadId = await ensureThreadId();
    if (!targetThreadId) {
      setErrorNotice(
        'Unable to start a new session. Please try again in a moment.'
      );
      return;
    }

    setIsGeneratingNotes(true);
    try {
      const response = await apiGenerateNotes({
        etaId: etaProfile.etaId,
        chatId: targetThreadId,
      });
      setErrorNotice('');
      if (response?.thread) {
        applyThreadUpdate(response.thread, targetThreadId);
      } else if (response?.notes) {
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === targetThreadId
              ? {
                  ...thread,
                  messages: [
                    ...thread.messages,
                    {
                      role: 'assistant',
                      content: response.notes,
                      timestamp: new Date().toISOString(),
                    },
                  ],
                  summary: formatMessagePreview(response.notes),
                }
              : thread
          )
        );
        setExpandedMessage({
          role: 'assistant',
          content: response.notes,
        });
      }
    } catch (error) {
      console.error('Failed to generate notes', error);
      setErrorNotice(
        error.message || 'Unable to generate notes right now.'
      );
    } finally {
      setIsGeneratingNotes(false);
    }
  }, [
    etaProfile?.etaId,
    isGeneratingNotes,
    ensureThreadId,
    applyThreadUpdate,
  ]);

  const handleGeneratePractice = useCallback(async () => {
    if (!etaProfile?.etaId || isGeneratingPractice) {
      return;
    }

    const targetThreadId = await ensureThreadId();
    if (!targetThreadId) {
      setErrorNotice(
        'Unable to start a new session. Please try again in a moment.'
      );
      return;
    }

    setIsGeneratingPractice(true);
    try {
      const requestPrompt =
        trimmedInput ||
        'Create a short set of practice problems based on our current session.';
      const response = await apiGeneratePracticeProblems({
        etaId: etaProfile.etaId,
        chatId: targetThreadId,
        message: requestPrompt,
      });
      setErrorNotice('');
      if (response?.thread) {
        applyThreadUpdate(response.thread, targetThreadId);
      } else if (response?.practice_problems) {
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === targetThreadId
              ? {
                  ...thread,
                  messages: [
                    ...thread.messages,
                    {
                      role: 'assistant',
                      content: response.practice_problems,
                      timestamp: new Date().toISOString(),
                    },
                  ],
                  summary: formatMessagePreview(response.practice_problems),
                }
              : thread
          )
        );
        setExpandedMessage({
          role: 'assistant',
          content: response.practice_problems,
        });
      }
    } catch (error) {
      console.error('Failed to generate practice problems', error);
      setErrorNotice(
        error.message || 'Unable to generate practice problems right now.'
      );
    } finally {
      setIsGeneratingPractice(false);
    }
  }, [
    etaProfile?.etaId,
    isGeneratingPractice,
    trimmedInput,
    ensureThreadId,
    applyThreadUpdate,
  ]);

  const handleVoiceResponse = useCallback(async () => {
    if (!etaProfile?.etaId || isRequestingVoice) {
      return;
    }
    const prompt = trimmedInput;
    if (!prompt) {
      setErrorNotice('Please enter a question to request a voice response.');
      return;
    }
    clearVoiceFallback();

    const targetThreadId = await ensureThreadId();
    if (!targetThreadId) {
      setErrorNotice(
        'Unable to start a new session. Please try again in a moment.'
      );
      return;
    }

    setIsRequestingVoice(true);
    try {
      const { audio } = await apiRequestVoiceResponse({
        etaId: etaProfile.etaId,
        chatId: targetThreadId,
        question: prompt,
        persona,
      });
      setErrorNotice('');

      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === targetThreadId
            ? {
                ...thread,
                messages: [
                  ...thread.messages,
                  {
                    role: 'assistant',
                    content: '🔊 Voice response delivered.',
                    timestamp: new Date().toISOString(),
                  },
                ],
                summary: 'Voice response delivered.',
              }
            : thread
        )
      );

      const blob = new Blob([audio], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);
      const release = () => {
        try {
          URL.revokeObjectURL(audioUrl);
        } catch {
          /* ignore */
        }
        setIsAvatarSpeaking(false);
      };

      setVoiceFallback({ audioUrl, release, animation: 'talking' });
      voiceCleanupRef.current = null;
      setSelectedAction('voice');
      setExpandedMessage({
        role: 'assistant',
        content: 'Voice ready. Press play below to listen.',
      });
    } catch (error) {
      console.error('Failed to generate voice response', error);
      setErrorNotice(
        error.message || 'Unable to generate a voice response right now.'
      );
    } finally {
      setIsRequestingVoice(false);
    }
  }, [
    etaProfile?.etaId,
    isRequestingVoice,
    trimmedInput,
    ensureThreadId,
    persona,
    setSelectedAction,
    clearVoiceFallback,
  ]);

  useEffect(
    () => () => {
      if (voiceCleanupRef.current) {
        voiceCleanupRef.current();
      }
      if (voiceFallback?.release) {
        try {
          voiceFallback.release();
        } catch {
          /* ignore */
        }
      }
    },
    [voiceFallback]
  );

  const isMessagesLoading =
    isFetchingThreads || loadingThreadId === activeThreadId;

  const isSessionBusy = isFetchingThreads || isCreatingThread;
  const inputDisabled = authLoading || !isAuthenticated;
  const actionDisabled = inputDisabled || isSessionBusy || isSendingMessage;
  const canSend =
    !inputDisabled &&
    !isSessionBusy &&
    !isSendingMessage &&
    !!etaProfile?.etaId &&
    trimmedInput.length > 0;
  const canGenerateNotes =
    !actionDisabled && !isGeneratingNotes && !!etaProfile?.etaId;
  const canGeneratePractice =
    !actionDisabled && !isGeneratingPractice && !!etaProfile?.etaId;
  const canVoice =
    !actionDisabled &&
    !isRequestingVoice &&
    !!etaProfile?.etaId &&
    trimmedInput.length > 0;

  const uploadDisabled =
    !etaProfile?.etaId || isUploadingContext || inputDisabled;
  const uploadLabel = isUploadingContext ? 'Uploading…' : 'Upload PDF Context';

  const primaryDisabled =
    (selectedAction === 'voice' && voiceFallback) ||
    (selectedAction === 'notes'
      ? !canGenerateNotes
      : selectedAction === 'practice'
      ? !canGeneratePractice
      : selectedAction === 'voice'
      ? !canVoice
      : !canSend);

  const primaryLabel =
    selectedAction === 'voice' && voiceFallback
      ? 'Voice Ready'
      : selectedAction === 'notes'
      ? isGeneratingNotes
        ? 'Generating Notes…'
        : 'Generate Notes'
      : selectedAction === 'practice'
      ? isGeneratingPractice
        ? 'Generating Problems…'
        : 'Generate Problems'
      : selectedAction === 'voice'
      ? isRequestingVoice
        ? 'Generating Voice…'
        : 'Play Voice Reply'
      : isSendingMessage
      ? 'Sending…'
      : 'Send';

  const handlePrimaryAction = useCallback(() => {
    if (primaryDisabled) return;
    if (selectedAction === 'notes') {
      handleGenerateNotes();
    } else if (selectedAction === 'practice') {
      handleGeneratePractice();
    } else if (selectedAction === 'voice') {
      handleVoiceResponse();
    } else {
      handleSend();
    }
  }, [
    handleGenerateNotes,
    handleGeneratePractice,
    handleVoiceResponse,
    handleSend,
    primaryDisabled,
    selectedAction,
  ]);

  return (
    <div
      className={`chat${expandedMessage ? ' chat--overlay-active' : ''}`}
    >
      <ChatSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onCreateThread={handleCreateThread}
        personaLabel={personaDetails.displayLabel}
        isSpeaking={isAvatarSpeaking}
        isCreatingThread={isCreatingThread}
        animationOverride={animationOverride}
      />
      <section className="chat__panel">
        <header className="chat__header">
          <div className="chat__header-copy">
            <h1>ETA Conversation</h1>
            <p className="chat__persona-line">
              Persona:{' '}
              <strong>{personaDetails.displayLabel}</strong>
            </p>
            <p className="chat__tone-line">
              Tone: {personaDetails.summary}. Ask a question to
              keep the session moving.
            </p>
          </div>
          <PersonaTabs
            activePersona={persona}
            onSelect={setPersona}
          />
        </header>

        {errorNotice ? (
          <div className="chat__status chat__status--error">
            {errorNotice}
          </div>
        ) : null}

        <ChatMessages
          messages={activeMessages}
          isLoading={isMessagesLoading}
          onMessageClick={handleMessageClick}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={handleContextFileChange}
        />

        {voiceFallback ? (
          <div className="chat__voice-fallback">
            <audio
              controls
              src={voiceFallback.audioUrl}
              onPlay={handleVoiceFallbackPlay}
              onPause={() => setIsAvatarSpeaking(false)}
              onEnded={clearVoiceFallback}
              data-animation={voiceFallback?.animation || 'talking'}
            />
            <button
              type="button"
              className="cta cta--ghost"
              onClick={clearVoiceFallback}
            >
              Close Voice Reply
            </button>
          </div>
        ) : null}

        <Composer
          input={input}
          onChange={setInput}
          onPrimaryAction={handlePrimaryAction}
          selectedAction={selectedAction}
          onSelectAction={setSelectedAction}
          onUploadContext={handleUploadContext}
          inputDisabled={inputDisabled}
          actionDisabled={actionDisabled}
          uploadDisabled={uploadDisabled}
          uploadLabel={uploadLabel}
          primaryDisabled={primaryDisabled}
          primaryLabel={primaryLabel}
        />
      </section>
      <ExpandedMessageOverlay
        message={expandedMessage}
        onClose={handleCloseExpandedMessage}
      />
    </div>
  );
}

export default Chat;
