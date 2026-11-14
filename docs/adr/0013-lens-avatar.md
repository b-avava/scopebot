# 0013. One avatar, faces from data

Date: 2026-11-08
Status: Accepted. Replaces the shapes and faces of `BotAvatar` from ADR 0004.

## Context

Employees picked one of eight shapes and sixteen faces. The set looked close to other products, and a face such as "proud" said nothing about the employee. Three directions were drawn in Paper (page v4 Avatars), and the lens was chosen.

## Decision

- **Every employee is the same lens.** Only the colour is chosen, from eight. Amber and grey are left out, because they mean "waiting for you" and "paused".
- **The face shows the state, worked out on the server.** `GET /agents/statuses` returns one of `paused`, `approval`, `with-person`, `after-hours` and `working`, in that order of priority, from the agent's settings, pending approvals, open handoffs and working hours. The app asks again every 30 seconds and after a chat changes.
- **A known job adds a sign.** Front desk, Sales, Follow-ups and Reports have one. Any other job has none.
- **The lens has four levels of detail**, by size: shine and shadows from 80 px, a highlight from 44 px, a thicker rim from 26 px, and only the circle and eyes below that. Badges sit in a hole cut with a mask, so they read on any background.
- **Motion is small and follows the state.** On the hiring screen and in chat (`live`), the eyes follow the cursor and blink now and then. In the sidebar (`greet`), hovering an employee makes the avatar hop once, blink and watch the pointer until it leaves. A paused employee does not react, and one after hours keeps its eyes closed and only hops. Nothing moves with reduced motion turned on.
- **`LensAvatar` lives in `packages/ui`.** It knows nothing about agents. `EmployeeAvatar` in the app maps an agent to it.
- **Migration 0002 drops `shape` and `face`.** Old data files lose them on import.

## Consequences

- A state can be up to 30 seconds late, except pausing, which shows at once.
- An employee whose colour is no longer offered keeps it, and the picker shows it first.
- Faces are no longer a way to tell employees apart. Colour, name and sign do that.
