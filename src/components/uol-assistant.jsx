"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import {
  GraduationCap,
  Send,
  MapPin,
  Calendar,
  BookOpen,
  FileText,
  Plus,
  MessageSquare,
  Trash2,
  Eraser,
  AlertCircle,
  PanelLeft,
  MoreVertical,
  Pencil,
  Settings,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STORAGE_KEY = "uol-assistant-conversations";
const REQUEST_TIMEOUT_MS = 20_000;

const WELCOME = {
  role: "assistant",
  text: "Assalam-o-Alaikum! I'm the University of Layyah Assistant. Ask me about admissions, programs, fees, departments, or campus life — or tap a suggestion below.",
};

const SUGGESTIONS = [
  { icon: BookOpen, text: "Show available BS programs" },
  { icon: FileText, text: "What is the fee for BS Computer Science?" },
  { icon: MapPin, text: "Where is the Computer Science department?" },
  { icon: Calendar, text: "What events are happening this month?" },
];

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-amber-600 hover:text-amber-700">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded-md bg-accent px-1.5 py-0.5 text-[0.85em] font-medium text-foreground">{children}</code>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 font-serif text-lg font-semibold text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 font-serif text-base font-semibold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-3 font-semibold text-foreground">{children}</h3>,
  table: ({ children }) => (
    <div className="mb-3 overflow-hidden rounded-lg bg-card last:mb-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-foreground">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-muted-foreground">{children}</td>,
};

function createConversation(id) {
  return { id, title: "New conversation", messages: [WELCOME] };
}

function truncateTitle(text) {
  const clean = text.trim();
  return clean.length > 40 ? clean.slice(0, 40) + "…" : clean;
}

function loadPersisted() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.conversations) && parsed.conversations.length > 0) {
        return {
          conversations: parsed.conversations,
          activeId: parsed.activeId ?? parsed.conversations[0].id,
        };
      }
    }
  } catch {}
  return { conversations: [createConversation("default")], activeId: "default" };
}

export default function UoLAssistant() {
  const [conversations, setConversations] = useState(() => loadPersisted().conversations);
  const [activeId, setActiveId] = useState(() => loadPersisted().activeId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const { theme, setTheme } = useTheme();

  const scrollRef = useRef(null);
  const clearTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversations, activeId }));
  }, [conversations, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages, loading]);

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, []);

  function handleClearAll() {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimeoutRef.current = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    clearTimeout(clearTimeoutRef.current);
    setConfirmClear(false);
    const fresh = createConversation(crypto.randomUUID());
    setConversations([fresh]);
    setActiveId(fresh.id);
    setSidebarOpen(false);
  }

  function newChat() {
    const id = crypto.randomUUID();
    setConversations((prev) => [createConversation(id), ...prev]);
    setActiveId(id);
  }

  function deleteConversation(id, e) {
    e?.stopPropagation();
    const filtered = conversations.filter((c) => c.id !== id);
    if (filtered.length === 0) {
      const fresh = createConversation(crypto.randomUUID());
      setConversations([fresh]);
      setActiveId(fresh.id);
      return;
    }
    setConversations(filtered);
    if (id === activeId) setActiveId(filtered[0].id);
  }

  function startRename() {
    setRenameValue(active.title);
    setIsRenaming(true);
    setMenuOpen(false);
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed) {
      setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, title: trimmed } : c)));
    }
    setIsRenaming(false);
  }

  function appendAssistantMessage(updatedMessages, text, isError) {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, messages: [...updatedMessages, { role: "assistant", text, isError }] } : c
      )
    );
  }

  async function send(text) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg = { role: "user", text: trimmed };
    const updatedMessages = [...active.messages, userMsg];

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? { ...c, messages: updatedMessages, title: c.title === "New conversation" ? truncateTitle(trimmed) : c.title }
          : c
      )
    );

    setInput("");

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    setLoading(true);

    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      appendAssistantMessage(updatedMessages, data.reply, !res.ok);
    } catch (err) {
      clearTimeout(timeoutId);
      const message =
        err.name === "AbortError"
          ? "The assistant is taking longer than expected to respond. Please try again in a moment."
          : "Couldn't reach the assistant. Please check your connection and try again.";
      appendAssistantMessage(updatedMessages, message, true);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-20 bg-black/40 md:hidden" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden bg-card transition-all duration-300 md:relative md:z-0 ${
          sidebarOpen ? "translate-x-0 w-72" : "-translate-x-full md:translate-x-0 w-16"
        }`}
      >
        <div className={`flex items-center py-5 ${sidebarOpen ? "px-5" : "justify-center w-full"}`}>
          {sidebarOpen ? (
            <>
              <GraduationCap className="h-6 w-6 shrink-0 text-amber-500" />
              <span className="ml-3 truncate font-serif text-sm font-semibold tracking-wide text-foreground">
                UoL Assistant
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="ml-auto shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PanelLeft className="h-5 w-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeft className="h-5 w-5 rotate-180" />
            </button>
          )}
        </div>

        <div className={`mb-2 ${sidebarOpen ? "px-4" : "flex justify-center px-2"}`}>
          <button
            onClick={newChat}
            className={`flex items-center rounded-xl bg-accent text-sm font-medium text-foreground transition-colors hover:bg-accent ${
              sidebarOpen ? "w-full gap-3 px-4 py-3" : "h-12 w-12 justify-center"
            }`}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {sidebarOpen && "New chat"}
          </button>
        </div>

        {sidebarOpen && (
          <>
            <div className="px-5 pb-2 pt-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </h2>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    c.id === activeId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <MessageSquare className={`h-4 w-4 shrink-0 ${c.id === activeId ? "text-foreground" : "text-muted-foreground"}`} />
                  <span className="flex-1 truncate font-medium">{c.title}</span>
                  <span
                    onClick={(e) => deleteConversation(c.id, e)}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-colors hover:bg-accent hover:text-red-600 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {!sidebarOpen && <div className="flex-1" />}

        <div className={`mt-auto py-4 ${sidebarOpen ? "flex items-center gap-2 px-4" : "flex flex-col items-center gap-3 px-2"}`}>
          {sidebarOpen && (
            <button
              onClick={handleClearAll}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                confirmClear
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Eraser className="h-4 w-4" />
              {confirmClear ? "Confirm?" : "Clear chats"}
            </button>
          )}
          <button className="flex shrink-0 items-center justify-center rounded-xl bg-muted p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        <header className="flex h-16 shrink-0 items-center gap-3 px-6 py-4">
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setIsRenaming(false);
              }}
              className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground outline-none"
            />
          ) : (
            <h1 className="flex-1 truncate text-sm font-semibold text-foreground">{active.title}</h1>
          )}

          <button
            onClick={() =>
              setTheme(theme === "dark" ? "light" : "dark")
            }
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-muted-foreground"
          >
            {theme === "dark"
              ? <Sun className="h-5 w-5" />
              : <Moon className="h-5 w-5" />
            }
          </button>

          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-muted-foreground"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl bg-background border border-border py-1.5 shadow-lg">
                  <button
                    onClick={startRename}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <Pencil className="h-4 w-4" />
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      deleteConversation(activeId);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive hover:text-accent"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {active.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-1.5 text-[15px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : m.isError
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-card text-card-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    m.isError ? (
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <span className="font-medium">{m.text}</span>
                      </div>
                    ) : (
                      <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-primary prose-pre:text-primary-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {m.text}
                        </ReactMarkdown>
                      </div>
                    )
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="ml-2 flex items-center gap-1.5 rounded-xl bg-card px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}

            {active.messages.length === 1 && (
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => send(text)}
                    className="flex items-center gap-2.5 rounded-xl bg-card px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-amber-500" />
                    {text}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-background pb-6 pt-2 px-4 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end rounded-[20px] bg-muted px-1.5 py-1.5">
              <textarea
                ref={inputRef}
                value={input}
                disabled={loading}
                placeholder="Ask about programs, fees, departments, exams..."
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                className="mx-2.5 my-1 max-h-30 min-h-6 flex-1 resize-none overflow-y-auto bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="mb-0.5 mr-0.5 shrink-0 rounded-full p-1.5 text-foreground transition-colors hover:text-background hover:bg-primary disabled:cursor-not-allowed disabled:bg-accent disabled:text-muted-foreground"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2.5 text-center text-xs font-medium text-muted-foreground">
              Responses are generated from University of Layyah information and may occasionally be inaccurate.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
