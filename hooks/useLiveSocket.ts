"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_MONITORING_WS_URL || "ws://localhost:8001/ws/live";

export interface LiveMessage {
  type: "new_measurement" | "storage_unreachable";
  set_number?: number;
  data?: Record<string, unknown>;
  message?: string;
}

export function useLiveSocket(onMessage: (msg: LiveMessage) => void) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        retryTimeout = setTimeout(connect, 5000);
        return;
      }

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) retryTimeout = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as LiveMessage;
          handlerRef.current(msg);
        } catch {
          // ignore malformed message
        }
      };
    }

    connect();

    const keepAlive = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
    }, 20000);

    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
      clearInterval(keepAlive);
      ws?.close();
    };
  }, []);

  return { connected };
}
