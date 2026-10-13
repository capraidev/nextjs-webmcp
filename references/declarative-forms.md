# Declarative form tools

Template: `assets/templates/forms.ts` (constants + `agentResponder` + usage).

## Which forms

- **Yes**: public actions with mild, reversible, consented consequences that the site already exposes without login and already rate-limits — newsletter (double opt-in), contact message, maybe a search form.
- **No (document as deliberate)**: registration / consent (a consent given by an agent is not a consent), checkout and payments, invitations, account deletion, admin. Lighthouse "Forms missing declarative WebMCP" will list them; write the reason in the docs and in a code comment next to the form.

## How

1. One constants module (`AGENT_FORMS`) with `toolname`, `tooldescription`, per-field `toolparamdescription`, and `where` (for llms.txt). English, model-oriented. Use the same snake_case style as the registry; never reuse a registry tool name (no overlap).
2. On the `<form>`: `toolname`, `tooldescription`. **No `toolautosubmit`**: the person's click is the confirmation.
3. On each field: a real `name` attribute (it becomes the parameter name) and `toolparamdescription`.
4. Type augmentation for JSX (`webmcp.d.ts`). Verify the attributes reach the DOM (`next build && next start`, view source).
5. **Controlled inputs**: read values from `new FormData(e.currentTarget)` at submit; fall back to state. A test should set `input.value` without dispatching an `input` event and expect the server action to receive it.
6. **Answer the agent**: `agentResponder(e.nativeEvent)` during the handler; resolve with the message the person sees (already localised), reject with an `Error` if the action throws, then rethrow so the UI behaves as before.
7. Server side is unchanged: the same server action, the same rate limit, the same validation and localisation.

## Tests

- Each annotated form renders `toolname`/`tooldescription`, each field `toolparamdescription`, and **no** `toolautosubmit`.
- Excluded forms (registration) render none of the attributes — pin the decision.
- Agent submit: dispatch a `submit` event with `agentInvoked: true` and a `respondWith` spy; expect `preventDefault`, the action called with DOM values, the promise resolved with the message.
- Failure: `agentResponder` with an `Error` → promise rejects.
- Person submit (no `agentInvoked`): `respondWith` never called.
- Guard: `toolname=` appears only in the approved form files.
