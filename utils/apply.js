// utils/apply.js
const fs   = require("fs");
const path = require("path");

const APPLY_PATH = path.join(process.cwd(), "data", "apply.json");

function load() {
  if (!fs.existsSync(APPLY_PATH)) {
    const defaults = { open: false, applicants: {} };
    fs.mkdirSync(path.dirname(APPLY_PATH), { recursive: true });
    fs.writeFileSync(APPLY_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  try { return JSON.parse(fs.readFileSync(APPLY_PATH, "utf-8")); }
  catch { return { open: false, applicants: {} }; }
}

function save(data) {
  fs.writeFileSync(APPLY_PATH, JSON.stringify(data, null, 2));
}

function isOpen()    { return load().open; }
function getApplicant(userId) { return load().applicants[userId] ?? null; }

function setApplicant(userId, data) {
  const db = load();
  db.applicants[userId] = { ...(db.applicants[userId] ?? {}), ...data };
  save(db);
}

function canApply(userId) {
  const a = getApplicant(userId);
  if (!a) return true;
  return a.status === "rejected" || a.status === "accepted" || a.status === "eligible";
}

function openPostulations() {
  const db = load();
  db.open = true;
  for (const id of Object.keys(db.applicants)) {
    if (["rejected", "accepted"].includes(db.applicants[id].status)) {
      db.applicants[id].status  = "eligible";
      db.applicants[id].started = false;  // permite volver a iniciar
    }
  }
  save(db);
}

function closePostulations() {
  const db = load();
  db.open = false;
  save(db);
}

/** Shuffle array (Fisher-Yates) */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Dado un array de categorías elegidas y la config,
 * devuelve { categoryId → preguntasSeleccionadas[] }
 */
function selectCategoryQuestions(chosenCategories, config) {
  const { MAX_CATEGORY_QUESTIONS, MAX_PER_CATEGORY, categories } = config;
  const result = {};

  const otherCat   = chosenCategories.find((id) => categories.find((c) => c.id === id)?.isOther);
  const normalCats = chosenCategories.filter((id) => id !== otherCat);

  if (otherCat) {
    const cat = categories.find((c) => c.id === otherCat);
    // Usa getCategoryQuestions para respetar overrides del panel
    const qs = getCategoryQuestions(otherCat);
    result[otherCat] = qs.slice(0, 1);
  }

  if (!normalCats.length) return result;

  const perCat = Math.min(
    MAX_PER_CATEGORY,
    Math.floor(MAX_CATEGORY_QUESTIONS / normalCats.length)
  );

  for (const id of normalCats) {
    const qs = getCategoryQuestions(id);
    result[id] = shuffle(qs).slice(0, perCat);
  }

  return result;
}

module.exports = {
  isOpen, getApplicant, setApplicant, canApply,
  openPostulations, closePostulations,
  shuffle, selectCategoryQuestions,
};

// ─────────────────────────────────────────────────────────────────────────────
// Preguntas con override desde data/apply_questions.json
// ─────────────────────────────────────────────────────────────────────────────
const fsQ  = require("fs");
const pathQ = require("path");
const APPLY_CONFIG_PATH = pathQ.join(process.cwd(), "data", "apply_questions.json");

function loadQOverride() {
  if (!fsQ.existsSync(APPLY_CONFIG_PATH)) return null;
  try { return JSON.parse(fsQ.readFileSync(APPLY_CONFIG_PATH, "utf-8")); }
  catch { return null; }
}

function getGeneralQuestions() {
  const APPLY_CONFIG = require("../config/apply");
  const override = loadQOverride();
  return override?.general ?? APPLY_CONFIG.generalQuestions;
}

function getCategoryQuestions(catId) {
  const APPLY_CONFIG = require("../config/apply");
  const override = loadQOverride();
  if (override?.categories?.[catId]) return override.categories[catId];
  return APPLY_CONFIG.categories.find((c) => c.id === catId)?.questions ?? [];
}

module.exports = Object.assign(module.exports, { getGeneralQuestions, getCategoryQuestions });