'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { nanoid } from '@/services/nanoid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

type ChatSSEEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_result'; tool: string; result: unknown; mutated: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

// ─── Props ────────────────────────────────────────────────────────────────────

interface TripChatPanelProps {
  tripId: string;
  isOpen: boolean;
  onClose: () => void;
  currentDayIndex: number;
  onActivityMutation: () => void;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-2 last:mb-0 pl-4 space-y-0.5 list-disc text-sm leading-relaxed">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 last:mb-0 pl-4 space-y-0.5 list-decimal text-sm leading-relaxed">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => (
          <h1 className="font-display font-semibold text-base leading-snug mt-3 mb-1 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="font-display font-semibold text-sm leading-snug mt-3 mb-1 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="font-semibold text-sm leading-snug mt-2 mb-1 first:mt-0">{children}</h3>
        ),
        code: ({ children, className }) => {
          // Heuristic: fenced code blocks have a language className or multiline content
          const src = String(children);
          const isBlock = !!className || src.includes('\n');
          if (isBlock) {
            return (
              <code className="text-xs font-mono leading-relaxed">{children}</code>
            );
          }
          return (
            <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-2 last:mb-0 rounded-lg bg-black/10 dark:bg-white/10 px-3 py-2 overflow-x-auto text-xs font-mono leading-relaxed">
            {children}
          </pre>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-secondary underline underline-offset-2 hover:no-underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="border-current opacity-20 my-3" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-current opacity-60 pl-3 italic mb-2 last:mb-0">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2',
          isUser
            ? 'bg-primary text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap'
            : 'bg-surface border border-border text-text-base dark:bg-slate-800 dark:border-slate-700',
        )}
      >
        {isUser ? (
          message.content
        ) : (
          <ChatMarkdown content={message.content} />
        )}
        {message.isStreaming && message.content === '' && (
          <span className="inline-flex gap-1 items-center h-4">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
          </span>
        )}
        {message.isStreaming && message.content !== '' && (
          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-text-base opacity-60 animate-pulse rounded-sm align-middle" />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 gap-3 text-center">
      <div className="rounded-full bg-surface border border-border p-3 dark:bg-slate-800 dark:border-slate-700">
        <MessageCircle className="h-6 w-6 text-text-muted" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text-base">Ask your trip assistant</p>
        <p className="type-caption max-w-[200px]">
          Ask about your itinerary, add activities, or get recommendations.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TripChatPanel({
  tripId,
  isOpen,
  onClose,
  currentDayIndex,
  onActivityMutation,
}: TripChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMutationsRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentRunIdRef = useRef<string | null>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-grow textarea
  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function sendMessage() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMsgId = nanoid(8);
    const assistantMsgId = nanoid(8);

    // Snapshot history — only the new user message is needed for continued runs,
    // but we always include it so the fallback (direct-Claude) path still works.
    const historyMessages = messages.map((m) => ({ role: m.role, content: m.content }));
    historyMessages.push({ role: 'user' as const, content: text });

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
    ]);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);
    hasMutationsRef.current = false;

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`/api/trips/${tripId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyMessages,
          currentDayIndex,
          ...(agentRunIdRef.current && { agentRunId: agentRunIdRef.current }),
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      if (!res.body) throw new Error('No response body');

      const runId = res.headers.get('X-Agent-Run-Id');
      if (runId) agentRunIdRef.current = runId;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: ChatSSEEvent;
          try {
            event = JSON.parse(line.slice(6)) as ChatSSEEvent;
          } catch {
            continue;
          }

          if (event.type === 'text') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: m.content + event.content } : m,
              ),
            );
          } else if (event.type === 'tool_result' && event.mutated) {
            hasMutationsRef.current = true;
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: `Something went wrong: ${event.message}`, isStreaming: false }
                  : m,
              ),
            );
          } else if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
              ),
            );
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: 'Connection error. Please try again.', isStreaming: false }
              : m,
          ),
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      if (hasMutationsRef.current) {
        onActivityMutation();
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col w-full sm:max-w-md"
      >
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <SheetTitle className="font-display font-semibold text-lg leading-snug">
            Trip Assistant
          </SheetTitle>
          <SheetDescription className="type-caption">
            Ask about your itinerary or manage activities
          </SheetDescription>
        </SheetHeader>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0"
        >
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your trip…"
              rows={1}
              disabled={isLoading}
              className={cn(
                'flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2',
                'text-sm text-text-base leading-relaxed placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                'disabled:opacity-50 overflow-hidden',
                'dark:bg-slate-800 dark:border-slate-700',
              )}
            />
            <Button
              onClick={sendMessage}
              disabled={!inputValue.trim() || isLoading}
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary-dark font-semibold shrink-0 h-9 w-9 p-0"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="type-caption mt-2 text-center">
            Shift + Enter for new line
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
