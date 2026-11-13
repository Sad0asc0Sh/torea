# Training Priority Engine (Phase 2)

This document summarizes the deterministic rules implemented by `src/services/training.engine.js`.

## Input contract

`processVoice({ userId, transcript, meta, voiceLogId })` where `meta` may contain:
- `tool`: `negotiation` | `training` | `automation`
- `customerName`, `customerTypeId`, `gps`, `suspiciousScore`

## Output contract

```
{
  phase: 'baseline' | 'training',
  difficulty_level: 'simple' | 'logical' | 'strict',
  current_topic_key: string | null,
  score: number | null,
  rolling_avg: number | null,
  threshold: number,
  unlocked_next: boolean,
  leveled_up: boolean,
  user_level: number,
  outputs: {
    summary_25?: string,
    key_points?: [string, string, string],
    coach_notes?: string
  }
}
```

## Business rules

1. **Baseline phase**
   - `baseline_voice_count` increments on every voice until it reaches `baseline_voices_count` from `training_company_settings`.
   - While under the target: `phase='baseline'`, outputs are empty, only difficulty is evaluated (`simple|logical|strict`).
2. **Training phase**
   - When `baseline_done` is true, current topic is the first enabled topic unless already set.
   - Each voice is analyzed **only for the current topic** via `ai.gateway`.
   - A `training_scores` row is inserted for the current topic; rolling average uses the last `rolling_window_n` scores.
   - If `rolling_avg >= threshold_score`, the next enabled topic is unlocked and becomes `current_topic_key`.
3. **Level-up**
   - When **all enabled topics** in the cycle have rolling averages above the threshold:
     - `user_level += 1`, `cycle_id += 1`
     - `current_topic_key` resets to the first enabled topic.
     - Difficulty level is retained by default.
4. **Suspicious speaker**
   - Training runs regardless of `suspiciousScore`; the flag is handled outside the engine (e.g., stored on voice logs). A suspicious threshold of `< 0.50` is used externally.

## AI gateway expectations

- Provider selection: `cloud` | `local` | `hybrid` (hybrid prefers cloud only when token/base_url exist).
- Prompts are topic+difficulty specific (`prompt_simple`, `prompt_logical`, `prompt_strict`).
- If a cloud token/base_url is missing, the gateway returns a controlled error and minimal outputs, but scoring still proceeds.
- `summary_25` is ~25 Persian words, `key_points` always three bullet-like items, and `coach_notes` are concise guidance for the manager/agent.
