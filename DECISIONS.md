# Decisiones y desvíos respecto del PRD

Registro de decisiones tomadas durante la implementación. Cada entrada indica si es un **desvío** del PRD
(requiere aviso al responsable), una **decisión nueva** (el PRD no la cubre) o una **confirmación**.

Convención de idioma: la documentación del proyecto sigue el idioma del PRD (español neutro); el código,
los comentarios, los mensajes de commit y los textos de interfaz están en inglés.

| #     | Fecha      | Tipo         | Tema                  | Decisión y motivo                                                                                                                                                                            |
| ----- | ---------- | ------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-1 | 2026-10-18 | Confirmación | TypeScript 5.8.x      | `npm view typescript version` devuelve 7.0.2, pero el PRD fija 5.8.x (la que usa `@vendure/core` 3.8.0, que declara 5.8.2). Se usa **5.8.3** exacta en todo el repositorio. No es un desvío. |
| DEC-2 | 2026-10-18 | Confirmación | Versiones principales | Contrastadas con el registro de npm el 2026-10-18: `@vendure/*` 3.8.0, `mercadopago` 3.6.1, `next` 16.4.2, `react` 19.3.1, `graphql-request` 7.4.0. Coinciden con la sección 16.             |
