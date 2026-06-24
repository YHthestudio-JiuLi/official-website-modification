const { WebSocketServer } = require('ws');

function attachWebSocket(server, deps) {
  const { dbOperations, adminTokens } = deps;
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcastToChat(sessionId, payload) {
    const msg = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState !== 1) continue;
      if (client.chatSessionId === sessionId || (client.isAdmin && client.adminSubscribed)) {
        client.send(msg);
      }
    }
  }

  deps.broadcastToChat = broadcastToChat;
  deps.wss = wss;

  wss.on('connection', (ws) => {
    ws.isAdmin = false;
    ws.adminSubscribed = false;
    ws.chatSessionId = null;

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (data.type === 'auth') {
        if (data.role === 'admin' && data.token && adminTokens.has(data.token)) {
          ws.isAdmin = true;
          ws.adminSubscribed = true;
          ws.send(JSON.stringify({ type: 'auth_ok', role: 'admin' }));
          return;
        }
        if (data.role === 'user' && data.sessionId) {
          dbOperations.chatSessions.findById(data.sessionId).then((session) => {
            if (session) {
              ws.isAdmin = false;
              ws.chatSessionId = data.sessionId;
              ws.send(JSON.stringify({ type: 'auth_ok', role: 'user' }));
            } else {
              ws.send(JSON.stringify({ type: 'auth_fail' }));
            }
          }).catch(() => {
            ws.send(JSON.stringify({ type: 'auth_fail' }));
          });
          return;
        }
        ws.send(JSON.stringify({ type: 'auth_fail' }));
        return;
      }

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    });

    ws.on('close', () => {
      ws.chatSessionId = null;
    });
  });

  return wss;
}

module.exports = { attachWebSocket };
