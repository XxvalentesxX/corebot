// config/apply.js
// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN COMPLETA DEL SISTEMA DE POSTULACIONES
// Editá este archivo para cambiar preguntas, botones, tiempos, etc.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  // ── Límites ────────────────────────────────────────────────────────────────
  MAX_CATEGORY_QUESTIONS: 15,   // Máximo total de preguntas de categorías (todas sumadas)
  MAX_PER_CATEGORY: 10,         // Máximo por categoría si solo elige una
  // Si elige N categorías, se reparte: Math.floor(MAX_CATEGORY_QUESTIONS / N) por cada una
  // Excepto "otros" que tiene su propia lógica (ver abajo)

  // ── Tiempos (en milisegundos) ──────────────────────────────────────────────
  CATEGORY_SELECT_TIME_MS: 10_000,   // Tiempo para elegir categorías (botones)
  DEFAULT_QUESTION_TIME_MS: 60_000,  // Tiempo por defecto por pregunta

  // ── Preguntas generales (se hacen SIEMPRE, en orden) ──────────────────────
  // Campos: text (string), timeMs (ms, opcional — usa DEFAULT si no se pone)
  generalQuestions: [
    { text: "¿Cuál es tu nombre o como querés que te llamemos?", timeMs: 60_000 },
    { text: "¿De dónde sos? (país o ciudad)", timeMs: 45_000 },
    { text: "¿Cuántos años tenés?", timeMs: 30_000 },
    { text: "¿Hace cuánto estás en el servidor y cómo lo conociste?", timeMs: 90_000 },
    { text: "¿Por qué querés ser parte del staff de CoreCM?", timeMs: 120_000 },
    { text: "¿Cuántas horas al día podés dedicarle al servidor aproximadamente?", timeMs: 60_000 },
    { text: "¿Tenés experiencia previa en staff de otros servidores? Si es así, ¿cuál fue tu rol?", timeMs: 120_000 },
  ],

  // ── Categorías (botones de lenguaje/área) ─────────────────────────────────
  // Campos por categoría:
  //   id:        identificador interno único (sin espacios, sin caracteres especiales)
  //   label:     texto del botón que verá el usuario
  //   embedTitle: título del embed de respuestas para esta categoría
  //   isOther:   si es true, solo se hace UNA pregunta abierta (no se respetan límites de MAX)
  //   questions: array de preguntas para esta categoría (se mezclan aleatoriamente)
  //              Campos: text (string), timeMs (ms, opcional)
  categories: [
    {
      id: "js",
      label: "JS",
      embedTitle: "JavaScript",
      isOther: false,
      questions: [
        { text: "¿Qué es una closure en JavaScript y para qué sirve?", timeMs: 90_000 },
        { text: "¿Cuál es la diferencia entre `let`, `const` y `var`?", timeMs: 60_000 },
        { text: "¿Qué es una Promise y cómo la usarías?", timeMs: 90_000 },
        { text: "¿Qué diferencia hay entre `==` y `===`?", timeMs: 45_000 },
        { text: "¿Qué es el event loop en Node.js?", timeMs: 90_000 },
        { text: "¿Para qué sirve `async/await`?", timeMs: 60_000 },
        { text: "¿Qué hace el método `.map()` en un array?", timeMs: 45_000 },
        { text: "¿Qué es destructuring y ponés un ejemplo?", timeMs: 60_000 },
        { text: "¿Qué es un módulo en Node.js y cómo lo importás?", timeMs: 60_000 },
        { text: "¿Qué es el prototipo en JS?", timeMs: 90_000 },
        { text: "¿Cuál es la diferencia entre `null` y `undefined`?", timeMs: 45_000 },
        { text: "¿Qué hace `Array.reduce()`?", timeMs: 60_000 },
      ],
    },
    {
      id: "htmlcss",
      label: "HTML/CSS",
      embedTitle: "HTML / CSS",
      isOther: false,
      questions: [
        { text: "¿Qué es el modelo de caja (box model) en CSS?", timeMs: 90_000 },
        { text: "¿Cuál es la diferencia entre `display: flex` y `display: grid`?", timeMs: 90_000 },
        { text: "¿Qué son los selectores CSS y mencioná 3 tipos?", timeMs: 60_000 },
        { text: "¿Qué es el DOM y cómo se relaciona con HTML?", timeMs: 90_000 },
        { text: "¿Para qué sirve `position: absolute` y cómo funciona?", timeMs: 60_000 },
        { text: "¿Qué es responsive design y cómo se logra?", timeMs: 90_000 },
        { text: "¿Qué hace la etiqueta `<meta viewport>`?", timeMs: 45_000 },
        { text: "¿Cuál es la diferencia entre `class` e `id` en HTML?", timeMs: 45_000 },
        { text: "¿Qué es un pseudo-elemento en CSS? Dá un ejemplo.", timeMs: 60_000 },
        { text: "¿Para qué sirve `z-index`?", timeMs: 45_000 },
        { text: "¿Qué es CSS specificity?", timeMs: 60_000 },
      ],
    },
    {
      id: "py",
      label: "PY",
      embedTitle: "Python",
      isOther: false,
      questions: [
        { text: "¿Qué diferencia hay entre una lista y una tupla en Python?", timeMs: 60_000 },
        { text: "¿Qué es un decorador en Python?", timeMs: 90_000 },
        { text: "¿Cómo funciona el manejo de excepciones con `try/except`?", timeMs: 60_000 },
        { text: "¿Qué es una list comprehension? Dá un ejemplo.", timeMs: 60_000 },
        { text: "¿Qué es `self` en una clase de Python?", timeMs: 60_000 },
        { text: "¿Cuál es la diferencia entre `is` y `==`?", timeMs: 45_000 },
        { text: "¿Qué es un generador y para qué sirve?", timeMs: 90_000 },
        { text: "¿Cómo importás un módulo en Python?", timeMs: 45_000 },
        { text: "¿Qué hace `*args` y `**kwargs`?", timeMs: 60_000 },
        { text: "¿Qué es `pip` y para qué se usa?", timeMs: 45_000 },
        { text: "¿Qué es la herencia en POO con Python?", timeMs: 90_000 },
      ],
    },
    {
      id: "bdfd",
      label: "BDFD",
      embedTitle: "BDFD",
      isOther: false,
      questions: [
        { text: "¿Qué función usarías para enviar un mensaje en BDFD?", timeMs: 45_000 },
        { text: "¿Cómo funciona `$eval` en BDFD y para qué sirve?", timeMs: 90_000 },
        { text: "¿Cómo harías un loop con `$repeatMessage`?", timeMs: 90_000 },
        { text: "¿Cómo guardás y leés una variable de usuario en BDFD?", timeMs: 60_000 },
        { text: "¿Qué hace `$if[]...$endif`?", timeMs: 60_000 },
        { text: "¿Cómo usarías `$onlyIf` para verificar permisos?", timeMs: 60_000 },
        { text: "¿Qué es `%{DOL}%` y por qué se usa dentro de `$eval`?", timeMs: 60_000 },
        { text: "¿Cómo mandarías un embed en BDFD?", timeMs: 60_000 },
        { text: "¿Qué diferencia hay entre variable de usuario y variable global?", timeMs: 60_000 },
        { text: "¿Cómo esperarías una respuesta del usuario con BDFD?", timeMs: 60_000 },
      ],
    },
    {
      id: "otros",
      label: "OTROS",
      embedTitle: "Otros lenguajes",
      isOther: true,   // ← solo UNA pregunta abierta
      questions: [
        { text: "¿Qué lenguajes o tecnologías sabés o estás aprendiendo? Contanos brevemente tu experiencia con cada uno.", timeMs: 180_000 },
      ],
    },
  ],
};