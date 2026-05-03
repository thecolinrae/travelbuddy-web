'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Sun, Moon, Check, Copy, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { COMMON_CURRENCIES } from '@/services/currency';

interface Props {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  preferredCurrency: string;
  mcpToken: string;
  appUrl: string;
}

export function SettingsClient({ name, email, avatarUrl, preferredCurrency: initial, mcpToken, appUrl }: Props) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currency, setCurrency] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const mcpConfigJson = JSON.stringify({
    type: 'http',
    url: `${appUrl}/api/mcp`,
    headers: { Authorization: `Bearer ${mcpToken}` },
  }, null, 2);

  async function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => setMounted(true), []);

  async function handleCurrencyChange(val: string) {
    setCurrency(val);
    setSaving(true);
    try {
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredCurrency: val }),
      });
      toast.success('Preference saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const THEMES = [
    { id: 'system', label: 'System', Icon: Monitor },
    { id: 'light',  label: 'Light',  Icon: Sun    },
    { id: 'dark',   label: 'Dark',   Icon: Moon   },
  ] as const;

  return (
    <div className="space-y-8">
      {/* Profile */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Profile
        </h2>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name ?? email}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-semibold text-primary">
              {(name ?? email).slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            {name && <p className="font-medium">{name}</p>}
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Appearance
        </h2>
        {mounted && (
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={[
                  'flex flex-col items-center gap-2 rounded-xl border-2 py-4 transition-colors text-sm font-medium',
                  theme === id
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-muted-foreground/40',
                ].join(' ')}
              >
                <Icon className="h-5 w-5" />
                {label}
                {theme === id && <Check className="h-3 w-3" />}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Preferences */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Preferences
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="currency-pref">Default currency</Label>
          <Select
            id="currency-pref"
            value={currency}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            disabled={saving}
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Used as the default for new trip imports.
          </p>
        </div>
      </section>

      {/* Integrations */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Integrations
          </h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Use your personal bearer token to connect AI agents and MCP clients to your TravelBuddy account.
          The token gives access to your trips and those shared with you.
        </p>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bearer token</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border bg-surface px-3 py-2 font-mono text-xs text-text-base break-all leading-relaxed">
              {mcpToken}
            </code>
            <button
              onClick={() => copyToClipboard(mcpToken, setCopiedToken)}
              className="shrink-0 rounded-lg border bg-card p-2 hover:bg-surface transition-colors"
              aria-label="Copy bearer token"
            >
              {copiedToken ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">MCP server config</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Add this to your Claude Code project or Claude Desktop configuration.
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 rounded-lg border bg-surface px-3 py-2 font-mono text-xs text-text-base overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
              {mcpConfigJson}
            </pre>
            <button
              onClick={() => copyToClipboard(mcpConfigJson, setCopiedConfig)}
              className="shrink-0 rounded-lg border bg-card p-2 hover:bg-surface transition-colors mt-0"
              aria-label="Copy MCP config"
            >
              {copiedConfig ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
