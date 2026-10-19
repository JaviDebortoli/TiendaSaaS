# mp-auth-failure

Objective: cross-process lock for renewing and verifying an account, a Mercado Pago 401 treated as a suspected revocation, and `createPayment` accepting only the plugin processor's calls.
Branch: `feat/mp-auth-failure` (stacked on `feat/mp-preference-registry`, PR #2). Delivery: `ask-on-risk`, stacked PRs. Runner: vitest (`npm run verify`, PostgreSQL via `TEST_DB_*`).

## Specs

Part 1 - lock between processes

- S1. "La renovación y la verificación de revocación toman un `pg_advisory_xact_lock` por cuenta (como el bloqueo por pedido de DEC-14). En SQL.js se mantiene el candado en proceso."
- S2. "Dentro del candado, siempre se releen los tokens de la base antes de renovar o de concluir algo. Si los tokens cambiaron desde que se usaron, no hubo revocación: se usan los nuevos."
- S3. "`markDisconnected` solo se puede llamar después de esa relectura y dentro del candado."
- S4. Tests against PostgreSQL: "Dos procesos que renuevan la misma cuenta a la vez no gastan el mismo `refresh_token` y ninguno concluye revocación." and "Un 401 con un token que otro proceso ya reemplazó no retira nada."
- S5. "Actualizá DEC-49 y el riesgo correspondiente de DEC-51."

Part 2 - a 401 is a suspected revocation

- S6. "Cuando cualquier llamada con el token de una cuenta recibe un error de autenticación de Mercado Pago (crear una preferencia, consultar un pago o su orden, reembolsar, cancelar), se corre la verificación de DEC-16 con el candado del punto 1."
- S7. "Renovación exitosa: se guardan los tokens y se reintenta **una vez** la operación original. Al crear una preferencia, el comprador no se entera."
- S8. "Revocación confirmada: sigue el camino único de DEC-42 (cuenta `disconnected`, vínculos `retired`, aviso `account_disconnected`). En el checkout, el comprador ve un mensaje claro, distinto del error genérico: que el local no puede cobrar con Mercado Pago en este momento. El método deja de ser elegible."
- S9. "No concluyente (5xx, timeout, error de red): no se cambia nada, el comprador ve el error genérico de hoy y se registra."
- S10. "Solo cuentan como fallas de autenticación las respuestas de Mercado Pago que digan que el token es inválido (401 y equivalentes que observes en el SDK), y en la renovación un rechazo del `refresh_token`. Un 403 o un 404 (por ejemplo, un pago que no es de esa cuenta) **no** disparan la verificación."
- S11. "Una sola verificación por cuenta a la vez. Las llamadas concurrentes esperan el resultado y lo reutilizan. Después de una verificación que concluyó que la cuenta está bien, hay una pausa mínima configurable (por ejemplo, 5 minutos) antes de volver a verificarla por otro 401."
- S12. "En el webhook y en `syncMercadoPagoPayment`: si la verificación confirma la revocación, el pago no se puede leer. Va el aviso `unverifiable_payment` al local y a la plataforma, porque puede haber un pago aprobado sin liquidar. Si no es concluyente, el trabajo se reintenta como cualquier caída de Mercado Pago."
- S13. "En reembolsos y cancelaciones: si se confirma la revocación, el resultado es el `Failed` con el mensaje de DEC-46."
- S14. Tests: a 401 creating the preference with a successful renewal (preference created, nothing retired); a 401 with the renewal rejected (revocation confirmed, links retired, clear message to the buyer, notice); a 401 followed by a 5xx in the verification (nothing changes); "Diez checkouts simultáneos con 401 disparan una sola verificación."; a 403 or a 404 trigger nothing; a 401 reading an approved payment in the webhook with the revocation confirmed: `unverifiable_payment`.
- S15. `VERIFICATION.md`: a sandbox point to record "qué devuelve exactamente Mercado Pago con un token revocado (código HTTP y cuerpo), tanto al usar el token de acceso como al renovar".
- S16. README, deployment section: "desarrollo y pruebas tienen que usar otra aplicación de Mercado Pago, nunca la de producción. Una autorización hecha desde otro entorno puede anular los tokens de producción (V20) y dejar a un local desvinculado."
- S17. "Actualizá el PRD (9.4, 9.5, 9.6 y 9.9) y DECISIONS.md con la entrada nueva."

Part 3 - `createPayment`

- S18. "`createPayment` rechaza **sin consultar a Mercado Pago** cualquier llamada que no ocurra dentro del alcance de liquidación de DEC-45. Devuelve un error, no un pago `Declined`, y no deja rastro en el pedido."
- S19. "Dentro del alcance, el pago ya fue verificado por el procesador. `createPayment` puede usar ese resultado en lugar de volver a consultar, siempre que el alcance esté ligado al pedido y al `mpPaymentId` exactos que se verificaron."
- S20. Tests: `addPaymentToOrder` from the Shop API with a real approved `mpPaymentId` does not settle and does not query Mercado Pago; the normal flow (webhook and `syncMercadoPagoPayment`) still settles; "El alcance de un pedido no sirve para otro pedido ni para otro pago."
- S21. "Actualizá DEC-13 y DEC-45 y el PRD (9.5 y 11)."

Part 4 - documentation

- S22. "PRD 9.5, párrafo de DEC-44: aclarar que las cuentas candidatas ya no se prueban en el modo `preference` ni en `syncMercadoPagoPayment` (como dice 9.7)."
- S23. "DECISIONS.md: agregar 'reemplazado en parte por DEC-52' a DEC-13, DEC-20 y DEC-43, con una línea sobre qué cambió."
- S24. "DEC-51: registrar el caso de una preferencia creada en Mercado Pago cuyo `preference_id` no se llegó a guardar (por ejemplo, por una caída del servidor). Su pago queda en revisión manual y se avisa: falla cerrado, se acepta."

Rules: keep PRD section 11 non-negotiables; change nothing outside this scope; stop and ask if the docs contradict this design or an uncovered product decision appears; finish with `npm run verify` green, the PostgreSQL suite run, and a summary of what changed and what is pending in the sandbox.

Assumptions (not in the request): the verification pause is kept in memory per process (no migration); a 401 followed by a verification that finds the token valid (`GET /users/me` answers) changes nothing and does not retry the original call.

## Tasks

- [x] T1 (S1-S5) Account lock, re-read inside it, one verification path (`reconcileAfterConnectNotification` and the 401 path share it), `markDisconnected` through the lock; PostgreSQL tests; DEC-49/DEC-51 · inline · 08d5543
- [x] T2 (S6-S14) 401 as suspected revocation across checkout, payment reads, merchant order, refund, cancel; pause option and env; tests · inline · 628fa4e
- [x] T3 (S18-S20) `createPayment` only inside the settlement scope, bound to order and `mpPaymentId`; tests · inline · e2cad27
- [ ] T4 (S15, S16, S17, S21-S24) Docs: PRD, DECISIONS, VERIFICATION, README · inline · -
- [ ] T5 Final `npm run verify` with PostgreSQL, independent verifier, native review where due · inline · -

## Log

- L1 (2026-10-19), the user's original request, verbatim: "Sobre esto quiero proponer tres cambios." followed by the three changes, the documentation adjustments and the rules, quoted in S1-S24 above and stored in the conversation of this feature (Spanish, pasted).
- L2 (2026-10-19) Route: all tasks inline (understood change, no parallel units with disjoint surfaces: they share `connection.service.ts` and the e2e helpers).
- L3 (2026-10-19) T1-T3 done (see commits). Decisions not covered by the request, recorded in DEC-55: a verification that finds the token valid changes nothing and does not retry; the pause is per process; the verification no longer marks `expiring` nor sends `token_renewal_failed`, and `reconcileAfterConnectNotification` only concludes a revocation on `invalid_grant` or an authentication rejection. Next: docs commit, final verify, verifier, native review where due.
