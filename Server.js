const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 4444;

// ============================================================================
// HTTP Server（回應健康檢查，同時設定 CORS）
// ============================================================================
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('okay');
});

// ============================================================================
// WebSocket Server（Signaling）
// ============================================================================
const wss = new WebSocket.Server({ server });

// room -> Set of WebSocket connections
const rooms = new Map();

const getOrCreateRoom = (roomName) => {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  return rooms.get(roomName);
};

wss.on('connection', (ws) => {
  const subscribedRooms = new Set();

  ws.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch (e) {
      return;
    }

    if (message.type === 'subscribe') {
      // 加入 room
      const topics = message.topics || [];
      topics.forEach((topic) => {
        const room = getOrCreateRoom(topic);
        room.add(ws);
        subscribedRooms.add(topic);
      });
    } else if (message.type === 'unsubscribe') {
      // 離開 room
      const topics = message.topics || [];
      topics.forEach((topic) => {
        const room = rooms.get(topic);
        if (room) {
          room.delete(ws);
          if (room.size === 0) rooms.delete(topic);
        }
        subscribedRooms.delete(topic);
      });
    } else if (message.type === 'publish') {
      // 廣播給同 room 的其他人
      const topic = message.topic;
      if (!topic) return;
      const room = rooms.get(topic);
      if (!room) return;

      const outgoing = JSON.stringify(message);
      room.forEach((peer) => {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(outgoing);
        }
      });
    } else if (message.type === 'ping') {
      // 回應 pong
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    }
  });

  ws.on('close', () => {
    // 離開所有 room
    subscribedRooms.forEach((topic) => {
      const room = rooms.get(topic);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(topic);
      }
    });
    subscribedRooms.clear();
  });

  ws.on('error', (err) => {
    console.error('[WS Error]', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`[ZenNotes Signaling] 🚀 Server running on port ${PORT}`);
});
