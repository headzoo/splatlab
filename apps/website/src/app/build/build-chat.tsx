"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import {
  playerAssetIdFor,
  type GamePreviewKind,
  type GameSetupQuestion,
  type GameSetupStep,
  type GameTheme,
  type HairColor,
  type HumanGender,
  type PlayerCharacter,
  type SkinTone,
} from "@/lib/game-contract";

import {
  parseBuildTurnResult,
  persistedBuildTurn,
  useBuildSetup,
} from "./build-setup";
import { buildPromptSuggestions } from "./build-prompt-suggestions";
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

const heroes = [
  { value: "cooper", label: "Cooper", tone: "yellow" },
  { value: "human", label: "Human", tone: "blue" },
  { value: "ghost", label: "Ghost", tone: "purple" },
  { value: "robot", label: "Robot", tone: "slate" },
] as const satisfies ReadonlyArray<{
  value: PlayerCharacter;
  label: string;
  tone: string;
}>;

const humanGenders = [
  { value: "boy", label: "Boy", tone: "blue" },
  { value: "girl", label: "Girl", tone: "coral" },
] as const satisfies ReadonlyArray<{
  value: HumanGender;
  label: string;
  tone: string;
}>;

const skinTones = [
  { value: "skin_01", label: "Skin tone 1", color: "#ffd0a4" },
  { value: "skin_02", label: "Skin tone 2", color: "#f0b38a" },
  { value: "skin_03", label: "Skin tone 3", color: "#dd9b73" },
  { value: "skin_04", label: "Skin tone 4", color: "#c38464" },
  { value: "skin_05", label: "Skin tone 5", color: "#aa7358" },
  { value: "skin_06", label: "Skin tone 6", color: "#98705a" },
] as const satisfies ReadonlyArray<{
  value: SkinTone;
  label: string;
  color: string;
}>;

const hairColors = [
  { value: "hair_01", label: "Black hair", color: "#252a35" },
  { value: "hair_02", label: "Dark brown hair", color: "#452820" },
  { value: "hair_03", label: "Brown hair", color: "#713927" },
  { value: "hair_04", label: "Auburn hair", color: "#a33f2c" },
  { value: "hair_05", label: "Red hair", color: "#cc552c" },
  { value: "hair_06", label: "Blond hair", color: "#d3a64a" },
  { value: "hair_07", label: "Platinum hair", color: "#c8c0bc" },
  { value: "hair_08", label: "Gray hair", color: "#777e87" },
] as const satisfies ReadonlyArray<{
  value: HairColor;
  label: string;
  color: string;
}>;

const MAX_CHAT_TURNS = 50;

function CooperAvatar() {
  return (
    <span className={styles.cooperAvatar} aria-hidden="true">
      <Image
        src="/brand/about/cooper-hero.png"
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
    selectCharacter,
    selectHumanGender,
    selectSkinTone,
    selectHairColor,
    gameIdentity,
    displayedGame,
    pausedBuildTurn,
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
  const setupReady = setupComplete && currentQuestion === "complete";
  const chatReady =
    setupReady && Boolean(gameIdentity) && !thinking && !pausedBuildTurn;
  const suggestedGameType = displayedGame?.gameType ?? selections.gameType;
  const suggestedTheme = displayedGame?.theme ?? selections.theme;
  const promptSuggestions =
    suggestedGameType && suggestedTheme
      ? buildPromptSuggestions(suggestedGameType, suggestedTheme)
      : [];
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
    const next = character === "human" ? "humanGender" : "complete";

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
        () => selectCharacter(character, "complete"),
        "complete",
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
        persistedBuildTurn(chatHistory, submittedMessage, result),
      );
      setDraft("");
      setFeedback("");
    } catch {
      setTurnError("Cooper couldn’t connect. Try again.");
    } finally {
      setThinking(false);
    }
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatReady || !draft.trim()) return;

    const message = draft.trim();
    void postBuildTurn({ message }, message);
  }

  function sendSuggestedPrompt(message: string) {
    if (!chatReady) return;
    void postBuildTurn({ message }, message);
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
                      "character",
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
                          "complete",
                        )
                      }
                    />
                  ))}
                </div>
              </fieldset>
            </div>
          </>
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

        {completionVisible ? (
          <>
            <div className={`${styles.cooperPrompt} ${styles.reply}`}>
              <CooperAvatar />
              <p>
                <strong>Awesome choices!</strong>
                Your game is taking shape. Add more ideas or try it out!
              </p>
            </div>
            <div
              className={styles.promptSuggestions}
              aria-label="Ideas to send Cooper"
            >
              {promptSuggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => sendSuggestedPrompt(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </>
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
        {turnError ? (
          <p className={styles.chatError} role="alert">
            {turnError}
          </p>
        ) : null}
      </div>

      <div className={styles.selectionSummary} aria-label="Current game choices">
        <span>Your game so far:</span>
        <strong className={selections.gameType ? "" : styles.unansweredChoice}>
          {selections.gameType === "platformer"
            ? "🎮 Platformer"
            : selections.gameType === "maze"
              ? "▦ Maze"
              : "Choose a game"}
        </strong>
        <strong className={selections.theme ? "" : styles.unansweredChoice}>
          {themes.find((theme) => theme.value === selections.theme)?.icon ?? "◇"}{" "}
          {themes.find((theme) => theme.value === selections.theme)?.label ?? "Choose a theme"}
        </strong>
        <strong className={selections.character ? "" : styles.unansweredChoice}>
          {selections.character ? "★" : "◇"}{" "}
          {selections.character === "human" && selections.humanGender
            ? `Human · ${selections.humanGender === "boy" ? "Boy" : "Girl"}`
            : heroes.find((hero) => hero.value === selections.character)?.label ??
              "Choose a hero"}
        </strong>
        <b aria-hidden="true">✦</b>
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
