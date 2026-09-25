# Components

## Implemented today

| Component | Source | Props/state and responsibility |
| --- | --- | --- |
| `RootLayout` | `src/app/layout.tsx` | Server root, metadata/global CSS, `children`; `lang="en"`. |
| `Home` | `src/app/page.tsx` | Async server session gate; passes only account email to `MableApp` or renders welcome plus `SignIn`. |
| `Privacy` | `src/app/privacy/page.tsx` | Server disclosure page and links. |
| `SignIn` | `src/components/sign-in.tsx` | Client Google OAuth button using shared `authClient`. |
| `MableApp` | `src/components/app.tsx` | Client `email` prop; owns fetched `View`, main error, successful-save transition state, new-question draft and action presence during exit animation, selected rule, settings/run dialogs and scope; GET polling and POST command callback. |
| `moveSavedQuestion` | `src/components/save-question-transition.ts` | Measures the input and persisted row, commits the new list state, and animates a temporary full field layer between them, preserving field geometry and revealing the fresh input afterward; hides new-row controls during the movement, then staggers their entrance; skips motion when requested and removes the layer afterward. |
| `ReorderHandle` | `src/components/reorder-handle.tsx` | In-card pointer drag handle with animated insertion-space previews, cancellation, and Up/Down keyboard reordering; parent optimistically applies and persists the resulting insertion order, restoring it on failure. |
| `QuestionComposer` | `src/components/question-composer.tsx` | Wraps the input/editor and animates vertical layout shifts using ResizeObserver and Web Animations; respects reduced motion and cleans up observers/animations. |
| `RuleRow` / `ActionIcon` | `src/components/app.tsx` | Private composition helpers; callbacks for edit/reorder/remove/toggle, label lookup, accessible action tooltip. Not exported/shared primitives. |
| `RuleEditor` | `src/components/rule-editor.tsx` | Optional `rule`/`initialQuestion`/`inlineQuestion`, `labels`, `command`, `close`, `saved`; owns draft question/actions/enabled and busy/error. Inline creation uses the parent question value, large action buttons, a hint that becomes an ink-colored Save submit control when actions are configured, and a label control that expands to reveal its picker on the right; existing-rule editing uses the dialog. Creating a Gmail label has an immediate remote effect. Inline creation passes the persisted rule to the parent onCreated callback for confirmation and movement into the list. The saved callback distinguishes question saves from label creation so only a completed new question clears the composer. |
| `UserMenu` | `src/components/user-menu.tsx` | User-icon HeroUI dropdown showing email and Settings/Log out actions; opens parent settings and reports sign-out failures to the parent error state. |
| `HowItWorks` | `src/components/how-it-works.tsx` | Signed-in footer trigger and HeroUI modal explaining questions, actions, first-match order, setup, manual/scheduled runs and data handling. HeroUI owns open state and focus lifecycle. |
| `SelectField` | `src/components/select-field.tsx` | Shared controlled HeroUI Select/ListBox composition; string option IDs, accessible label or labelled-by, value and change callback. Used by automatic cleanup and run-scope dropdowns. |
| `LabelPicker` | `src/components/label-picker.tsx` | Searchable HeroUI ComboBox shared by inline creation and rule editing; owns search text and newly created label options. Filters labels and offers creation only for nonblank searches with no matches. Parent handles creation errors/busy state and selected label. |
| `SettingsPanel` | `src/components/settings-panel.tsx` | `view`, `command`, `close`, `changed`; owns threshold/schedule/key/delete-confirm drafts and busy/error. Reconnect/sign-out via auth client. |

`src/components/types.ts` defines UI `Rule`, `Label`, `Run`, `View`, and generic `Command`. These are hand-maintained view types, not API response validation. The server returns more rule/run fields than the UI type exposes. No local component library, storybook, hook folder, React context store, or component tests are present.

Mutation callbacks return API JSON or throw; child components own user-facing form errors, then call refresh callbacks. Draft state initializes from props on mount; subsequent polls do not automatically overwrite the open form draft. Shared client auth is `src/lib/auth-client.ts`; server auth/database/provider code must stay outside the client runtime.

## Planned/aspirational — placement policy

Keep new feature-local components in `src/components/` while this remains small; extract helpers only when repeated responsibilities warrant it. A shared accessible dialog would replace repeated overlay lifecycle code, but it is not present today. Update this inventory when exported components or state ownership change.
