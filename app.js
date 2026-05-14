const LEGACY_STORAGE_KEY = "mealPlannerStateV1";
const DB_NAME = "mealPlannerDb";
const DB_VERSION = 1;
const DB_STORE = "appState";
const DB_STATE_KEY = "state";

let database = null;

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const days = [
  { id: "mon", short: "Пн", full: "Понедельник" },
  { id: "tue", short: "Вт", full: "Вторник" },
  { id: "wed", short: "Ср", full: "Среда" },
  { id: "thu", short: "Чт", full: "Четверг" },
  { id: "fri", short: "Пт", full: "Пятница" },
  { id: "sat", short: "Сб", full: "Суббота" },
  { id: "sun", short: "Вс", full: "Воскресенье" },
];

const meals = [
  { id: "breakfast", title: "Завтрак" },
  { id: "lunch", title: "Обед" },
  { id: "dinner", title: "Ужин" },
  { id: "snack", title: "Перекус" },
];

const defaultState = {
  settings: {
    cookingDays: ["wed", "sun"],
  },
  recipes: [
    {
      id: "recipe-oatmeal",
      title: "Овсянка с ягодами",
      category: "Завтрак",
      servings: 1,
      calories: 360,
      protein: 16,
      fat: 10,
      carbs: 52,
      ingredients: "Овсянка, греческий йогурт, ягоды, мед",
      notes: "Можно собрать вечером в банку и оставить в холодильнике.",
    },
    {
      id: "recipe-chicken-bowl",
      title: "Боул с курицей и рисом",
      category: "Обед",
      servings: 2,
      calories: 520,
      protein: 38,
      fat: 16,
      carbs: 55,
      ingredients: "Куриное филе, рис, огурец, авокадо, соус",
      notes: "Курицу и рис удобно приготовить заранее на два дня.",
    },
    {
      id: "recipe-salmon-potato",
      title: "Лосось с картофелем",
      category: "Ужин",
      servings: 2,
      calories: 610,
      protein: 42,
      fat: 26,
      carbs: 48,
      ingredients: "Лосось, картофель, брокколи, лимон",
      notes: "Запекать все на одном противне около 25 минут.",
    },
  ],
  menu: [
    {
      id: "menu-mon-breakfast-oatmeal",
      recipeId: "recipe-oatmeal",
      day: "mon",
      meal: "breakfast",
      servings: 1,
      prepDay: "",
    },
    {
      id: "menu-wed-lunch-chicken",
      recipeId: "recipe-chicken-bowl",
      day: "wed",
      meal: "lunch",
      servings: 1,
      prepDay: "wed",
    },
    {
      id: "menu-sun-dinner-salmon",
      recipeId: "recipe-salmon-potato",
      day: "sun",
      meal: "dinner",
      servings: 1,
      prepDay: "sun",
    },
  ],
};

let state = cloneDefaultState();

const elements = {
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  weekCalories: document.querySelector("#weekCalories"),
  weekProtein: document.querySelector("#weekProtein"),
  weekFat: document.querySelector("#weekFat"),
  weekCarbs: document.querySelector("#weekCarbs"),
  weekGrid: document.querySelector("#weekGrid"),
  menuForm: document.querySelector("#menuForm"),
  menuRecipe: document.querySelector("#menuRecipe"),
  menuDay: document.querySelector("#menuDay"),
  menuMeal: document.querySelector("#menuMeal"),
  menuServings: document.querySelector("#menuServings"),
  menuPrepDay: document.querySelector("#menuPrepDay"),
  resetMenuButton: document.querySelector("#resetMenuButton"),
  recipeForm: document.querySelector("#recipeForm"),
  recipeId: document.querySelector("#recipeId"),
  recipeTitle: document.querySelector("#recipeTitle"),
  recipeServings: document.querySelector("#recipeServings"),
  recipeCategory: document.querySelector("#recipeCategory"),
  recipeCalories: document.querySelector("#recipeCalories"),
  recipeProtein: document.querySelector("#recipeProtein"),
  recipeFat: document.querySelector("#recipeFat"),
  recipeCarbs: document.querySelector("#recipeCarbs"),
  recipeIngredients: document.querySelector("#recipeIngredients"),
  recipeNotes: document.querySelector("#recipeNotes"),
  saveRecipeButton: document.querySelector("#saveRecipeButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  recipeList: document.querySelector("#recipeList"),
  cookingDays: document.querySelector("#cookingDays"),
};

async function loadState() {
  try {
    database = await withTimeout(openDatabase(), 2500);
    const storedState = await withTimeout(readStateFromDatabase(), 2500);

    if (storedState) {
      return normalizeState(storedState);
    }

    const migratedState = loadLegacyState();
    await saveStateToDatabase(migratedState);
    return migratedState;
  } catch {
    return loadLegacyState();
  }
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Database request timed out")), timeoutMs);
    }),
  ]);
}

function loadLegacyState() {
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    return stored ? normalizeState(JSON.parse(stored)) : cloneDefaultState();
  } catch {
    return cloneDefaultState();
  }
}

function normalizeState(nextState) {
  return {
    settings: {
      ...cloneDefaultState().settings,
      ...(nextState.settings || {}),
    },
    recipes: Array.isArray(nextState.recipes) ? nextState.recipes : cloneDefaultState().recipes,
    menu: Array.isArray(nextState.menu) ? nextState.menu : cloneDefaultState().menu,
  };
}

function persist() {
  const snapshot = JSON.parse(JSON.stringify(state));

  if (!database) {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshot));
    return;
  }

  saveStateToDatabase(snapshot).catch(() => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshot));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readStateFromDatabase() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);
    const request = store.get(DB_STATE_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function saveStateToDatabase(nextState) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);

    store.put(nextState, DB_STATE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function formatNumber(value) {
  return Math.round(value * 10) / 10;
}

function recipeById(id) {
  return state.recipes.find((recipe) => recipe.id === id);
}

function dayById(id) {
  return days.find((day) => day.id === id);
}

function nutritionForEntry(entry) {
  const recipe = recipeById(entry.recipeId);
  if (!recipe) {
    return { calories: 0, protein: 0, fat: 0, carbs: 0 };
  }

  const servings = Number(entry.servings) || 1;
  return {
    calories: recipe.calories * servings,
    protein: recipe.protein * servings,
    fat: recipe.fat * servings,
    carbs: recipe.carbs * servings,
  };
}

function sumNutrition(entries) {
  return entries.reduce(
    (total, entry) => {
      const item = nutritionForEntry(entry);
      total.calories += item.calories;
      total.protein += item.protein;
      total.fat += item.fat;
      total.carbs += item.carbs;
      return total;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
}

function preparedRecipeIds() {
  return new Set(state.menu.filter((entry) => entry.prepDay).map((entry) => entry.recipeId));
}

function renderSelectOptions() {
  elements.menuRecipe.innerHTML = state.recipes
    .map((recipe) => `<option value="${recipe.id}">${escapeHtml(recipe.title)}</option>`)
    .join("");

  elements.menuDay.innerHTML = days.map((day) => `<option value="${day.id}">${day.full}</option>`).join("");
  elements.menuMeal.innerHTML = meals.map((meal) => `<option value="${meal.id}">${meal.title}</option>`).join("");

  const prepOptions = ['<option value="">Не готовлю заранее</option>']
    .concat(
      state.settings.cookingDays.map((id) => {
        const day = dayById(id);
        return `<option value="${id}">${day.full}</option>`;
      }),
    )
    .join("");
  elements.menuPrepDay.innerHTML = prepOptions;
}

function renderSummary() {
  const total = sumNutrition(state.menu);
  elements.weekCalories.textContent = Math.round(total.calories);
  elements.weekProtein.textContent = `${formatNumber(total.protein)} г`;
  elements.weekFat.textContent = `${formatNumber(total.fat)} г`;
  elements.weekCarbs.textContent = `${formatNumber(total.carbs)} г`;
}

function renderWeek() {
  const cookingDays = new Set(state.settings.cookingDays);

  elements.weekGrid.innerHTML = days
    .map((day) => {
      const dayEntries = state.menu.filter((entry) => entry.day === day.id);
      const total = sumNutrition(dayEntries);
      const mealMarkup = meals
        .map((meal) => {
          const entries = dayEntries.filter((entry) => entry.meal === meal.id);
          const content = entries.length
            ? entries.map(renderMenuEntry).join("")
            : '<p class="empty">Пока пусто</p>';
          return `
            <section class="meal-block">
              <div class="meal-title">${meal.title}</div>
              ${content}
            </section>
          `;
        })
        .join("");

      return `
        <article class="day-card ${cookingDays.has(day.id) ? "cooking-day" : ""}">
          <header class="day-head">
            <strong>${day.full}${cookingDays.has(day.id) ? "<em>готовка</em>" : ""}</strong>
            <div class="day-total">${Math.round(total.calories)} ккал · Б ${formatNumber(total.protein)} · Ж ${formatNumber(total.fat)} · У ${formatNumber(total.carbs)}</div>
          </header>
          ${mealMarkup}
        </article>
      `;
    })
    .join("");
}

function renderMenuEntry(entry) {
  const recipe = recipeById(entry.recipeId);
  if (!recipe) {
    return "";
  }

  const nutrition = nutritionForEntry(entry);
  const prepDay = entry.prepDay ? dayById(entry.prepDay) : null;
  const prepBadge = prepDay ? `<span class="badge gold">готово · ${prepDay.short}</span>` : "";

  return `
    <article class="entry-card">
      <div class="entry-title-row">
        <strong>${escapeHtml(recipe.title)}</strong>
        ${prepBadge}
      </div>
      <div class="entry-meta">${entry.servings} порц. · ${Math.round(nutrition.calories)} ккал · Б ${formatNumber(nutrition.protein)} · Ж ${formatNumber(nutrition.fat)} · У ${formatNumber(nutrition.carbs)}</div>
      <div class="entry-actions">
        <button class="tiny-button" type="button" data-action="toggle-prep" data-id="${entry.id}">${prepDay ? "Не готовить" : "Готовить"}</button>
        <button class="tiny-button danger" type="button" data-action="delete-entry" data-id="${entry.id}">Удалить</button>
      </div>
    </article>
  `;
}

function renderRecipes() {
  const prepared = preparedRecipeIds();
  elements.recipeList.innerHTML = state.recipes
    .map((recipe) => {
      const badge = prepared.has(recipe.id) ? '<span class="badge gold">готово</span>' : "";
      return `
        <article class="recipe-card">
          <div class="recipe-title-row">
            <strong>${escapeHtml(recipe.title)}</strong>
            ${badge}
          </div>
          <div class="recipe-meta">${escapeHtml(recipe.category || "Без категории")} · ${recipe.servings} порц. в рецепте</div>
          <div class="macro-line">${recipe.calories} ккал · Б ${recipe.protein} · Ж ${recipe.fat} · У ${recipe.carbs} на порцию</div>
          ${recipe.ingredients ? `<p>${escapeHtml(recipe.ingredients)}</p>` : ""}
          <div class="recipe-actions">
            <button class="tiny-button" type="button" data-action="edit-recipe" data-id="${recipe.id}">Править</button>
            <button class="tiny-button danger" type="button" data-action="delete-recipe" data-id="${recipe.id}">Удалить</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCookingDays() {
  const selected = new Set(state.settings.cookingDays);
  elements.cookingDays.innerHTML = days
    .map(
      (day) => `
        <button class="day-toggle ${selected.has(day.id) ? "active" : ""}" type="button" data-day="${day.id}">
          ${day.full}
        </button>
      `,
    )
    .join("");
}

function render() {
  renderSelectOptions();
  renderSummary();
  renderWeek();
  renderRecipes();
  renderCookingDays();
}

function resetRecipeForm() {
  elements.recipeForm.reset();
  elements.recipeId.value = "";
  elements.recipeServings.value = "1";
  elements.saveRecipeButton.textContent = "Сохранить рецепт";
  elements.cancelEditButton.hidden = true;
}

function editRecipe(id) {
  const recipe = recipeById(id);
  if (!recipe) {
    return;
  }

  elements.recipeId.value = recipe.id;
  elements.recipeTitle.value = recipe.title;
  elements.recipeServings.value = recipe.servings;
  elements.recipeCategory.value = recipe.category;
  elements.recipeCalories.value = recipe.calories;
  elements.recipeProtein.value = recipe.protein;
  elements.recipeFat.value = recipe.fat;
  elements.recipeCarbs.value = recipe.carbs;
  elements.recipeIngredients.value = recipe.ingredients;
  elements.recipeNotes.value = recipe.notes;
  elements.saveRecipeButton.textContent = "Обновить рецепт";
  elements.cancelEditButton.hidden = false;
  elements.recipeTitle.focus();
}

function saveRecipe(event) {
  event.preventDefault();

  const recipe = {
    id: elements.recipeId.value || createId(),
    title: elements.recipeTitle.value.trim(),
    servings: Number(elements.recipeServings.value) || 1,
    category: elements.recipeCategory.value.trim(),
    calories: Number(elements.recipeCalories.value) || 0,
    protein: Number(elements.recipeProtein.value) || 0,
    fat: Number(elements.recipeFat.value) || 0,
    carbs: Number(elements.recipeCarbs.value) || 0,
    ingredients: elements.recipeIngredients.value.trim(),
    notes: elements.recipeNotes.value.trim(),
  };

  if (!recipe.title) {
    return;
  }

  const existingIndex = state.recipes.findIndex((item) => item.id === recipe.id);
  if (existingIndex >= 0) {
    state.recipes[existingIndex] = recipe;
  } else {
    state.recipes.push(recipe);
  }

  persist();
  resetRecipeForm();
  render();
}

function addMenuEntry(event) {
  event.preventDefault();
  if (!state.recipes.length) {
    return;
  }

  state.menu.push({
    id: createId(),
    recipeId: elements.menuRecipe.value,
    day: elements.menuDay.value,
    meal: elements.menuMeal.value,
    servings: Number(elements.menuServings.value) || 1,
    prepDay: elements.menuPrepDay.value,
  });

  elements.menuServings.value = "1";
  persist();
  render();
}

function togglePrep(entryId) {
  const entry = state.menu.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  if (entry.prepDay) {
    entry.prepDay = "";
  } else {
    entry.prepDay = state.settings.cookingDays[0] || entry.day;
  }

  persist();
  render();
}

function deleteRecipe(id) {
  state.recipes = state.recipes.filter((recipe) => recipe.id !== id);
  state.menu = state.menu.filter((entry) => entry.recipeId !== id);
  persist();
  resetRecipeForm();
  render();
}

function deleteEntry(id) {
  state.menu = state.menu.filter((entry) => entry.id !== id);
  persist();
  render();
}

function toggleCookingDay(dayId) {
  const selected = new Set(state.settings.cookingDays);
  if (selected.has(dayId)) {
    selected.delete(dayId);
  } else {
    selected.add(dayId);
  }

  state.settings.cookingDays = days.map((day) => day.id).filter((id) => selected.has(id));
  state.menu = state.menu.map((entry) => ({
    ...entry,
    prepDay: state.settings.cookingDays.includes(entry.prepDay) ? entry.prepDay : "",
  }));

  persist();
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    elements.tabs.forEach((item) => item.classList.toggle("active", item === tab));
    elements.views.forEach((view) => view.classList.toggle("active", view.id === tab.dataset.view));
  });
});

elements.menuForm.addEventListener("submit", addMenuEntry);
elements.recipeForm.addEventListener("submit", saveRecipe);
elements.cancelEditButton.addEventListener("click", resetRecipeForm);

elements.resetMenuButton.addEventListener("click", () => {
  state.menu = [];
  persist();
  render();
});

elements.weekGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "delete-entry") {
    deleteEntry(button.dataset.id);
  }

  if (button.dataset.action === "toggle-prep") {
    togglePrep(button.dataset.id);
  }
});

elements.recipeList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "edit-recipe") {
    editRecipe(button.dataset.id);
  }

  if (button.dataset.action === "delete-recipe") {
    deleteRecipe(button.dataset.id);
  }
});

elements.cookingDays.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-day]");
  if (button) {
    toggleCookingDay(button.dataset.day);
  }
});

async function initializeApp() {
  state = await loadState();
  render();
}

initializeApp();
