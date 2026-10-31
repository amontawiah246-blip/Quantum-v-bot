import React, { useState } from 'react';
import { BROKERS } from "./assets";

export interface StatusData {
  ready?: boolean;
  error?: string;
  balance?: number | null;
  demo?: boolean;
  assets?: number;
}

interface HomeProps {
  status: StatusData | null;
  onOpenChart: () => void;
}

export function Home({ status, onOpenChart }: HomeProps) {
  return (
    <div className="page">
      <h1>QuantX</h1>
      <div className="card">
        <div className="row">
          <span>Bridge</span>
          <b className={status?.ready ? "up" : "down"}>
            {status?.ready ? "Connected" : status ? "Starting / Connecting..." : "Offline"}
          </b>
        </div>
        <div className="row"><span>Account</span><b>{status?.ready ? (status.demo ? "Demo" : "Real") : "—"}</b></div>
        <div className="row"><span>Balance</span><b>{status?.balance != null ? `$${status.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</b></div>
        <div className="row"><span>Assets</span><b>{status?.assets ?? "—"}</b></div>
        {status?.error && <p className="warn">{status.error}</p>}
      </div>
      <button className="primary" onClick={onOpenChart}>Open chart</button>
    </div>
  );
}

export function Signals() {
  return (
    <div className="page">
      <h1>Signals</h1>
      <p className="muted">Strategy signals will live here, apart from the chart. Nothing is generated yet.</p>
    </div>
  );
}

interface ApiProps {
  bridge: string;
  setBridge: (v: string) => void;
}

export function Api({ bridge, setBridge }: ApiProps) {
  const [ssidInput, setSsidInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const saveSsid = async () => {
    if (!ssidInput.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/set-ssid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: ssidInput.trim() }),
      });
      const data = await res.json();
      setMsg(data.msg || 'SSID saved successfully');
    } catch (e) {
      setMsg(`Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h1>API & Cloud Bridge</h1>
      <div className="card">
        <div className="row">
          <span>Bridge Mode</span>
          <b className="up">Cloud Server (No Laptop Needed)</b>
        </div>
      </div>

      <label className="field">Bridge host address
        <input value={bridge} onChange={(e) => setBridge(e.target.value)} spellCheck={false} />
      </label>

      <div className="field">
        <span>Pocket Option SSID</span>
        <textarea
          rows={3}
          placeholder='Update session: 42["auth",{"session":"...","isDemo":1,...}]'
          value={ssidInput}
          onChange={(e) => setSsidInput(e.target.value)}
          className="search"
          style={{ fontFamily: 'monospace', fontSize: '11px', resize: 'vertical' }}
        />
        <button
          className="primary"
          style={{ marginTop: '8px' }}
          disabled={saving || !ssidInput.trim()}
          onClick={saveSsid}
        >
          {saving ? 'Updating...' : 'Update & Reconnect Session'}
        </button>
        {msg && <p className="muted" style={{ marginTop: '6px' }}>{msg}</p>}
      </div>

      <div className="card">
        {BROKERS.map((b) => (
          <div className="row" key={b.id}>
            <span>{b.name}<small>{b.note}</small></span>
            <b className={b.ready ? "up" : "muted"}>{b.ready ? "Active" : "Soon"}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Menu() {
  return (
    <div className="page">
      <h1>Menu</h1>
      <p className="muted">Settings, trade history and bot controls will be added here as separate screens.</p>
    </div>
  );
}
