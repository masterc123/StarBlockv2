/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isAi: boolean;
  aiDifficulty?: 'Easy' | 'Medium' | 'Hard' | 'Brutal';
  team: 1 | 2 | 0; // 0 = FFA
  faction: 'Terran Dominion' | 'Zerg Swarm' | 'Protoss Fleet' | 'Protoss Solaris';
  ping: number;
  ready: boolean;
  antiCheatVerified?: boolean;
  antiCheatFlags?: number;
}

export interface ChatMessageEntry {
  sender: string;
  text: string;
  time: string;
  channel?: 'ALL' | 'TEAM' | 'SYSTEM';
  team?: number;
}

export interface MultiplayerLobby {
  id: string;
  name: string;
  hostName: string;
  hostId: string;
  mode: 'team_ai' | 'deathmatch' | '2v2' | 'ffa';
  mapName: string;
  maxPlayers: number;
  ping: number;
  status: 'Waiting' | 'Ready' | 'In Progress';
  players: LobbyPlayer[];
  messages: ChatMessageEntry[];
  seed?: number;
}

type Listener = (event: { type: string; payload: any }) => void;

class RealtimeMultiplayerClient {
  private ws: WebSocket | null = null;
  private channel: BroadcastChannel | null = null;
  private listeners: Set<Listener> = new Set();
  private isConnected = false;
  public myPlayerId: string;
  public myPlayerName: string;
  public clientKey: string;
  public currentLobbyId: string | null = null;
  public measuredPing = 18;

  constructor() {
    this.myPlayerId = `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const randomNum = Math.floor(Math.random() * 900 + 100);
    this.myPlayerName = `Commander_${randomNum}`;
    this.clientKey = this.myPlayerId;

    if (typeof window !== 'undefined') {
      try {
        const storedKey = window.localStorage.getItem('OUTPOST_CLIENT_KEY');
        if (storedKey) {
          this.clientKey = storedKey;
        } else {
          window.localStorage.setItem('OUTPOST_CLIENT_KEY', this.clientKey);
        }
      } catch {}
    }

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('sector09_multiplayer_bus');
        this.channel.onmessage = (e) => {
          this.handleIncoming(e.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }

    this.connectWebSocket();
  }

  private connectWebSocket() {
    if (typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit('connection_status', { connected: true, transport: 'websocket' });
        this.send({ type: 'c:hello', clientKey: this.clientKey, name: this.myPlayerName });
        this.send({ type: 'c:get_lobbies', clientKey: this.clientKey });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncoming(data);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('connection_status', { connected: false, transport: 'broadcast_channel' });
        setTimeout(() => this.connectWebSocket(), 3500);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      // In sandbox environments that disable raw WS, BroadcastChannel handles multi-tab
      this.emit('connection_status', { connected: true, transport: 'broadcast_channel' });
    }
  }

  private handleIncoming(data: any) {
    if (!data || !data.type) return;

    if (data.type === 's:init') {
      this.myPlayerId = data.playerId || this.myPlayerId;
      this.emit('lobbies_update', data.lobbies || []);
    } else if (data.type === 's:lobby_list') {
      this.emit('lobbies_update', data.lobbies || []);
    } else if (data.type === 's:room_state') {
      this.emit('room_update', data.lobby);
    } else if (data.type === 's:chat_message') {
      this.emit('chat_message', data.message);
    } else if (data.type === 's:game_start') {
      this.emit('game_start', data);
    } else if (data.type === 's:game_order') {
      this.emit('game_order', data);
    } else if (data.type === 's:pong') {
      const rtt = Math.max(8, Date.now() - (Number(data.clientTs) || Date.now()));
      this.measuredPing = rtt;
      this.emit('ping_measured', { ping: rtt });
    } else if (data.type === 's:ping_update') {
      this.emit('ping_update', data);
    } else if (data.type === 's:share_resources') {
      this.emit('share_resources', data);
    } else if (data.type === 's:penalty_status') {
      this.emit('penalty_status', data);
    } else if (data.type === 's:anticheat_alert') {
      this.emit('anticheat_alert', data);
    } else if (data.type === 's:anticheat_ok') {
      this.emit('anticheat_ok', data);
    }
  }

  public send(msg: any) {
    const payloadWithKey = { ...msg, clientKey: this.clientKey };
    const raw = JSON.stringify(payloadWithKey);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    }
    if (this.channel) {
      try {
        this.channel.postMessage(payloadWithKey);
      } catch {}
    }
  }

  public subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(type: string, payload: any) {
    this.listeners.forEach((fn) => fn({ type, payload }));
  }

  public createLobby(name: string, mode: 'team_ai' | 'deathmatch' | '2v2' | 'ffa') {
    this.send({
      type: 'c:create_lobby',
      name,
      mode
    });
  }

  public joinLobby(lobbyId: string, name?: string) {
    this.currentLobbyId = lobbyId;
    this.send({
      type: 'c:join_lobby',
      lobbyId,
      name: name || this.myPlayerName
    });
  }

  public leaveLobby(inGameAbandon = false) {
    this.currentLobbyId = null;
    this.send({ type: 'c:leave_lobby', inGameAbandon });
  }

  public abandonMatch() {
    this.currentLobbyId = null;
    this.send({ type: 'c:abandon_match' });
  }

  public updatePlayer(updates: Partial<LobbyPlayer> & { mode?: string }) {
    this.send({
      type: 'c:update_player',
      ...updates
    });
  }

  public addBot(difficulty: 'Easy' | 'Medium' | 'Hard' | 'Brutal') {
    this.send({
      type: 'c:add_bot',
      difficulty
    });
  }

  public removePlayer(playerId: string) {
    this.send({
      type: 'c:remove_player',
      playerId
    });
  }

  public sendChat(text: string, channel: 'ALL' | 'TEAM' = 'ALL') {
    this.send({
      type: 'c:chat',
      text,
      channel
    });
  }

  public shareResources(toPlayerId: string, toPlayerName: string, minerals: number, gems: number) {
    this.send({
      type: 'c:share_resources',
      toPlayerId,
      toPlayerName,
      minerals,
      gems
    });
  }

  public sendAntiCheatHeartbeat(digest: { req: number; gems: number; unitsCount: number; buildingsCount: number; wave: number; checksum: number }) {
    this.send({
      type: 'c:anticheat_heartbeat',
      ...digest
    });
  }

  public startGame() {
    this.send({ type: 'c:start_game' });
  }

  public sendGameOrder(order: any) {
    this.send({
      type: 'c:game_order',
      order
    });
  }
}

export const realtimeClient = new RealtimeMultiplayerClient();
