// Paid venue transport: websim native realtime room (server.js "room").
export async function connectRealm(join, handlers) {
  const room = await WebsimSocket.joinRoom();
  const t = {
    kind: "realm",
    send: (o) => room.send(o),
    close: () => { try { room.close(); } catch (e) {} },
  };
  room.onmessage = (e) => { let m; try { m = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; } handlers.message(m); };
  room.onreconnect = () => { handlers.reconnect?.(); room.send(join); };
  room.onclose = (e) => handlers.close?.(e?.reason || "Disconnected");
  room.send(join);
  return t;
}
