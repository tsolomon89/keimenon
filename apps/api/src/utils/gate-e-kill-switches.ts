function parseBooleanFlag(rawValue: string | undefined): boolean {
  if (!rawValue) {
    return false;
  }

  const normalized = rawValue.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Gate-E kill switch: disables enqueueing objective verification tasks.
 */
export function isObjectiveEnqueueKillSwitchEnabled(): boolean {
  return parseBooleanFlag(process.env.KILL_SWITCH_OBJECTIVE_ENQUEUE);
}

/**
 * Gate-E kill switch: disables the semantic component in SimilarityEngineV2.
 */
export function isSemanticStageKillSwitchEnabled(): boolean {
  return parseBooleanFlag(process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE);
}
