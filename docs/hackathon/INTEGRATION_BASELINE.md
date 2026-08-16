# Integration Baseline v1






**Repository:** `WorkD69/travel-assistant-summer-module`






**Canonical integration branch:** `integration/hackathon-2026`






**Strategy:** clean-base reconstruction from `4e46655fc22ac5eeb1825b253e52a3e9d869000f` through ordinary non-fast-forward merge PRs. Canonical `main` was not a merge target.






> **Baseline status:** this is a reviewable integration baseline. It must not be merged into `main` automatically.
>




## Approved inputs and provenance






| Owner | Approved source head | Server-side integration merge |


|---|---|---|


| Egor — Green core hardening | `6ccd9f07d6cb8c9dda36ac0a7903b0d80fafed2f` | `c46652bc4185f5ec4521ec92bf52703b4eebed93` (PR #9) |


| Egor — Yellow access helper | `48191ad21bb633aa65be2872f8188badb8718c4c` | Included transitively by Yellow Security; not merged separately |


| Egor — Yellow security | `e9158bdb90f658d11b57452153a6134c4fc627cf` | `b951cec4376d31bbf9f77971e29615c98387ec72` (PR #10) |


| Artem — Tutu-native Home/Search | `4f896edcd6797184208201eaee73fce7d3c4719b` | `1787b96da3b315de464a03456e82d7bd0f9bbb98` (PR #11) |






The branch was reconstructed from the clean historical base because the approved Egor heads were ancestors of `main` but their tree changes had been reverted. Starting from clean base prevents Git's merged-and-reverted ancestry from suppressing approved content. No approved source branch was rebased, squashed, rewritten, or force-pushed.






## Frozen core and security baseline






The integrated tree retains Green canonical source-of-truth and production hardening semantics: no implicit production Turkey/demo Trip fallback; explicit development/test-only legacy fixture preview gate; fail-closed neutral core-flow initial access state; production JWT fail-closed configuration; and the frontend CI working-directory fix.






The Yellow security baseline retains `backend/src/services/tripAccess.js` and the canonical active participant allowlist (`active` and normalized `Активен`). It enforces scoped child lookups for mutation paths, owner-or-shared document visibility, and aligned bot authorization.






> `backend/src/routes/monitoring.js` and `backend/src/services/botNotify.js` use shared fail-closed access predicates. Future Plan B work must preserve that alignment and must not restore fail-open authorization predicates.
