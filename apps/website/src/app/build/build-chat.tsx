"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import {
  playerAssetIdFor,
  type GamePreviewKind,
  type MapLength,
  type MapStyle,
  type GameSetupQuestion,
  type GameSetupStep,
  type GameTheme,
  type PlayerCharacter,
} from "@/lib/game-contract";
import {
  HAIR_COLOR_CHOICES,
  HERO_CHOICES,
  HUMAN_GENDER_CHOICES,
  SKIN_TONE_CHOICES,
} from "@/game/hero-catalog";

import {
  buildGameNameOptions,
  parseBuildTurnResult,
  persistedBuildTurn,
  useBuildSetup,
} from "./build-setup";
import {
  buildPromptSuggestions,
  type PromptSuggestion,
} from "./build-prompt-suggestions";
import { setupChoiceReplyFor } from "./build-setup-replies";
import styles from "./build.module.css";

const gameTypes = [
  { value: "platformer", label: "Platformer", icon: "🎮", tone: "yellow" },
  { value: "maze", label: "Maze", icon: "▦", tone: "blue" },
] as const satisfies ReadonlyArray<{
  value: GamePreviewKind;
  label: string;
  icon: string;
  tone: string;
}>;

const themes = [
  { value: "green_hills", label: "Green Hills", icon: "🌄", tone: "coral" },
  { value: "graveyard", label: "Graveyard", icon: "🪦", tone: "purple" },
  { value: "space", label: "Space", icon: "🪐", tone: "navy" },
  { value: "dragon_world", label: "Dragon World", icon: "🐉", tone: "yellow" },
] as const satisfies ReadonlyArray<{
  value: GameTheme;
  label: string;
  icon: string;
  tone: string;
}>;

const mapStyles = [
  { value: "ready_made", label: "Ready-made map", icon: "🗺️", tone: "blue" },
  { value: "generated", label: "Random map", icon: "🎲", tone: "purple" },
] as const satisfies ReadonlyArray<{
  value: MapStyle;
  label: string;
  icon: string;
  tone: string;
}>;

const mapLengths = [
  { value: "short", label: "Short map", icon: "🐣", tone: "yellow" },
  { value: "medium", label: "Medium map", icon: "🐔", tone: "coral" },
  { value: "long", label: "Long map", icon: "🏃", tone: "navy" },
] as const satisfies ReadonlyArray<{
  value: MapLength;
  label: string;
  icon: string;
  tone: string;
}>;

const heroes = HERO_CHOICES;
const humanGenders = HUMAN_GENDER_CHOICES;
const skinTones = SKIN_TONE_CHOICES;
const hairColors = HAIR_COLOR_CHOICES;


const MAX_CHAT_TURNS = 50;
const SETUP_INTRO =
  "You're building a game you can share. The preview is your live game, and this chat is where I'll help you set it up and keep building.";

function CooperAvatar() {
  return (
    <span className={styles.cooperAvatar} aria-hidden="true">
      <Image
        src="/brand/features/cooper-hero.png"
        alt=""
        width={1399}
        height={1124}
        unoptimized
      />
    </span>
  );
}

function CooperQuestion({ children }: { children: string }) {
  return (
    <div className={styles.cooperPrompt}>
      <CooperAvatar />
      <p>{children}</p>
    </div>
  );
}

function CharacterSprite({
  assetId,
}: {
  assetId: ReturnType<typeof playerAssetIdFor>;
}) {
  return (
    <span
      className={`${styles.choiceIcon} ${styles.characterIcon}`}
      aria-hidden="true"
      style={
        {
          "--character-sprite": `url("/game-assets/sprites/${assetId}.png")`,
        } as CSSProperties
      }
    />
  );
}

export function BuildChat() {
  const {
    selections,
    setupStep,
    setupComplete,
    chatHistory,
    setupQuestionHistory,
    selectGameType,
    selectTheme,
    selectMapStyle,
    rollGeneratedMap,
    selectCharacter,
    selectHumanGender,
    selectSkinTone,
    selectHairColor,
    selectGameName,
    gameIdentity,
    displayedGame,
    pausedBuildTurn,
    openLevelPicker,
    appendLocalUserMessage,
    applyPersistedBuildTurn,
  } = useBuildSetup();
  const [currentQuestion, setCurrentQuestion] =
    useState<GameSetupStep>(setupStep);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [turnError, setTurnError] = useState("");
  const [askedQuestions, setAskedQuestions] =
    useState<GameSetupQuestion[]>(setupQuestionHistory);
  const conversationRef = useRef<HTMLDivElement>(null);
  const thinkingTimeoutRef = useRef<number | null>(null);
  const isTransitioningRef = useRef(false);
  const chatHistoryRef = useRef(chatHistory);
  chatHistoryRef.current = chatHistory;
  const setupReady = setupComplete && currentQuestion === "complete";
  const chatReady =
    setupReady && Boolean(gameIdentity) && !thinking && !pausedBuildTurn;
  const suggestedGameType = displayedGame?.gameType ?? selections.gameType;
  // Re-rendered below the newest message every turn, so the ideas stay at the
  // end of the conversation instead of scrolling away with the setup replies.
  const promptSuggestions =
    chatReady && suggestedGameType
      ? buildPromptSuggestions(suggestedGameType)
      : [];
  const gameNameOptions = buildGameNameOptions(selections);
  const gameTypeReply = setupChoiceReplyFor("gameType", selections.gameType);
  const themeReply = setupChoiceReplyFor("theme", selections.theme);
  const mapStyleReply = setupChoiceReplyFor("mapStyle", selections.mapStyle);
  const mapLengthReply = setupChoiceReplyFor("mapLength", selections.mapLength);
  const completionTurnCount = chatReady ? 1 : 0;
  const overflowTurns = Math.max(
    0,
    askedQuestions.length + completionTurnCount + chatHistory.length - MAX_CHAT_TURNS,
  );
  const visibleQuestions = askedQuestions.slice(
    Math.min(overflowTurns, askedQuestions.length),
  );
  const visibleQuestionSet = new Set(visibleQuestions);
  const completionVisible =
    chatReady && overflowTurns <= askedQuestions.length;
  const hiddenChatTurns = Math.max(
    0,
    overflowTurns - askedQuestions.length - completionTurnCount,
  );
  const visibleChatHistory = chatHistory.slice(hiddenChatTurns);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [chatHistory, currentQuestion, thinking]);

  useEffect(
    () => () => {
      if (thinkingTimeoutRef.current !== null) {
        window.clearTimeout(thinkingTimeoutRef.current);
      }
    },
    [],
  );

  function answerCurrentQuestion(action: () => void, next: GameSetupStep) {
    if (setupComplete || thinking || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    action();
    setThinking(true);
    thinkingTimeoutRef.current = window.setTimeout(() => {
      setCurrentQuestion(next);
      if (next !== "complete") {
        setAskedQuestions((current) =>
          current.includes(next) ? current : [...current, next],
        );
      }
      setThinking(false);
      isTransitioningRef.current = false;
      thinkingTimeoutRef.current = null;
    }, 1000);
  }

  function chooseSetupOption(
    question: GameSetupQuestion,
    action: (nextStep?: GameSetupStep) => void,
    next: GameSetupStep,
  ) {
    if (currentQuestion === question) {
      answerCurrentQuestion(() => action(next), next);
      return;
    }

    action();
  }

  function chooseCharacter(character: PlayerCharacter) {
    const next = character === "human" ? "humanGender" : "gameName";

    if (currentQuestion === "character") {
      answerCurrentQuestion(() => selectCharacter(character, next), next);
      return;
    }

    const inHumanQuestions =
      currentQuestion === "humanGender" ||
      currentQuestion === "skinTone" ||
      currentQuestion === "hairColor";

    if (character !== "human" && inHumanQuestions) {
      answerCurrentQuestion(
        () => selectCharacter(character, "gameName"),
        "gameName",
      );
      return;
    }

    if (character === "human" && !askedQuestions.includes("humanGender")) {
      answerCurrentQuestion(
        () => selectCharacter(character, "humanGender"),
        "humanGender",
      );
      return;
    }

    selectCharacter(character);
  }

  async function chooseMapLength(mapLength: MapLength) {
    if (
      currentQuestion !== "mapLength" ||
      setupComplete ||
      thinking ||
      isTransitioningRef.current
    ) return;

    isTransitioningRef.current = true;
    setThinking(true);
    setTurnError("");
    const outcome = await rollGeneratedMap(mapLength);
    if (outcome.success) {
      setCurrentQuestion("character");
      setAskedQuestions((current) =>
        current.includes("character") ? current : [...current, "character"],
      );
    } else {
      setTurnError(outcome.message ?? "We couldn't make that map. Please try again.");
    }
    setThinking(false);
    isTransitioningRef.current = false;
  }

  function chooseMapStyle(mapStyle: MapStyle) {
    const next = mapStyle === "generated" ? "mapLength" : "character";
    if (currentQuestion === "mapStyle") {
      answerCurrentQuestion(
        () => selectMapStyle(mapStyle, next),
        next,
      );
      return;
    }
    if (mapStyle === "generated" && currentQuestion !== "mapLength") {
      answerCurrentQuestion(
        () => selectMapStyle(mapStyle, "mapLength"),
        "mapLength",
      );
      return;
    }
    if (currentQuestion === "mapLength" && mapStyle === "ready_made") {
      answerCurrentQuestion(
        () => selectMapStyle(mapStyle, "character"),
        "character",
      );
      return;
    }
    selectMapStyle(mapStyle);
  }

  async function postBuildTurn(
    input: { message: string } | { action: "proceed" | "reject"; feedback?: string },
    submittedMessage: string,
  ) {
    if (!gameIdentity || thinking) return;

    setThinking(true);
    setTurnError("");
    try {
      const response = await fetch(
        `/api/games/${encodeURIComponent(gameIdentity.id)}/build-turn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          setTurnError(
            "Cooper’s build flow changed. Send a fresh message to continue.",
          );
        } else {
          setTurnError(
            body &&
              typeof body === "object" &&
              "message" in body &&
              typeof body.message === "string"
              ? body.message
              : "Cooper couldn’t finish that turn. Try again.",
          );
        }
        return;
      }

      const result = parseBuildTurnResult(
        body,
        response.headers.get("X-Game-Revision"),
      );
      if (!result) {
        setTurnError("Cooper sent an unexpected reply. Please try again.");
        return;
      }

      applyPersistedBuildTurn(
        persistedBuildTurn(chatHistoryRef.current, submittedMessage, result),
      );
      setDraft("");
      setFeedback("");
    } catch {
      setTurnError("Cooper couldn’t connect. Try again.");
    } finally {
      setThinking(false);
    }
  }

  function sendUserMessage(message: string) {
    if (!chatReady) return;

    appendLocalUserMessage(message);
    setDraft("");
    void postBuildTurn({ message }, message);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatReady || !draft.trim()) return;

    sendUserMessage(draft.trim());
  }

  function sendSuggestedPrompt(suggestion: PromptSuggestion) {
    if (!chatReady) return;
    if (!suggestion.message) {
      openLevelPicker();
      return;
    }
    sendUserMessage(suggestion.message);
  }

  function submitPausedAction(action: "proceed" | "reject") {
    if (!pausedBuildTurn || thinking) return;
    const trimmedFeedback = feedback.trim();
    void postBuildTurn(
      trimmedFeedback ? { action, feedback: trimmedFeedback } : { action },
      trimmedFeedback,
    );
  }

  return (
    <>
      <div className={styles.conversation} ref={conversationRef}>
        {visibleQuestionSet.has("gameType") ? (
          <>
            <CooperQuestion>{SETUP_INTRO}</CooperQuestion>
            <CooperQuestion>What do you want to make?</CooperQuestion>
            <div
              className={`${styles.choiceGrid} ${styles.gameTypeGrid}`}
              aria-label="Choose a game type"
            >
              {gameTypes.map((gameType) => (
                <button
                  type="button"
                  className={`${styles.choiceCard} ${styles[gameType.tone]} ${selections.gameType === gameType.value ? styles.selected : ""}`}
                  key={gameType.value}
                  aria-pressed={selections.gameType === gameType.value}
                  disabled={setupComplete || thinking}
                  onClick={() =>
                    chooseSetupOption(
                      "gameType",
                      (nextStep) => selectGameType(gameType.value, nextStep),
                      "theme",
                    )
                  }
                >
                  <span className={styles.choiceIcon} aria-hidden="true">
                    {gameType.icon}
                  </span>
                  <strong>{gameType.label}</strong>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {visibleQuestionSet.has("gameType") && gameTypeReply ? (
          <CooperQuestion>{gameTypeReply}</CooperQuestion>
        ) : null}

        {visibleQuestionSet.has("theme") ? (
          <>
            <CooperQuestion>What theme do you want?</CooperQuestion>
            <div className={styles.choiceGrid} aria-label="Choose a theme">
              {themes.map((theme) => (
                <button
                  type="button"
                  className={`${styles.choiceCard} ${styles[theme.tone]} ${selections.theme === theme.value ? styles.selected : ""}`}
                  key={theme.value}
                  aria-pressed={selections.theme === theme.value}
                  disabled={setupComplete || thinking}
                  onClick={() =>
                    chooseSetupOption(
                      "theme",
                      (nextStep) => selectTheme(theme.value, nextStep),
                      "mapStyle",
                    )
                  }
                >
                  <span className={styles.choiceIcon} aria-hidden="true">
                    {theme.icon}
                  </span>
                  <strong>{theme.label}</strong>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {visibleQuestionSet.has("theme") && themeReply ? (
          <CooperQuestion>{themeReply}</CooperQuestion>
        ) : null}

        {visibleQuestionSet.has("mapStyle") ? (
          <>
            <CooperQuestion>Would you like a ready-made map or a random map?</CooperQuestion>
            <div className={styles.choiceGrid} aria-label="Choose a map style">
              {mapStyles.map((mapStyle) => (
                <button
                  type="button"
                  className={`${styles.choiceCard} ${styles[mapStyle.tone]} ${selections.mapStyle === mapStyle.value ? styles.selected : ""}`}
                  key={mapStyle.value}
                  aria-pressed={selections.mapStyle === mapStyle.value}
                  disabled={setupComplete || thinking}
                  onClick={() => chooseMapStyle(mapStyle.value)}
                >
                  <span className={styles.choiceIcon} aria-hidden="true">
                    {mapStyle.icon}
                  </span>
                  <strong>{mapStyle.label}</strong>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {visibleQuestionSet.has("mapStyle") && mapStyleReply ? (
          <CooperQuestion>{mapStyleReply}</CooperQuestion>
        ) : null}

        {visibleQuestionSet.has("mapLength") ? (
          <>
            <CooperQuestion>How long should your random map be?</CooperQuestion>
            <div className={styles.choiceGrid} aria-label="Choose a map length">
              {mapLengths.map((mapLength) => (
                <button
                  type="button"
                  className={`${styles.choiceCard} ${styles[mapLength.tone]} ${selections.mapLength === mapLength.value ? styles.selected : ""}`}
                  key={mapLength.value}
                  aria-pressed={selections.mapLength === mapLength.value}
                  disabled={setupComplete || thinking}
                  onClick={() => void chooseMapLength(mapLength.value)}
                >
                  <span className={styles.choiceIcon} aria-hidden="true">
                    {mapLength.icon}
                  </span>
                  <strong>{mapLength.label}</strong>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {visibleQuestionSet.has("mapLength") && mapLengthReply ? (
          <CooperQuestion>{mapLengthReply}</CooperQuestion>
        ) : null}

        {visibleQuestionSet.has("character") ? (
          <>
            <CooperQuestion>Pick your hero!</CooperQuestion>
            <div className={styles.choiceGrid} aria-label="Choose a hero">
              {heroes.map((hero) => (
                <button
                  type="button"
                  className={`${styles.choiceCard} ${styles[hero.tone]} ${selections.character === hero.value ? styles.selected : ""}`}
                  key={hero.value}
                  aria-pressed={selections.character === hero.value}
                  disabled={setupComplete || thinking}
                  onClick={() => chooseCharacter(hero.value)}
                >
                  <CharacterSprite
                    assetId={playerAssetIdFor(
                      selections.theme ?? "green_hills",
                      hero.value,
                    )}
                  />
                  <strong>{hero.label}</strong>
                  {hero.tagline ? (
                    <small className={styles.heroTagline}>{hero.tagline}</small>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {visibleQuestionSet.has("humanGender") ? (
          <>
            <CooperQuestion>Should your human hero be a boy or a girl?</CooperQuestion>
            <div
              className={`${styles.choiceGrid} ${styles.gameTypeGrid}`}
              aria-label="Choose a boy or girl"
            >
              {humanGenders.map((gender) => (
                <button
                  type="button"
                  className={`${styles.choiceCard} ${styles[gender.tone]} ${selections.humanGender === gender.value ? styles.selected : ""}`}
                  key={gender.value}
                  aria-pressed={selections.humanGender === gender.value}
                  disabled={setupComplete || thinking}
                  onClick={() =>
                    chooseSetupOption(
                      "humanGender",
                      (nextStep) => selectHumanGender(gender.value, nextStep),
                      "skinTone",
                    )
                  }
                >
                  <CharacterSprite
                    assetId={playerAssetIdFor(
                      selections.theme ?? "green_hills",
                      "human",
                      gender.value,
                    )}
                  />
                  <strong>{gender.label}</strong>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {visibleQuestionSet.has("skinTone") ? (
          <>
            <CooperQuestion>What skin color should they have?</CooperQuestion>
            <div className={`${styles.appearancePickers} ${styles.singleAppearancePicker}`}>
              <fieldset>
                <legend>Skin color</legend>
                <div className={styles.swatchGrid}>
                  {skinTones.map((tone) => (
                    <button
                      type="button"
                      key={tone.value}
                      className={selections.skinTone === tone.value ? styles.selectedSwatch : ""}
                      style={{ "--swatch-color": tone.color } as CSSProperties}
                      aria-label={tone.label}
                      aria-pressed={selections.skinTone === tone.value}
                      disabled={setupComplete || thinking}
                      onClick={() =>
                        chooseSetupOption(
                          "skinTone",
                          (nextStep) => selectSkinTone(tone.value, nextStep),
                          "hairColor",
                        )
                      }
                    />
                  ))}
                </div>
              </fieldset>
            </div>
          </>
        ) : null}

        {visibleQuestionSet.has("hairColor") ? (
          <>
            <CooperQuestion>What hair color should they have?</CooperQuestion>
            <div className={`${styles.appearancePickers} ${styles.singleAppearancePicker}`}>
              <fieldset>
                <legend>Hair color</legend>
                <div className={styles.swatchGrid}>
                  {hairColors.map((color) => (
                    <button
                      type="button"
                      key={color.value}
                      className={selections.hairColor === color.value ? styles.selectedSwatch : ""}
                      style={{ "--swatch-color": color.color } as CSSProperties}
                      aria-label={color.label}
                      aria-pressed={selections.hairColor === color.value}
                      disabled={setupComplete || thinking}
                      onClick={() =>
                        chooseSetupOption(
                          "hairColor",
                          (nextStep) => selectHairColor(color.value, nextStep),
                          "gameName",
                        )
                      }
                    />
                  ))}
                </div>
              </fieldset>
            </div>
          </>
        ) : null}

        {visibleQuestionSet.has("gameName") ? (
          <>
            <CooperQuestion>What should we call your game?</CooperQuestion>
            <div
              className={`${styles.choiceGrid} ${styles.gameNameGrid}`}
              aria-label="Choose a game name"
            >
              {gameNameOptions.map((gameName) => (
                <button
                  type="button"
                  className={`${styles.choiceCard} ${styles.gameNameCard} ${selections.gameName === gameName ? styles.selected : ""}`}
                  key={gameName}
                  aria-pressed={selections.gameName === gameName}
                  disabled={setupComplete || thinking}
                  onClick={() =>
                    chooseSetupOption(
                      "gameName",
                      (nextStep) => selectGameName(gameName, nextStep),
                      "complete",
                    )
                  }
                >
                  <strong>{gameName}</strong>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {completionVisible ? (
          <div className={`${styles.cooperPrompt} ${styles.reply}`}>
            <CooperAvatar />
            <p>
              <strong>Awesome choices!</strong>
              Your game is taking shape. Add more ideas or try it out!
            </p>
          </div>
        ) : null}

        <div
          className={styles.chatMessages}
          role="log"
          aria-live="polite"
          aria-label="Messages with Cooper"
        >
          {visibleChatHistory.map((turn, index) =>
            turn.role === "user" ? (
              <div className={styles.userMessage} key={`${turn.role}-${index}`}>
                <p>
                  <strong>You</strong>
                  {turn.message}
                </p>
              </div>
            ) : (
              <div className={styles.cooperPrompt} key={`${turn.role}-${index}`}>
                <CooperAvatar />
                <p>
                  <strong className={styles.messageAuthor}>Cooper</strong>
                  {turn.message}
                </p>
              </div>
            ),
          )}
        </div>

        {promptSuggestions.length > 0 ? (
          <div
            className={styles.promptSuggestions}
            aria-label="Ideas to send Cooper"
          >
            {promptSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.label}
                onClick={() => sendSuggestedPrompt(suggestion)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        ) : null}

        {pausedBuildTurn ? (
          <div className={styles.pausedTurn} aria-label="Cooper needs your decision">
            <p>Would you like Cooper to continue?</p>
            {pausedBuildTurn.feedbackEnabled ? (
              <input
                type="text"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Optional feedback for Cooper"
                aria-label="Feedback for Cooper"
                maxLength={500}
                disabled={thinking}
              />
            ) : null}
            <div>
              <button
                type="button"
                onClick={() => submitPausedAction("proceed")}
                disabled={thinking}
              >
                Proceed
              </button>
              <button
                type="button"
                onClick={() => submitPausedAction("reject")}
                disabled={thinking}
              >
                Reject
              </button>
            </div>
          </div>
        ) : null}

        {thinking ? (
          <div className={`${styles.cooperPrompt} ${styles.thinkingPrompt}`} role="status">
            <CooperAvatar />
            <p>
              Cooper is thinking
              <span aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </p>
          </div>
        ) : null}

        {turnError ? (
          <p className={styles.chatError} role="alert">
            {turnError}
          </p>
        ) : null}
      </div>

      <form
        className={styles.chatComposer}
        aria-label="Chat with Cooper"
        onSubmit={sendMessage}
      >
        <span aria-hidden="true">♧</span>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            !setupReady
              ? "Finish the setup questions to chat…"
              : !gameIdentity
                ? "Saving your game before chat…"
                : pausedBuildTurn
                  ? "Choose Proceed or Reject first…"
                  : chatReady
              ? "Tell Cooper something weird…"
              : "Cooper is thinking…"
          }
          aria-label="Message Cooper"
          maxLength={500}
          disabled={!chatReady}
        />
        <button type="submit" disabled={!chatReady || !draft.trim()}>
          Send
        </button>
      </form>
    </>
  );
}
