export const IMPORT_PIPELINE_STAGE_CHAIN = [
  'canonicalize',
  'save',
  'source',
  'span',
  'atomic',
  'packet',
  'dedupe',
  'code',
  'spine',
  'finalize',
] as const;

export type ImportPipelineStage = (typeof IMPORT_PIPELINE_STAGE_CHAIN)[number];

export function getNextPipelineStage(
  current: ImportPipelineStage | null
): ImportPipelineStage | null {
  if (current === null) {
    return IMPORT_PIPELINE_STAGE_CHAIN[0];
  }

  const index = IMPORT_PIPELINE_STAGE_CHAIN.indexOf(current);
  if (index < 0 || index + 1 >= IMPORT_PIPELINE_STAGE_CHAIN.length) {
    return null;
  }

  return IMPORT_PIPELINE_STAGE_CHAIN[index + 1];
}
