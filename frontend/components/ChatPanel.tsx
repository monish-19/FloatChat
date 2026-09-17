'use client';

/* ─────────────────────────────────────────────────────────────
   ChatPanel — left-docked glass rail, collapsible to icon.
   Full viewport height, ~360px wide when open, 48px when closed.
   Chat messages, attribution pills, loading state.
───────────────────────────────────────────────────────────── */

import { FormEvent, useEffect, useRef, useState } from 'react';
import { EyebrowReveal, HeadingReveal } from '@/components/SplitReveal';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  details?: {
    summary: Record<string, unknown>;
    latency: Record<string, number>;
    matchCount: number;
  };
  demo?: boolean;
};

type QueryResponse = {
  answer: string;
  match_count: number;
  summary: Record<string, unknown>;
  latency: Record<string, number>;
  sources?: string[];
};

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: 'Ask me about temperature, salinity, oxygen, or chlorophyll across the float profiles.',
};

const PROMPT_SEED = 'Show oxygen minima below 500m in the Arabian Sea over the last quarter.';

type ChatPanelProps = {
  questionSeed?: string;
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
};

export default function ChatPanel({ questionSeed, collapsed = false, onCollapsedChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedPrompt, setTypedPrompt] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (questionSeed) { setQuestion(questionSeed); }
  }, [questionSeed]);

  // Typewriter animation for placeholder
  useEffect(() => {
    let idx = 0;
    const interval = window.setInterval(() => {
      idx += 1;
      setTypedPrompt(PROMPT_SEED.slice(0, idx));
      if (idx >= PROMPT_SEED.length) window.clearInterval(interval);
    }, 26);
    return () => window.clearInterval(interval);
  }, []);

  async function submitQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = question.trim();
    if (!q || isLoading) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setQuestion('');
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as QueryResponse;
      if (!res.ok || !data.answer) throw new Error('Unexpected response from query service.');
      const isDemo = Object.values(data.latency ?? {}).every((v) => v === 0);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          details: { summary: data.summary ?? {}, latency: data.latency ?? {}, matchCount: data.match_count ?? 0 },
          demo: isDemo,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach the query service.');
    } finally {
      setIsLoading(false);
    }
  }

  const panelWidth = collapsed ? 48 : 360;

  return (
    <div
      id="chat-panel"
      className="chat-panel-enter parallax-layer parallax-layer--near"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 10,
        width: panelWidth,
        background: 'rgba(10,18,32,0.88)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        borderRight: '1px solid rgba(19,30,48,0.95)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 240ms ease-out',
        overflow: 'hidden',
      }}
      aria-label="FloatChat query console"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '16px 0' : '14px 16px',
          borderBottom: '1px solid rgba(19,30,48,0.9)',
          flexShrink: 0,
          gap: 8,
        }}
      >
        {!collapsed && (
          <div>
            <EyebrowReveal text="Ocean query" className="eyebrow" staggerMs={22} />
            <HeadingReveal
              text="FloatChat"
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--foam-100)',
                letterSpacing: '-0.01em',
                marginTop: 1,
              }}
              staggerMs={55}
              delayMs={90}
            />
          </div>
        )}

        <button
          id="chat-collapse-btn"
          type="button"
          onClick={() => onCollapsedChange?.(!collapsed)}
          aria-label={collapsed ? 'Expand chat panel' : 'Collapse chat panel'}
          title={collapsed ? 'Expand chat' : 'Collapse chat'}
          style={{
            background: 'transparent',
            border: '1px solid rgba(19,30,48,0.9)',
            borderRadius: 6,
            color: 'var(--foam-400)',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 12,
            flexShrink: 0,
            transition: 'border-color 150ms ease, color 150ms ease',
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Collapsed icon rail */}
      {collapsed && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 12,
            gap: 16,
          }}
          aria-hidden="true"
        >
          {/* Wave icon */}
          <div title="Chat" style={{ fontSize: 18, color: 'var(--bio-400)' }}>〜</div>
          {/* Messages count pill */}
          {messages.length > 1 && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--bio-400)',
              background: 'rgba(45,212,191,0.1)',
              border: '1px solid rgba(45,212,191,0.25)',
              borderRadius: 999,
              padding: '1px 5px',
            }}>
              {messages.length - 1}
            </div>
          )}
        </div>
      )}

      {/* Full panel content */}
      {!collapsed && (
        <>
          {/* Live badge */}
          <div style={{ padding: '8px 16px 0', flexShrink: 0 }}>
            <span className="live-badge">Live</span>
          </div>

          {/* Message thread */}
          <div
            ref={threadRef}
            className="scroll-thread"
            style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {messages.map((msg, i) => (
              <div
                key={`${msg.role}-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '88%',
                    borderRadius: msg.role === 'user' ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                    padding: '9px 12px',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--foam-100)',
                    background: msg.role === 'user'
                      ? 'rgba(45,212,191,0.12)'
                      : 'rgba(19,30,48,0.7)',
                    border: msg.role === 'user'
                      ? '1px solid rgba(45,212,191,0.2)'
                      : '1px solid rgba(19,30,48,0.9)',
                  }}
                >
                  <div>{msg.content}</div>
                  {msg.demo && (
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--amber-400)',
                      marginTop: 6,
                    }}>
                      Demo mode · backend offline
                    </div>
                  )}
                  {msg.details && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      <span className="pill pill-semantic">semantic</span>
                      {msg.details.latency.sql_ms !== undefined && (
                        <span className="pill pill-sql">SQL</span>
                      )}
                      {msg.details.latency.llm_ms !== undefined && (
                        <span className="pill pill-llm">LLM</span>
                      )}
                      {msg.details.latency.graph_ms !== undefined && (
                        <span className="pill pill-graph">graph</span>
                      )}
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--foam-400)',
                        letterSpacing: '0.02em',
                        marginLeft: 2,
                      }}>
                        {msg.details.matchCount} matches
                      </span>
                    </div>
                  )}
                  {msg.details && (
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--foam-400)',
                      marginTop: 4,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0 8px',
                    }}>
                      {Object.entries(msg.details.latency).map(([k, v]) => (
                        <span key={k}>{k.replace('_ms', '')}: {v} ms</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  background: 'rgba(19,30,48,0.7)',
                  border: '1px solid rgba(19,30,48,0.9)',
                  borderRadius: '10px 10px 10px 3px',
                  padding: '9px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  minWidth: 140,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: 'var(--font-ui)',
                    fontSize: 12,
                    color: 'var(--foam-400)',
                  }}>
                    <span>Interpreting float signals</span>
                    <span className="thinking-dots" aria-hidden="true">
                      <span /><span /><span />
                    </span>
                  </div>
                  <div className="sonar-ping" style={{ width: '100%' }} />
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              margin: '0 14px',
              padding: '8px 12px',
              background: 'rgba(251,113,133,0.08)',
              border: '1px solid rgba(251,113,133,0.3)',
              borderRadius: 8,
              fontFamily: 'var(--font-ui)',
              fontSize: 12,
              color: 'var(--coral-400)',
              flexShrink: 0,
            }}>
              {error}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={submitQuestion}
            style={{
              padding: '10px 14px 14px',
              display: 'flex',
              gap: 8,
              flexShrink: 0,
              borderTop: '1px solid rgba(19,30,48,0.9)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea
                id="chat-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={question ? '' : typedPrompt || 'Ask about the water column…'}
                aria-label="Ask FloatChat a question"
                rows={2}
                className="ocean-input"
                style={{
                  resize: 'none',
                  fontFamily: 'var(--font-ui)',
                }}
              />
            </div>
            <button
              id="chat-submit-btn"
              type="submit"
              disabled={isLoading || !question.trim()}
              className="btn-bio"
              style={{ alignSelf: 'flex-end', flexShrink: 0 }}
            >
              Ask
            </button>
          </form>

          {/* Typewriter hint */}
          <div style={{
            padding: '0 14px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--foam-400)',
            letterSpacing: '0.02em',
            flexShrink: 0,
            minHeight: 16,
          }}>
            {!question && typedPrompt && (
              <>{typedPrompt}<span className="caret">|</span></>
            )}
          </div>
        </>
      )}
    </div>
  );
}
