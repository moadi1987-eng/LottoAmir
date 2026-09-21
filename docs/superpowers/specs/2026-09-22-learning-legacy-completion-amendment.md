# Approved amendment: complete short legacy-control rows

Approved by the user on 2026-09-22 after the existing generator was observed producing incomplete rows. This amendment overrides only the exact-as-generated legacy-control requirement in the 2026-09-21 learning spec and plan.

- The learning experiment's legacy arm still starts with `generateBaselineForms` on the preceding 500 draws, using its `.main` output.
- Keep every valid six-number row exactly unchanged, including metadata/strong number; keep duplicates between different rows.
- Complete a short row only when it contains 1–5 distinct integers in 1–37 and an otherwise valid line identity and strong number. Reject empty rows, non-array rows, duplicates within a row, out-of-range numbers, excess numbers or malformed metadata with GENERATION_FAILED; those are not silently repaired.
- Keep all original row numbers and the strong number. Rank numbers 1–37 by occurrence count in those same 500 preceding draws, highest count first, numeric ascending on ties. Append numbers absent from the row until it contains six, then sort ascending.
- Mark a completed row's strategy label with ` • השלמה קבועה`. Label the arm in the UI/guide as `שיטה קיימת + השלמה קבועה`, so it is not presented as the unchanged generator.
- No target/future outcome, replay result, random seed or prize amount can affect completion. No retry chooses a better-performing completion.
- Export `LEGACY_COMPLETION_VERSION = 'frequency-fill-v1'` and `CORE_VERSION = LottoStrategyCore.ALGORITHM_VERSION + ':' + LottoStrategyCore.CONSTRAINT_VERSION + ':legacy-' + LEGACY_COMPLETION_VERSION` from the learning core. Persist and validate this full core identity. Keep the initial unpublished learning protocol name `learning-experiment-v1`.
- The existing strategy core, all PIN forms, their numbers, storage, prizes and other generation paths remain unchanged.

Task1 implements and behaviorally tests completion, including hand-derived tie/frequency cases, unchanged valid rows, preservation of originals/strong numbers, input immutability and rejection of malformed output. The original periodic fixture now produces valid arms; keep a separate malformed-output test. Task2 must verify target/future mutation cannot alter completion. Tasks3–5 persist/validate CORE_VERSION; Task6 exposes the corrected benchmark label; Task7 documents this distinction.
