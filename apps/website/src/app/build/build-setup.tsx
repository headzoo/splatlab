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

import {
  activeGameTheme,
  GAME_SETUP_STEPS,
  THEME_MAP_SOURCES,
  type GameDocument,
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

export type SetupSelections = {
  gameType: GamePreviewKind | null;
  theme: GameTheme | null;
  character: PlayerCharacter | null;
  humanGender: HumanGender | null;
  skinTone: SkinTone | null;
  hairColor: HairColor | null;
};

export type SetupChange = {
  revision: number;
  change: Partial<
    Pick<
      GameDocument,
      | "previewKind"
      | "platformerMapSource"
      | "mazeMapSource"
      | "playerCharacter"
      | "humanGender"
      | "skinTone"
      | "hairColor"
      | "setupStep"
      | "builderSetupHistory"
      | "builderChatHistory"
    >
  >;
};

export type BuildGameIdentity = {
  id: string;
  revision: number;
};

export type DisplayedGame = {
  gameType: GamePreviewKind;
  theme: GameTheme;
};

export type PausedBuildTurn = {
  feedbackEnabled: boolean;
};

export type BuildTurnResult = {
  status: "replied" | "paused";
  cooperMessage: string;
  runId: string;
  revision: number;
};

export type PersistedBuildTurn = BuildTurnResult & {
  submittedMessage: string;
  chatHistory: BuilderChatTurn[];
};

const MAX_CHAT_TURNS = 50;
const NON_CHAT_GAME_FIELDS = [
  "previewKind",
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
  "platformerObjectEdits",
  "platformerObjectRemovals",
  "platformerObjectSettings",
] as const satisfies readonly (keyof GameDocument)[];

export function reconcilePersistedGame(
  server: GameDocument,
  saved: GameDocument,
  local: GameDocument,
): GameDocument {
  return NON_CHAT_GAME_FIELDS.reduce<GameDocument>((reconciled, field) => (
    JSON.stringify(local[field]) !== JSON.stringify(saved[field])
      ? { ...reconciled, [field]: local[field] }
      : reconciled
  ), { ...server });
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

  return {
    status: body.status as BuildTurnResult["status"],
    cooperMessage: body.cooperMessage.trim(),
    runId: body.runId,
    revision,
  };
}

export function persistedBuildTurn(
  history: BuilderChatTurn[],
  submittedMessage: string,
  result: BuildTurnResult,
): PersistedBuildTurn {
  const userTurns = submittedMessage
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
  chatHistory: BuilderChatTurn[];
  setupQuestionHistory: GameSetupQuestion[];
  selectGameType: (gameType: GamePreviewKind, nextStep?: GameSetupStep) => void;
  selectTheme: (theme: GameTheme, nextStep?: GameSetupStep) => void;
  selectCharacter: (character: PlayerCharacter, nextStep?: GameSetupStep) => void;
  selectHumanGender: (humanGender: HumanGender, nextStep?: GameSetupStep) => void;
  selectSkinTone: (skinTone: SkinTone, nextStep?: GameSetupStep) => void;
  selectHairColor: (hairColor: HairColor, nextStep?: GameSetupStep) => void;
  saveChatHistory: (turns: BuilderChatTurn[]) => void;
  publishGameIdentity: (identity: BuildGameIdentity) => void;
  publishDisplayedGame: (displayedGame: DisplayedGame) => void;
  applyPersistedBuildTurn: (turn: PersistedBuildTurn) => void;
};

const BuildSetupContext = createContext<BuildSetupContextValue | null>(null);

const EMPTY_SELECTIONS: SetupSelections = {
  gameType: null,
  theme: null,
  character: null,
  humanGender: null,
  skinTone: null,
  hairColor: null,
};

function hasAnsweredStep(currentStep: GameSetupStep, answerStep: GameSetupStep) {
  return GAME_SETUP_STEPS.indexOf(currentStep) > GAME_SETUP_STEPS.indexOf(answerStep);
}

export function isSetupHistoryLocked(setupStep: GameSetupStep) {
  return setupStep === "complete";
}

export function setupSelectionsFromSpec(
  initialSpec: GameDocument | null,
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
  if (reached("character")) questions.push("character");
  if (initialSpec.playerCharacter === "human") {
    if (reached("humanGender")) questions.push("humanGender");
    if (reached("skinTone")) questions.push("skinTone");
    if (reached("hairColor")) questions.push("hairColor");
  }

  return questions;
}

export function BuildSetupProvider({
  children,
  initialSpec,
  initialIdentity = null,
  initialPausedBuildTurn = null,
}: {
  children: ReactNode;
  initialSpec: GameDocument | null;
  initialIdentity?: BuildGameIdentity | null;
  initialPausedBuildTurn?: PausedBuildTurn | null;
}) {
  const [selections, setSelections] = useState(() =>
    setupSelectionsFromSpec(initialSpec),
  );
  const [setupStep, setSetupStep] = useState<GameSetupStep>(
    initialSpec?.setupStep ?? "gameType",
  );
  const [requestedSetup, setRequestedSetup] = useState<SetupChange | null>(null);
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

  const requestChange = useCallback((change: SetupChange["change"]) => {
    setRequestedSetup((current) => ({
      revision: nextRevision.current++,
      change: { ...current?.change, ...change },
    }));
  }, []);

  const applySelectionChange = useCallback(
    (change: SetupChange["change"], nextStep?: GameSetupStep) => {
      if (nextStep) setSetupStep(nextStep);
      if (!nextStep) {
        requestChange(change);
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
      });
    },
    [requestChange, setupQuestionHistory],
  );

  const selectGameType = useCallback(
    (gameType: GamePreviewKind, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, gameType }));
      applySelectionChange({ previewKind: gameType }, nextStep);
    },
    [applySelectionChange],
  );

  const selectTheme = useCallback(
    (theme: GameTheme, nextStep?: GameSetupStep) => {
      setSelections((current) => ({ ...current, theme }));
      applySelectionChange(THEME_MAP_SOURCES[theme], nextStep);
    },
    [applySelectionChange],
  );

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
      chatHistory,
      setupQuestionHistory,
      selectGameType,
      selectTheme,
      selectCharacter,
      selectHumanGender,
      selectSkinTone,
      selectHairColor,
      saveChatHistory,
      publishGameIdentity,
      publishDisplayedGame,
      applyPersistedBuildTurn,
    }),
    [
      requestedSetup,
      chatHistory,
      gameIdentity,
      displayedGame,
      pausedBuildTurn,
      latestPersistedBuildTurn,
      setupQuestionHistory,
      selectCharacter,
      selectGameType,
      selectHairColor,
      selectHumanGender,
      selections,
      selectSkinTone,
      selectTheme,
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
