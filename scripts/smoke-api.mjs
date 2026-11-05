import WebSocket from 'ws';

const baseUrl = process.env.API_URL ?? 'http://localhost:8080/api';
const publicOrigin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:8080';

const health = await fetch(`${baseUrl}/health`);
if (!health.ok) throw new Error(`Health check failed: ${health.status}`);

const created = await fetch(`${baseUrl}/rooms`, {
  method: 'POST',
  headers: { origin: publicOrigin, 'content-type': 'application/json' },
  body: JSON.stringify({ nickname: 'Smoke Test' }),
});
if (created.status !== 201)
  throw new Error(`Room creation failed: ${created.status}`);
const cookie = created.headers.get('set-cookie')?.split(';', 1)[0];
if (!cookie) throw new Error('Room creation did not issue a session cookie');
const createdBody = await created.json();
const code = createdBody.snapshot?.public?.roomCode;
if (!/^[A-Z]{4}$/.test(code)) throw new Error('Invalid room code in snapshot');

const restored = await fetch(`${baseUrl}/session`, { headers: { cookie } });
if (!restored.ok) throw new Error(`Session restore failed: ${restored.status}`);
const restoredBody = await restored.json();
if (restoredBody.snapshot?.public?.roomCode !== code)
  throw new Error('Restored session returned a different room');

const websocketUrl = `${baseUrl.replace(/^http/, 'ws').replace(/\/api$/, '')}/ws?room=${code}`;
await new Promise((resolve, reject) => {
  const socket = new WebSocket(websocketUrl, {
    headers: { cookie, origin: publicOrigin },
  });
  const timer = setTimeout(() => {
    socket.terminate();
    reject(new Error('WebSocket snapshot timed out'));
  }, 10_000);
  socket.on('message', (data) => {
    const event = JSON.parse(data.toString());
    if (event.type !== 'snapshot') return;
    clearTimeout(timer);
    socket.close();
    if (event.snapshot?.public?.roomCode !== code)
      reject(new Error('WebSocket snapshot returned a different room'));
    else resolve();
  });
  socket.on('error', reject);
});

process.stdout.write(`Smoke test passed for room ${code}\n`);
