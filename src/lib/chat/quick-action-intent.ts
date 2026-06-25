export const QUICK_ACTION_INTENT_PREFIX = "quick_action:";
/** Separates composite action keys (which may contain `:`) from the base intent. */
export const QUICK_ACTION_INTENT_SEPARATOR = "\x1f";

const LEGACY_RETURN_BASE_INTENT_MARKERS = [
  "return_reason_choice|",
  "return_reason|",
  "return_photo|",
  "return_item_pick|",
  "return_item_select|",
  "return_confirmed|",
  "return_tracking|",
] as const;

function recoverLegacyTaggedIntent(
  rest: string,
): { actionKey: string; baseIntent: string } | null {
  for (const marker of LEGACY_RETURN_BASE_INTENT_MARKERS) {
    const markerIndex = rest.indexOf(marker);
    if (markerIndex <= 0) continue;

    const actionKey = rest.slice(0, markerIndex).replace(/:$/, "");
    if (!actionKey) continue;

    return {
      actionKey,
      baseIntent: rest.slice(markerIndex),
    };
  }

  return null;
}

export function encodeQuickActionIntent(
  actionKey: string,
  baseIntent: string,
): string {
  return `${QUICK_ACTION_INTENT_PREFIX}${actionKey}${QUICK_ACTION_INTENT_SEPARATOR}${baseIntent}`;
}

export function parseQuickActionTaggedIntent(
  intent: string | null,
): { actionKey: string; baseIntent: string } | null {
  if (!intent?.startsWith(QUICK_ACTION_INTENT_PREFIX)) return null;

  const rest = intent.slice(QUICK_ACTION_INTENT_PREFIX.length);
  const separatorIndex = rest.indexOf(QUICK_ACTION_INTENT_SEPARATOR);
  if (separatorIndex > 0) {
    return {
      actionKey: rest.slice(0, separatorIndex),
      baseIntent: rest.slice(separatorIndex + 1),
    };
  }

  const legacyRecovery = recoverLegacyTaggedIntent(rest);
  if (legacyRecovery) return legacyRecovery;

  const colonIdx = rest.indexOf(":");
  if (colonIdx <= 0) return null;

  return {
    actionKey: rest.slice(0, colonIdx),
    baseIntent: rest.slice(colonIdx + 1),
  };
}

export function resolveMessageIntent(intent: string | null): string | null {
  if (!intent) return null;
  return parseQuickActionTaggedIntent(intent)?.baseIntent ?? intent;
}
