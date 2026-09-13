import type { BuilderChatTurn, GameDocument } from "./game-contract";

export type GameHistory = {
  past: GameDocument[];
  present: GameDocument;
  future: GameDocument[];
};

export type GameHistoryAction =
  | { type: "edit"; spec: GameDocument }
  | { type: "chat"; turns: BuilderChatTurn[] }
  | { type: "undo" }
  | { type: "redo" };

const MAX_HISTORY_LENGTH = 50;

function sameChatHistory(left: BuilderChatTurn[], right: BuilderChatTurn[]) {
  return (
    left.length === right.length &&
    left.every(
      (turn, index) =>
        turn.role === right[index]?.role && turn.message === right[index]?.message,
    )
  );
}

function sameSetupHistory(left: GameDocument, right: GameDocument) {
  return (
    left.builderSetupHistory.length === right.builderSetupHistory.length &&
    left.builderSetupHistory.every(
      (question, index) => question === right.builderSetupHistory[index],
    )
  );
}

function sameLevels(left: GameDocument, right: GameDocument) {
  return (
    JSON.stringify(left.platformerLevels) === JSON.stringify(right.platformerLevels) &&
    JSON.stringify(left.mazeLevels) === JSON.stringify(right.mazeLevels)
  );
}

function sameTerrainEdits(left: GameDocument, right: GameDocument) {
  return (
    left.platformerTerrainEdits.length === right.platformerTerrainEdits.length &&
    left.platformerTerrainEdits.every((edit, index) => {
      const other = right.platformerTerrainEdits[index];
      return (
        edit.mapSource === other?.mapSource &&
        edit.x === other.x &&
        edit.y === other.y &&
        edit.kind === other.kind
      );
    })
  );
}

function sameObjectEdits(left: GameDocument, right: GameDocument) {
  return (
    left.platformerObjectEdits.length === right.platformerObjectEdits.length &&
    left.platformerObjectEdits.every((edit, index) => {
      const other = right.platformerObjectEdits[index];
      return edit.id === other?.id && edit.mapSource === other.mapSource &&
        edit.x === other.x && edit.y === other.y && edit.kind === other.kind;
    })
  );
}

function sameObjectRemovals(left: GameDocument, right: GameDocument) {
  return (
    left.platformerObjectRemovals.length === right.platformerObjectRemovals.length &&
    left.platformerObjectRemovals.every((removal, index) => {
      const other = right.platformerObjectRemovals[index];
      return removal.mapSource === other?.mapSource && removal.objectId === other.objectId;
    })
  );
}

function sameObjectSettings(left: GameDocument, right: GameDocument) {
  return (
    left.platformerObjectSettings.length === right.platformerObjectSettings.length &&
    left.platformerObjectSettings.every((settings, index) => {
      const other = right.platformerObjectSettings[index];
      return settings.mapSource === other?.mapSource &&
        settings.objectId === other.objectId && settings.assetId === other.assetId &&
        settings.behavior === other.behavior && settings.direction === other.direction;
    })
  );
}

export function createGameHistory(spec: GameDocument): GameHistory {
  return { past: [], present: spec, future: [] };
}

export function sameGameDocument(left: GameDocument, right: GameDocument) {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.previewKind === right.previewKind &&
    left.platformerMapSource === right.platformerMapSource &&
    left.mazeMapSource === right.mazeMapSource &&
    sameLevels(left, right) &&
    left.playerCharacter === right.playerCharacter &&
    left.humanGender === right.humanGender &&
    left.skinTone === right.skinTone &&
    left.hairColor === right.hairColor &&
    left.setupStep === right.setupStep &&
    sameSetupHistory(left, right) &&
    sameTerrainEdits(left, right) &&
    sameObjectEdits(left, right) &&
    sameObjectRemovals(left, right) &&
    sameObjectSettings(left, right) &&
    sameChatHistory(left.builderChatHistory, right.builderChatHistory)
  );
}

export function gameHistoryReducer(
  history: GameHistory,
  action: GameHistoryAction,
): GameHistory {
  if (action.type === "edit") {
    if (sameGameDocument(history.present, action.spec)) return history;

    return {
      past: [...history.past, history.present].slice(-MAX_HISTORY_LENGTH),
      present: action.spec,
      future: [],
    };
  }

  if (action.type === "chat") {
    if (sameChatHistory(history.present.builderChatHistory, action.turns)) {
      return history;
    }

    return {
      ...history,
      present: { ...history.present, builderChatHistory: action.turns },
    };
  }

  if (action.type === "undo") {
    const previous = history.past.at(-1);
    if (!previous) return history;

    return {
      past: history.past.slice(0, -1),
      present: {
        ...previous,
        builderChatHistory: history.present.builderChatHistory,
      },
      future: [history.present, ...history.future],
    };
  }

  const next = history.future[0];
  if (!next) return history;

  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY_LENGTH),
    present: {
      ...next,
      builderChatHistory: history.present.builderChatHistory,
    },
    future: history.future.slice(1),
  };
}
