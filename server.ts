import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const BRIDGE_PORT = 8765;
const DEFAULT_SSID = '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]';

let bridgeProc: ChildProcess | null = null;

function startBridge() {
  console.log(`[Server] Starting internal Pocket Option bridge on 127.0.0.1:${BRIDGE_PORT}...`);
  const env = {
    ...process.env,
    POCKET_SSID: process.env.POCKET_SSID || DEFAULT_SSID,
  };

  bridgeProc = spawn('python3', ['-m', 'uvicorn', 'bridge.server:app', '--host', '127.0.0.1', '--port', String(BRIDGE_PORT), '--log-level', 'warning'], {
    env,
    cwd: __dirname,
  });

  bridgeProc.stdout?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Bridge] ${msg}`);
  });

  bridgeProc.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    if (!msg) return;
    if (msg.includes('ERROR') || msg.includes('Traceback') || msg.includes('Exception:')) {
      console.error(`[Bridge Error] ${msg}`);
    } else {
      console.log(`[Bridge] ${msg}`);
    }
  });

  bridgeProc.on('exit', (code, sig) => {
    console.log(`[Bridge] Exited with code ${code}, signal ${sig}. Restarting in 3s...`);
    setTimeout(startBridge, 3000);
  });
}

async function main() {
  startBridge();

  const app = express();
  app.use(express.json());

  // Proxy status
  app.get('/api/status', async (req, res) => {
    try {
      const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/status`);
      if (response.ok) {
        const data = await response.json();
        return res.json(data);
      }
    } catch {
      // Bridge still warming up
    }
    res.json({
      ready: false,
      error: 'Connecting to Pocket Option live bridge...',
      balance: null,
      demo: true,
      assets: 0,
    });
  });

  // Proxy assets list
  app.get('/api/assets', async (req, res) => {
    try {
      const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/assets`);
      if (response.ok) {
        const data = await response.json();
        return res.json(data);
      }
    } catch {
      // Return empty array while loading
    }
    res.json([]);
  });

  // Proxy SSID update
  app.post('/api/set-ssid', async (req, res) => {
    try {
      const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/set-ssid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.json(data);
    } catch (e) {
      res.status(500).json({ status: 'error', msg: String(e) });
    }
  });

  const server = http.createServer(app);

  // WebSocket Server for /ws proxy
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (clientWs) => {
        wss.emit('connection', clientWs, request);
      });
    }
  });

  wss.on('connection', (clientWs: WebSocket, request: http.IncomingMessage) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const upstreamUrl = `ws://127.0.0.1:${BRIDGE_PORT}/ws${url.search}`;

    let upstreamWs: WebSocket | null = null;
    let isClientClosed = false;

    try {
      upstreamWs = new WebSocket(upstreamUrl);

      upstreamWs.on('open', () => {
        // Forward buffered messages if any
      });

      upstreamWs.on('message', (data, isBinary) => {
        if (!isClientClosed && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      upstreamWs.on('error', (err) => {
        if (!isClientClosed && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'info', msg: `Bridge connecting: ${err.message}` }));
        }
      });

      upstreamWs.on('close', () => {
        if (!isClientClosed && clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
      });

      clientWs.on('message', (data, isBinary) => {
        if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.send(data, { binary: isBinary });
        }
      });

      clientWs.on('close', () => {
        isClientClosed = true;
        if (upstreamWs) {
          upstreamWs.close();
        }
      });

      clientWs.on('error', () => {
        isClientClosed = true;
        if (upstreamWs) {
          upstreamWs.close();
        }
      });
    } catch {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', msg: 'Unable to connect to Pocket Option bridge' }));
      }
    }
  });

  // Mount Vite middlewares in development
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Full-stack QuantX server running at http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[Server Fatal]', err);
  process.exit(1);
});
