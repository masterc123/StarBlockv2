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
  team: 1 | 2 | 0; // 0 = FFA
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

interface MultiplayerLobby {
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

const DEFAULT_LOBBIES: MultiplayerLobby[] = [
  {
    id: 'lob-1',
    name: '[DOMINION] Canyon Crossfire 3v3',
    hostName: 'OPEN LOBBY (JOIN TO HOST)',
    hostId: '',
    mode: 'team_ai',
    mapName: 'Sector-09 Valley Pass',
    maxPlayers: 6,
    ping: 18,
    status: 'Waiting',
    players: [
      { id: 'p_ai1', name: '[BOT] Kerrigan_Brood', isHost: false, isAi: true, aiDifficulty: 'Hard', team: 2, faction: 'Zerg Swarm', ping: 0, ready: true, antiCheatVerified: true, antiCheatFlags: 0 },
      { id: 'p_ai2', name: '[BOT] Overmind_Hive', isHost: false, isAi: true, aiDifficulty: 'Brutal', team: 2, faction: 'Zerg Swarm', ping: 0, ready: true, antiCheatVerified: true, antiCheatFlags: 0 }
    ],
    messages: [
      { sender: 'SYSTEM', text: 'Real-Time WebSocket Sector-09 Lobby ready. Valkyrie Anti-Cheat & Resource Link enabled.', time: 'LIVE', channel: 'SYSTEM' }
    ]
  },
  {
    id: 'lob-2',
    name: '[DEATHMATCH] Frontier Bloodbath FFA',
    hostName: 'OPEN LOBBY (JOIN TO HOST)',
    hostId: '',
    mode: 'deathmatch',
    mapName: 'Sector-09 Valley Pass',
    maxPlayers: 4,
    ping: 24,
    status: 'Waiting',
    players: [
      { id: 'p_ai3', name: '[BOT] Artanis_Synod', isHost: false, isAi: true, aiDifficulty: 'Hard', team: 0, faction: 'Protoss Fleet', ping: 0, ready: true, antiCheatVerified: true, antiCheatFlags: 0 },
      { id: 'p_ai4', name: '[BOT] Zagara_Swarm', isHost: false, isAi: true, aiDifficulty: 'Medium', team: 0, faction: 'Zerg Swarm', ping: 0, ready: true, antiCheatVerified: true, antiCheatFlags: 0 }
    ],
    messages: [
      { sender: 'SYSTEM', text: 'Free-For-All room initialized. All added commanders receive dedicated procedural bases.', time: 'LIVE', channel: 'SYSTEM' }
    ]
  },
  {
    id: 'lob-3',
    name: '[CO-OP] 2v2 River Causeway Defense',
    hostName: 'OPEN LOBBY (JOIN TO HOST)',
    hostId: '',
    mode: '2v2',
    mapName: 'Sector-09 Valley Pass',
    maxPlayers: 4,
    ping: 16,
    status: 'Waiting',
    players: [
      { id: 'p_ai_ally', name: '[BOT] Tassadar_Solaris', isHost: false, isAi: true, aiDifficulty: 'Hard', team: 1, faction: 'Protoss Fleet', ping: 0, ready: true, antiCheatVerified: true, antiCheatFlags: 0 },
      { id: 'p_ai5', name: '[BOT] Torrasque_Brood', isHost: false, isAi: true, aiDifficulty: 'Brutal', team: 2, faction: 'Zerg Swarm', ping: 0, ready: true, antiCheatVerified: true, antiCheatFlags: 0 }
    ],
    messages: [
      { sender: 'SYSTEM', text: '2v2 Co-Op Causeway room ready. Add AI or human commanders and launch match.', time: 'LIVE', channel: 'SYSTEM' }
    ]
  }
];

export default function App() {
  const [phase, setPhase] = useState<'menu' | 'multiplayer_browser' | 'inside_lobby' | 'loading_match' | 'playing' | 'defeat'>('menu');
  const [lobbies, setLobbies] = useState<MultiplayerLobby[]>(DEFAULT_LOBBIES);
  const [selectedLobby, setSelectedLobby] = useState<MultiplayerLobby>(DEFAULT_LOBBIES[0]);
  const [lobbyFilter, setLobbyFilter] = useState<'all' | 'team_ai' | 'deathmatch' | '2v2' | 'ffa'>('all');
  const [activeBarrierId, setActiveBarrierId] = useState<string>('alpha');
  const [chatMessages, setChatMessages] = useState<ChatMessageEntry[]>(DEFAULT_LOBBIES[0].messages);
  const [chatInput, setChatInput] = useState('');
  const [chatChannel, setChatChannel] = useState<'ALL' | 'TEAM'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('Sector-09 Tactical Skirmish');
  const [newRoomMode, setNewRoomMode] = useState<'team_ai' | 'deathmatch' | '2v2' | 'ffa'>('team_ai');
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

  // Multiplayer Battle.net Match Launch (enables chat, connection bars, resource sharing, anti-cheat, anti-leave)
  const handleStartGame = useCallback(() => {
    if (penaltyUntil > Date.now()) {
      setPhase('multiplayer_browser');
      return;
    }
    setIsMultiplayerMatch(true);
    if (window.SFX) window.SFX.init();
    setInternetOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    // Ensure the real player is included in the lobby players list before generating bases
    let activePlayers = selectedLobby ? [...selectedLobby.players] : [];
    const hasHuman = activePlayers.some(p => !p.isAi || p.id === myPlayerId || p.name === myPlayerName);
    if (!hasHuman) {
      activePlayers.unshift({
        id: myPlayerId,
        name: myPlayerName,
        isHost: true,
        isAi: false,
        team: 1,
        faction: commanderProfile.preferredFaction as any,
        ping: myMeasuredPingRef.current || 14,
        ready: true,
        antiCheatVerified: true,
        antiCheatFlags: 0
      });
      if (selectedLobby) {
        setSelectedLobby({ ...selectedLobby, players: activePlayers, hostName: myPlayerName, hostId: myPlayerId });
      }
    }
    // Regenerate the 3D map with bases for every added player/AI in the lobby!
    if (window.regenerateDynamicSectorMap) {
      const seed = window.regenerateDynamicSectorMap(undefined, activePlayers);
      setMapSeedDisplay(window.MAP_SEED || seed);
      setMapArchetypeDisplay(window.MAP_ARCHETYPE || 'open_badlands');
      setBridgeCountDisplay(window.BRIDGES ? window.BRIDGES.length : 0);
    }
    window.loadingCameraSweep = true;
    setLoadingStage(1);
    setPhase('loading_match');
  }, [selectedLobby, myPlayerId, myPlayerName, commanderProfile.preferredFaction, penaltyUntil]);

  // Real 10-Stage World Initialization & Readiness Verification Pipeline (Driven by actual engine completion, no fake timers)
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
    const allyBots = isMultiplayerMatch && selectedLobby ? selectedLobby.players.filter(p => p.isAi && p.team === 1) : [];
    const enemyBots = isMultiplayerMatch && selectedLobby ? selectedLobby.players.filter(p => p.isAi && p.team !== 1) : [];
    const missionConfig = {
      allyBots,
      enemyBots,
      lobbyPlayers: isMultiplayerMatch && selectedLobby ? selectedLobby.players : [],
      startingMinerals: isMultiplayerMatch ? lobbyMinerals : 200,
      aiAllyMode: isMultiplayerMatch ? lobbyAiAllyMode : 'defensive',
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

          // Yield one animation frame so WebGL and the progress bar render smoothly between real subsystem tasks
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
  }, [phase, isMultiplayerMatch, selectedLobby, lobbyMinerals, lobbyAiAllyMode, lobbyBotDiff, mapSeedDisplay, loadingRetryCount]);

  // Establish Real WebSocket connection to backend server (/ws) + Ping & Anti-Cheat Heartbeat Loops
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
                  if (data.lobby.messages) {
                    setChatMessages(data.lobby.messages);
                  }
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
                const rtt = Math.max(8, Math.min(999, Date.now() - (Number(data.clientTs) || Date.now())));
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
                  // Credit shared resources if targeted to us or broadcast to team
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
                  const allyBots = data.lobby?.players ? data.lobby.players.filter((p: any) => p.isAi && p.team === 1) : [];
                  const enemyBots = data.lobby?.players ? data.lobby.players.filter((p: any) => p.isAi && p.team !== 1) : [];
                  window.GAME_API.startMission({
                    allyBots,
                    enemyBots,
                    lobbyPlayers: data.lobby?.players || [],
                    startingMinerals: lobbyMinerals,
                    aiAllyMode: lobbyAiAllyMode,
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
          reconnectTimeout = window.setTimeout(connect, 2500);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (e) {
        console.warn('[WS] Fallback connection issue:', e);
        reconnectTimeout = window.setTimeout(connect, 3000);
      }
    }

    connect();

    // Live Ping Measurement Loop (updates everyplayer's connection bar & latency ms)
    pingInterval = window.setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'c:ping',
          clientTs: Date.now(),
          measuredPing: myMeasuredPingRef.current,
          clientKey: clientKeyRef.current
        }));
      } else {
        // Fallback local jitter measurement when in local/BroadcastChannel mode
        const jitter = 14 + Math.floor(Math.random() * 7);
        myMeasuredPingRef.current = jitter;
        setMyMeasuredPing(jitter);
      }
    }, 2500);

    // Valkyrie Anti-Cheat Heartbeat Loop (verifies resource & unit state checksums)
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

  const handleShareResourceWithPlayer = (targetPlayer: LobbyPlayer, minerals: number, gems: number) => {
    const api = window.GAME_API;
    if (api && typeof api.spendResourcesForShare === 'function') {
      const ok = api.spendResourcesForShare(minerals, gems);
      if (!ok) {
        setShareNotification(`⚠️ Insufficient stockpile to transfer ${minerals > 0 ? `${minerals} Minerals` : `${gems} Gems`}!`);
        window.setTimeout(() => setShareNotification(null), 3000);
        return;
      }
    }
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:share_resources',
        clientKey: clientKeyRef.current,
        toPlayerId: targetPlayer.id,
        toPlayerName: targetPlayer.name,
        minerals,
        gems
      }));
    } else {
      const label = minerals > 0 ? `+${minerals} Minerals` : `+${gems} Raw Gems`;
      const transferMsg: ChatMessageEntry = {
        sender: 'LOGISTICS',
        text: `📦 ${myPlayerName} transferred ${label} to ${targetPlayer.name}.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        channel: 'SYSTEM'
      };
      setChatMessages(prev => [...prev.slice(-49), transferMsg]);
      setShareNotification(`📦 Sent ${label} to ${targetPlayer.name}`);
      window.setTimeout(() => setShareNotification(null), 3500);
    }
    if (window.SFX) window.SFX.playHeal();
  };

  const renderConnectionBars = (pingValue: number, isAi = false) => {
    const effectivePing = isAi ? 4 : Math.max(8, pingValue || myMeasuredPing || 16);
    const bars = isAi ? 4 : (effectivePing < 60 ? 4 : effectivePing < 110 ? 3 : effectivePing < 180 ? 2 : 1);
    const activeColor = bars === 4 ? '#00ff66' : bars === 3 ? '#38bdf8' : bars === 2 ? '#ffaa00' : '#ff2a4b';

    return (
      <span
        className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-[#040a12] border border-[#1d3552] font-mono text-[10px] tabular-nums shrink-0"
        title={isAi ? 'AI Neural Sync: 4/4 Bars (Optimal)' : `Connection Quality: ${bars}/4 Bars (${effectivePing}ms RTT)`}
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
          {isAi ? 'AI 4ms' : `${effectivePing}ms`}
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

  const handleJoinLobby = (lobby: MultiplayerLobby) => {
    if (penaltyUntil > Date.now()) {
      if (window.SFX) window.SFX.playClick();
      return;
    }
    const alreadyIn = lobby.players.some(p => p.id === myPlayerId || p.name === myPlayerName);
    const hasHumanHost = lobby.players.some(p => !p.isAi && p.isHost);
    const myEntry: LobbyPlayer = {
      id: myPlayerId,
      name: myPlayerName,
      isHost: !hasHumanHost,
      isAi: false,
      team: lobby.mode === 'ffa' ? 0 : 1,
      faction: (commanderProfile.preferredFaction === 'Protoss Solaris' ? 'Protoss Fleet' : commanderProfile.preferredFaction) as any,
      ping: myMeasuredPing || 14,
      ready: true,
      antiCheatVerified: true,
      antiCheatFlags: 0
    };
    const updatedPlayers = alreadyIn ? lobby.players : [myEntry, ...lobby.players];
    const updatedLobby: MultiplayerLobby = {
      ...lobby,
      hostName: !hasHumanHost ? myPlayerName : lobby.hostName,
      hostId: !hasHumanHost ? myPlayerId : lobby.hostId,
      players: updatedPlayers
    };
    setSelectedLobby(updatedLobby);
    setChatMessages(lobby.messages || []);
    setPhase('inside_lobby');
    if (window.SFX) window.SFX.playClick();

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:join_lobby',
        lobbyId: lobby.id,
        name: myPlayerName,
        clientKey: clientKeyRef.current
      }));
    }
  };

  const handleLeaveLobby = () => {
    setPhase('multiplayer_browser');
    if (window.SFX) window.SFX.playClick();
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'c:leave_lobby', clientKey: clientKeyRef.current }));
    }
  };

  const handleToggleMyTeam = () => {
    if (!selectedLobby) return;
    const mySlot = selectedLobby.players.find(p => p.id === myPlayerId || p.name === myPlayerName);
    const currentTeam = mySlot ? mySlot.team : 1;
    const nextTeam: 1 | 2 | 0 = selectedLobby.mode === 'ffa' ? 0 : (currentTeam === 1 ? 2 : 1);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:update_player',
        team: nextTeam,
        clientKey: clientKeyRef.current
      }));
    } else {
      const updated = selectedLobby.players.map(p => {
        if (p.id === myPlayerId || p.name === myPlayerName) {
          return { ...p, team: nextTeam };
        }
        return p;
      });
      setSelectedLobby({ ...selectedLobby, players: updated });
    }
    if (window.SFX) window.SFX.playClick();
  };

  const handleToggleMyReady = () => {
    if (!selectedLobby) return;
    const mySlot = selectedLobby.players.find(p => p.id === myPlayerId || p.name === myPlayerName);
    const nextReady = mySlot ? !mySlot.ready : true;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:update_player',
        ready: nextReady,
        clientKey: clientKeyRef.current
      }));
    } else {
      const updated = selectedLobby.players.map(p => {
        if (p.id === myPlayerId || p.name === myPlayerName) {
          return { ...p, ready: nextReady };
        }
        return p;
      });
      setSelectedLobby({ ...selectedLobby, players: updated });
    }
    if (window.SFX) window.SFX.playClick();
  };

  const handleAddAiBot = (
    diff: 'Easy' | 'Medium' | 'Hard' | 'Brutal' = lobbyBotDiff,
    preferredTeam: 1 | 2 | 0 = 2
  ) => {
    if (!selectedLobby || selectedLobby.players.length >= selectedLobby.maxPlayers) return;

    const botTeam: 1 | 2 | 0 = selectedLobby.mode === 'ffa' ? 0 : preferredTeam;
    const allyNames = ['Commander_Nova', 'Executor_Tassadar', 'Raynor_Raider', 'Artanis_Synod'];
    const enemyNames = ['Zagara_Brood', 'Abathur_Swarm', 'Kerrigan_Hive', 'Dehaka_Pack'];
    const botLabel = botTeam === 1
      ? allyNames[selectedLobby.players.length % allyNames.length]
      : enemyNames[selectedLobby.players.length % enemyNames.length];
    const defaultFaction = botTeam === 1
      ? (selectedLobby.players.length % 2 === 0 ? 'Protoss Fleet' : 'Terran Dominion')
      : (botTeam === 0 ? 'Protoss Fleet' : 'Zerg Swarm');

    const newId = `bot_${Date.now()}_${Math.floor(Math.random() * 999)}`;
    const newBot: LobbyPlayer = {
      id: newId,
      name: `[BOT] ${botLabel}`,
      isHost: false,
      isAi: true,
      aiDifficulty: diff,
      team: botTeam,
      faction: defaultFaction as any,
      ping: 0,
      ready: true,
      antiCheatVerified: true,
      antiCheatFlags: 0
    };
    const nextPlayers = [...selectedLobby.players, newBot];
    setSelectedLobby({ ...selectedLobby, players: nextPlayers });

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:add_bot',
        difficulty: diff,
        team: botTeam,
        clientKey: clientKeyRef.current
      }));
    }
    if (window.SFX) window.SFX.playBuild();
  };

  const handleCycleBotTeam = (botId: string) => {
    if (!selectedLobby) return;
    let targetTeam: 1 | 2 | 0 = 2;
    let targetFaction: any = 'Zerg Swarm';
    const updated = selectedLobby.players.map(p => {
      if (p.id !== botId) return p;
      const nextTeam: 1 | 2 | 0 = p.team === 1 ? 2 : (p.team === 2 ? 0 : 1);
      const nextFaction: any = nextTeam === 1 ? 'Protoss Fleet' : (nextTeam === 2 ? 'Zerg Swarm' : 'Terran Dominion');
      targetTeam = nextTeam;
      targetFaction = nextFaction;
      return { ...p, team: nextTeam, faction: nextFaction };
    });
    setSelectedLobby({ ...selectedLobby, players: updated });
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:update_bot',
        botId,
        team: targetTeam,
        faction: targetFaction,
        clientKey: clientKeyRef.current
      }));
    }
    if (window.SFX) window.SFX.playClick();
  };

  const handleCycleBotFaction = (botId: string) => {
    if (!selectedLobby) return;
    const factions: Array<'Terran Dominion' | 'Protoss Fleet' | 'Zerg Swarm'> = ['Terran Dominion', 'Protoss Fleet', 'Zerg Swarm'];
    let targetFaction: any = 'Terran Dominion';
    const updated = selectedLobby.players.map(p => {
      if (p.id !== botId) return p;
      const curIdx = factions.indexOf(p.faction as any);
      const nextFaction = factions[(curIdx + 1) % factions.length];
      targetFaction = nextFaction;
      return { ...p, faction: nextFaction };
    });
    setSelectedLobby({ ...selectedLobby, players: updated });
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:update_bot',
        botId,
        faction: targetFaction,
        clientKey: clientKeyRef.current
      }));
    }
    if (window.SFX) window.SFX.playClick();
  };

  const handleCycleBotDifficulty = (botId: string) => {
    if (!selectedLobby) return;
    const diffs: Array<'Easy' | 'Medium' | 'Hard' | 'Brutal'> = ['Easy', 'Medium', 'Hard', 'Brutal'];
    let targetDiff: 'Easy' | 'Medium' | 'Hard' | 'Brutal' = 'Hard';
    const updated = selectedLobby.players.map(p => {
      if (p.id !== botId) return p;
      const curIdx = diffs.indexOf(p.aiDifficulty || 'Hard');
      const nextDiff = diffs[(curIdx + 1) % diffs.length];
      targetDiff = nextDiff;
      return { ...p, aiDifficulty: nextDiff };
    });
    setSelectedLobby({ ...selectedLobby, players: updated });
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:update_bot',
        botId,
        aiDifficulty: targetDiff,
        clientKey: clientKeyRef.current
      }));
    }
    if (window.SFX) window.SFX.playClick();
  };

  const handleRemovePlayer = (id: string) => {
    if (!selectedLobby) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:remove_player',
        playerId: id,
        clientKey: clientKeyRef.current
      }));
    } else {
      setSelectedLobby({
        ...selectedLobby,
        players: selectedLobby.players.filter(p => p.id !== id)
      });
    }
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
    } else {
      setChatMessages(prev => [
        ...prev,
        {
          sender: myPlayerName,
          text: chatInput.trim(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          channel: chatChannel,
          team: 1
        }
      ]);
    }
    setChatInput('');
  };

  const handleCreateLobbySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (penaltyUntil > Date.now()) {
      setShowCreateModal(false);
      return;
    }
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'c:create_lobby',
        name: newRoomName || 'Custom Battle Sector',
        mode: newRoomMode,
        clientKey: clientKeyRef.current
      }));
    } else {
      const customLobby: MultiplayerLobby = {
        id: `lob_${Date.now()}`,
        name: newRoomName || 'Custom Battle Sector',
        hostName: myPlayerName,
        hostId: myPlayerId,
        mode: newRoomMode,
        mapName: 'Sector-09 Valley Pass',
        maxPlayers: 6,
        ping: myMeasuredPing || 12,
        status: 'Waiting',
        players: [
          {
            id: myPlayerId,
            name: myPlayerName,
            isHost: true,
            isAi: false,
            team: newRoomMode === 'ffa' ? 0 : 1,
            faction: (commanderProfile.preferredFaction === 'Protoss Solaris' ? 'Protoss Fleet' : commanderProfile.preferredFaction) as any,
            ping: myMeasuredPing || 12,
            ready: true,
            antiCheatVerified: true,
            antiCheatFlags: 0
          },
          {
            id: `bot_init_${Date.now()}`,
            name: '[BOT] Kerrigan_Brood',
            isHost: false,
            isAi: true,
            aiDifficulty: lobbyBotDiff,
            team: newRoomMode === 'ffa' ? 0 : 2,
            faction: 'Zerg Swarm',
            ping: 0,
            ready: true,
            antiCheatVerified: true,
            antiCheatFlags: 0
          }
        ],
        messages: [
          { sender: 'SYSTEM', text: `Room "${newRoomName}" created by ${myPlayerName}.`, time: 'LIVE', channel: 'SYSTEM' }
        ]
      };
      setLobbies(prev => [customLobby, ...prev]);
      setSelectedLobby(customLobby);
      setChatMessages(customLobby.messages);
    }
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
          MULTIPLAYER LOBBY BROWSER (MOBILE-RESPONSIVE LIST / FILTERS / CREATE)
          ========================================================================= */}
      {phase === 'multiplayer_browser' && (
        <div className="fixed inset-0 flex flex-col items-center justify-between py-2 sm:py-5 px-2 sm:px-4 pointer-events-auto overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(5,11,19,0.88)_0%,rgba(3,6,10,0.97)_100%)] backdrop-blur-md">
          {/* Header */}
          <div className="w-full max-w-5xl flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3 bg-[#060e18] border-2 border-[#213750] shadow-xl shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => {
                  setPhase('menu');
                  if (window.SFX) window.SFX.playClick();
                }}
                className="px-2.5 sm:px-3 py-1.5 bg-[#0a1726] border border-[#2a4568] hover:border-[#00e5ff] text-[#93b7df] hover:text-white text-[11px] sm:text-xs font-bold uppercase transition-colors cursor-pointer shrink-0"
              >
                &larr; MENU
              </button>
              <h2 className="text-xs sm:text-lg font-black tracking-wider text-white truncate">
                BATTLE.NET MULTIPLAYER LOBBIES
              </h2>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {renderConnectionBars(myMeasuredPing, false)}
              <div className="hidden md:flex items-center gap-1.5 px-2 py-1 bg-[#072219] border border-[#00ff66]/60 text-[10px] font-mono text-[#00ff66]">
                <span>🛡️ VALKYRIE ANTI-CHEAT: VERIFIED</span>
              </div>
              <button
                onClick={() => setShowProfileModal(true)}
                className="px-2.5 py-1.5 bg-[#102036] hover:bg-[#193254] border border-[#ffaa00]/60 text-[#ffaa00] text-[10px] sm:text-xs font-mono font-bold uppercase cursor-pointer"
              >
                ★ {commanderProfile.callsign}
              </button>
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#0a1524] border border-[#233d5e] text-xs font-mono text-[#8faecf]">
                <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#00ff66]' : 'bg-[#eab308]'} animate-pulse`}></span>
                <span>{wsConnected ? 'WS CONNECTED' : 'LOCAL SYNC'}</span>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                disabled={penaltySecondsLeft > 0}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#00e5ff] hover:bg-[#38bdf8] disabled:opacity-40 text-[#040810] font-black text-[11px] sm:text-xs tracking-wider uppercase border border-[#a5f3fc] transition-colors cursor-pointer shadow-md shrink-0"
              >
                {penaltySecondsLeft > 0 ? `LOCKED (${penaltySecondsLeft}s)` : '+ CREATE LOBBY'}
              </button>
            </div>
          </div>

          {/* Anti-Leave Matchmaking Timeout Penalty Banner */}
          {penaltySecondsLeft > 0 && (
            <div className="w-full max-w-5xl mt-2 p-3 bg-[#280810]/95 border-2 border-[#ff2a4b] shadow-[0_0_25px_rgba(255,42,75,0.4)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 font-mono">
              <div>
                <div className="text-xs sm:text-sm font-black text-[#ff4d6d] uppercase">
                  ⚠️ ANTI-LEAVE PENALTY LOCKOUT IN EFFECT (OFFENSE #{penaltyOffenses})
                </div>
                <div className="text-[11px] text-[#ffb3c1]">
                  {penaltyReason || 'You abandoned an active match in progress. You cannot join or create lobbies until the timeout expires.'}
                </div>
              </div>
              <div className="px-3 py-1.5 bg-[#ff2a4b] text-white font-black text-sm sm:text-base tabular-nums shrink-0 text-center">
                TIMEOUT: {String(Math.floor(penaltySecondsLeft / 60)).padStart(2, '0')}:{String(penaltySecondsLeft % 60).padStart(2, '0')}
              </div>
            </div>
          )}

          {/* Lobby Content Container */}
          <div className="w-full max-w-5xl flex-1 flex flex-col my-2 sm:my-3 p-2.5 sm:p-4 bg-[#07101c]/90 border border-[#1e3550] shadow-2xl min-h-0 overflow-hidden">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1b3049] pb-2.5 mb-3 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'ALL MODES' },
                  { id: 'team_ai', label: 'TEAM VS AI' },
                  { id: 'deathmatch', label: 'DEATHMATCH' },
                  { id: '2v2', label: '2V2 BATTLE' },
                  { id: 'ffa', label: 'FREE FOR ALL' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setLobbyFilter(tab.id as any);
                      if (window.SFX) window.SFX.playClick();
                    }}
                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer border whitespace-nowrap shrink-0 ${
                      lobbyFilter === tab.id
                        ? 'bg-[#00e5ff]/20 border-[#00e5ff] text-[#00e5ff]'
                        : 'bg-[#0a1626] border-[#223854] text-[#8eaecf] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] sm:text-xs font-mono text-[#89a8cb]">
                SHOWING {filteredLobbies.length} ACTIVE LOBBIES
              </span>
            </div>

            {/* Lobby List Table */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {filteredLobbies.map(lobby => (
                <div
                  key={lobby.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-[#0a1524] border border-[#1d3452] transition-all group ${
                    penaltySecondsLeft > 0
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:bg-[#0e1d32] hover:border-[#00e5ff]/60 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (penaltySecondsLeft <= 0) handleJoinLobby(lobby);
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#060c14] border border-[#254266] flex items-center justify-center text-base sm:text-lg text-[#00e5ff] shrink-0">
                      {lobby.mode === 'team_ai' ? '🛡️' : (lobby.mode === 'deathmatch' ? '⚔️' : '❖')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="font-bold text-xs sm:text-sm text-white group-hover:text-[#00e5ff] transition-colors truncate">
                          {lobby.name}
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 bg-[#14283d] text-[#38bdf8] border border-[#203c5c] uppercase shrink-0">
                          {lobby.mode.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#07261d] text-[#00ff66] border border-[#00ff66]/40 uppercase shrink-0">
                          🛡️ AC PROTECTED
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs text-[#82a4c9] font-mono mt-0.5">
                        <span className="truncate">HOST: {lobby.hostName}</span>
                        <span>&middot;</span>
                        <span className="truncate">MAP: {lobby.mapName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#162942] shrink-0">
                    {renderConnectionBars(lobby.ping, false)}
                    <div className="text-left sm:text-right font-mono text-xs tabular-nums">
                      <div className="text-[#00ff66] font-bold text-[11px] sm:text-xs">
                        {lobby.players.length} / {lobby.maxPlayers} COMMANDERS
                      </div>
                      <div className="text-[#7ea0c5] text-[10px]">
                        STATUS: {lobby.status.toUpperCase()}
                      </div>
                    </div>
                    <button
                      disabled={penaltySecondsLeft > 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (penaltySecondsLeft <= 0) handleJoinLobby(lobby);
                      }}
                      className="px-3.5 sm:px-4 py-1.5 sm:py-2 bg-[#122842] group-hover:bg-[#00e5ff] disabled:opacity-40 text-[#00e5ff] group-hover:text-[#040810] font-black text-[11px] sm:text-xs tracking-wider uppercase border border-[#2b517d] group-hover:border-[#a5f3fc] transition-all cursor-pointer shadow-md shrink-0"
                    >
                      {penaltySecondsLeft > 0 ? `LOCKED (${penaltySecondsLeft}s)` : 'JOIN ROOM \u2192'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="w-full max-w-5xl flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-[#7ea0c5] font-mono p-2 bg-[#060e18] border border-[#1b3048] shrink-0">
            <span>STATUS: SECTOR-09 LOBBY CLUSTER &middot; ANTI-LEAVE &amp; RESOURCE LINK ENABLED</span>
            <span>VALKYRIE ANTI-CHEAT CHECKSUM #{antiCheatState.checksum}</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          INSIDE LOBBY SCREEN (MOBILE-SAFE SCROLLABLE PLAYERS / MAP / CHAT / LAUNCH)
          ========================================================================= */}
      {phase === 'inside_lobby' && selectedLobby && (
        <div className="fixed inset-0 flex flex-col items-center justify-between py-2 sm:py-4 px-2 sm:px-4 pointer-events-auto overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(5,11,19,0.92)_0%,rgba(3,6,10,0.98)_100%)] backdrop-blur-md">
          {/* Lobby Top Bar */}
          <div className="w-full max-w-5xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3.5 bg-[#060e18] border-2 border-[#213750] shadow-xl shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={handleLeaveLobby}
                className="px-2.5 sm:px-3 py-1.5 bg-[#0a1726] border border-[#2a4568] hover:border-[#ff2a4b] text-[#93b7df] hover:text-white text-[11px] sm:text-xs font-bold uppercase transition-colors cursor-pointer shrink-0"
              >
                &larr; LEAVE
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="text-xs sm:text-base font-black tracking-wider text-white truncate">
                  {selectedLobby.name}
                </h2>
                <div className="text-[10px] sm:text-[11px] font-mono text-[#8faecf] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate">HOST: {selectedLobby.hostName}</span>
                  <span>&middot;</span>
                  <span className="text-[#00e5ff] uppercase font-bold">MODE: {selectedLobby.mode.replace('_', ' ')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowProfileModal(true)}
                className="px-2.5 py-1 bg-[#102036] hover:bg-[#193254] border border-[#ffaa00]/60 text-[#ffaa00] text-[10px] font-mono font-bold uppercase cursor-pointer"
              >
                ★ PROFILE: {commanderProfile.callsign}
              </button>

              {/* Mode Switcher */}
              <div className="flex items-center gap-1 bg-[#091524] p-1 border border-[#1f3754] overflow-x-auto max-w-full shrink-0">
                {[
                  { id: 'team_ai', label: 'TEAM VS AI' },
                  { id: 'deathmatch', label: 'DEATHMATCH' },
                  { id: '2v2', label: '2V2' },
                  { id: 'ffa', label: 'FFA' }
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedLobby({ ...selectedLobby, mode: m.id as any });
                      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                        socketRef.current.send(JSON.stringify({ type: 'c:update_player', mode: m.id, clientKey: clientKeyRef.current }));
                      }
                      if (window.SFX) window.SFX.playClick();
                    }}
                    className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      selectedLobby.mode === m.id
                        ? 'bg-[#00e5ff] text-[#040810]'
                        : 'text-[#82a4c9] hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Lobby Main Grid */}
          <div className="w-full max-w-5xl flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 my-2 sm:my-3 min-h-0 overflow-y-auto md:overflow-hidden pr-0.5">
            {/* Left 2 Cols: Player Slot List */}
            <div className="md:col-span-2 flex flex-col p-2.5 sm:p-4 bg-[#07101c]/90 border border-[#1e3550] shadow-xl min-h-[220px] md:min-h-0 md:overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1b3049] pb-2 mb-2.5 shrink-0">
                <span className="text-[11px] sm:text-xs font-mono font-bold tracking-wider text-[#00e5ff] uppercase">
                  COMMANDER &amp; AI BASES ({selectedLobby.players.length}/{selectedLobby.maxPlayers} BASES WILL SPAWN)
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handleAddAiBot(lobbyBotDiff, 1)}
                    disabled={selectedLobby.players.length >= selectedLobby.maxPlayers}
                    className="px-2 py-1 bg-[#0b2922] hover:bg-[#124236] disabled:opacity-40 text-[#00ff66] border border-[#1f6e58] text-[10px] sm:text-[11px] font-bold uppercase transition-colors cursor-pointer"
                    title="Add Friendly AI Bot Ally Base to Team 1"
                  >
                    + ALLY AI BASE (TEAM 1)
                  </button>
                  <button
                    onClick={() => handleAddAiBot(lobbyBotDiff, 2)}
                    disabled={selectedLobby.players.length >= selectedLobby.maxPlayers}
                    className="px-2 py-1 bg-[#261014] hover:bg-[#3b171e] disabled:opacity-40 text-[#ff4d6d] border border-[#5e1f2b] text-[10px] sm:text-[11px] font-bold uppercase transition-colors cursor-pointer"
                    title="Add Hostile AI Bot Base to Enemy Team 2"
                  >
                    + ENEMY AI BASE (TEAM 2)
                  </button>
                </div>
              </div>

              {/* Slot Cards List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {selectedLobby.players.map((p, idx) => {
                  const isYou = p.id === myPlayerId || p.name === myPlayerName;
                  return (
                    <div
                      key={p.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 sm:p-3 border transition-colors ${
                        isYou
                          ? 'bg-[#00e5ff]/10 border-[#00e5ff]/70 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                          : (p.team === 1 ? 'bg-[#0a182b] border-[#1d3d63]' : (p.team === 2 ? 'bg-[#210c11] border-[#521b24]' : 'bg-[#151a24] border-[#293547]'))
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono text-xs text-[#6e8fad] shrink-0">#{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-xs sm:text-sm text-white truncate">
                              {p.name} {isYou && <span className="text-[#00e5ff] text-[11px] font-mono">(YOU &middot; {commanderProfile.rank})</span>}
                            </span>
                            {p.isHost && (
                              <span className="px-1.5 py-0.2 bg-[#ffaa00]/20 text-[#ffaa00] border border-[#ffaa00]/50 text-[9px] font-mono uppercase shrink-0">
                                HOST
                              </span>
                            )}
                            <span
                              className="px-1 py-0.2 bg-[#07261d] text-[#00ff66] border border-[#00ff66]/40 text-[8px] font-mono uppercase shrink-0"
                              title="Valkyrie Anti-Cheat Verified"
                            >
                              🛡️ AC
                            </span>
                            {p.isAi && (
                              <button
                                onClick={() => handleCycleBotDifficulty(p.id)}
                                className="px-1.5 py-0.2 bg-[#ff2a4b]/20 hover:bg-[#ff2a4b]/40 text-[#ff8fa3] border border-[#ff2a4b]/50 text-[9px] font-mono uppercase shrink-0 cursor-pointer"
                                title="Click to cycle Bot Difficulty (Easy / Medium / Hard / Brutal)"
                              >
                                BOT &middot; {p.aiDifficulty || 'Hard'} ↻
                              </button>
                            )}
                          </div>
                          <div className="text-[10px] sm:text-[11px] font-mono text-[#89a8cb] truncate flex flex-wrap items-center gap-2 mt-0.5">
                            {p.isAi ? (
                              <button
                                onClick={() => handleCycleBotFaction(p.id)}
                                className="text-[#38bdf8] hover:text-white underline decoration-dotted cursor-pointer"
                                title="Click to switch Bot Faction (Terran Dominion / Protoss Fleet / Zerg Swarm)"
                              >
                                {p.faction} ↻
                              </button>
                            ) : (
                              <span>{p.faction}</span>
                            )}
                            <span>&middot;</span>
                            {renderConnectionBars(isYou ? myMeasuredPing : p.ping, p.isAi)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-[#172c46] shrink-0">
                        {isYou ? (
                          <button
                            onClick={handleToggleMyTeam}
                            className={`px-2.5 py-1 font-mono text-[10px] sm:text-xs font-bold uppercase border cursor-pointer ${
                              p.team === 1
                                ? 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]'
                                : (p.team === 2 ? 'bg-[#ff2a4b]/20 text-[#ff2a4b] border-[#ff2a4b]' : 'bg-[#e2e8f0]/20 text-white border-white')
                            }`}
                          >
                            {p.team === 1 ? 'TEAM 1 (ALLY)' : (p.team === 2 ? 'TEAM 2 (ENEMY)' : 'FFA (SOLO)')}
                          </button>
                        ) : p.isAi ? (
                          <button
                            onClick={() => handleCycleBotTeam(p.id)}
                            className={`px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold uppercase border cursor-pointer ${
                              p.team === 1
                                ? 'bg-[#00ff66]/15 text-[#00ff66] border-[#00ff66]/60'
                                : (p.team === 2 ? 'bg-[#ff2a4b]/15 text-[#ff4d6d] border-[#ff2a4b]/60' : 'text-slate-300 border-slate-600')
                            }`}
                            title="Click to switch Bot between Ally Team 1 and Enemy Team 2"
                          >
                            {p.team === 1 ? 'TEAM 1 (ALLY BOT) ↻' : (p.team === 2 ? 'TEAM 2 (ENEMY BOT) ↻' : 'FFA BOT ↻')}
                          </button>
                        ) : (
                          <span className={`px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold uppercase border ${
                            p.team === 1
                              ? 'text-[#38bdf8] border-[#204a75]'
                              : (p.team === 2 ? 'text-[#ff4d6d] border-[#6b1e2b]' : 'text-slate-300 border-slate-600')
                          }`}>
                            {p.team === 1 ? 'TEAM 1' : (p.team === 2 ? 'TEAM 2' : 'FFA')}
                          </span>
                        )}

                        {isYou ? (
                          <button
                            onClick={handleToggleMyReady}
                            className={`px-2.5 py-1 text-[10px] sm:text-xs font-bold uppercase border transition-colors cursor-pointer ${
                              p.ready
                                ? 'bg-[#00ff66] text-[#050b14] border-[#86efac]'
                                : 'bg-[#1a2b3d] text-[#93b7df] border-[#2d496a]'
                            }`}
                          >
                            {p.ready ? 'READY' : 'NOT READY'}
                          </button>
                        ) : (
                          <span className={`px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold uppercase ${
                            p.ready ? 'text-[#00ff66]' : 'text-[#8faecf]'
                          }`}>
                            {p.ready ? 'READY' : 'WAITING'}
                          </span>
                        )}

                        {p.isAi && (
                          <button
                            onClick={() => handleRemovePlayer(p.id)}
                            className="text-xs text-[#ff4d6d] hover:text-white px-2 py-0.5 border border-[#521b24] hover:bg-[#521b24] transition-colors cursor-pointer"
                            title="Remove AI Bot"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Open Empty Slots */}
                {Array.from({ length: Math.max(0, selectedLobby.maxPlayers - selectedLobby.players.length) }).map((_, i) => (
                  <div
                    key={`empty_${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#050d18]/50 border border-dashed border-[#1a2f47] text-[#557191] text-[10px] sm:text-xs font-mono"
                  >
                    <span className="truncate">[BASE SLOT #{selectedLobby.players.length + i + 1} OPEN]</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleAddAiBot(lobbyBotDiff, 1)}
                        className="px-2 py-0.5 bg-[#0b2922] hover:bg-[#13463a] text-[#00ff66] border border-[#1f6e58] uppercase cursor-pointer shrink-0"
                      >
                        + ALLY BOT
                      </button>
                      <button
                        onClick={() => handleAddAiBot(lobbyBotDiff, 2)}
                        className="px-2 py-0.5 bg-[#261014] hover:bg-[#3b171e] text-[#ff4d6d] border border-[#5e1f2b] uppercase cursor-pointer shrink-0"
                      >
                        + ENEMY BOT
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Col: Map & Sector Intel + Match AI Rules + Tactical Chat */}
            <div className="flex flex-col gap-3 sm:gap-3.5 min-h-0">
              <div className="p-3 bg-[#07101c]/90 border border-[#1e3550] shadow-xl shrink-0 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold tracking-wider text-[#00e5ff] uppercase">
                    SECTOR-09 MAP &amp; AI RULES
                  </span>
                  <button
                    onClick={() => handleRegenerateMap(selectedLobby.players)}
                    className="px-2 py-0.5 bg-[#0d2238] hover:bg-[#00e5ff] text-[#00e5ff] hover:text-[#040810] border border-[#00e5ff]/60 text-[9px] sm:text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer"
                  >
                    ⟳ REGEN MAP FOR {selectedLobby.players.length} BASES
                  </button>
                </div>
                <div className="w-full h-20 bg-[#040810] border border-[#1b3452] relative overflow-hidden flex items-center justify-center p-2">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,229,255,0.12)_0%,transparent_70%)]"></div>
                  <div className="text-center font-mono text-xs relative z-10">
                    <div className="text-[#00e5ff] font-bold text-[11px] sm:text-xs">PROCEDURAL SEED #{mapSeedDisplay}</div>
                    <div className="text-[#7ea0c5] text-[10px]">
                      {bridgeCountDisplay > 0 ? `${bridgeCountDisplay} Engineered Bridges · Stepped Ramps` : 'Badlands Valley · Trenches & Airbase'}
                    </div>
                    <div className="text-[#d946ef] text-[9px] sm:text-[10px] mt-0.5">
                      {selectedLobby.players.length} Faction Bases + Gem Craters + Mine Drills
                    </div>
                  </div>
                </div>

                {/* Match Settings */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setLobbyMinerals(prev => (prev === 200 ? 400 : prev === 400 ? 900 : 200))}
                    className="p-1.5 bg-[#091728] hover:bg-[#102742] border border-[#224063] text-left cursor-pointer"
                  >
                    <div className="text-[#7ea0c5] text-[9px]">MINERALS</div>
                    <div className="text-[#00e5ff] font-bold">{lobbyMinerals}M ↻</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLobbyAiAllyMode(prev => (prev === 'defensive' ? 'aggressive' : prev === 'aggressive' ? 'off' : 'defensive'))}
                    className="p-1.5 bg-[#091728] hover:bg-[#102742] border border-[#224063] text-left cursor-pointer"
                  >
                    <div className="text-[#7ea0c5] text-[9px]">AI ALLY</div>
                    <div className="text-[#00ff66] font-bold uppercase">{lobbyAiAllyMode} ↻</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLobbyBotDiff(prev => (prev === 'Easy' ? 'Medium' : prev === 'Medium' ? 'Hard' : prev === 'Hard' ? 'Brutal' : 'Easy'))}
                    className="p-1.5 bg-[#091728] hover:bg-[#102742] border border-[#224063] text-left cursor-pointer"
                  >
                    <div className="text-[#7ea0c5] text-[9px]">BOT DIFF</div>
                    <div className="text-[#ffaa00] font-bold uppercase">{lobbyBotDiff} ↻</div>
                  </button>
                </div>

                {/* Lobby Planet Biome Selector */}
                <div className="pt-1">
                  <div className="text-[9px] font-mono text-[#7ea0c5] uppercase mb-1">
                    PLANET ENVIRONMENT BIOME: <span className="text-[#00e5ff] font-bold">{planetBiome.toUpperCase()}</span>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {(['highland', 'desert', 'ocean', 'lava', 'jungle', 'random'] as const).map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => handleSelectPlanetBiome(b)}
                        className={`py-1 text-[8px] sm:text-[9px] font-mono font-bold uppercase border cursor-pointer ${
                          planetBiome === b
                            ? 'bg-[#00e5ff] text-[#040810] border-[#a5f3fc]'
                            : 'bg-[#091524] text-[#82a4c9] border-[#1f3754] hover:text-white'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tactical Comms Chat */}
              <div className="flex-1 flex flex-col p-2.5 sm:p-3 bg-[#07101c]/90 border border-[#1e3550] shadow-xl overflow-hidden min-h-[150px]">
                <div className="flex items-center justify-between border-b border-[#1b3049] pb-1 mb-2 shrink-0">
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold tracking-wider text-[#00e5ff] uppercase">
                    TACTICAL COMMS CHAT
                  </span>
                  <div className="flex items-center gap-1">
                    {(['ALL', 'TEAM'] as const).map(ch => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setChatChannel(ch)}
                        className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border cursor-pointer ${
                          chatChannel === ch
                            ? 'bg-[#00e5ff] text-[#040810] border-[#a5f3fc]'
                            : 'bg-[#091524] text-[#7ea0c5] border-[#1f3754]'
                        }`}
                      >
                        [{ch}]
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 text-[11px] sm:text-xs font-mono pr-1 mb-2">
                  {chatMessages.map((m, idx) => (
                    <div key={idx} className="leading-tight break-words">
                      <span className="text-[#557191] text-[10px] mr-1">[{m.time}]</span>
                      {m.channel && m.channel !== 'ALL' && (
                        <span
                          className={`text-[9px] px-1 mr-1 font-bold uppercase ${
                            m.channel === 'TEAM'
                              ? 'bg-[#00ff66]/20 text-[#00ff66]'
                              : 'bg-[#ffaa00]/20 text-[#ffaa00]'
                          }`}
                        >
                          {m.channel}
                        </span>
                      )}
                      <span className="text-[#00e5ff] font-bold mr-1">{m.sender}:</span>
                      <span className="text-[#c7dcfa]">{m.text}</span>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSendChat} className="flex gap-1.5 pt-1 border-t border-[#1b3049] shrink-0">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Broadcast [${chatChannel}] order...`}
                    className="flex-1 min-w-0 px-2.5 py-1.5 bg-[#050c16] border border-[#203a5a] text-white text-xs font-mono focus:outline-none focus:border-[#00e5ff]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 bg-[#102338] hover:bg-[#00e5ff] text-[#00e5ff] hover:text-[#040810] border border-[#274a73] font-bold text-xs uppercase cursor-pointer transition-colors shrink-0"
                  >
                    SEND
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Lobby Launch Bottom Action Bar */}
          <div className="w-full max-w-5xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 sm:p-3.5 bg-[#060e18] border-2 border-[#213750] shadow-xl shrink-0">
            <div className="text-[10px] sm:text-xs font-mono text-[#8faecf] flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span>ALLIES: {selectedLobby.players.filter(p => p.team === 1).length}</span>
              <span>&middot;</span>
              <span>HOSTILES: {selectedLobby.players.filter(p => p.team === 2).length}</span>
              <span>&middot;</span>
              <span className="text-[#00ff66]">🛡️ VALKYRIE ANTI-CHEAT &amp; RESOURCE SHARING ACTIVE</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleRegenerateMap(selectedLobby.players)}
                className="px-3 py-2.5 bg-[#0e2036] hover:bg-[#163252] text-[#00e5ff] font-bold text-[11px] sm:text-xs tracking-wider uppercase border border-[#294d78] transition-all cursor-pointer shrink-0"
              >
                ⟳ NEW MAP
              </button>
              <button
                onClick={handleStartGame}
                className="flex-1 sm:flex-initial px-4 sm:px-8 py-2.5 sm:py-3 bg-[#00ff66] hover:bg-[#00e5ff] text-[#040810] font-black text-xs sm:text-sm tracking-widest uppercase border-2 border-[#86efac] transition-all cursor-pointer shadow-[0_0_25px_rgba(0,255,102,0.45)] text-center"
              >
                LAUNCH MATCH NOW &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          COMMANDER PROFILE DOSSIER MODAL
          ========================================================================= */}
      {showProfileModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-auto bg-[#040810]/85 z-50">
          <div className="w-full max-w-lg p-4 sm:p-6 bg-[#07111e] border-2 border-[#ffaa00] shadow-[0_0_40px_rgba(255,170,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#253f61] pb-3 mb-4">
              <div className="flex items-center gap-3">
                {renderCommanderEmblem(commanderProfile.emblem, '#ffaa00')}
                <div>
                  <h3 className="text-sm sm:text-base font-black tracking-wider text-white uppercase">
                    COMMANDER PROFILE DOSSIER
                  </h3>
                  <p className="text-[10px] font-mono text-[#ffaa00] uppercase">
                    {commanderProfile.division} &middot; {commanderProfile.wins}W / {commanderProfile.matches}M
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-2.5 py-1 bg-[#122238] text-[#93b7df] hover:text-white border border-[#2a4568] text-xs font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs font-mono">
              <div>
                <label className="block text-[#8faecf] uppercase mb-1">COMMANDER CALLSIGN:</label>
                <input
                  type="text"
                  value={commanderProfile.callsign}
                  onChange={(e) => {
                    const val = e.target.value.slice(0, 22);
                    setCommanderProfile(prev => ({ ...prev, callsign: val }));
                    setMyPlayerName(val || 'Marshal_Vance');
                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && val) {
                      socketRef.current.send(JSON.stringify({ type: 'c:update_player', name: val, clientKey: clientKeyRef.current }));
                    }
                  }}
                  className="w-full px-3 py-2 bg-[#050b14] border border-[#213958] text-white focus:border-[#ffaa00] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8faecf] uppercase mb-1">MILITARY RANK:</label>
                  <select
                    value={commanderProfile.rank}
                    onChange={(e) => setCommanderProfile(prev => ({ ...prev, rank: e.target.value }))}
                    className="w-full px-2.5 py-2 bg-[#050b14] border border-[#213958] text-white focus:border-[#ffaa00] focus:outline-none"
                  >
                    <option value="Fleet Marshal // Tier-I">Fleet Marshal // Tier-I</option>
                    <option value="Dominion General // Tier-I">Dominion General // Tier-I</option>
                    <option value="High Executor // Synod">High Executor // Synod</option>
                    <option value="Cerebrate // Overmind">Cerebrate // Overmind</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#8faecf] uppercase mb-1">PRIMARY FACTION:</label>
                  <select
                    value={commanderProfile.preferredFaction}
                    onChange={(e) => setCommanderProfile(prev => ({ ...prev, preferredFaction: e.target.value as any }))}
                    className="w-full px-2.5 py-2 bg-[#050b14] border border-[#213958] text-white focus:border-[#ffaa00] focus:outline-none"
                  >
                    <option value="Terran Dominion">Terran Dominion</option>
                    <option value="Protoss Solaris">Protoss Solaris</option>
                    <option value="Zerg Swarm">Zerg Swarm</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#8faecf] uppercase mb-1">TACTICAL DIVISION &amp; DOCTRINE:</label>
                <input
                  type="text"
                  value={commanderProfile.division}
                  onChange={(e) => setCommanderProfile(prev => ({ ...prev, division: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#050b14] border border-[#213958] text-white focus:border-[#ffaa00] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-5 py-2 bg-[#ffaa00] hover:bg-[#00e5ff] text-[#040810] font-black text-xs uppercase cursor-pointer shadow-md"
                >
                  SAVE COMMANDER PROFILE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CREATE LOBBY MODAL
          ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-auto bg-[#040810]/85 z-50">
          <div className="w-full max-w-md p-4 sm:p-6 bg-[#07111e] border-2 border-[#00e5ff] shadow-2xl">
            <h3 className="text-sm sm:text-base font-black tracking-wider text-white mb-4 uppercase">
              CREATE MULTIPLAYER LOBBY
            </h3>
            <form onSubmit={handleCreateLobbySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#8faecf] uppercase mb-1">
                  LOBBY ROOM NAME:
                </label>
                <input
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
                  value={newRoomMode}
                  onChange={(e) => setNewRoomMode(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#050b14] border border-[#213958] text-white text-xs font-mono focus:border-[#00e5ff] focus:outline-none"
                >
                  <option value="team_ai">TEAM VS AI (Co-op Defense)</option>
                  <option value="deathmatch">DEATHMATCH (Elimination)</option>
                  <option value="2v2">2V2 TEAM BATTLE</option>
                  <option value="ffa">FREE FOR ALL (Solo Combat)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-[#101b2a] text-[#8faecf] border border-[#263e5e] text-xs font-bold uppercase cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#00e5ff] text-[#040810] font-black text-xs uppercase cursor-pointer shadow-md"
                >
                  CREATE &amp; ENTER
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
