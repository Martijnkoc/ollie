/**
 * Video infrastructure behind one small interface. Provider keys stay on the server.
 * - daily: private two-person rooms on Daily, participant-bound meeting tokens
 * - fake:  no media connection at all; for automated tests and closed previews only,
 *          and always labelled as such in the interface
 */
export interface VideoProvider {
  name: "daily" | "fake";
  createRoom(opts: { dateId: string; nbf: Date; exp: Date }): Promise<{ room: string; url: string }>;
  token(opts: { room: string; participantId: string; name: string; nbf: Date; exp: Date }): Promise<string>;
  /** Move the room's hard end to the date's single end time. */
  setExpiry(room: string, exp: Date): Promise<void>;
  /** Delete the room: everyone still inside is removed and no token works any more. */
  closeRoom(room: string): Promise<void>;
  /** Participant ids the provider sees in the room, or null when the provider cannot tell. */
  present(room: string): Promise<string[] | null>;
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const DAILY = "https://api.daily.co/v1";

async function daily<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${DAILY}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (method === "DELETE" && res.status === 404) return {} as T;
  if (!res.ok) throw new Error(`Daily ${method} ${path.split("/")[1]} failed with status ${res.status}`);
  return res.json() as Promise<T>;
}

export const dailyProvider: VideoProvider = {
  name: "daily",
  async createRoom({ dateId, nbf, exp }) {
    const room = await daily<{ name: string; url: string }>("POST", "/rooms", {
      name: `cafe-${dateId.slice(0, 8)}-${Math.random().toString(36).slice(2, 10)}`,
      privacy: "private",
      properties: {
        nbf: unix(nbf),
        exp: unix(exp),
        eject_at_room_exp: true,
        max_participants: 2,
        enable_chat: false,
        enable_screenshare: false,
        enable_knocking: false,
        enable_prejoin_ui: false,
        enable_people_ui: false,
        // Recording and transcription are not enabled for these rooms.
      },
    });
    return { room: room.name, url: room.url };
  },
  async token({ room, participantId, name, nbf, exp }) {
    const { token } = await daily<{ token: string }>("POST", "/meeting-tokens", {
      properties: {
        room_name: room,
        user_id: participantId,
        user_name: name,
        is_owner: false,
        nbf: unix(nbf),
        exp: unix(exp),
        eject_at_token_exp: true,
        enable_screenshare: false,
      },
    });
    return token;
  },
  async setExpiry(room, exp) {
    await daily("POST", `/rooms/${encodeURIComponent(room)}`, { properties: { exp: unix(exp), eject_at_room_exp: true } });
  },
  async closeRoom(room) {
    await daily("DELETE", `/rooms/${encodeURIComponent(room)}`);
  },
  async present(room) {
    const res = await daily<{ data?: { userId?: string }[] }>("GET", `/rooms/${encodeURIComponent(room)}/presence`);
    return (res.data ?? []).map((p) => p.userId).filter((id): id is string => Boolean(id));
  },
};

/** Records what it was asked to do, so tests can check the provider side of the timer. */
export function createFakeProvider() {
  const calls: { op: string; room: string; at?: Date }[] = [];
  const provider: VideoProvider & { calls: typeof calls } = {
    name: "fake",
    calls,
    async createRoom({ dateId }) {
      calls.push({ op: "create", room: `fake-${dateId}` });
      return { room: `fake-${dateId}`, url: "" };
    },
    async token({ room }) {
      calls.push({ op: "token", room });
      return "fake-token";
    },
    async setExpiry(room, exp) {
      calls.push({ op: "expiry", room, at: exp });
    },
    async closeRoom(room) {
      calls.push({ op: "close", room });
    },
    async present() {
      return null;
    },
  };
  return provider;
}

const fakeSingleton = createFakeProvider();

export function videoProvider(): VideoProvider | null {
  if (process.env.DAILY_API_KEY) return dailyProvider;
  const testsAllowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_TRANSPORTS === "true";
  if (process.env.VIDEO_PROVIDER === "fake" && testsAllowed) return fakeSingleton;
  return null;
}
