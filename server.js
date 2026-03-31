const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 4444;

const server = http.createServer((req, res) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('okay');
});

// 關鍵：用 noServer: true，然後手動處理 upgrade
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  console.log('[WS] upgrade 請求收到');
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const rooms = new Map();

wss.on('connection', (ws) => {
  console.log('[WS] 新連線，目前:', wss.clients.size);
  const subscribedRooms = new Set();

  ws.on('message', (rawMessage) => {
    let message;
    try { message = JSON.parse(rawMessage); } catch (e) { return; }

    if (message.type === 'subscribe') {
      (message.topics || []).forEach((topic) => {
        if (!rooms.has(topic)) rooms.set(topic, new Set());
        rooms.get(topic).add(ws);
        subscribedRooms.add(topic);
        console.log(`[WS] 加入 room: ${topic}, 人數: ${rooms.get(topic).size}`);
      });
    } else if (message.type === 'unsubscribe') {
      (message.topics || []).forEach((topic) => {
        const room = rooms.get(topic);
        if (room) { room.delete(ws); if (room.size === 0) rooms.delete(topic); }
        subscribedRooms.delete(topic);
      });
    } else if (message.type === 'publish') {
      const topic = message.topic;
      if (!topic) return;
      const room = rooms.get(topic);
      if (!room) return;
      const outgoing = JSON.stringify(message);
      room.forEach((peer) => {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(outgoing);
      });
    } else if (message.type === 'ping') {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] 關閉，目前:', wss.clients.size);
    subscribedRooms.forEach((topic) => {
      const room = rooms.get(topic);
      if (room) { room.delete(ws); if (room.size === 0) rooms.delete(topic); }
    });
    subscribedRooms.clear();
  });

  ws.on('error', (err) => console.error('[WS Error]', err.message));
});

server.listen(PORT, () => {
  console.log(`[ZenNotes Signaling] 🚀 Server running on port ${PORT}`);
});
