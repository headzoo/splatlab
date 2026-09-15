import type { BuilderChatTurn, GameDocument } from "./game-contract";
import {
  applyCooperSpecChange,
  applyMapRollChange,
  specChangeIsNoop,
  type CooperSpecChange,
  type MapRollChange,
} from "./cooper-spec-change";
import type { GamePhysicsDocument } from "./game-physics";

export type GameHistory = {
  past: GameDocument[];
  present: GameDocument;
  future: GameDocument[];
};

export type GameHistoryAction =
  | { type: "edit"; spec: GameDocument }
  /** Setup state paired with a server map roll is not independently undoable. */
  | { type: "setup"; spec: GameDocument }
  | { type: "chat"; turns: BuilderChatTurn[] }
  /** Server-owned: Cooper's physics fork is not an undoable local edit. */
  | { type: "physics"; document: GamePhysicsDocument | undefined }
  /** Cooper's object add/remove, merged in rather than replacing local edits. */
  | { type: "specChange"; change: CooperSpecChange }
  /** A materialized map roll invalidates all local undo snapshots. */
  | { type: "mapRoll"; change: MapRollChange }
  | { type: "undo" }
  | { type: "redo" };

const MAX_HISTORY_LENGTH = 50;

function samePhysics(left: GameDocument, right: GameDocument) {
  return JSON.stringify(left.physicsDocument ?? null)
    === JSON.stringify(right.physicsDocument ?? null);
}

function withPhysics(spec: GameDocument, document: GamePhysicsDocument | undefined): GameDocument {
  const next: GameDocument = { ...spec };
  delete next.physicsDocument;
  if (document) next.physicsDocument = document;
  return next;
}

function withGeneratedMaps(spec: GameDocument, stored: GameDocument): GameDocument {
  return {
    ...spec,
    generatedPlatformerMaps: stored.generatedPlatformerMaps,
    generatedMazeMaps: stored.generatedMazeMaps,
  };
}

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
    JSON.stringify(left.generatedPlatformerMaps) === JSON.stringify(right.generatedPlatformerMaps) &&
    JSON.stringify(left.generatedMazeMaps) === JSON.stringify(right.generatedMazeMaps) &&
    left.mapStyle === right.mapStyle &&
    left.mapLength === right.mapLength &&
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
    samePhysics(left, right) &&
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

  if (action.type === "setup") {
    if (sameGameDocument(history.present, action.spec)) return history;
    return { ...history, present: action.spec };
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

  if (action.type === "physics") {
    const present = withPhysics(history.present, action.document);
    if (samePhysics(history.present, present)) return history;

    return { ...history, present };
  }

  // Cooper owns this change, so it is folded into the present rather than
  // pushed as an undo step the kid did not make.
  if (action.type === "specChange") {
    if (specChangeIsNoop(history.present, action.change)) return history;

    return { ...history, present: applyCooperSpecChange(history.present, action.change) };
  }
  if (action.type === "mapRoll") {
    return { past: [], future: [], present: applyMapRollChange(history.present, action.change) };
  }

  if (action.type === "undo") {
    const previous = history.past.at(-1);
    if (!previous) return history;

    return {
      past: history.past.slice(0, -1),
      present: {
        ...withGeneratedMaps(withPhysics(previous, history.present.physicsDocument), history.present),
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
      ...withGeneratedMaps(withPhysics(next, history.present.physicsDocument), history.present),
      builderChatHistory: history.present.builderChatHistory,
    },
    future: history.future.slice(1),
  };
}
