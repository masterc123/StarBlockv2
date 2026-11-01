/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';

interface GameStateSnapshot {
  basePlaced: boolean;
  hqDead: boolean;
  hqHp: number;
  missionWon: boolean;
  isEndless: boolean;
  req: number;
  wave: number;
  kills: number;
  unitsCount: number;
  enemiesCount: number;
  fowRevealAll: boolean;
  stats?: Record<string, any> | null;
  userData?: Record<string, any> | null;
}

interface BaseBarrier {
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  z: number;
  radius: number;
}

interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isAi: boolean;
  aiDifficulty?: 'Easy' | 'Medium' | 'Hard' | 'Brutal';
  team: 1 | 2 | 3 | 4 | 0; // 0 = FFA
  faction: 'Terran Dominion' | 'Zerg Swarm' | 'Protoss Fleet' | 'Protoss Solaris';
  ping: number;
  ready: boolean;
  antiCheatVerified?: boolean;
  antiCheatFlags?: number;
}

interface ChatMessageEntry {
  sender: string;
  text: string;
  time: string;
  channel?: 'ALL' | 'TEAM' | 'SYSTEM';
  team?: number;
}

type LobbyGameMode = '1v1' | '1v2' | '1v3' | '2v2' | 'ffa' | 'custom' | 'team_ai' | 'deathmatch';

interface MultiplayerLobby {
  id: string;
  name: string;
  hostName: string;
  hostId: string;
  mode: LobbyGameMode;
  mapBiome?: 'highland' | 'desert' | 'ocean' | 'lava' | 'jungle' | 'random';
  mapName: string;
  maxPlayers: number;
  ping: number;
  status: 'Waiting' | 'Ready' | 'In Progress';
  players: LobbyPlayer[];
  messages: ChatMessageEntry[];
  seed?: number;
}

interface CommanderProfile {
  callsign: string;
  rank: string;
  division: string;
  preferredFaction: 'Terran Dominion' | 'Protoss Solaris' | 'Zerg Swarm';
  emblem: 'dominion_eagle' | 'solaris_crest' | 'zerg_brood' | 'spec_ops';
  wins: number;
  matches: number;
  specialty: string;
}

declare global {
  interface Window {
    titleScreenActive?: boolean;
    gamePaused?: boolean;
    fowRevealAll?: boolean;
    loadingCameraSweep?: boolean;
    MAP_SEED?: number;
    MAP_ARCHETYPE?: string;
    BRIDGES?: Array<any>;
    BASE_TERRAIN_ZONES?: Array<any>;
    GEM_CRATERS?: Array<any>;
    DESTROYED_RUNWAYS?: Array<any>;
    DYNAMIC_TRENCHES?: Array<any>;
    ACTIVE_PLANET_BIOME?: string;
    setPlanetBiome?: (biomeName: string, regenerateNow?: boolean) => string;
    regenerateDynamicSectorMap?: (customSeed?: number, customPlayers?: any[]) => number;
    validateAndBuildMultiplayerRoster?: (lobbyConfig: any) => {
      valid: boolean;
      errors: string[];
      roster: any[];
      humanCount?: number;
      aiCount?: number;
      teams?: Record<number, any[]>;
      mode?: string;
      mapBiome?: string;
      seed?: number;
    };
    initializeMultiplayerMatchFromRoster?: (lobbyConfig: any) => any;
    SFX?: {
      muted: boolean;
      init: () => void;
      playClick: () => void;
      playBuild: () => void;
      playHeal: () => void;
      playExplosion: (heavy?: boolean) => void;
    };
    GAME_API?: {
      getState: () => GameStateSnapshot;
      startMission: (config?: any) => void;
      repairHQ: () => void;
      focusCamera: (zone: 'hq' | 'bridge' | 'hive') => void;
      getBaseBarriers?: () => BaseBarrier[];
      getSelectedBaseBarrier?: () => string;
      selectBaseBarrierZone?: (id: string) => void;
      deployBaseAtBarrier?: (id: string) => boolean;
      regenerateMap?: (customSeed?: number, customPlayers?: any[]) => number;
      spendResourcesForShare?: (minerals: number, gems: number) => boolean;
      receiveSharedResources?: (minerals: number, gems: number, senderName?: string) => boolean;
      getAntiCheatDigest?: () => {
        req: number;
        gems: number;
        unitsCount: number;
        buildingsCount: number;
        wave: number;
        checksum: number;
      };
      runInitializationStep?: (stepIndex: number, config?: any) => Promise<{ ok: boolean; stage: string }>;
      getBattleCinematicState?: () => {
        stageIndex: number;
        totalStages: number;
        title: string;
        subtitle: string;
        progress: number;
      } | null;
      restartBattleCinematic?: () => void;
      getStateSnapshot?: () => any;
      applyStateSnapshot?: (snap: any) => void;
      handleNetworkOrder?: (order: any, senderId?: string) => void;
    };
  }
}

function buildPresetPlayersForMode(
  mode: LobbyGameMode,
  humanId: string,
  humanName: string,
  humanFaction: LobbyPlayer['faction'],
  humanPing = 15,
  defaultBotDiff: 'Easy' | 'Medium' | 'Hard' | 'Brutal' = 'Hard'
): LobbyPlayer[] {
  const isFfa = mode === 'ffa' || mode === 'deathmatch';
  const hostSlot: LobbyPlayer = {
    id: humanId,
    name: humanName,
    isHost: true,
    isAi: false,
    team: isFfa ? 0 : 1,
    faction: humanFaction,
    ping: humanPing,
    ready: true,
    antiCheatVerified: true,
    antiCheatFlags: 0
  };

  const makeAi = (
    idx: number,
    name: string,
    team: 1 | 2 | 3 | 4 | 0,
    faction: LobbyPlayer['faction'],
    diff: 'Easy' | 'Medium' | 'Hard' | 'Brutal' = defaultBotDiff
  ): LobbyPlayer => ({
    id: `bot_preset_${idx}_${Date.now()}`,
    name: `[AI] ${name}`,
    isHost: false,
    isAi: true,
    aiDifficulty: diff,
    team,
    faction,
    ping: 0,
    ready: true,
    antiCheatVerified: true,
    antiCheatFlags: 0
  });

  switch (mode) {
    case '1v1':
      return [
        hostSlot,
        makeAi(1, 'Kerrigan_Brood', 2, 'Zerg Swarm', defaultBotDiff)
      ];
    case '1v2':
      return [
        hostSlot,
        makeAi(1, 'Kerrigan_Brood', 2, 'Zerg Swarm', defaultBotDiff),
        makeAi(2, 'Artanis_Fleet', 2, 'Protoss Fleet', defaultBotDiff)
      ];
    case '1v3':
      return [
        hostSlot,
        makeAi(1, 'Kerrigan_Brood', 2, 'Zerg Swarm', defaultBotDiff),
        makeAi(2, 'Artanis_Fleet', 2, 'Protoss Fleet', defaultBotDiff),
        makeAi(3, 'Mengsk_Guard', 2, 'Terran Dominion', defaultBotDiff)
      ];
    case '2v2':
    case 'team_ai':
      return [
        hostSlot,
        makeAi(1, 'Tassadar_Solaris', 1, 'Protoss Fleet', defaultBotDiff),
        makeAi(2, 'Kerrigan_Brood', 2, 'Zerg Swarm', defaultBotDiff),
        makeAi(3, 'Zagara_Swarm', 2, 'Zerg Swarm', defaultBotDiff)
      ];
    case 'ffa':
    case 'deathmatch':
      return [
        hostSlot,
        makeAi(1, 'Kerrigan_Brood', 0, 'Zerg Swarm', defaultBotDiff),
        makeAi(2, 'Artanis_Fleet', 0, 'Protoss Fleet', defaultBotDiff),
        makeAi(3, 'Mengsk_Guard', 0, 'Terran Dominion', defaultBotDiff)
      ];
    case 'custom':
    default:
      return [
        hostSlot,
        makeAi(1, 'Kerrigan_Brood', 2, 'Zerg Swarm', defaultBotDiff)
      ];
  }
}

export default function App() {
  const [phase, setPhase] = useState<'menu' | 'multiplayer_browser' | 'inside_lobby' | 'loading_match' | 'playing' | 'defeat'>('menu');
  const [lobbies, setLobbies] = useState<MultiplayerLobby[]>([]);
  const [selectedLobby, setSelectedLobby] = useState<MultiplayerLobby | null>(null);
  const [lobbyFilter, setLobbyFilter] = useState<'all' | LobbyGameMode>('all');
  const [lobbyValidationError, setLobbyValidationError] = useState<string | null>(null);
  const [activeBarrierId, setActiveBarrierId] = useState<string>('alpha');
  const [chatMessages, setChatMessages] = useState<ChatMessageEntry[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatChannel, setChatChannel] = useState<'ALL' | 'TEAM'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('Sector-09 Skirmish');
  const [newRoomMode, setNewRoomMode] = useState<LobbyGameMode>('1v1');
  const [mapSeedDisplay, setMapSeedDisplay] = useState<number>(() => window.MAP_SEED || 100);
  const [mapArchetypeDisplay, setMapArchetypeDisplay] = useState<string>(() => window.MAP_ARCHETYPE || 'open_badlands');
  const [bridgeCountDisplay, setBridgeCountDisplay] = useState<number>(() => (window.BRIDGES ? window.BRIDGES.length : 0));
  const [planetBiome, setPlanetBiome] = useState<'highland' | 'desert' | 'ocean' | 'lava' | 'jungle' | 'random'>('highland');

  const handleSelectPlanetBiome = (biome: 'highland' | 'desert' | 'ocean' | 'lava' | 'jungle' | 'random') => {
    setPlanetBiome(biome);
    if (typeof window.setPlanetBiome === 'function') {
      window.setPlanetBiome(biome, true);
      setMapSeedDisplay(window.MAP_SEED || 100);
      setBridgeCountDisplay(window.BRIDGES ? window.BRIDGES.length : 0);
    }
    if (selectedLobby) {
      setSelectedLobby(prev => prev ? { ...prev, mapBiome: biome } : prev);
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'c:update_lobby_config',
          mapBiome: biome,
          clientKey: clientKeyRef.current
        }));
      }
    }
    if (window.SFX) window.SFX.playClick();
  };
  const [loadingStage, setLoadingStage] = useState<number>(0);
  const [loadingStatusText, setLoadingStatusText] = useState<string>('Preparing terrain, factions and battlefield systems.');
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [loadingRetryCount, setLoadingRetryCount] = useState<number>(0);
  const [cinematicState, setCinematicState] = useState<{
    stageIndex: number;
    totalStages: number;
    title: string;
    subtitle: string;
    progress: number;
  }>({
    stageIndex: 0,
    totalStages: 10,
    title: 'ORBITAL RECONNAISSANCE',
    subtitle: 'High-Altitude Tactical Sector-09 Overview',
    progress: 0
  });
  const [cinematicViewMode, setCinematicViewMode] = useState<'auto' | 'birds_eye' | 'team_a' | 'team_b' | 'ground_operator'>('auto');
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState<boolean>(false);
  const campaignHoldTimerRef = useRef<number | null>(null);
  const campaignHoldTriggeredRef = useRef<boolean>(false);
  const initRunningRef = useRef<boolean>(false);

  // Multiplayer Anti-Leave Penalty, Connection Ping, Share Resources & Anti-Cheat State
  const clientKeyRef = useRef<string>('');
  if (!clientKeyRef.current) {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('OUTPOST_CLIENT_KEY') : null;
      if (saved) {
        clientKeyRef.current = saved;
      } else {
        const generated = `ck_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        clientKeyRef.current = generated;
        if (typeof window !== 'undefined') window.localStorage.setItem('OUTPOST_CLIENT_KEY', generated);
      }
    } catch {
      clientKeyRef.current = `ck_${Date.now()}`;
    }
  }

  const [penaltyUntil, setPenaltyUntil] = useState<number>(() => {
    try {
      const saved = typeof window !== 'undefined' ? Number(window.localStorage.getItem('OUTPOST_PENALTY_UNTIL') || 0) : 0;
      return saved > Date.now() ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [penaltyOffenses, setPenaltyOffenses] = useState<number>(() => {
    try {
      return typeof window !== 'undefined' ? Number(window.localStorage.getItem('OUTPOST_PENALTY_OFFENSES') || 0) : 0;
    } catch {
      return 0;
    }
  });
  const [penaltyReason, setPenaltyReason] = useState<string>(() => {
    try {
      return (typeof window !== 'undefined' ? window.localStorage.getItem('OUTPOST_PENALTY_REASON') : '') || '';
    } catch {
      return '';
    }
  });
  const [penaltySecondsLeft, setPenaltySecondsLeft] = useState<number>(0);
  const [showAbandonConfirmModal, setShowAbandonConfirmModal] = useState<boolean>(false);
  const [myMeasuredPing, setMyMeasuredPing] = useState<number>(16);
  const myMeasuredPingRef = useRef<number>(16);
  const [inGameChatOpen, setInGameChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [inGameMpPanelOpen, setInGameMpPanelOpen] = useState<boolean>(true);
  const [shareNotification, setShareNotification] = useState<string | null>(null);
  const [antiCheatState, setAntiCheatState] = useState<{
    verified: boolean;
    checksum: number;
    flags: number;
    lastScan: string;
    alertMessage: string | null;
  }>({
    verified: true,
    checksum: 27900,
    flags: 0,
    lastScan: 'VERIFIED',
    alertMessage: null
  });

  // Commander Profile State (Replaces generic loading info & allows full customization)
  const [commanderProfile, setCommanderProfile] = useState<CommanderProfile>({
    callsign: 'Marshal_Vance',
    rank: ' Fleet Marshal // Tier-I',
    division: 'Sector-09 First Armored Corps',
    preferredFaction: 'Terran Dominion',
    emblem: 'dominion_eagle',
    wins: 14,
    matches: 16,
    specialty: 'Combined Arms Siege & Deep Gem Auger Ops'
  });

  // Real WebSocket state
  const [myPlayerId, setMyPlayerId] = useState<string>(() => `usr_${Date.now()}`);
  const [myPlayerName, setMyPlayerName] = useState<string>('Marshal_Vance');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [internetOnline, setInternetOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const socketRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  if (typeof window !== 'undefined') {
    (window as any).__STARBLOCK_PHASE__ = phase;
  }
  const inGameChatOpenRef = useRef(inGameChatOpen);
  inGameChatOpenRef.current = inGameChatOpen;

  // Live 1-second countdown ticker for Anti-Leave Penalty timeout
  useEffect(() => {
    const updateTicker = () => {
      if (penaltyUntil > Date.now()) {
        setPenaltySecondsLeft(Math.ceil((penaltyUntil - Date.now()) / 1000));
      } else {
        setPenaltySecondsLeft(0);
      }
    };
    updateTicker();
    const timer = window.setInterval(updateTicker, 500);
    return () => clearInterval(timer);
  }, [penaltyUntil]);

  const applyLocalOrServerPenalty = useCallback((untilTs: number, offensesCount: number, reasonText: string) => {
    setPenaltyUntil(untilTs);
    setPenaltyOffenses(offensesCount);
    setPenaltyReason(reasonText);
    try {
      window.localStorage.setItem('OUTPOST_PENALTY_UNTIL', String(untilTs));
      window.localStorage.setItem('OUTPOST_PENALTY_OFFENSES', String(offensesCount));
      window.localStorage.setItem('OUTPOST_PENALTY_REASON', reasonText);
    } catch {}
  }, []);

  const [snapshot, setSnapshot] = useState<GameStateSnapshot>({
    basePlaced: false,
    hqDead: false,
    hqHp: 1500,
    missionWon: false,
    isEndless: false,
    req: 200,
    wave: 1,
    kills: 0,
    unitsCount: 0,
    enemiesCount: 0,
    fowRevealAll: false,
  });

  const handleRegenerateMap = useCallback((customPlayers?: any[]) => {
    const playersToUse = customPlayers || selectedLobby?.players || [];
    let generatedSeed = 0;
    if (window.regenerateDynamicSectorMap) {
      generatedSeed = window.regenerateDynamicSectorMap(undefined, playersToUse);
    } else if (window.GAME_API?.regenerateMap) {
      generatedSeed = window.GAME_API.regenerateMap(undefined, playersToUse);
    }
    const finalSeed = window.MAP_SEED || generatedSeed || Math.floor(100000 + Math.random() * 899999);
    setMapSeedDisplay(finalSeed);
    setMapArchetypeDisplay(window.MAP_ARCHETYPE || 'open_badlands');
    setBridgeCountDisplay(window.BRIDGES ? window.BRIDGES.length : 0);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'c:regen_map', seed: finalSeed, clientKey: clientKeyRef.current }));
    }
  }, [selectedLobby]);

  const [lobbyMinerals, setLobbyMinerals] = useState<number>(200);
  const [lobbyAiAllyMode, setLobbyAiAllyMode] = useState<'defensive' | 'aggressive' | 'off'>('defensive');
  const [lobbyBotDiff, setLobbyBotDiff] = useState<'Easy' | 'Medium' | 'Hard' | 'Brutal'>('Hard');
  const [isMultiplayerMatch, setIsMultiplayerMatch] = useState<boolean>(false);

  // Single-Player Campaign Launch (no multiplayer chat, no connection bars, no anti-leave penalty)
  const handleStartCampaignGame = useCallback(() => {
    setIsMultiplayerMatch(false);
    setInGameMpPanelOpen(false);
    setInGameChatOpen(false);
    setCampaignDropdownOpen(false);
    if (window.SFX) window.SFX.init();
    if (window.regenerateDynamicSectorMap) {
      const seed = window.regenerateDynamicSectorMap(undefined, []);
      setMapSeedDisplay(window.MAP_SEED || seed);
      setMapArchetypeDisplay(window.MAP_ARCHETYPE || 'open_badlands');
      setBridgeCountDisplay(window.BRIDGES ? window.BRIDGES.length : 0);
    }
    window.loadingCameraSweep = true;
    setLoadingStage(1);
    setPhase('loading_match');
  }, []);

  const clearCampaignHoldTimer = useCallback(() => {
    if (campaignHoldTimerRef.current !== null) {
      window.clearTimeout(campaignHoldTimerRef.current);
      campaignHoldTimerRef.current = null;
    }
  }, []);

  const handleCampaignPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    campaignHoldTriggeredRef.current = false;
    clearCampaignHoldTimer();
    campaignHoldTimerRef.current = window.setTimeout(() => {
      campaignHoldTriggeredRef.current = true;
      setCampaignDropdownOpen(true);
      if (window.SFX) window.SFX.playClick();
    }, 420);
  }, [clearCampaignHoldTimer]);

  const handleCampaignPointerUp = useCallback(() => {
    const wasHold = campaignHoldTriggeredRef.current;
    clearCampaignHoldTimer();
    if (!wasHold) {
      handleStartCampaignGame();
    }
  }, [clearCampaignHoldTimer, handleStartCampaignGame]);

  const handleCampaignPointerCancel = useCallback(() => {
    clearCampaignHoldTimer();
  }, [clearCampaignHoldTimer]);

  const handleRegenerateCampaignMap = useCallback(() => {
    if (typeof (window as any).resetMatchForNewMap === 'function' && window.regenerateDynamicSectorMap) {
      const newSeed = Math.floor(100 + Math.random() * 899);
      window.regenerateDynamicSectorMap(newSeed, []);
      (window as any).resetMatchForNewMap(newSeed);
      setMapSeedDisplay(window.MAP_SEED || newSeed);
      setMapArchetypeDisplay(window.MAP_ARCHETYPE || 'open_badlands');
      setBridgeCountDisplay(window.BRIDGES ? window.BRIDGES.length : 0);
    } else if (window.regenerateDynamicSectorMap) {
      const seed = window.regenerateDynamicSectorMap(undefined, []);
      setMapSeedDisplay(window.MAP_SEED || seed);
      setMapArchetypeDisplay(window.MAP_ARCHETYPE || 'open_badlands');
      setBridgeCountDisplay(window.BRIDGES ? window.BRIDGES.length : 0);
    }
    if (window.SFX) window.SFX.playClick();
  }, []);

  const handleChangeCinematicViewMode = useCallback((mode: 'auto' | 'birds_eye' | 'team_a' | 'team_b' | 'ground_operator') => {
    setCinematicViewMode(mode);
    if ((window as any).GAME_API && typeof (window as any).GAME_API.setBattleCinematicViewMode === 'function') {
      (window as any).GAME_API.setBattleCinematicViewMode(mode);
    } else if ((window as any).BATTLE_CINEMATIC && typeof (window as any).BATTLE_CINEMATIC.setCameraViewMode === 'function') {
      (window as any).BATTLE_CINEMATIC.setCameraViewMode(mode);
    }
    if (window.SFX) window.SFX.playClick();
  }, []);

  // Multiplayer Match Launch — validates lobby configuration as single source of truth
  const handleStartGame = useCallback(() => {
    if (penaltyUntil > Date.now()) {
      setPhase('multiplayer_browser');
      return;
    }
    if (!selectedLobby) {
      setLobbyValidationError('No active multiplayer lobby selected.');
      return;
    }
    setLobbyValidationError(null);

    const activePlayers = Array.isArray(selectedLobby.players) ? [...selectedLobby.players] : [];
    const unreadyHumans = activePlayers.filter(p => !p.isAi && !p.ready);
    if (unreadyHumans.length > 0) {
      setLobbyValidationError(`Cannot start match: Waiting for ${unreadyHumans.map(h => h.name).join(', ')} to mark Ready.`);
      return;
    }

    const activeBiome = selectedLobby.mapBiome || planetBiome || 'highland';
    const lobbyConfigPayload = {
      id: selectedLobby.id,
      name: selectedLobby.name,
      mode: selectedLobby.mode,
      mapBiome: activeBiome,
      seed: selectedLobby.seed || window.MAP_SEED || 100,
      players: activePlayers
    };

    if (typeof window.validateAndBuildMultiplayerRoster === 'function') {
      const validation = window.validateAndBuildMultiplayerRoster(lobbyConfigPayload);
      if (!validation.valid) {
        setLobbyValidationError(validation.errors.join(' '));
        return;
      }
      if (validation.roster.length !== activePlayers.length) {
        setLobbyValidationError(`Roster mismatch: configured ${activePlayers.length} slots, generated ${validation.roster.length}.`);
        return;
      }
    }

    setIsMultiplayerMatch(true);
    if (window.SFX) window.SFX.init();
    setInternetOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    if (typeof window.setPlanetBiome === 'function') {
      window.setPlanetBiome(activeBiome, false);
    }
    if (window.regenerateDynamicSectorMap) {
      const seed = window.regenerateDynamicSectorMap(lobbyConfigPayload.seed, activePlayers);
      setMapSeedDisplay(window.MAP_SEED || seed);
      setMapArchetypeDisplay(window.MAP_ARCHETYPE || 'open_badlands');
      setBridgeCountDisplay(window.BRIDGES ? window.BRIDGES.length : 0);
    }
    window.loadingCameraSweep = true;
    setLoadingStage(1);
    setPhase('loading_match');
  }, [selectedLobby, planetBiome, penaltyUntil]);

  // Real 10-Stage World Initialization & Readiness Verification Pipeline
  useEffect(() => {
    if (phase !== 'loading_match') {
      window.loadingCameraSweep = false;
      initRunningRef.current = false;
      return;
    }
    if (initRunningRef.current) return;
    initRunningRef.current = true;
    window.loadingCameraSweep = true;
    setLoadingError(null);

    let cancelled = false;
    const activePlayers = isMultiplayerMatch && selectedLobby ? selectedLobby.players : [];
    const humanSlot = activePlayers.find(p => !p.isAi);
    const humanTeam = humanSlot ? (selectedLobby?.mode === 'ffa' ? 0 : humanSlot.team) : 1;
    const allyBots = isMultiplayerMatch && selectedLobby
      ? activePlayers.filter(p => p.isAi && humanTeam !== 0 && p.team === humanTeam)
      : [];
    const enemyBots = isMultiplayerMatch && selectedLobby
      ? activePlayers.filter(p => p.isAi && (humanTeam === 0 || p.team !== humanTeam))
      : [];
    const activeBiome = (isMultiplayerMatch && selectedLobby?.mapBiome) ? selectedLobby.mapBiome : planetBiome;

    const missionConfig = {
      isMultiplayer: isMultiplayerMatch,
      mode: isMultiplayerMatch && selectedLobby ? selectedLobby.mode : 'campaign',
      mapBiome: activeBiome,
      allyBots,
      enemyBots,
      lobbyPlayers: activePlayers,
      players: activePlayers,
      startingMinerals: isMultiplayerMatch ? lobbyMinerals : 200,
      aiAllyMode: isMultiplayerMatch ? (allyBots.length > 0 ? lobbyAiAllyMode : 'off') : 'defensive',
      botDifficulty: isMultiplayerMatch ? lobbyBotDiff : 'Hard',
      autoDeployBase: true,
      seed: selectedLobby?.seed || window.MAP_SEED
    };

    const runRealInitialization = async () => {
      try {
        setLoadingStage(0);
        setLoadingStatusText('Preparing terrain, factions and battlefield systems.');

        for (let step = 0; step < 10; step++) {
          if (cancelled) return;

          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          if (cancelled) return;

          if (window.GAME_API?.runInitializationStep) {
            const res = await window.GAME_API.runInitializationStep(step, missionConfig);
            if (res && res.ok === false) {
              throw new Error(res.stage || `Initialization step ${step + 1} failed verification.`);
            }
          } else if (step === 9 && window.GAME_API?.startMission) {
            window.GAME_API.startMission(missionConfig);
          }

          setLoadingStage(step + 1);

          if (step === 1 || step === 3) {
            setMapSeedDisplay(window.MAP_SEED || mapSeedDisplay);
            setMapArchetypeDisplay(window.MAP_ARCHETYPE || 'open_badlands');
            setBridgeCountDisplay(window.BRIDGES ? window.BRIDGES.length : 0);
          }
          if (step === 8 && isMultiplayerMatch && socketRef.current && socketRef.current.readyState === WebSocket.OPEN && selectedLobby) {
            socketRef.current.send(JSON.stringify({ type: 'c:start_game', clientKey: clientKeyRef.current }));
          }
        }

        if (!cancelled) {
          window.loadingCameraSweep = false;
          initRunningRef.current = false;
          setPhase('playing');
        }
      } catch (err: any) {
        if (!cancelled) {
          initRunningRef.current = false;
          setLoadingError(err?.message || 'Failed to initialize battlefield systems.');
        }
      }
    };

    runRealInitialization();

    return () => {
      cancelled = true;
      initRunningRef.current = false;
    };
  }, [phase, isMultiplayerMatch, selectedLobby, planetBiome, lobbyMinerals, lobbyAiAllyMode, lobbyBotDiff, mapSeedDisplay, loadingRetryCount]);

  // Establish Real WebSocket connection to backend server (/ws)
  const retryWebSocketConnection = useCallback(() => {
    if (socketRef.current) {
      try { socketRef.current.close(); } catch {}
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;
      ws.onopen = () => {
        setWsConnected(true);
        setLobbyValidationError(null);
        ws.send(JSON.stringify({
          type: 'c:hello',
          clientKey: clientKeyRef.current,
          name: myPlayerName
        }));
        ws.send(JSON.stringify({ type: 'c:get_lobbies', clientKey: clientKeyRef.current }));
      };
    } catch {}
  }, [myPlayerName]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: number;
    let pingInterval: number;
    let antiCheatInterval: number;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          setLobbyValidationError(null);
          ws.send(JSON.stringify({
            type: 'c:hello',
            clientKey: clientKeyRef.current,
            name: myPlayerName
          }));
          ws.send(JSON.stringify({ type: 'c:get_lobbies', clientKey: clientKeyRef.current }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case 's:init':
                if (data.playerId) setMyPlayerId(data.playerId);
                if (data.name) {
                  setMyPlayerName(data.name);
                  setCommanderProfile(prev => ({ ...prev, callsign: data.name }));
                }
                if (data.lobbies && Array.isArray(data.lobbies)) {
                  setLobbies(data.lobbies);
                }
                break;
              case 's:lobby_list':
                if (data.lobbies && Array.isArray(data.lobbies)) {
                  setLobbies(data.lobbies);
                }
                break;
              case 's:room_state':
                if (data.lobby) {
                  setSelectedLobby(data.lobby);
                  if (data.lobby.mapBiome) {
                    setPlanetBiome(data.lobby.mapBiome);
                  }
                  if (data.lobby.messages) {
                    setChatMessages(data.lobby.messages);
                  }
                }
                break;
              case 's:error':
                if (data.message) {
                  setLobbyValidationError(String(data.message));
                }
                break;
              case 's:chat_message':
                if (data.message) {
                  setChatMessages(prev => [...prev.slice(-49), data.message]);
                  if (phaseRef.current === 'playing' && !inGameChatOpenRef.current) {
                    setUnreadChatCount(c => c + 1);
                  }
                }
                break;
              case 's:pong': {
                const rtt = Math.max(1, Math.min(999, Date.now() - (Number(data.clientTs) || Date.now())));
                myMeasuredPingRef.current = rtt;
                setMyMeasuredPing(rtt);
                break;
              }
              case 's:ping_update': {
                if (data.playerId) {
                  setSelectedLobby(prev => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      ping: data.lobbyPing || prev.ping,
                      players: prev.players.map(p => p.id === data.playerId ? { ...p, ping: data.ping } : p)
                    };
                  });
                }
                break;
              }
              case 's:penalty_status': {
                const untilTs = Number(data.penaltyUntil) || 0;
                const offenses = Number(data.offenses) || 0;
                const reason = data.reason || '';
                if (untilTs > Date.now()) {
                  applyLocalOrServerPenalty(untilTs, offenses, reason);
                }
                break;
              }
              case 's:share_resources': {
                if (data.fromId && data.fromId !== myPlayerId) {
                  if (data.toId === myPlayerId || data.toName === myPlayerName || data.toId === 'ally') {
                    window.GAME_API?.receiveSharedResources?.(Number(data.minerals) || 0, Number(data.gems) || 0, data.fromName);
                  }
                }
                const parts: string[] = [];
                if (data.minerals > 0) parts.push(`+${data.minerals}M`);
                if (data.gems > 0) parts.push(`+${data.gems}♦`);
                setShareNotification(`📦 ${data.fromName} → ${data.toName}: ${parts.join(' ')}`);
                window.setTimeout(() => setShareNotification(null), 4000);
                break;
              }
              case 's:anticheat_ok': {
                setAntiCheatState(prev => ({
                  ...prev,
                  verified: true,
                  checksum: Number(data.checksum) || prev.checksum,
                  flags: Number(data.flags) || 0,
                  lastScan: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }));
                break;
              }
              case 's:anticheat_alert': {
                setAntiCheatState(prev => ({
                  ...prev,
                  verified: data.severity !== 'critical',
                  flags: prev.flags + 1,
                  alertMessage: data.message || 'Valkyrie Anti-Cheat anomaly detected!'
                }));
                window.setTimeout(() => {
                  setAntiCheatState(prev => ({ ...prev, alertMessage: null }));
                }, 6000);
                break;
              }
              case 's:player_left_match': {
                setShareNotification(`⚠️ ${data.playerName} abandoned match (${data.penaltySeconds || 60}s Timeout Penalty applied)`);
                window.setTimeout(() => setShareNotification(null), 5000);
                break;
              }
              case 's:game_start':
                setIsMultiplayerMatch(true);
                if (window.SFX) window.SFX.init();
                window.loadingCameraSweep = false;
                if (window.GAME_API) {
                  const lobbyPlayers = data.lobby?.players || [];
                  const humanSlot = lobbyPlayers.find((p: any) => !p.isAi);
                  const humanTeam = humanSlot ? (data.lobby?.mode === 'ffa' ? 0 : humanSlot.team) : 1;
                  const allyBots = lobbyPlayers.filter((p: any) => p.isAi && humanTeam !== 0 && p.team === humanTeam);
                  const enemyBots = lobbyPlayers.filter((p: any) => p.isAi && (humanTeam === 0 || p.team !== humanTeam));
                  window.GAME_API.startMission({
                    isMultiplayer: true,
                    mode: data.lobby?.mode || '1v1',
                    mapBiome: data.mapBiome || data.lobby?.mapBiome || 'highland',
                    seed: data.seed || data.lobby?.seed,
                    allyBots,
                    enemyBots,
                    lobbyPlayers,
                    players: lobbyPlayers,
                    startingMinerals: lobbyMinerals,
                    aiAllyMode: allyBots.length > 0 ? lobbyAiAllyMode : 'off',
                    botDifficulty: lobbyBotDiff,
                    autoDeployBase: true
                  });
                } else {
                  window.titleScreenActive = false;
                  window.gamePaused = false;
                }
                setPhase('playing');
                break;
              case 's:game_order':
                if (data.order && window.GAME_API?.handleNetworkOrder) {
                  window.GAME_API.handleNetworkOrder(data.order, data.senderId);
                }
                break;
              case 's:state_snapshot':
                if (data.snapshot && data.senderId !== myPlayerId && window.GAME_API?.applyStateSnapshot) {
                  window.GAME_API.applyStateSnapshot(data.snapshot);
                }
                break;
              case 's:request_sync':
                if (window.GAME_API?.getStateSnapshot && ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'c:state_snapshot',
                    clientKey: clientKeyRef.current,
                    snapshot: window.GAME_API.getStateSnapshot()
                  }));
                }
                break;
            }
          } catch (err) {
            console.error('[WS] Parse error:', err);
          }
        };

        (window as any).SEND_NETWORK_ORDER = (order: any) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const orderWithId = {
              ...order,
              orderId: order?.orderId || `${clientKeyRef.current}_${Date.now()}_${Math.floor(Math.random() * 10000)}`
            };
            ws.send(JSON.stringify({ type: 'c:game_order', order: orderWithId, clientKey: clientKeyRef.current }));
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          myMeasuredPingRef.current = 0;
          setMyMeasuredPing(0);
          reconnectTimeout = window.setTimeout(connect, 2500);
        };

        ws.onerror = () => {
          setWsConnected(false);
          myMeasuredPingRef.current = 0;
          setMyMeasuredPing(0);
        };
      } catch (e) {
        setWsConnected(false);
        reconnectTimeout = window.setTimeout(connect, 3000);
      }
    }

    connect();

    // Real Ping Measurement Loop (only measures real WebSocket RTT; no fake random jitter)
    pingInterval = window.setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'c:ping',
          clientTs: Date.now(),
          measuredPing: myMeasuredPingRef.current,
          clientKey: clientKeyRef.current
        }));
      }
    }, 2500);

    // Valkyrie Anti-Cheat Heartbeat Loop
    antiCheatInterval = window.setInterval(() => {
      const digest = window.GAME_API?.getAntiCheatDigest?.();
      if (digest) {
        setAntiCheatState(prev => ({
          ...prev,
          checksum: digest.checksum,
          lastScan: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        }));
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'c:anticheat_heartbeat',
            clientKey: clientKeyRef.current,
            ...digest
          }));
        }
      }
    }, 4000);

    return () => {
      clearTimeout(reconnectTimeout);
      clearInterval(pingInterval);
      clearInterval(antiCheatInterval);
      if (socketRef.current) socketRef.current.close();
    };
  }, [applyLocalOrServerPenalty]);

  // Sync game loop state snapshot with null-safe guards for stats and userData
  useEffect(() => {
    const interval = window.setInterval(() => {
      try {
        const api = window.GAME_API;
        if (api && typeof api.getState === 'function') {
          const rawState = api.getState();
          if (rawState && typeof rawState === 'object') {
            const safeStats = rawState.stats && typeof rawState.stats === 'object' ? rawState.stats : null;
            const safeUserData = rawState.userData && typeof rawState.userData === 'object' ? rawState.userData : null;
            const safeSnapshot: GameStateSnapshot = {
              basePlaced: Boolean(rawState.basePlaced),
              hqDead: Boolean(rawState.hqDead),
              hqHp: typeof rawState.hqHp === 'number' && Number.isFinite(rawState.hqHp) ? rawState.hqHp : 1500,
              missionWon: Boolean(rawState.missionWon),
              isEndless: Boolean(rawState.isEndless),
              req: typeof rawState.req === 'number' && Number.isFinite(rawState.req) ? rawState.req : 0,
              wave: typeof rawState.wave === 'number' && Number.isFinite(rawState.wave) ? rawState.wave : 1,
              kills: typeof rawState.kills === 'number' && Number.isFinite(rawState.kills) ? rawState.kills : 0,
              unitsCount: typeof rawState.unitsCount === 'number' ? rawState.unitsCount : 0,
              enemiesCount: typeof rawState.enemiesCount === 'number' ? rawState.enemiesCount : 0,
              fowRevealAll: Boolean(rawState.fowRevealAll),
              stats: safeStats,
              userData: safeUserData,
            };
            setSnapshot(safeSnapshot);
            if (safeSnapshot.hqDead && phase === 'playing') {
              setPhase('defeat');
            }
          }
          if (typeof api.getSelectedBaseBarrier === 'function') {
            const selectedBarrier = api.getSelectedBaseBarrier();
            if (selectedBarrier) {
              setActiveBarrierId(selectedBarrier);
            }
          }
        }
        if (typeof window.MAP_SEED === 'number') setMapSeedDisplay(window.MAP_SEED);
        if (typeof window.MAP_ARCHETYPE === 'string') setMapArchetypeDisplay(window.MAP_ARCHETYPE);
        if (Array.isArray(window.BRIDGES)) setBridgeCountDisplay(window.BRIDGES.length);
        if (api && typeof api.getBattleCinematicState === 'function') {
          const cState = api.getBattleCinematicState();
          if (cState) setCinematicState(cState);
        }
      } catch (err) {
        if ((window as any).APP_ERROR_HANDLER?.record) {
          (window as any).APP_ERROR_HANDLER.record('App.uiUpdateLoop', err);
        }
      }
    }, 250);

    (window as any).returnToMainMenu = () => {
      if (phase === 'playing' && isMultiplayerMatch && !snapshot.hqDead && !snapshot.missionWon) {
        setShowAbandonConfirmModal(true);
        if (window.SFX) window.SFX.playClick();
        return;
      }
      window.loadingCameraSweep = false;
      initRunningRef.current = false;
      setCampaignDropdownOpen(false);
      setIsMultiplayerMatch(false);
      setPhase('menu');
      window.titleScreenActive = true;
      if (window.SFX) window.SFX.playClick();
    };

    return () => {
      clearInterval(interval);
    };
  }, [phase, isMultiplayerMatch, snapshot.hqDead, snapshot.missionWon]);

  const handleConfirmAbandonMatch = () => {
    const nextOffenses = penaltyOffenses + 1;
    const durationMs = Math.min(300_000, 60_000 * nextOffenses);
    const untilTs = Date.now() + durationMs;
    const reasonText = `Abandoned active match in "${selectedLobby?.name || 'Sector-09'}" (Offense #${nextOffenses} — ${Math.round(durationMs / 1000)}s matchmaking timeout)`;
    applyLocalOrServerPenalty(untilTs, nextOffenses, reasonText);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:abandon_match',
        clientKey: clientKeyRef.current
      }));
    }
    setShowAbandonConfirmModal(false);
    window.titleScreenActive = true;
    setPhase('multiplayer_browser');
    if (window.SFX) window.SFX.playClick();
  };

  const renderConnectionBars = (pingValue: number, isAi = false) => {
    if (!isAi && !wsConnected) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#24080e] border border-[#ff2a4b] font-mono text-[10px] text-[#ff4d6d] shrink-0">
          OFFLINE
        </span>
      );
    }
    const effectivePing = isAi ? 0 : Math.max(1, pingValue || myMeasuredPing || 15);
    const bars = isAi ? 4 : (effectivePing < 60 ? 4 : effectivePing < 110 ? 3 : effectivePing < 180 ? 2 : 1);
    const activeColor = bars === 4 ? '#00ff66' : bars === 3 ? '#38bdf8' : bars === 2 ? '#ffaa00' : '#ff2a4b';

    return (
      <span
        className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-[#040a12] border border-[#1d3552] font-mono text-[10px] tabular-nums shrink-0"
        title={isAi ? 'AI Slot' : `RTT: ${effectivePing}ms`}
      >
        <span className="inline-flex items-end gap-[2px] h-3">
          {[1, 2, 3, 4].map(barIdx => (
            <span
              key={barIdx}
              className="w-[3px] transition-colors"
              style={{
                height: `${barIdx * 3}px`,
                backgroundColor: barIdx <= bars ? activeColor : '#1e334c'
              }}
            />
          ))}
        </span>
        <span style={{ color: activeColor }} className="font-bold">
          {isAi ? 'AI' : `${effectivePing}ms`}
        </span>
      </span>
    );
  };

  const handleSelectBarrier = (id: string) => {
    setActiveBarrierId(id);
    if (window.GAME_API && window.GAME_API.selectBaseBarrierZone) {
      window.GAME_API.selectBaseBarrierZone(id);
    }
  };

  const handleDeployBaseAtSelectedBarrier = () => {
    if (window.GAME_API && window.GAME_API.deployBaseAtBarrier) {
      window.GAME_API.deployBaseAtBarrier(activeBarrierId);
    }
  };

  const syncLobbyPlayersToServer = (nextLobby: MultiplayerLobby) => {
    setSelectedLobby(nextLobby);
    setLobbyValidationError(null);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:update_lobby_config',
        name: nextLobby.name,
        mode: nextLobby.mode,
        mapBiome: nextLobby.mapBiome || planetBiome,
        seed: nextLobby.seed,
        players: nextLobby.players,
        clientKey: clientKeyRef.current
      }));
    }
  };

  const handleJoinLobby = (lobby: MultiplayerLobby) => {
    if (penaltyUntil > Date.now()) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setLobbyValidationError('Cannot join room: Multiplayer server (/ws) is offline.');
      return;
    }
    setLobbyValidationError(null);
    socketRef.current.send(JSON.stringify({
      type: 'c:join_lobby',
      lobbyId: lobby.id,
      name: myPlayerName,
      faction: commanderProfile.preferredFaction === 'Protoss Solaris' ? 'Protoss Fleet' : commanderProfile.preferredFaction,
      clientKey: clientKeyRef.current
    }));
    setSelectedLobby(lobby);
    setChatMessages(lobby.messages || []);
    setPhase('inside_lobby');
    if (window.SFX) window.SFX.playClick();
  };

  const handleLeaveLobby = () => {
    setLobbyValidationError(null);
    setSelectedLobby(null);
    setPhase('multiplayer_browser');
    if (window.SFX) window.SFX.playClick();
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'c:leave_lobby', clientKey: clientKeyRef.current }));
    }
  };

  const handleSelectLobbyMode = (nextMode: LobbyGameMode) => {
    if (!selectedLobby) return;
    const mySlot = selectedLobby.players.find(p => !p.isAi && (p.id === myPlayerId || p.name === myPlayerName)) || selectedLobby.players[0];
    const humanFaction = mySlot?.faction || 'Terran Dominion';
    const nextPlayers = nextMode === 'custom'
      ? selectedLobby.players
      : buildPresetPlayersForMode(nextMode, myPlayerId, myPlayerName, humanFaction, myMeasuredPing || 15, lobbyBotDiff);
    syncLobbyPlayersToServer({
      ...selectedLobby,
      mode: nextMode,
      players: nextPlayers
    });
    if (window.SFX) window.SFX.playClick();
  };

  const handleUpdateSlotTeam = (slotId: string, nextTeam: 1 | 2 | 3 | 4 | 0) => {
    if (!selectedLobby) return;
    const updatedPlayers = selectedLobby.players.map(p => p.id === slotId ? { ...p, team: nextTeam } : p);
    syncLobbyPlayersToServer({ ...selectedLobby, players: updatedPlayers });
    if (window.SFX) window.SFX.playClick();
  };

  const handleUpdateSlotFaction = (slotId: string, nextFaction: LobbyPlayer['faction']) => {
    if (!selectedLobby) return;
    const updatedPlayers = selectedLobby.players.map(p => p.id === slotId ? { ...p, faction: nextFaction } : p);
    syncLobbyPlayersToServer({ ...selectedLobby, players: updatedPlayers });
    if (window.SFX) window.SFX.playClick();
  };

  const handleUpdateSlotDifficulty = (slotId: string, nextDiff: 'Easy' | 'Medium' | 'Hard' | 'Brutal') => {
    if (!selectedLobby) return;
    const updatedPlayers = selectedLobby.players.map(p => p.id === slotId ? { ...p, aiDifficulty: nextDiff } : p);
    syncLobbyPlayersToServer({ ...selectedLobby, players: updatedPlayers });
    if (window.SFX) window.SFX.playClick();
  };

  const handleToggleMyReady = () => {
    if (!selectedLobby) return;
    const mySlot = selectedLobby.players.find(p => p.id === myPlayerId || p.name === myPlayerName);
    const nextReady = mySlot ? !mySlot.ready : true;
    const updatedPlayers = selectedLobby.players.map(p =>
      (p.id === myPlayerId || p.name === myPlayerName) ? { ...p, ready: nextReady } : p
    );
    syncLobbyPlayersToServer({ ...selectedLobby, players: updatedPlayers });
    if (window.SFX) window.SFX.playClick();
  };

  const handleAddAiBot = (
    diff: 'Easy' | 'Medium' | 'Hard' | 'Brutal' = lobbyBotDiff,
    preferredTeam: 1 | 2 | 3 | 4 | 0 = 2
  ) => {
    if (!selectedLobby || selectedLobby.players.length >= selectedLobby.maxPlayers) return;
    const botTeam: 1 | 2 | 3 | 4 | 0 = selectedLobby.mode === 'ffa' ? 0 : preferredTeam;
    const aiPool = [
      { name: 'Kerrigan_Brood', faction: 'Zerg Swarm' as const },
      { name: 'Artanis_Fleet', faction: 'Protoss Fleet' as const },
      { name: 'Mengsk_Guard', faction: 'Terran Dominion' as const },
      { name: 'Zagara_Swarm', faction: 'Zerg Swarm' as const },
      { name: 'Tassadar_Solaris', faction: 'Protoss Fleet' as const }
    ];
    const pick = aiPool[selectedLobby.players.length % aiPool.length];
    const newBot: LobbyPlayer = {
      id: `bot_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      name: `[AI] ${pick.name}`,
      isHost: false,
      isAi: true,
      aiDifficulty: diff,
      team: botTeam,
      faction: pick.faction,
      ping: 0,
      ready: true,
      antiCheatVerified: true,
      antiCheatFlags: 0
    };
    syncLobbyPlayersToServer({
      ...selectedLobby,
      players: [...selectedLobby.players, newBot]
    });
    if (window.SFX) window.SFX.playBuild();
  };

  const handleRemovePlayer = (id: string) => {
    if (!selectedLobby) return;
    syncLobbyPlayersToServer({
      ...selectedLobby,
      players: selectedLobby.players.filter(p => p.id !== id)
    });
    if (window.SFX) window.SFX.playClick();
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:chat',
        text: chatInput.trim(),
        channel: chatChannel,
        clientKey: clientKeyRef.current
      }));
    }
    setChatInput('');
  };

  const handleCreateLobbySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (penaltyUntil > Date.now()) {
      setShowCreateModal(false);
      return;
    }
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setLobbyValidationError('Cannot create room: Multiplayer server (/ws) is offline.');
      setShowCreateModal(false);
      return;
    }
    const hostFaction = (commanderProfile.preferredFaction === 'Protoss Solaris' ? 'Protoss Fleet' : commanderProfile.preferredFaction) as LobbyPlayer['faction'];
    const initialPlayers = buildPresetPlayersForMode(
      newRoomMode,
      myPlayerId,
      myPlayerName,
      hostFaction,
      myMeasuredPing || 15,
      lobbyBotDiff
    );
    setLobbyValidationError(null);
    socketRef.current.send(JSON.stringify({
      type: 'c:create_lobby',
      name: (newRoomName || 'Sector-09 Skirmish').trim(),
      mode: newRoomMode,
      mapBiome: planetBiome,
      initialPlayers,
      clientKey: clientKeyRef.current
    }));
    setShowCreateModal(false);
    setPhase('inside_lobby');
    if (window.SFX) window.SFX.playBuild();
  };

  const filteredLobbies = lobbies.filter(l => lobbyFilter === 'all' || l.mode === lobbyFilter);

  const renderCommanderEmblem = (emblem: string, color = '#00e5ff') => {
    if (emblem === 'solaris_crest') {
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8 shrink-0" fill="none">
          <polygon points="24,4 42,16 36,40 24,45 12,40 6,16" stroke={color} strokeWidth="2" fill="rgba(56,189,248,0.16)" />
          <polygon points="24,10 32,24 24,38 16,24" fill={color} />
        </svg>
      );
    }
    if (emblem === 'zerg_brood') {
      return (
        <svg viewBox="0 0 48 48" className="w-8 h-8 shrink-0" fill="none">
          <circle cx="24" cy="24" r="18" stroke="#d946ef" strokeWidth="2" fill="rgba(217,70,239,0.16)" />
          <path d="M14,28 C16,14 32,14 34,28 C28,22 20,22 14,28 Z" fill="#d946ef" />
          <circle cx="24" cy="18" r="3.5" fill="#ffaa00" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 48 48" className="w-8 h-8 shrink-0" fill="none">
        <polygon points="24,4 44,14 38,38 24,44 10,38 4,14" stroke={color} strokeWidth="2" fill="rgba(0,229,255,0.16)" />
        <polygon points="24,10 29,21 40,23 29,28 24,40 19,28 8,23 19,21" fill="#ffaa00" />
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-20 select-none font-chakra">
      {/* =========================================================================
          BASE PLACEMENT BARRIER SELECTION STRIP (ACTIVE WHEN BASE NOT YET PLACED)
          ========================================================================= */}
      {phase === 'playing' && !snapshot.basePlaced && (
        <div className="fixed top-9 sm:top-14 left-1/2 -translate-x-1/2 w-[96vw] max-w-xl flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 px-2 py-1 bg-[#050b14]/92 border border-[#00e5ff]/60 shadow-[0_4px_18px_rgba(0,0,0,0.85)] backdrop-blur-sm pointer-events-auto z-40">
          <span className="hidden sm:inline text-[10px] font-mono font-bold text-[#00e5ff] uppercase mr-1">
            DROP-ZONE:
          </span>
          {[
            { id: 'alpha', short: 'ALPHA', icon: '⬡' },
            { id: 'beta',  short: 'BETA',  icon: '▲' },
            { id: 'gamma', short: 'GAMMA', icon: '◆' }
          ].map(b => {
            const isSelected = activeBarrierId === b.id;
            return (
              <button
                key={b.id}
                onClick={() => handleSelectBarrier(b.id)}
                className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-extrabold tracking-wider border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#00e5ff]/25 border-[#00e5ff] text-[#00e5ff]'
                    : 'bg-[#0b1626]/90 border-[#223956] text-[#8faecf] hover:text-white'
                }`}
              >
                {b.icon} {b.short}
              </button>
            );
          })}
          <button
            onClick={handleDeployBaseAtSelectedBarrier}
            className="px-2.5 sm:px-3 py-0.5 sm:py-1 bg-[#00ff66] hover:bg-[#00e5ff] text-[#040810] text-[10px] sm:text-[11px] font-black uppercase tracking-wider cursor-pointer shadow-[0_0_10px_rgba(0,255,102,0.45)]"
          >
            DEPLOY HQ [{activeBarrierId.toUpperCase()}]
          </button>
          <button
            onClick={() => handleRegenerateMap()}
            className="px-2 py-0.5 sm:py-1 bg-[#0f243c] hover:bg-[#00e5ff] text-[#00e5ff] hover:text-[#040810] border border-[#00e5ff]/60 text-[9px] sm:text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer"
            title="Dynamically regenerate procedural canyon terrain, bridges, and river layout"
          >
            ⟳ MAP #{mapSeedDisplay}
          </button>
        </div>
      )}

      {/* =========================================================================
          IN-GAME MULTIPLAYER BATTLE.NET HUD: CONNECTION BARS, SHARE RESOURCES, CHAT, ANTI-CHEAT & ANTI-LEAVE
          (ONLY SHOWN IN MULTIPLAYER BATTLE.NET MATCHES — HIDDEN IN SINGLE-PLAYER CAMPAIGN)
          ========================================================================= */}
      {phase === 'playing' && isMultiplayerMatch && (
        <>
          {/* Resource Transfer / Anti-Cheat Live Toast Banner */}
          {(shareNotification || antiCheatState.alertMessage) && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center gap-1">
              {shareNotification && (
                <div className="px-3.5 py-1.5 bg-[#051322]/95 border border-[#00ff66] text-[#00ff66] font-mono text-xs font-bold shadow-[0_0_18px_rgba(0,255,102,0.35)]">
                  {shareNotification}
                </div>
              )}
              {antiCheatState.alertMessage && (
                <div className="px-3.5 py-1.5 bg-[#24080e]/95 border border-[#ff2a4b] text-[#ff4d6d] font-mono text-xs font-bold shadow-[0_0_18px_rgba(255,42,75,0.45)]">
                  {antiCheatState.alertMessage}
                </div>
              )}
            </div>
          )}

          {/* Minimal Compact Multiplayer Status & Comms Strip (Share Resources hidden for clean viewport) */}
          <div className="fixed top-14 left-2 sm:left-3 z-30 flex flex-col gap-1 max-w-[90vw] sm:max-w-xs pointer-events-auto">
            <div className="flex items-center gap-1 px-1.5 py-1 bg-[#050c16]/88 border border-[#1f3b5c]/80 shadow-md backdrop-blur-sm">
              {renderConnectionBars(myMeasuredPing, false)}

              <button
                onClick={() => {
                  setInGameChatOpen(v => {
                    const next = !v;
                    if (next) setUnreadChatCount(0);
                    return next;
                  });
                  if (window.SFX) window.SFX.playClick();
                }}
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border cursor-pointer transition-colors relative ${
                  inGameChatOpen
                    ? 'bg-[#00ff66] text-[#040810] border-[#86efac]'
                    : 'bg-[#0b192c] text-[#7dd3fc] border-[#234368] hover:border-[#00e5ff]'
                }`}
                title="Toggle In-Game Tactical Comms Chat"
              >
                💬 CHAT
                {unreadChatCount > 0 && (
                  <span className="ml-1 px-1 bg-[#ff2a4b] text-white text-[8px] font-black rounded-sm">
                    {unreadChatCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setShowAbandonConfirmModal(true);
                  if (window.SFX) window.SFX.playClick();
                }}
                className="px-1.5 py-0.5 bg-[#240b11] hover:bg-[#ff2a4b] text-[#ff6b81] hover:text-white border border-[#5e1d29] text-[9px] font-mono font-bold uppercase cursor-pointer transition-colors"
                title="Leave active match"
              >
                ✕ LEAVE
              </button>
            </div>

            {/* Expandable In-Game Tactical Comms Chat Panel */}
            {inGameChatOpen && (
              <div className="p-2 bg-[#050c16]/94 border border-[#00e5ff]/70 shadow-2xl backdrop-blur-sm flex flex-col gap-1.5 w-72 sm:w-80">
                <div className="flex items-center justify-between border-b border-[#1b324d] pb-1">
                  <span className="text-[10px] font-mono font-bold text-[#00e5ff] uppercase">
                    LIVE COMMS CHAT
                  </span>
                  <div className="flex items-center gap-1">
                    {(['ALL', 'TEAM'] as const).map(ch => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setChatChannel(ch)}
                        className={`px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase border cursor-pointer ${
                          chatChannel === ch
                            ? 'bg-[#00e5ff] text-[#040810] border-[#a5f3fc]'
                            : 'bg-[#0a1726] text-[#7ea0c5] border-[#213a57]'
                        }`}
                      >
                        [{ch}]
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-32 overflow-y-auto space-y-1 pr-1 text-[10px] font-mono">
                  {chatMessages.slice(-25).map((m, idx) => (
                    <div key={idx} className="leading-snug break-words">
                      <span className="text-[#557191] text-[9px] mr-1">[{m.time}]</span>
                      {m.channel && m.channel !== 'ALL' && (
                        <span
                          className={`text-[8px] px-1 mr-1 font-bold uppercase ${
                            m.channel === 'TEAM'
                              ? 'bg-[#00ff66]/20 text-[#00ff66]'
                              : 'bg-[#ffaa00]/20 text-[#ffaa00]'
                          }`}
                        >
                          {m.channel}
                        </span>
                      )}
                      <span className="text-[#00e5ff] font-bold mr-1">{m.sender}:</span>
                      <span className="text-[#d6e6ff]">{m.text}</span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendChat} className="flex gap-1 pt-1 border-t border-[#1b324d]">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Message [${chatChannel}]...`}
                    className="flex-1 min-w-0 px-2 py-1 bg-[#030810] border border-[#223e61] text-white text-[11px] font-mono focus:outline-none focus:border-[#00e5ff]"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-[#00e5ff] hover:bg-[#38bdf8] text-[#040810] font-mono font-black text-[10px] uppercase cursor-pointer"
                  >
                    SEND
                  </button>
                </form>
              </div>
            )}
          </div>
        </>
      )}

      {/* =========================================================================
          ANTI-LEAVE MATCH ABANDONMENT WARNING MODAL
          ========================================================================= */}
      {showAbandonConfirmModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-auto bg-[#090306]/88 z-50">
          <div className="w-full max-w-md p-5 bg-[#09111d] border-2 border-[#ff2a4b] shadow-[0_0_40px_rgba(255,42,75,0.45)] text-center">
            <div className="inline-block px-2.5 py-0.5 mb-2 bg-[#ff2a4b]/20 border border-[#ff2a4b] text-[#ff4d6d] font-mono text-[10px] font-black uppercase">
              ⚠️ ANTI-LEAVE ENFORCEMENT PROTOCOL
            </div>
            <h3 className="text-base sm:text-lg font-black tracking-wider text-white uppercase mb-2">
              ABANDON ACTIVE COMBAT MATCH?
            </h3>
            <p className="text-xs font-mono text-[#9ab4d2] mb-4 leading-relaxed">
              Leaving an active match in progress disrupts your allied commanders and triggers an immediate{' '}
              <span className="text-[#ff4d6d] font-bold">
                {Math.min(300, 60 * (penaltyOffenses + 1))}s Matchmaking Timeout Penalty
              </span>
              . You will be locked out from joining or creating lobbies until the penalty timer expires.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowAbandonConfirmModal(false)}
                className="px-4 py-2 bg-[#00ff66] hover:bg-[#00e5ff] text-[#040810] font-black text-xs uppercase cursor-pointer"
              >
                STAY IN MATCH
              </button>
              <button
                type="button"
                onClick={handleConfirmAbandonMatch}
                className="px-4 py-2 bg-[#2b0b12] hover:bg-[#ff2a4b] text-[#ff6b81] hover:text-white border border-[#ff2a4b] font-bold text-xs uppercase cursor-pointer transition-colors"
              >
                LEAVE &amp; ACCEPT {Math.min(300, 60 * (penaltyOffenses + 1))}s PENALTY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          COMPACT MAIN MENU OVERLAY OVER LIVE 3D BATTLEFIELD CINEMATIC
          ========================================================================= */}
      {phase === 'menu' && (
        <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-7 z-40">
          {/* Top-Right Spectator AI-vs-AI Camera Mode Controls */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 pointer-events-auto">
            <div className="flex items-center bg-[#060d17]/85 border border-[#2b4463] p-0.5 backdrop-blur-sm">
              {([
                { id: 'auto', label: 'AUTO' },
                { id: 'birds_eye', label: 'OVERVIEW' },
                { id: 'team_a', label: 'TEAM A' },
                { id: 'team_b', label: 'TEAM B' },
                { id: 'ground_operator', label: 'BATTLE' }
              ] as const).map(cm => (
                <button
                  key={cm.id}
                  type="button"
                  onClick={() => handleChangeCinematicViewMode(cm.id)}
                  className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase transition-colors cursor-pointer ${
                    cinematicViewMode === cm.id
                      ? 'bg-[#00e5ff] text-[#040810]'
                      : 'text-[#93b4d4] hover:text-white'
                  }`}
                >
                  {cm.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleStartCampaignGame}
              className="px-3 py-1 bg-[#060d17]/75 hover:bg-[#00e5ff] text-[#93b4d4] hover:text-[#040810] border border-[#2b4463] hover:border-[#00e5ff] text-[10px] font-mono font-bold tracking-widest uppercase transition-colors cursor-pointer backdrop-blur-sm"
            >
              SKIP &raquo;
            </button>
          </div>

          {/* Lower-Left Compact Command Overlay (Leaves >85% of viewport open to 3D Battle Cinematic) */}
          <div className="w-[84vw] max-w-[280px] sm:max-w-[310px] p-4 sm:p-5 bg-[#050b14]/82 border border-[#223852] shadow-[0_8px_32px_rgba(0,0,0,0.75)] backdrop-blur-md pointer-events-auto">
            <div className="flex items-center gap-3 mb-4">
              <svg viewBox="0 0 120 120" className="w-10 h-10 shrink-0" fill="none">
                <circle cx="60" cy="60" r="54" stroke="#00e5ff" strokeWidth="2.5" strokeDasharray="10 5" />
                <polygon points="60,10 106,34 92,86 60,108 28,86 14,34" fill="rgba(0, 229, 255, 0.14)" stroke="#00e5ff" strokeWidth="2.5" />
                <polygon points="60,22 72,50 98,56 72,68 60,98 48,68 22,56 48,50" fill="#ffaa00" />
                <circle cx="60" cy="58" r="7" fill="#040609" stroke="#00e5ff" strokeWidth="2" />
              </svg>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black tracking-wider text-white leading-tight truncate">
                  OUTPOST : SECTOR-09
                </h1>
                <p className="text-[9px] text-[#00e5ff] tracking-[0.18em] font-mono uppercase">
                  Tactical RTS Command
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="relative flex flex-col gap-1">
                <button
                  data-testid="launch-campaign-btn"
                  onPointerDown={handleCampaignPointerDown}
                  onPointerUp={handleCampaignPointerUp}
                  onPointerCancel={handleCampaignPointerCancel}
                  onPointerLeave={handleCampaignPointerCancel}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCampaignDropdownOpen(prev => !prev);
                  }}
                  className="w-full py-2.5 px-3.5 bg-[#00e5ff] text-[#040810] font-black text-xs tracking-widest uppercase hover:bg-[#38bdf8] border border-[#bbf7ff] transition-all cursor-pointer shadow-[0_0_16px_rgba(0,229,255,0.35)] flex items-center justify-between select-none"
                  title="Tap to Launch Campaign · Hold to Open Campaign Options"
                >
                  <span>CAMPAIGN</span>
                  <span className="text-[9px] font-mono font-bold">TAP / HOLD ▾</span>
                </button>

                {campaignDropdownOpen && (
                  <div
                    data-testid="campaign-hold-dropdown"
                    className="w-full bg-[#071322]/96 border border-[#00e5ff] shadow-[0_8px_24px_rgba(0,0,0,0.85)] p-1.5 flex flex-col gap-1 z-50"
                  >
                    <div className="flex items-center justify-between px-1.5 py-0.5 text-[9px] font-mono text-[#7dd3fc] border-b border-[#1e3a5f]">
                      <span>CAMPAIGN COMMAND MENU</span>
                      <button
                        type="button"
                        onClick={() => setCampaignDropdownOpen(false)}
                        className="text-[#f87171] hover:text-white font-bold cursor-pointer px-1"
                      >
                        ✕
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleStartCampaignGame();
                      }}
                      className="w-full py-1.5 px-2.5 bg-[#0c243d] hover:bg-[#00e5ff] text-[#e0f2fe] hover:text-[#040810] font-mono font-bold text-[10px] uppercase text-left transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <span>▶ NEW CAMPAIGN</span>
                      <span className="text-[9px] opacity-80">START</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleRegenerateCampaignMap();
                      }}
                      className="w-full py-1.5 px-2.5 bg-[#0c243d] hover:bg-[#00ff66] text-[#e0f2fe] hover:text-[#040810] font-mono font-bold text-[10px] uppercase text-left transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <span>↻ REGENERATE MAP</span>
                      <span className="text-[9px] opacity-80">SEED #{mapSeedDisplay}</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setPhase('multiplayer_browser');
                  if (window.SFX) window.SFX.playClick();
                  if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                    socketRef.current.send(JSON.stringify({ type: 'c:get_lobbies', clientKey: clientKeyRef.current }));
                  }
                }}
                className="w-full py-2.5 px-3.5 bg-[#0d1c2e]/90 hover:bg-[#132840] text-[#00e5ff] font-extrabold text-xs tracking-widest uppercase border border-[#2b4c73] hover:border-[#00e5ff] transition-all cursor-pointer flex items-center justify-between"
              >
                <span>MULTIPLAYER</span>
                <span className="text-[10px] font-mono text-[#00ff66]">LOBBIES</span>
              </button>

              <button
                onClick={() => {
                  if (window.SFX) {
                    window.SFX.muted = !window.SFX.muted;
                    window.SFX.playClick();
                  }
                  if (typeof (window as any).toggleHudSettingsModal === 'function') {
                    (window as any).toggleHudSettingsModal();
                  }
                }}
                className="w-full py-2 px-3.5 bg-[#091320]/90 hover:bg-[#0e1d30] text-[#93b4d4] font-bold text-[11px] tracking-wider uppercase border border-[#233852] transition-all cursor-pointer flex items-center justify-between"
              >
                <span>SETTINGS / AUDIO</span>
                <span className="font-mono text-[10px] text-[#00e5ff]">{window.SFX?.muted ? 'MUTED' : 'ACTIVE'}</span>
              </button>

              {/* Procedural Planet Biome Selector */}
              <div className="pt-2 mt-1 border-t border-[#1c314a]">
                <div className="flex items-center justify-between text-[9px] font-mono text-[#88a8c8] uppercase mb-1.5">
                  <span>PLANET BIOME</span>
                  <span className="text-[#00e5ff] font-bold">{planetBiome.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { id: 'highland', label: 'HIGHLAND' },
                    { id: 'desert', label: 'DESERT' },
                    { id: 'ocean', label: 'OCEAN' },
                    { id: 'lava', label: 'LAVA' },
                    { id: 'jungle', label: 'JUNGLE' },
                    { id: 'random', label: 'RANDOM' }
                  ] as const).map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectPlanetBiome(b.id)}
                      className={`py-1 px-1.5 text-[9px] font-mono font-bold uppercase border transition-colors cursor-pointer ${
                        planetBiome === b.id
                          ? 'bg-[#00e5ff] text-[#040810] border-[#a5f3fc]'
                          : 'bg-[#081321] text-[#8faecf] border-[#1f3754] hover:border-[#00e5ff]'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MULTIPLAYER LOBBY BROWSER (CLEAN COMPACT RTS LOBBY LIST — REAL SERVER ONLY)
          ========================================================================= */}
      {phase === 'multiplayer_browser' && (
        <div
          data-testid="multiplayer-browser"
          className="fixed inset-0 flex flex-col items-center justify-center p-2 sm:p-4 pointer-events-auto overflow-y-auto bg-[#040810]/92 backdrop-blur-md"
        >
          <div className="w-full max-w-4xl flex flex-col max-h-[94vh] bg-[#060e18] border border-[#213750] shadow-2xl overflow-hidden">
            {/* Compact Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3 border-b border-[#1b3049] bg-[#081220] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => {
                    setPhase('menu');
                    setLobbyValidationError(null);
                    if (window.SFX) window.SFX.playClick();
                  }}
                  className="px-2.5 py-1 bg-[#0a1726] border border-[#2a4568] hover:border-[#00e5ff] text-[#93b7df] hover:text-white text-xs font-bold uppercase transition-colors cursor-pointer shrink-0"
                >
                  &larr; MENU
                </button>
                <h2 className="text-xs sm:text-base font-black tracking-wider text-white uppercase truncate">
                  MULTIPLAYER LOBBY
                </h2>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <div
                  data-testid="mp-connection-status"
                  className={`flex items-center gap-1.5 px-2 py-1 border text-[10px] sm:text-xs font-mono ${
                    wsConnected
                      ? 'bg-[#072219] border-[#00ff66]/60 text-[#00ff66]'
                      : 'bg-[#280810] border-[#ff2a4b] text-[#ff4d6d]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#00ff66]' : 'bg-[#ff2a4b]'}`} />
                  <span>{wsConnected ? `ONLINE (${myMeasuredPing || 12}ms)` : 'SERVER OFFLINE'}</span>
                </div>

                {!wsConnected && (
                  <button
                    type="button"
                    onClick={retryWebSocketConnection}
                    className="px-2.5 py-1 bg-[#122842] hover:bg-[#00e5ff] text-[#00e5ff] hover:text-[#040810] border border-[#00e5ff] text-[10px] sm:text-xs font-mono font-bold uppercase cursor-pointer"
                  >
                    RETRY
                  </button>
                )}

                <button
                  data-testid="open-create-lobby-btn"
                  onClick={() => setShowCreateModal(true)}
                  disabled={!wsConnected || penaltySecondsLeft > 0}
                  className="px-3 sm:px-4 py-1.5 bg-[#00e5ff] hover:bg-[#38bdf8] disabled:opacity-40 text-[#040810] font-black text-[11px] sm:text-xs tracking-wider uppercase border border-[#a5f3fc] transition-colors cursor-pointer shrink-0"
                >
                  {penaltySecondsLeft > 0 ? `LOCKED (${penaltySecondsLeft}s)` : '+ CREATE ROOM'}
                </button>
              </div>
            </div>

            {/* Offline / Validation / Penalty Banner */}
            {!wsConnected && (
              <div
                data-testid="mp-offline-banner"
                className="p-2.5 bg-[#280810] border-b border-[#ff2a4b] text-[#ffb3c1] font-mono text-xs flex items-center justify-between gap-2 shrink-0"
              >
                <span>Connection to multiplayer server (/ws) unavailable. No mock rooms are shown.</span>
                <button
                  type="button"
                  onClick={retryWebSocketConnection}
                  className="px-2.5 py-1 bg-[#ff2a4b] text-white font-bold uppercase text-[10px] cursor-pointer shrink-0"
                >
                  RECONNECT
                </button>
              </div>
            )}

            {lobbyValidationError && (
              <div
                data-testid="mp-error-banner"
                className="p-2.5 bg-[#280810] border-b border-[#ff2a4b] text-[#ff4d6d] font-mono text-xs flex items-center justify-between gap-2 shrink-0"
              >
                <span>{lobbyValidationError}</span>
                <button
                  type="button"
                  onClick={() => setLobbyValidationError(null)}
                  className="text-white hover:text-[#ff4d6d] font-bold px-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {penaltySecondsLeft > 0 && (
              <div className="p-2.5 bg-[#280810] border-b border-[#ff2a4b] text-[#ffb3c1] font-mono text-xs flex items-center justify-between gap-2 shrink-0">
                <span>LOCKOUT ({penaltySecondsLeft}s): {penaltyReason || 'Abandoned active match.'}</span>
              </div>
            )}

            {/* Filter Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[#1b3049] bg-[#07101c] shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto max-w-full">
                {([
                  { id: 'all', label: 'ALL' },
                  { id: '1v1', label: '1V1' },
                  { id: '1v2', label: '1V2' },
                  { id: '1v3', label: '1V3' },
                  { id: '2v2', label: '2V2' },
                  { id: 'ffa', label: 'FFA' },
                  { id: 'custom', label: 'CUSTOM' }
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setLobbyFilter(tab.id as any);
                      if (window.SFX) window.SFX.playClick();
                    }}
                    className={`px-2.5 py-1 text-[10px] sm:text-xs font-bold uppercase border cursor-pointer whitespace-nowrap ${
                      lobbyFilter === tab.id
                        ? 'bg-[#00e5ff] text-[#040810] border-[#a5f3fc]'
                        : 'bg-[#0a1626] border-[#223854] text-[#8eaecf] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] sm:text-xs font-mono text-[#89a8cb]">
                {filteredLobbies.length} {filteredLobbies.length === 1 ? 'ROOM' : 'ROOMS'}
              </span>
            </div>

            {/* Active Rooms List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[220px]">
              {filteredLobbies.length === 0 ? (
                <div
                  data-testid="empty-lobby-list"
                  className="h-48 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[#1e3550] bg-[#050c16]/60 font-mono"
                >
                  <div className="text-xs sm:text-sm text-[#93b7df] font-bold uppercase mb-1">
                    {wsConnected ? 'NO ACTIVE ROOMS ON SERVER' : 'SERVER OFFLINE'}
                  </div>
                  <p className="text-[11px] text-[#6488ad] mb-3 max-w-md">
                    {wsConnected
                      ? 'Create a room to configure teams, factions, AI slots, and map biome.'
                      : 'Connect to the multiplayer server to browse or create rooms.'}
                  </p>
                  {wsConnected && penaltySecondsLeft <= 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-1.5 bg-[#00e5ff] hover:bg-[#38bdf8] text-[#040810] font-black text-xs uppercase cursor-pointer"
                    >
                      + CREATE ROOM
                    </button>
                  )}
                </div>
              ) : (
                filteredLobbies.map(lobby => (
                  <div
                    key={lobby.id}
                    data-testid={`lobby-row-${lobby.id}`}
                    onClick={() => {
                      if (wsConnected && penaltySecondsLeft <= 0) handleJoinLobby(lobby);
                    }}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 sm:p-3 bg-[#0a1524] border border-[#1d3452] transition-colors ${
                      !wsConnected || penaltySecondsLeft > 0
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:bg-[#0e1d32] hover:border-[#00e5ff] cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs sm:text-sm text-white truncate">
                          {lobby.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#14283d] text-[#00e5ff] border border-[#203c5c] uppercase">
                          {lobby.mode.toUpperCase()}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#0d1c2e] text-[#93b7df] border border-[#1f3754] uppercase">
                          {(lobby.mapBiome || 'highland').toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[10px] sm:text-xs text-[#82a4c9] font-mono mt-0.5">
                        Host: {lobby.hostName} &middot; {lobby.players.length}/{lobby.maxPlayers} Slots &middot; {lobby.status}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={!wsConnected || penaltySecondsLeft > 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (wsConnected && penaltySecondsLeft <= 0) handleJoinLobby(lobby);
                        }}
                        className="px-3.5 py-1.5 bg-[#00e5ff] hover:bg-[#38bdf8] disabled:opacity-40 text-[#040810] font-black text-xs uppercase cursor-pointer"
                      >
                        JOIN
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          INSIDE LOBBY SCREEN (CLEAN, COMPACT RTS LOBBY — SINGLE SOURCE OF TRUTH)
          ========================================================================= */}
      {phase === 'inside_lobby' && selectedLobby && (
        <div
          data-testid="inside-lobby-screen"
          className="fixed inset-0 flex flex-col items-center justify-center p-2 sm:p-4 pointer-events-auto overflow-y-auto bg-[#040810]/94 backdrop-blur-md"
        >
          <div className="w-full max-w-4xl flex flex-col max-h-[96vh] bg-[#060e18] border border-[#213750] shadow-2xl overflow-hidden">
            {/* 1. Top Bar: Leave Lobby, Room Name, Connection Status */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3 border-b border-[#1b3049] bg-[#081220] shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  data-testid="leave-lobby-btn"
                  onClick={handleLeaveLobby}
                  className="px-2.5 py-1 bg-[#0a1726] border border-[#2a4568] hover:border-[#ff2a4b] text-[#93b7df] hover:text-white text-xs font-bold uppercase transition-colors cursor-pointer shrink-0"
                >
                  &larr; LEAVE
                </button>
                <input
                  data-testid="lobby-room-name-input"
                  type="text"
                  value={selectedLobby.name}
                  onChange={(e) => {
                    const nextName = e.target.value.slice(0, 40);
                    syncLobbyPlayersToServer({ ...selectedLobby, name: nextName });
                  }}
                  className="min-w-0 flex-1 max-w-xs px-2 py-1 bg-[#050b14] border border-[#1f3754] focus:border-[#00e5ff] text-white font-bold text-xs sm:text-sm truncate focus:outline-none"
                  aria-label="Room Name"
                />
              </div>

              <div className="flex items-center gap-2">
                <div
                  data-testid="lobby-ws-status"
                  className={`flex items-center gap-1.5 px-2 py-1 border text-[10px] sm:text-xs font-mono ${
                    wsConnected
                      ? 'bg-[#072219] border-[#00ff66]/60 text-[#00ff66]'
                      : 'bg-[#280810] border-[#ff2a4b] text-[#ff4d6d]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#00ff66]' : 'bg-[#ff2a4b]'}`} />
                  <span>{wsConnected ? `CONNECTED (${myMeasuredPing || 12}ms)` : 'OFFLINE'}</span>
                </div>
              </div>
            </div>

            {/* Validation Error Banner */}
            {lobbyValidationError && (
              <div
                data-testid="lobby-validation-error"
                className="p-2.5 bg-[#280810] border-b border-[#ff2a4b] text-[#ff4d6d] font-mono text-xs flex items-center justify-between gap-2 shrink-0"
              >
                <span>⚠️ {lobbyValidationError}</span>
                <button
                  type="button"
                  onClick={() => setLobbyValidationError(null)}
                  className="text-white hover:text-[#ff4d6d] font-bold px-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 2. Essential Match Controls Bar: Game Mode & Map Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 sm:p-3 border-b border-[#1b3049] bg-[#07101c] shrink-0">
              {/* Game Mode Selector */}
              <div>
                <div className="text-[10px] font-mono text-[#8faecf] uppercase mb-1">
                  GAME MODE
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {([
                    { id: '1v1', label: '1V1' },
                    { id: '1v2', label: '1V2' },
                    { id: '1v3', label: '1V3' },
                    { id: '2v2', label: '2V2' },
                    { id: 'ffa', label: 'FFA' },
                    { id: 'custom', label: 'CUSTOM' }
                  ] as const).map(m => (
                    <button
                      key={m.id}
                      data-testid={`mode-btn-${m.id}`}
                      type="button"
                      onClick={() => handleSelectLobbyMode(m.id)}
                      className={`py-1 text-[10px] sm:text-xs font-mono font-bold uppercase border cursor-pointer ${
                        selectedLobby.mode === m.id
                          ? 'bg-[#00e5ff] text-[#040810] border-[#a5f3fc]'
                          : 'bg-[#091524] text-[#82a4c9] border-[#1f3754] hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Map Biome Selection */}
              <div>
                <div className="text-[10px] font-mono text-[#8faecf] uppercase mb-1">
                  MAP BIOME
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {(['highland', 'ocean', 'lava', 'jungle', 'desert'] as const).map(b => {
                    const activeBiome = selectedLobby.mapBiome || planetBiome;
                    return (
                      <button
                        key={b}
                        data-testid={`biome-btn-${b}`}
                        type="button"
                        onClick={() => handleSelectPlanetBiome(b)}
                        className={`py-1 text-[10px] sm:text-xs font-mono font-bold uppercase border cursor-pointer ${
                          activeBiome === b
                            ? 'bg-[#00e5ff] text-[#040810] border-[#a5f3fc]'
                            : 'bg-[#091524] text-[#82a4c9] border-[#1f3754] hover:text-white'
                        }`}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. Player & AI Slots Table (Scrollable on Mobile & Desktop) */}
            <div className="flex-1 flex flex-col p-2.5 sm:p-3 overflow-y-auto min-h-[200px]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 shrink-0">
                <span className="text-xs font-mono font-bold text-[#00e5ff] uppercase">
                  PARTICIPANT SLOTS ({selectedLobby.players.length}/{selectedLobby.maxPlayers})
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    data-testid="add-ai-team1-btn"
                    type="button"
                    onClick={() => handleAddAiBot('Hard', 1)}
                    disabled={selectedLobby.players.length >= selectedLobby.maxPlayers}
                    className="px-2.5 py-1 bg-[#0b2922] hover:bg-[#124236] disabled:opacity-40 text-[#00ff66] border border-[#1f6e58] text-[10px] sm:text-xs font-mono font-bold uppercase cursor-pointer"
                  >
                    + AI (TEAM 1)
                  </button>
                  <button
                    data-testid="add-ai-team2-btn"
                    type="button"
                    onClick={() => handleAddAiBot('Hard', 2)}
                    disabled={selectedLobby.players.length >= selectedLobby.maxPlayers}
                    className="px-2.5 py-1 bg-[#261014] hover:bg-[#3b171e] disabled:opacity-40 text-[#ff4d6d] border border-[#5e1f2b] text-[10px] sm:text-xs font-mono font-bold uppercase cursor-pointer"
                  >
                    + AI (TEAM 2)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {selectedLobby.players.map((p, idx) => {
                  const isYou = !p.isAi && (p.id === myPlayerId || p.name === myPlayerName);
                  const teamColorClass = p.team === 1
                    ? 'border-l-4 border-l-[#00e5ff] bg-[#091829]'
                    : p.team === 2
                    ? 'border-l-4 border-l-[#ff2a4b] bg-[#1f0d13]'
                    : p.team === 3
                    ? 'border-l-4 border-l-[#ffaa00] bg-[#1f1709]'
                    : p.team === 4
                    ? 'border-l-4 border-l-[#a855f7] bg-[#180d26]'
                    : 'border-l-4 border-l-[#94a3b8] bg-[#111722]';

                  return (
                    <div
                      key={p.id}
                      data-testid={`lobby-slot-${idx}`}
                      className={`grid grid-cols-1 sm:grid-cols-12 items-center gap-2 p-2 border border-[#1f3652] ${teamColorClass}`}
                    >
                      {/* Slot Name & Type */}
                      <div className="sm:col-span-4 flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs text-[#6e8fad] shrink-0">#{idx + 1}</span>
                        <span className="font-bold text-xs sm:text-sm text-white truncate">
                          {p.name}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase border shrink-0 ${
                          p.isAi
                            ? 'bg-[#1e293b] text-[#cbd5e1] border-[#475569]'
                            : 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/60'
                        }`}>
                          {p.isAi ? 'AI' : 'HUMAN'}
                        </span>
                      </div>

                      {/* Team Assignment */}
                      <div className="sm:col-span-2">
                        <select
                          data-testid={`slot-team-select-${idx}`}
                          value={selectedLobby.mode === 'ffa' ? 0 : p.team}
                          onChange={(e) => handleUpdateSlotTeam(p.id, Number(e.target.value) as any)}
                          className="w-full px-2 py-1 bg-[#050b14] border border-[#244061] text-white font-mono text-[11px] uppercase focus:border-[#00e5ff] focus:outline-none"
                          aria-label={`Slot ${idx + 1} Team`}
                        >
                          <option value={1}>TEAM 1</option>
                          <option value={2}>TEAM 2</option>
                          <option value={3}>TEAM 3</option>
                          <option value={4}>TEAM 4</option>
                          <option value={0}>FFA (SOLO)</option>
                        </select>
                      </div>

                      {/* Faction Selection */}
                      <div className="sm:col-span-3">
                        <select
                          data-testid={`slot-faction-select-${idx}`}
                          value={p.faction === 'Protoss Solaris' ? 'Protoss Fleet' : p.faction}
                          onChange={(e) => handleUpdateSlotFaction(p.id, e.target.value as any)}
                          className="w-full px-2 py-1 bg-[#050b14] border border-[#244061] text-[#38bdf8] font-mono text-[11px] uppercase focus:border-[#00e5ff] focus:outline-none"
                          aria-label={`Slot ${idx + 1} Faction`}
                        >
                          <option value="Terran Dominion">TERRAN DOMINION</option>
                          <option value="Protoss Fleet">PROTOSS FLEET</option>
                          <option value="Zerg Swarm">ZERG SWARM</option>
                        </select>
                      </div>

                      {/* AI Difficulty OR Human Ready Status + Remove AI */}
                      <div className="sm:col-span-3 flex items-center justify-end gap-1.5">
                        {p.isAi ? (
                          <>
                            <select
                              data-testid={`slot-difficulty-select-${idx}`}
                              value={p.aiDifficulty || 'Hard'}
                              onChange={(e) => handleUpdateSlotDifficulty(p.id, e.target.value as any)}
                              className="flex-1 px-2 py-1 bg-[#050b14] border border-[#244061] text-[#ffaa00] font-mono text-[11px] uppercase focus:border-[#00e5ff] focus:outline-none"
                              aria-label={`Slot ${idx + 1} AI Difficulty`}
                            >
                              <option value="Easy">EASY</option>
                              <option value="Medium">MEDIUM</option>
                              <option value="Hard">HARD</option>
                              <option value="Brutal">BRUTAL</option>
                            </select>
                            <button
                              data-testid={`remove-slot-btn-${idx}`}
                              type="button"
                              onClick={() => handleRemovePlayer(p.id)}
                              className="px-2 py-1 bg-[#2b0d14] hover:bg-[#ff2a4b] text-[#ff6b81] hover:text-white border border-[#5e1f2b] text-xs font-mono font-bold cursor-pointer shrink-0"
                              title="Remove AI Slot"
                            >
                              ✕
                            </button>
                          </>
                        ) : isYou ? (
                          <button
                            data-testid="toggle-ready-btn"
                            type="button"
                            onClick={handleToggleMyReady}
                            className={`w-full py-1 px-2.5 text-[11px] font-mono font-bold uppercase border cursor-pointer ${
                              p.ready
                                ? 'bg-[#00ff66] text-[#040810] border-[#86efac]'
                                : 'bg-[#1a2b3d] text-[#93b7df] border-[#2d496a]'
                            }`}
                          >
                            {p.ready ? '✓ READY' : 'NOT READY'}
                          </button>
                        ) : (
                          <span className={`px-2 py-1 text-[11px] font-mono font-bold uppercase ${
                            p.ready ? 'text-[#00ff66]' : 'text-[#8faecf]'
                          }`}>
                            {p.ready ? 'READY' : 'WAITING'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 4. Secondary Info & Chat in Expandable Details */}
              <details className="mt-3 bg-[#050c16] border border-[#1b3049] text-xs font-mono">
                <summary className="px-3 py-1.5 text-[11px] text-[#8faecf] hover:text-white cursor-pointer select-none flex items-center justify-between">
                  <span>ROOM DETAILS &amp; CHAT ({chatMessages.length})</span>
                  <span className="text-[#00e5ff]">SEED #{selectedLobby.seed || mapSeedDisplay}</span>
                </summary>
                <div className="p-2.5 border-t border-[#1b3049] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#7ea0c5]">
                    <span>ROOM ID: {selectedLobby.id}</span>
                    <button
                      type="button"
                      onClick={() => handleRegenerateMap(selectedLobby.players)}
                      className="px-2 py-0.5 bg-[#0d2238] hover:bg-[#00e5ff] text-[#00e5ff] hover:text-[#040810] border border-[#00e5ff]/60 uppercase cursor-pointer"
                    >
                      ⟳ NEW SEED
                    </button>
                  </div>
                  <div className="h-24 overflow-y-auto space-y-1 p-1.5 bg-[#03070e] border border-[#162942] text-[11px]">
                    {chatMessages.map((m, idx) => (
                      <div key={idx} className="leading-tight break-words">
                        <span className="text-[#557191] text-[10px] mr-1">[{m.time}]</span>
                        <span className="text-[#00e5ff] font-bold mr-1">{m.sender}:</span>
                        <span className="text-[#c7dcfa]">{m.text}</span>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendChat} className="flex gap-1.5">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Send room message..."
                      className="flex-1 min-w-0 px-2 py-1 bg-[#050c16] border border-[#203a5a] text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1 bg-[#102338] hover:bg-[#00e5ff] text-[#00e5ff] hover:text-[#040810] border border-[#274a73] font-bold text-xs uppercase cursor-pointer"
                    >
                      SEND
                    </button>
                  </form>
                </div>
              </details>
            </div>

            {/* 5. Bottom Action Bar: Team Summary & Start Match */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 sm:p-3 border-t border-[#1b3049] bg-[#081220] shrink-0">
              <div className="text-[11px] font-mono text-[#93b7df] flex flex-wrap items-center gap-2">
                <span className="text-[#00e5ff]">TEAM 1: {selectedLobby.players.filter(p => p.team === 1).length}</span>
                <span>&middot;</span>
                <span className="text-[#ff4d6d]">TEAM 2: {selectedLobby.players.filter(p => p.team === 2).length}</span>
                {selectedLobby.players.some(p => p.team === 3 || p.team === 4 || p.team === 0) && (
                  <>
                    <span>&middot;</span>
                    <span className="text-[#ffaa00]">
                      OTHER/FFA: {selectedLobby.players.filter(p => p.team !== 1 && p.team !== 2).length}
                    </span>
                  </>
                )}
              </div>

              <button
                data-testid="start-match-btn"
                type="button"
                onClick={handleStartGame}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#00ff66] hover:bg-[#00e5ff] text-[#040810] font-black text-xs sm:text-sm tracking-widest uppercase border border-[#86efac] transition-colors cursor-pointer shadow-[0_0_20px_rgba(0,255,102,0.4)]"
              >
                START MATCH &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CREATE LOBBY MODAL
          ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-auto bg-[#040810]/85 z-50">
          <div className="w-full max-w-md p-4 sm:p-5 bg-[#07111e] border-2 border-[#00e5ff] shadow-2xl">
            <h3 className="text-sm sm:text-base font-black tracking-wider text-white mb-3 uppercase">
              CREATE MULTIPLAYER ROOM
            </h3>
            <form onSubmit={handleCreateLobbySubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-mono text-[#8faecf] uppercase mb-1">
                  ROOM NAME:
                </label>
                <input
                  data-testid="create-room-name-input"
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#050b14] border border-[#213958] text-white text-xs font-mono focus:border-[#00e5ff] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8faecf] uppercase mb-1">
                  GAME MODE:
                </label>
                <select
                  data-testid="create-room-mode-select"
                  value={newRoomMode}
                  onChange={(e) => setNewRoomMode(e.target.value as LobbyGameMode)}
                  className="w-full px-3 py-2 bg-[#050b14] border border-[#213958] text-white text-xs font-mono focus:border-[#00e5ff] focus:outline-none"
                >
                  <option value="1v1">1v1 (1 Human vs 1 AI)</option>
                  <option value="1v2">1v2 (1 Human vs 2 AI)</option>
                  <option value="1v3">1v3 (1 Human vs 3 AI)</option>
                  <option value="2v2">2v2 (2 Team 1 vs 2 Team 2)</option>
                  <option value="ffa">Free-For-All (4-Way Solo)</option>
                  <option value="custom">Custom Slots</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-[#101b2a] text-[#8faecf] border border-[#263e5e] text-xs font-bold uppercase cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  data-testid="confirm-create-room-btn"
                  type="submit"
                  className="px-5 py-2 bg-[#00e5ff] text-[#040810] font-black text-xs uppercase cursor-pointer shadow-md"
                >
                  CREATE ROOM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          CLEAN CINEMATIC LOADING SCREEN (REAL PROGRESS ONLY)
          ========================================================================= */}
      {phase === 'loading_match' && (
        <div className="fixed inset-0 flex flex-col items-center justify-end pb-8 sm:pb-12 px-4 pointer-events-auto z-50 bg-transparent">
          <div className="w-full max-w-md p-4 sm:p-5 bg-[#050b14]/88 border border-[#1f3b5c] shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-md text-center">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <svg viewBox="0 0 120 120" className="w-6 h-6 shrink-0" fill="none">
                <circle cx="60" cy="60" r="54" stroke="#00e5ff" strokeWidth="3" />
                <polygon points="60,22 72,50 98,56 72,68 60,98 48,68 22,56 48,50" fill="#ffaa00" />
              </svg>
              <span className="text-xs sm:text-sm font-black tracking-widest text-white uppercase">
                GENERATING BATTLEFIELD...
              </span>
            </div>

            <p className="text-[11px] font-mono text-[#8fb2d6] mb-3">
              {loadingError ? loadingError : 'Preparing terrain, factions and battlefield systems.'}
            </p>

            <div className="w-full h-2 bg-[#03070e] border border-[#1f3b5c] overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-[#00e5ff] to-[#00ff66] transition-all duration-150"
                style={{ width: `${Math.min(100, loadingStage * 10)}%` }}
              />
            </div>

            {loadingError ? (
              <div className="flex items-center justify-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setLoadingRetryCount(c => c + 1)}
                  className="px-4 py-1.5 bg-[#00e5ff] text-[#040810] text-xs font-mono font-black uppercase cursor-pointer"
                >
                  RETRY
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[10px] font-mono text-[#6488ad]">
                <span>TIP: Build Mine Drills on Gem Craters for high-yield resources.</span>
                <span className="text-[#00e5ff] font-bold">{Math.min(100, loadingStage * 10)}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          DEFEAT MODAL (HQ OVERRUN)
          ========================================================================= */}
      {phase === 'defeat' && (
        <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-auto bg-[#0c0406]/85">
          <div className="w-full max-w-md p-5 sm:p-6 border-2 border-[#ff2a4b] bg-[#0b1017] text-center shadow-2xl">
            <h2 className="text-base sm:text-lg font-black tracking-wider text-[#ff2a4b] mb-2">
              COMMAND HQ OVERRUN
            </h2>
            <p className="text-xs text-[#9ab0c9] mb-6 leading-relaxed">
              The Zerg brood breached your Command HQ on Wave {snapshot.wave}. Trigger an Emergency Shockwave Overload to vaporize all surrounding enemies and restore HQ integrity!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  window.GAME_API?.repairHQ();
                  setPhase('playing');
                }}
                className="px-5 py-2.5 text-xs font-extrabold uppercase bg-[#00ff66] text-[#05080c] hover:bg-[#00e5ff] transition-colors cursor-pointer"
              >
                Shockwave &amp; Emergency Repair HQ
              </button>
              <button
                onClick={() => setPhase('menu')}
                className="px-4 py-2.5 text-xs font-extrabold uppercase bg-[#1a2433] text-[#d8ecff] border border-[#3a4b63] hover:border-[#ff2a4b] transition-colors cursor-pointer"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
