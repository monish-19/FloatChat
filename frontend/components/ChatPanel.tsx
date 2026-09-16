'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

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

const initialMessage: Message = {
  role: 'assistant',
  content: 'Ask me about temperature, salinity, oxygen, or chlorophyll across the float profiles.',
};

export default function ChatPanel({ questionSeed }: { questionSeed?: string }) {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (questionSeed) setQuestion(questionSeed);
  }, [questionSeed]);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isLoading) return;

    setMessages((current) => [...current, { role: 'user', content: trimmedQuestion }]);
    setQuestion('');
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedQuestion }),
      });
      const data = (await response.json()) as QueryResponse;
      if (!response.ok || !data.answer) {
        throw new Error('The query service returned an unexpected response.');
      }

      const isDemo = Object.values(data.latency ?? {}).every((value) => value === 0);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.answer,
          details: {
            summary: data.summary ?? {},
            latency: data.latency ?? {},
            matchCount: data.match_count ?? 0,
          },
          demo: isDemo,
        },
      ]);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to reach the query service.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="panel flex min-h-[460px] flex-col rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fc-ink-subtle)]">Ocean query console</div>
          <div className="mt-1 text-xl font-semibold text-[var(--fc-ink)]">Talk to the water column</div>
        </div>
        <div className="glow-ring rounded-full border border-[var(--fc-accent)]/30 bg-[var(--fc-accent)]/10 px-2.5 py-1.5 text-xs text-[var(--fc-accent-strong)]">Live</div>
      </div>

      <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] rounded-lg px-4 py-3 text-sm ${message.role === 'user' ? 'bg-[var(--fc-accent)]/15 text-[var(--fc-ink)]' : 'border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] text-[var(--fc-ink-muted)]'}`}>
              <div>{message.content}</div>
              {message.demo && <div className="mt-2 text-xs text-[var(--fc-warning)]">Demo mode: backend offline</div>}
              {message.details && (
                <div className="mono mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--fc-ink-subtle)]">
                  <span className="mr-1">{message.details.matchCount} matches</span>
                  <span className="rounded-full border border-[var(--fc-line)] bg-[var(--fc-surface-2)] px-2 py-0.5">semantic</span>
                  {message.details.latency.sql_ms !== undefined && <span className="rounded-full border border-[var(--fc-sal-3)]/40 bg-[var(--fc-sal-3)]/10 px-2 py-0.5">SQL</span>}
                  {message.details.latency.llm_ms !== undefined && <span className="rounded-full border border-[var(--fc-warning)]/40 bg-[var(--fc-warning)]/10 px-2 py-0.5">LLM</span>}
                  {message.details.latency.graph_ms !== undefined && <span className="rounded-full border border-[var(--fc-accent)]/40 bg-[var(--fc-accent)]/10 px-2 py-0.5">graph</span>}
                  <span className="basis-full">{String(message.details.summary.variable ?? 'unknown')} / {String(message.details.summary.region ?? 'global')}</span>
                  {Object.entries(message.details.latency).map(([name, value]) => (
                    <span key={name}>{name.replace('_ms', '')}: {value} ms</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && <div className="data-line rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] px-3 py-2 text-sm text-[var(--fc-accent-strong)]">Reading float profiles...</div>}
      </div>

      {error && <div className="mt-3 rounded-md border border-[var(--fc-danger)]/30 bg-[var(--fc-danger)]/10 px-3 py-2 text-xs text-[var(--fc-danger)]">{error}</div>}

      <form onSubmit={submitQuestion} className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. Where is oxygen lowest in deep water?"
          aria-label="Ask FloatChat a question"
          className="focus-ring min-w-0 flex-1 rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] px-3 py-3 text-sm text-[var(--fc-ink)] outline-none placeholder:text-[var(--fc-ink-faint)] focus:border-[var(--fc-accent)]"
        />
        <button type="submit" disabled={isLoading || !question.trim()} className="rounded-md bg-[var(--fc-accent)] px-4 py-2 text-sm font-semibold text-[var(--fc-canvas)] transition hover:bg-[var(--fc-accent-strong)] disabled:cursor-not-allowed disabled:opacity-40">
          Ask
        </button>
      </form>
    </div>
  );
}
