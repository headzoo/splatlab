"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";

import {
  activeGameTheme,
  defaultGameTitle,
  GAME_SETUP_STEPS,
  THEME_MAP_SOURCES,
  type GameDocument,
  type MapLength,
  type MapStyle,
  type GamePreviewKind,
  type GameSetupStep,
  type GameSetupQuestion,
  type GameTheme,
  type HairColor,
  type HumanGender,
  type PlayerCharacter,
  type SkinTone,
  type BuilderChatTurn,
} from "@/lib/game-contract";
import {
  cooperSpecChangeSchema,
  mapRollSuccessSchema,
  mergeObjectArrays,
  pruneOrphanedMapSourceEdits,
  preserveRolledCampaign,
  type CooperSpecChange,
  type MapRollSuccess,
} from "@/lib/cooper-spec-change";
import {
  gamePhysicsDocumentSchema,
  type GamePhysicsDocument,
} from "@/lib/game-physics";
export type SetupSelections = {
  gameType: GamePreviewKind | null;
  theme: GameTheme | null;
  mapStyle: MapStyle | null;
  mapLength: MapLength | null;
  character: PlayerCharacter | null;
  humanGender: HumanGender | null;
  skinTone: SkinTone | null;
  hairColor: HairColor | null;
  gameName: string | null;
};

type GameSetupSpecChange = Partial<
  Pick<
    GameDocument,
    | "previewKind"
    | "mapStyle"
    | "mapLength"
    | "platformerMapSource"
    | "mazeMapSource"
    | "generatedPlatformerMaps"
    | "generatedMazeMaps"
    | "playerCharacter"
    | "humanGender"
    | "skinTone"
    | "hairColor"
    | "setupStep"
    | "builderSetupHistory"
    | "builderChatHistory"
  >
>;

export type SetupChange = {
  revision: number;
  change: GameSetupSpecChange;
  title?: string;
};

export type BuildGameIdentity = {
  id: string;
  revision: number;
};

export type DisplayedGame = {
  gameType: GamePreviewKind;
  theme: GameTheme;
};

export type MapRollAttempt = {
  success: boolean;
  message?: string;
};

export type MapRollSetupCompletion = Required<
  Pick<GameSetupSpecChange, "mapLength" | "setupStep" | "builderSetupHistory">
>;

type MapRollHandler = (
  length: MapLength,
  completion: MapRollSetupCompletion,
) => Promise<MapRollAttempt>;

const TITLE_THEMES = {
  green_hills: {
    adjective: "Sunny",
    place: "Green Hills",
    noun: "Meadow",
    quest: "Hill Hop",
  },
  graveyard: {
    adjective: "Moonlit",
    place: "Graveyard",
    noun: "Crypt",
    quest: "Ghost Quest",
  },
  space: {
    adjective: "Rocket",
    place: "Space",
    noun: "Moon",
    quest: "Star Mission",
  },
  dragon_world: {
    adjective: "Dragon",
    place: "Dragon World",
    noun: "Ember",
    quest: "Castle Quest",
  },
} as const satisfies Record<
  GameTheme,
  {
    adjective: string;
    place: string;
    noun: string;
    quest: string;
  }
>;

const TITLE_GAME_TYPES = {
  platformer: {
    primary: "Dash",
    action: "Jump",
    objective: "Coin Quest",
  },
  maze: {
    primary: "Maze",
    action: "Escape",
    objective: "Key Quest",
  },
} as const satisfies Record<
  GamePreviewKind,
  {
    primary: string;
    action: string;
    objective: string;
  }
>;

function titleHero(
  character: PlayerCharacter | null,
  humanGender: HumanGender | null,
) {
  if (character === "cooper" || character === null) return "Cooper";
  if (character === "human") return humanGender === "girl" ? "Girl Hero" : "Hero";
  return character === "ghost" ? "Ghost" : "Robot";
}

export function buildGameNameOptions({
  gameType,
  theme,
  character,
  humanGender,
}: Pick<SetupSelections, "gameType" | "theme" | "character" | "humanGender">) {
  const titleTheme = TITLE_THEMES[theme ?? "green_hills"];
  const titleGameType = TITLE_GAME_TYPES[gameType ?? "platformer"];
  const hero = titleHero(character, humanGender);

  return Array.from(new Set([
    `${hero}'s ${titleTheme.quest}`,
    `${titleTheme.place} ${titleGameType.primary}`,
    `${titleTheme.adjective} ${hero} ${titleGameType.action}`,
    `${titleTheme.noun} ${titleGameType.objective}`,
  ])).slice(0, 4);
}

export type PausedBuildTurn = {
  feedbackEnabled: boolean;
};

export type BuildTurnResult = {
  status: "replied" | "paused";
  cooperMessage: string;
  runId: string;
  revision: number;
  /** Present only when Cooper changed this game's physics on this turn. */
  physicsDocument?: GamePhysicsDocument;
  /** Present only when Cooper added or removed objects on this turn. */
  specChange?: CooperSpecChange;
  /** Present only when Cooper renamed the game on this turn. */
  title?: string;
  /** Present only when Cooper rolled the active map on this turn. */
  mapRoll?: MapRollSuccess;
};

export type PersistedBuildTurn = BuildTurnResult & {
  submittedMessage: string;
  chatHistory: BuilderChatTurn[];
};

const MAX_CHAT_TURNS = 50;
const NON_CHAT_GAME_FIELDS = [
  "previewKind",
  "mapStyle",
  "mapLength",
  "platformerMapSource",
  "mazeMapSource",
  "platformerLevels",
  "mazeLevels",
  "playerCharacter",
  "humanGender",
  "skinTone",
  "hairColor",
  "setupStep",
  "builderSetupHistory",
  "platformerTerrainEdits",
  "platformerLevelArt",
  // The three object arrays are deliberately absent: Cooper and the level
  // editor both append to them, so they are unioned below rather than won
  // outright by either side. `physicsDocument` and `startingLives` are absent
  // because only the server writes them, so the server's value must survive
  // reconciliation.
] as const satisfies readonly (keyof GameDocument)[];

export function reconcilePersistedGame(
  server: GameDocument,
  saved: GameDocument,
  local: GameDocument,
): GameDocument {
  const reconciledLocal = preserveRolledCampaign(local, server);
  const reconciled = NON_CHAT_GAME_FIELDS.reduce<GameDocument>((carried, field) => (
    JSON.stringify(reconciledLocal[field]) !== JSON.stringify(saved[field])
      ? { ...carried, [field]: reconciledLocal[field] }
      : carried
  ), { ...server });
  return pruneOrphanedMapSourceEdits({
    ...reconciled,
    ...mergeObjectArrays(server, reconciledLocal),
  });
}

export function parseBuildTurnResult(
  body: unknown,
  revisionHeader: string | null,
): BuildTurnResult | null {
  if (
    !body ||
    typeof body !== "object" ||
    !("status" in body) ||
    !("cooperMessage" in body) ||
    !("runId" in body) ||
    !["replied", "paused"].includes(body.status as string) ||
    typeof body.cooperMessage !== "string" ||
    !body.cooperMessage.trim() ||
    body.cooperMessage.length > 500 ||
    typeof body.runId !== "string" ||
    !body.runId
  ) {
    return null;
  }

  const revision = Number(revisionHeader);
  if (!Number.isInteger(revision) || revision < 1) return null;

  const physics = "physicsDocument" in body
    ? gamePhysicsDocumentSchema.safeParse(body.physicsDocument)
    : undefined;
  if (physics && !physics.success) return null;

  const objects = "specChange" in body
    ? cooperSpecChangeSchema.safeParse(body.specChange)
    : undefined;
  if (objects && !objects.success) return null;

  // Matches `createGameInputSchema.title`, so a name the server would refuse on
  // the next autosave never reaches the builder in the first place.
  const title = "title" in body
    ? z.string().trim().min(1).max(80).safeParse(body.title)
    : undefined;
  if (title && !title.success) return null;

  const rolled = "mapRoll" in body
    ? mapRollSuccessSchema.safeParse(body.mapRoll)
    : undefined;
  if (rolled && !rolled.success) return null;

  return {
    status: body.status as BuildTurnResult["status"],
    cooperMessage: body.cooperMessage.trim(),
    runId: body.runId,
    revision,
    ...(physics ? { physicsDocument: physics.data } : {}),
    ...(objects ? { specChange: objects.data } : {}),
    ...(title ? { title: title.data } : {}),
    ...(rolled ? { mapRoll: rolled.data } : {}),
  };
}

export function persistedBuildTurn(
  history: BuilderChatTurn[],
  submittedMessage: string,
  result: BuildTurnResult,
): PersistedBuildTurn {
  const last = history.at(-1);
  const alreadyRecorded =
    Boolean(submittedMessage) &&
    last?.role === "user" &&
    last.message === submittedMessage;
  const userTurns =
    submittedMessage && !alreadyRecorded
      ? [{ role: "user" as const, message: submittedMessage }]
      : [];

  return {
    ...result,
    submittedMessage,
    chatHistory: [
      ...history,
      ...userTurns,
      { role: "cooper" as const, message: result.cooperMessage },
    ].slice(-MAX_CHAT_TURNS),
  };
}

type BuildSetupContextValue = {
  selections: SetupSelections;
  setupStep: GameSetupStep;
  setupComplete: boolean;
  gameIdentity: BuildGameIdentity | null;
  displayedGame: DisplayedGame | null;
  pausedBuildTurn: PausedBuildTurn | null;
  persistedBuildTurn: PersistedBuildTurn | null;
  requestedSetup: SetupChange | null;
  levelPickerOpen: boolean;
  chatHistory: BuilderChatTurn[];
  setupQuestionHistory: GameSetupQuestion[];
  selectGameType: (gameType: GamePreviewKind, nextStep?: GameSetupStep) => void;
  selectTheme: (theme: GameTheme, nextStep?: GameSetupStep) => void;
  selectMapStyle: (mapStyle: MapStyle, nextStep?: GameSetupStep) => void;
  rollGeneratedMap: (mapLength: MapLength) => Promise<MapRollAttempt>;
  registerMapRollHandler: (handler: MapRollHandler | null) => void;
  selectCharacter: (character: PlayerCharacter, nextStep?: GameSetupStep) => void;
  selectHumanGender: (humanGender: HumanGender, nextStep?: GameSetupStep) => void;
  selectSkinTone: (skinTone: SkinTone, nextStep?: GameSetupStep) => void;
  selectHairColor: (hairColor: HairColor, nextStep?: GameSetupStep) => void;
  selectGameName: (gameName: string, nextStep?: GameSetupStep) => void;
  openLevelPicker: () => void;
  closeLevelPicker: () => void;
  appendLocalUserMessage: (message: string) => void;
  saveChatHistory: (turns: BuilderChatTurn[]) => void;
  publishGameIdentity: (identity: BuildGameIdentity) => void;
  publishDisplayedGame: (displayedGame: DisplayedGame) => void;
  applyPersistedBuildTurn: (turn: PersistedBuildTurn) => void;
};

const BuildSetupContext = createContext<BuildSetupContextValue | null>(null);

const EMPTY_SELECTIONS: SetupSelections = {
  gameType: null,
  theme: null,
  mapStyle: null,
  mapLength: null,
  character: null,
  humanGender: null,
  skinTone: null,
  hairColor: null,
  gameName: null,
};

function hasAnsweredStep(currentStep: GameSetupStep, answerStep: GameSetupStep) {
  return GAME_SETUP_STEPS.indexOf(currentStep) > GAME_SETUP_STEPS.indexOf(answerStep);
}

export function isSetupHistoryLocked(setupStep: GameSetupStep) {
  return setupStep === "complete";
}

export function setupSelectionsFromSpec(
  initialSpec: GameDocument | null,
  initialTitle: string | null = null,
): SetupSelections {
  if (!initialSpec) return { ...EMPTY_SELECTIONS };

  const hasCharacter = hasAnsweredStep(initialSpec.setupStep, "character");
  const isHuman = hasCharacter && initialSpec.playerCharacter === "human";

  return {
    gameType: hasAnsweredStep(initialSpec.setupStep, "gameType")
      ? initialSpec.previewKind
      : null,
    theme: hasAnsweredStep(initialSpec.setupStep, "theme")
      ? activeGameTheme(initialSpec)
      : null,
    mapStyle: hasAnsweredStep(initialSpec.setupStep, "mapStyle")
      ? initialSpec.mapStyle
      : null,
    mapLength: initialSpec.mapStyle === "generated"
      && hasAnsweredStep(initialSpec.setupStep, "mapLength")
      ? initialSpec.mapLength
      : null,
    character: hasCharacter ? initialSpec.playerCharacter : null,
    humanGender:
      isHuman && hasAnsweredStep(initialSpec.setupStep, "humanGender")
        ? initialSpec.humanGender
        : null,
    skinTone:
      isHuman && hasAnsweredStep(initialSpec.setupStep, "skinTone")
        ? initialSpec.skinTone
        : null,
    hairColor:
      isHuman && hasAnsweredStep(initialSpec.setupStep, "hairColor")
        ? initialSpec.hairColor
        : null,
    gameName: hasAnsweredStep(initialSpec.setupStep, "gameName")
      ? initialTitle ?? defaultGameTitle(initialSpec)
      : null,
  };
}

export function setupQuestionHistoryFromSpec(
  initialSpec: GameDocument | null,
): GameSetupQuestion[] {
  if (!initialSpec) return ["gameType"];
  if (initialSpec.builderSetupHistory.length > 0) {
    return initialSpec.builderSetupHistory;
  }

  const currentIndex = GAME_SETUP_STEPS.indexOf(initialSpec.setupStep);
  const reached = (question: GameSetupQuestion) =>
    GAME_SETUP_STEPS.indexOf(question) <= currentIndex;
  const questions: GameSetupQuestion[] = ["gameType"];

  if (reached("theme")) questions.push("theme");
  if (reached("mapStyle")) questions.push("mapStyle");
  if (
    initialSpec.mapStyle === "generated" &&
    reached("mapLength")
  ) questions.push("mapLength");
  if (reached("character")) questions.push("character");
  if (initialSpec.playerCharacter === "human") {
    if (reached("humanGender")) questions.push("humanGender");
    if (reached("skinTone")) questions.push("skinTone");
    if (reached("hairColor")) questions.push("hairColor");
  }
  if (reached("gameName")) questions.push("gameName");

  return questions;
}

export function BuildSetupProvider({
  children,
  initialSpec,
  initialTitle = null,
  initialIdentity = null,
  initialPausedBuildTurn = null,
}: {
  children: ReactNode;
  initialSpec: GameDocument | null;
  initialTitle?: string | null;
  initialIdentity?: BuildGameIdentity | null;
  initialPausedBuildTurn?: PausedBuildTurn | null;
}) {
  const [selections, setSelections] = useState(() =>
    setupSelectionsFromSpec(initialSpec, initialTitle),
  );
  const [setupStep, setSetupStep] = useState<GameSetupStep>(
    initialSpec?.setupStep ?? "gameType",
  );
  const [requestedSetup, setRequestedSetup] = useState<SetupChange | null>(null);
  const [levelPickerOpen, setLevelPickerOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<BuilderChatTurn[]>(
    initialSpec?.builderChatHistory ?? [],
  );
  const [setupQuestionHistory, setSetupQuestionHistory] = useState<
    GameSetupQuestion[]
  >(() => setupQuestionHistoryFromSpec(initialSpec));
  const [gameIdentity, setGameIdentity] = useState<BuildGameIdentity | null>(
    initialIdentity,
  );
  const [displayedGame, setDisplayedGame] = useState<DisplayedGame | null>(() =>
    initialSpec
      ? {
          gameType: initialSpec.previewKind,
          theme: activeGameTheme(initialSpec),
        }
      : null,
  );
  const [pausedBuildTurn, setPausedBuildTurn] = useState<PausedBuildTurn | null>(
    initialPausedBuildTurn,
  );
  const [latestPersistedBuildTurn, setLatestPersistedBuildTurn] =
    useState<PersistedBuildTurn | null>(null);
  const nextRevision = useRef(1);
  const mapRollHandlerRef = useRef<MapRollHandler | null>(null);

  const requestChange = useCallback((
    change: SetupChange["change"],
    title?: string,
  ) => {
    setRequestedSetup((current) => ({
      revision: nextRevision.current++,
      change: { ...current?.change, ...change },
      ...(title !== undefined
        ? { title }
        : current?.title !== undefined
          ? { title: current.title }
          : {}),
    }));
  }, []);

  const applySelectionChange = useCallback(
    (
      change: SetupChange["change"],
      nextStep?: GameSetupStep,
      title?: string,
    ) => {
      if (nextStep) setSetupStep(nextStep);
      if (!nextStep) {
        requestChange(change, title);
        return;
      }

      const nextHistory =
        nextStep !== "complete" && !setupQuestionHistory.includes(nextStep)
          ? [...setupQuestionHistory, nextStep]
          : setupQuestionHistory;
      setSetupQuestionHistory(nextHistory);
      requestChange({
        ...change,
        setupStep: nextStep,
        builderSetupHistory: nextHistory,
      }, title);
    },
    [requestChange, setupQuestionHistory],
  );

  const selectGameType = useCallback(
    (gameType: GamePreviewKind, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, gameType }));
      applySelectionChange({
        previewKind: gameType,
        generatedPlatformerMaps: [],
        generatedMazeMaps: [],
      }, nextStep);
    },
    [applySelectionChange],
  );

  const selectTheme = useCallback(
    (theme: GameTheme, nextStep?: GameSetupStep) => {
      const resetGeneratedMap = selections.mapStyle === "generated";
      setSelections((current) => ({
        ...current,
        theme,
        ...(resetGeneratedMap ? { mapStyle: "ready_made", mapLength: null } : {}),
      }));
      applySelectionChange({
        ...THEME_MAP_SOURCES[theme],
        generatedPlatformerMaps: [],
        generatedMazeMaps: [],
        ...(resetGeneratedMap ? { mapStyle: "ready_made" as const } : {}),
      }, nextStep);
    },
    [applySelectionChange, selections.mapStyle],
  );

  const selectMapStyle = useCallback(
    (mapStyle: MapStyle, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, mapStyle }));
      if (mapStyle === "ready_made") {
        const theme = selections.theme ?? "green_hills";
        applySelectionChange({
          mapStyle,
          ...THEME_MAP_SOURCES[theme],
          generatedPlatformerMaps: [],
          generatedMazeMaps: [],
        }, nextStep);
        return;
      }
      applySelectionChange({ mapStyle }, nextStep);
    },
    [applySelectionChange, selections.theme],
  );

  const registerMapRollHandler = useCallback((handler: MapRollHandler | null) => {
    mapRollHandlerRef.current = handler;
  }, []);

  const rollGeneratedMap = useCallback(async (mapLength: MapLength) => {
    const handler = mapRollHandlerRef.current;
    if (!handler) {
      return { success: false, message: "Your game is still saving. Please try again." };
    }
    const nextStep = "character" as const;
    const nextHistory = setupQuestionHistory.includes(nextStep)
      ? setupQuestionHistory
      : [...setupQuestionHistory, nextStep];
    const outcome = await handler(mapLength, {
      mapLength,
      setupStep: nextStep,
      builderSetupHistory: nextHistory,
    });
    if (outcome.success) {
      setSelections((current) => ({ ...current, mapLength, mapStyle: "generated" }));
      setSetupStep(nextStep);
      setSetupQuestionHistory(nextHistory);
    }
    return outcome;
  }, [setupQuestionHistory]);

  const selectCharacter = useCallback(
    (character: PlayerCharacter, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, character }));
      applySelectionChange({ playerCharacter: character }, nextStep);
    },
    [applySelectionChange],
  );

  const selectHumanGender = useCallback(
    (humanGender: HumanGender, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, humanGender }));
      applySelectionChange({ humanGender }, nextStep);
    },
    [applySelectionChange],
  );

  const selectSkinTone = useCallback(
    (skinTone: SkinTone, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, skinTone }));
      applySelectionChange({ skinTone }, nextStep);
    },
    [applySelectionChange],
  );

  const selectHairColor = useCallback(
    (hairColor: HairColor, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, hairColor }));
      applySelectionChange({ hairColor }, nextStep);
    },
    [applySelectionChange],
  );

  const selectGameName = useCallback(
    (gameName: string, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, gameName }));
      applySelectionChange({}, nextStep, gameName);
    },
    [applySelectionChange],
  );

  const openLevelPicker = useCallback(() => {
    setLevelPickerOpen(true);
  }, []);

  const closeLevelPicker = useCallback(() => {
    setLevelPickerOpen(false);
  }, []);

  const appendLocalUserMessage = useCallback((message: string) => {
    setChatHistory((current) =>
      [...current, { role: "user" as const, message }].slice(-MAX_CHAT_TURNS),
    );
  }, []);

  const saveChatHistory = useCallback((turns: BuilderChatTurn[]) => {
    const boundedTurns = turns.slice(-50);
    setChatHistory(boundedTurns);
    setRequestedSetup({
      revision: nextRevision.current++,
      change: { builderChatHistory: boundedTurns },
    });
  }, []);

  const publishGameIdentity = useCallback((identity: BuildGameIdentity) => {
    setGameIdentity((current) =>
      current?.id === identity.id && current.revision === identity.revision
        ? current
        : identity,
    );
  }, []);

  const publishDisplayedGame = useCallback((next: DisplayedGame) => {
    setDisplayedGame((current) =>
      current?.gameType === next.gameType && current.theme === next.theme
        ? current
        : next,
    );
  }, []);

  const applyPersistedBuildTurn = useCallback((turn: PersistedBuildTurn) => {
    setChatHistory(turn.chatHistory);
    setGameIdentity((current) =>
      current ? { ...current, revision: turn.revision } : current,
    );
    setPausedBuildTurn(
      turn.status === "paused" ? { feedbackEnabled: true } : null,
    );
    setLatestPersistedBuildTurn(turn);
  }, []);

  const value = useMemo<BuildSetupContextValue>(
    () => ({
      selections,
      setupStep,
      setupComplete: isSetupHistoryLocked(setupStep),
      gameIdentity,
      displayedGame,
      pausedBuildTurn,
      persistedBuildTurn: latestPersistedBuildTurn,
      requestedSetup,
      levelPickerOpen,
      chatHistory,
      setupQuestionHistory,
      selectGameType,
      selectTheme,
      selectMapStyle,
      rollGeneratedMap,
      registerMapRollHandler,
      selectCharacter,
      selectHumanGender,
      selectSkinTone,
      selectHairColor,
      selectGameName,
      openLevelPicker,
      closeLevelPicker,
      appendLocalUserMessage,
      saveChatHistory,
      publishGameIdentity,
      publishDisplayedGame,
      applyPersistedBuildTurn,
    }),
    [
      requestedSetup,
      levelPickerOpen,
      chatHistory,
      gameIdentity,
      displayedGame,
      pausedBuildTurn,
      latestPersistedBuildTurn,
      setupQuestionHistory,
      selectCharacter,
      selectGameType,
      selectHairColor,
      selectGameName,
      openLevelPicker,
      closeLevelPicker,
      selectHumanGender,
      selections,
      selectSkinTone,
      selectTheme,
      selectMapStyle,
      rollGeneratedMap,
      registerMapRollHandler,
      appendLocalUserMessage,
      saveChatHistory,
      publishGameIdentity,
      publishDisplayedGame,
      applyPersistedBuildTurn,
      setupStep,
    ],
  );

  return (
    <BuildSetupContext.Provider value={value}>
      {children}
    </BuildSetupContext.Provider>
  );
}

export function useBuildSetup() {
  const context = useContext(BuildSetupContext);
  if (!context) {
    throw new Error("useBuildSetup must be used inside BuildSetupProvider.");
  }
  return context;
}
