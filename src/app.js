(() => {
  "use strict";

  const BASE_COLORS = ["#DCEBFA", "#DCEFEA", "#E2F1D5", "#FFF2C6", "#FBE4C8", "#F8D9D2", "#EADCF3"];
  const DEFAULT_CATEGORIES = [
    { name: "学习", color: BASE_COLORS[0] },
    { name: "工作", color: BASE_COLORS[2] },
    { name: "生活", color: BASE_COLORS[4] },
  ];
  const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const SLOT_COUNT = 48;
  const SLOT_HEIGHT = 30;

  // 彩带消失时间（毫秒）：数值越小，彩带越早消失；建议在 500–1800 之间调整。
  const CONFETTI_FADE_MS = {
    near: 1200,
    medium: 1150,
    far: 1050,
  };

  const $ = (selector) => document.querySelector(selector);
  const state = {
    weekStart: startOfWeek(new Date()),
    entries: [],
    categories: DEFAULT_CATEGORIES,
    colors: BASE_COLORS,
    selection: null,
    dragAnchor: null,
    editingEntryId: null,
    activityAutoFilled: false,
    editingCategory: null,
    selectedCategoryColor: BASE_COLORS[0],
    confettiEnabled: false,
  };

  async function api(path, options) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
    return payload;
  }

  function currentWeek() {
    return isoDate(state.weekStart);
  }

  async function loadWeek() {
    state.entries = await api(`/api/entries?week=${encodeURIComponent(currentWeek())}`);
  }

  async function saveWeek() {
    await api(`/api/entries?week=${encodeURIComponent(currentWeek())}`, {
      method: "PUT",
      body: JSON.stringify(state.entries),
    });
  }

  async function saveCategories(rename = null) {
    await api("/api/categories", {
      method: "PUT",
      body: JSON.stringify({ categories: state.categories, colors: state.colors, rename }),
    });
  }

  async function savePreferences() {
    await api("/api/preferences", {
      method: "PUT",
      body: JSON.stringify({ confettiEnabled: state.confettiEnabled }),
    });
  }

  function mergeColors(colors) {
    const valid = Array.isArray(colors) ? colors.map(normalizeHexColor).filter(Boolean) : [];
    return [...new Set([...BASE_COLORS, ...valid])];
  }

  function normalizeHexColor(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : null;
  }

  function pad(value) { return String(value).padStart(2, "0"); }
  function slotToTime(slot) { return `${pad(Math.floor(slot / 2))}:${slot % 2 ? "30" : "00"}`; }
  function timeToSlot(time) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 2 + (minute >= 30 ? 1 : 0);
  }
  function isoDate(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  function startOfWeek(date) {
    const value = new Date(date);
    const day = value.getDay() || 7;
    value.setDate(value.getDate() - day + 1);
    value.setHours(0, 0, 0, 0);
    return value;
  }
  function getDays() {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(state.weekStart);
      date.setDate(date.getDate() + index);
      return date;
    });
  }
  function dateLabel(date) { return `${date.getMonth() + 1}月${date.getDate()}日`; }
  function durationLabel(minutes) {
    const sign = minutes < 0 ? "-" : "";
    const abs = Math.abs(minutes);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    return `${sign}${hours ? `${hours}小时` : ""}${mins ? `${mins}分钟` : hours ? "" : "0分钟"}`;
  }
  function compactDurationLabel(slotCount) {
    const hours = slotCount / 2;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }
  function entryTimeLabel(startTime, endTime, slotCount) {
    return slotCount >= 2 ? `${startTime}–${endTime}（${compactDurationLabel(slotCount)}）` : "";
  }
  function categoryColor(name) {
    return state.categories.find((item) => item.name === name)?.color || "#E8EBEF";
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }
  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.hidden = true; }, 2400);
  }

  function clearSelectionCelebration() {
    if (showSelectionCelebration.active) {
      clearTimeout(showSelectionCelebration.active.cleanupTimer);
      showSelectionCelebration.active.element.remove();
      showSelectionCelebration.active = null;
    }
  }

  function showSelectionCelebration(x, y) {
    if (!state.confettiEnabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    clearSelectionCelebration();

    const celebration = document.createElement("div");
    celebration.className = "selection-celebration";
    celebration.style.left = `${x}px`;
    celebration.style.top = `${y}px`;

    const colors = ["#1F6B50", "#06D6A0", "#3A86FF", "#FFBE0B", "#FB5607", "#8338EC"];
    const particleCount = 26;
    const distanceTiers = [
      { name: "near", min: 72, range: 62, flight: 1200, fade: CONFETTI_FADE_MS.near },
      { name: "medium", min: 155, range: 85, flight: 1350, fade: CONFETTI_FADE_MS.medium },
      { name: "far", min: 270, range: 130, flight: 1500, fade: CONFETTI_FADE_MS.far },
    ];

    for (let index = 0; index < particleCount; index += 1) {
      const angle = (Math.PI * 2 * index / particleCount) + (Math.random() - 0.5) * 0.28;
      const tier = distanceTiers[index % distanceTiers.length];
      const distance = tier.min + Math.random() * tier.range;
      const piece = document.createElement("i");
      if (Math.random() > 0.58) piece.className = "is-dot";
      piece.dataset.distanceTier = tier.name;
      piece.style.setProperty("--confetti-color", colors[index % colors.length]);
      piece.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
      piece.style.setProperty("--burst-y", `${Math.sin(angle) * distance}px`);
      piece.style.setProperty("--spin", `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360)}deg`);
      // 消失时间较长时同步延长飞行，避免彩带停在终点后才消失。
      piece.style.setProperty("--flight-duration", `${Math.max(tier.flight, tier.fade)}ms`);
      piece.style.setProperty("--fade-duration", `${tier.fade}ms`);
      celebration.appendChild(piece);
    }

    document.body.appendChild(celebration);
    const active = { element: celebration, cleanupTimer: 0 };
    showSelectionCelebration.active = active;
    const cleanupDelay = Math.max(...distanceTiers.flatMap((tier) => [tier.flight, tier.fade])) + 100;
    active.cleanupTimer = window.setTimeout(() => {
      celebration.remove();
      if (showSelectionCelebration.active === active) showSelectionCelebration.active = null;
    }, cleanupDelay);
  }

  function entryActualMinutes(entry) {
    const baseMinutes = Math.max(timeToSlot(entry.endTime) - timeToSlot(entry.startTime), 0) * 30;
    return Math.max(baseMinutes + (Number(entry.timeAdjustment) || 0), 0);
  }

  function renderStats() {
    const totals = new Map();
    state.entries.forEach((entry) => {
      totals.set(entry.category, (totals.get(entry.category) || 0) + entryActualMinutes(entry));
    });

    const rows = [...totals.entries()]
      .filter(([, minutes]) => minutes > 0)
      .sort((left, right) => right[1] - left[1]);
    const totalMinutes = rows.reduce((sum, [, minutes]) => sum + minutes, 0);
    const chart = $("#stats-chart");
    $("#stats-summary").textContent = rows.length
      ? `已记录 ${durationLabel(totalMinutes)}`
      : "当前周还没有时间记录";

    if (!rows.length) {
      chart.innerHTML = '<div class="stats-empty">拖动上方时间格并保存记录后，这里会显示分类统计。</div>';
      return;
    }

    const maxMinutes = Math.max(...rows.map(([, minutes]) => minutes));
    chart.innerHTML = rows.map(([category, minutes]) => {
      const width = Math.max(minutes / maxMinutes * 100, 2);
      const color = categoryColor(category);
      return `<div class="stats-row">
        <div class="stats-label"><span><i style="background:${color}"></i>${escapeHtml(category)}</span><strong>${durationLabel(minutes)}</strong></div>
        <div class="stats-track" role="img" aria-label="${escapeHtml(category)}：${durationLabel(minutes)}">
          <div class="stats-bar" style="width:${width}%;background:${color}"></div>
        </div>
      </div>`;
    }).join("");
  }

  function renderDailyStats(days) {
    const today = isoDate(new Date());
    const dayIndexes = new Map(days.map((date, index) => [isoDate(date), index]));
    const totals = new Map(state.categories.map((category) => [category.name, Array(7).fill(0)]));

    state.entries.forEach((entry) => {
      const dayIndex = dayIndexes.get(entry.date);
      const categoryTotals = totals.get(entry.category);
      if (dayIndex === undefined || !categoryTotals) return;
      categoryTotals[dayIndex] += entryActualMinutes(entry);
    });

    let html = '<div class="daily-stats" role="table" aria-label="每日分类统计">';
    html += '<div class="daily-stats-corner" role="columnheader">每日统计</div>';
    days.forEach((date, day) => {
      const dateString = isoDate(date);
      html += `<div class="daily-stats-day ${dateString === today ? "is-today" : ""}" role="columnheader"><span>${WEEKDAYS[day]}</span><strong>${pad(date.getMonth() + 1)}/${pad(date.getDate())}</strong></div>`;
    });

    state.categories.forEach((category) => {
      const categoryTotals = totals.get(category.name);
      html += `<div class="daily-category-label" role="rowheader" title="${escapeHtml(category.name)}"><i style="background:${category.color}"></i><span>${escapeHtml(category.name)}</span></div>`;
      days.forEach((date, day) => {
        const minutes = categoryTotals[day];
        const dateString = isoDate(date);
        html += `<div class="daily-stat-value ${dateString === today ? "is-today" : ""} ${minutes ? "has-time" : "is-empty"}" role="cell" aria-label="${escapeHtml(category.name)}，${WEEKDAYS[day]}：${durationLabel(minutes)}">${minutes ? durationLabel(minutes) : "—"}</div>`;
      });
    });

    html += "</div>";
    return html;
  }

  function renderSheet() {
    const sheet = $("#sheet");
    const days = getDays();
    const today = isoDate(new Date());
    $("#week-label").textContent = `${dateLabel(days[0])} — ${dateLabel(days[6])}`;

    let html = '<div class="corner"><span>时间</span></div>';
    days.forEach((date, day) => {
      const dateString = isoDate(date);
      html += `<div class="day-heading ${dateString === today ? "is-today" : ""}"><span>${WEEKDAYS[day]}</span><strong>${pad(date.getMonth() + 1)}/${pad(date.getDate())}</strong></div>`;
    });
    html += '<div class="time-axis">';
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      html += `<div class="time-label">${slot % 2 === 0 ? slotToTime(slot) : ""}</div>`;
    }
    html += "</div>";

    days.forEach((date, day) => {
      const dateString = isoDate(date);
      html += `<div class="day-column ${dateString === today ? "is-today" : ""}" data-day="${day}">`;
      for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
        const selected = state.selection && state.selection.day === day && slot >= state.selection.start && slot <= state.selection.end;
        const selectionStart = selected && slot === state.selection.start;
        const selectionEnd = selected && slot === state.selection.end;
        html += `<button type="button" class="slot ${selected ? "selected" : ""} ${selectionStart ? "selection-start" : ""} ${selectionEnd ? "selection-end" : ""}" data-day="${day}" data-slot="${slot}" data-time="${slotToTime(slot)}" data-end-time="${slotToTime(slot + 1)}" data-range-time="${slotToTime(slot)}–${slotToTime(slot + 1)}" aria-label="${dateString} ${slotToTime(slot)}"></button>`;
      }
      state.entries.filter((entry) => entry.date === dateString).forEach((entry) => {
        const start = timeToSlot(entry.startTime);
        const end = timeToSlot(entry.endTime);
        const slotCount = Math.max(end - start, 1);
        const timeLabel = entryTimeLabel(entry.startTime, entry.endTime, slotCount);
        const adjustment = slotCount >= 2 && entry.timeAdjustment ? `<em>${entry.timeAdjustment > 0 ? "+" : ""}${entry.timeAdjustment} 分钟</em>` : "";
        const entryDescription = `${entry.activity} · ${entry.startTime}–${entry.endTime} · ${entry.category}`;
        html += `<article class="entry-block ${slotCount === 1 ? "is-single-slot" : "is-multi-slot"}" data-entry-id="${escapeHtml(entry.id)}" role="button" tabindex="0" aria-label="编辑记录：${escapeHtml(entryDescription)}" style="top:${start * SLOT_HEIGHT + 1}px;height:${Math.max(slotCount * SLOT_HEIGHT - 2, 28)}px;background-color:${categoryColor(entry.category)}" title="单击编辑 · ${escapeHtml(entryDescription)}"><strong>${escapeHtml(entry.activity)}</strong>${timeLabel ? `<span>${timeLabel}</span>` : ""}${adjustment}</article>`;
      });
      html += "</div>";
    });
    html += renderDailyStats(days);
    sheet.innerHTML = html;

    sheet.querySelectorAll(".slot").forEach((slot) => {
      slot.addEventListener("pointerdown", beginSelection);
    });
    sheet.querySelectorAll(".entry-block").forEach((block) => {
      block.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEntryEditor(block.dataset.entryId, event);
      });
      block.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openEntryEditor(block.dataset.entryId, event);
      });
    });
    renderStats();
  }

  function renderOverview() {
    const days = getDays();
    const today = isoDate(new Date());
    const grid = $("#overview-grid");

    let html = '<div class="overview-corner">时间</div>';
    days.forEach((date, day) => {
      const dateString = isoDate(date);
      html += `<div class="overview-day-head ${dateString === today ? "is-today" : ""}"><span>${WEEKDAYS[day]}</span><strong>${pad(date.getMonth() + 1)}/${pad(date.getDate())}</strong></div>`;
    });

    html += '<div class="overview-time-axis">';
    for (let hour = 0; hour <= 24; hour += 4) {
      html += `<span class="overview-time-label" style="top:${hour / 24 * 100}%">${pad(hour)}:00</span>`;
    }
    html += "</div>";

    const slotGrid = `<div class="overview-slot-grid" aria-hidden="true">${Array.from({ length: SLOT_COUNT }, (_, slot) => `<i class="${slot % 2 === 1 ? "is-hour-line" : ""}"></i>`).join("")}</div>`;

    days.forEach((date) => {
      const dateString = isoDate(date);
      html += `<div class="overview-day-column ${dateString === today ? "is-today" : ""}">${slotGrid}`;
      state.entries.filter((entry) => entry.date === dateString).forEach((entry) => {
        const start = timeToSlot(entry.startTime);
        const end = timeToSlot(entry.endTime);
        const slotCount = Math.max(end - start, 1);
        const top = start / SLOT_COUNT * 100;
        const height = slotCount / SLOT_COUNT * 100;
        const timeLabel = entryTimeLabel(entry.startTime, entry.endTime, slotCount);
        html += `<article class="overview-entry ${slotCount === 1 ? "is-single-slot" : "is-multi-slot"}" style="top:${top}%;height:${height}%;background-color:${categoryColor(entry.category)}" title="${escapeHtml(`${entry.activity} · ${entry.startTime}–${entry.endTime}`)}"><strong>${escapeHtml(entry.activity)}</strong>${timeLabel ? `<span>${timeLabel}</span>` : ""}</article>`;
      });
      html += "</div>";
    });
    grid.innerHTML = html;
  }

  function openOverview() {
    closeEntry();
    renderOverview();
    $("#overview-modal").hidden = false;
    document.body.classList.add("overview-open");
    $("#close-overview").focus();
  }

  function closeOverview() {
    $("#overview-modal").hidden = true;
    document.body.classList.remove("overview-open");
    $("#open-overview").focus();
  }

  function beginSelection(event) {
    event.preventDefault();
    const day = Number(event.currentTarget.dataset.day);
    const slot = Number(event.currentTarget.dataset.slot);
    closeEntry(false);
    state.dragAnchor = { day, slot };
    state.selection = { day, start: slot, end: slot };
    updateSelectionHighlight();
  }

  function extendSelection(event) {
    if (!state.dragAnchor || event.buttons !== 1) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".slot");
    if (!target) return;
    const day = Number(target.dataset.day);
    const slot = Number(target.dataset.slot);
    if (day !== state.dragAnchor.day) return;
    state.selection = { day, start: Math.min(state.dragAnchor.slot, slot), end: Math.max(state.dragAnchor.slot, slot) };
    updateSelectionHighlight();
  }

  function updateSelectionHighlight() {
    document.querySelectorAll(".slot").forEach((slot) => {
      const day = Number(slot.dataset.day);
      const index = Number(slot.dataset.slot);
      const selected = state.selection && state.selection.day === day && index >= state.selection.start && index <= state.selection.end;
      slot.classList.toggle("selected", Boolean(selected));
      slot.classList.toggle("selection-start", Boolean(selected && index === state.selection.start));
      slot.classList.toggle("selection-end", Boolean(selected && index === state.selection.end));
    });
  }

  function finishSelection(event) {
    if (!state.dragAnchor || !state.selection) return;
    state.dragAnchor = null;
    const popover = $("#entry-popover");
    const days = getDays();
    const selection = state.selection;
    $("#entry-date").textContent = `${dateLabel(days[selection.day])} · ${WEEKDAYS[selection.day]}`;
    $("#entry-title").textContent = `${slotToTime(selection.start)} — ${slotToTime(selection.end + 1)}`;
    $("#activity").value = "";
    state.activityAutoFilled = false;
    $("#adjustment").value = "0";
    $("#note").value = "";
    renderEntryCategories();
    applySleepActivityDefault();
    state.editingEntryId = null;
    $("#delete-entry").hidden = true;
    $("#save-entry").textContent = "保存记录";
    $(".form-actions").classList.remove("is-editing");
    updateActualDuration();
    popover.style.left = `${Math.max(16, Math.min(event.clientX + 18, window.innerWidth - 326))}px`;
    popover.style.top = `${Math.max(16, Math.min(event.clientY - 60, window.innerHeight - 536))}px`;
    popover.hidden = false;
    showSelectionCelebration(event.clientX, event.clientY);
    $("#activity").focus();
  }

  function openEntryEditor(entryId, event) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;
    const days = getDays();
    const day = days.findIndex((date) => isoDate(date) === entry.date);
    if (day < 0) return;

    closeEntry(false);
    const start = timeToSlot(entry.startTime);
    const end = Math.max(timeToSlot(entry.endTime) - 1, start);
    state.editingEntryId = entry.id;
    state.selection = { day, start, end };
    updateSelectionHighlight();

    $("#entry-date").textContent = `${dateLabel(days[day])} · ${WEEKDAYS[day]}`;
    $("#entry-title").textContent = `${entry.startTime} — ${entry.endTime}`;
    $("#activity").value = entry.activity;
    state.activityAutoFilled = false;
    $("#adjustment").value = String(Number(entry.timeAdjustment) || 0);
    $("#note").value = entry.note || "";
    renderEntryCategories();
    $("#entry-category").value = entry.category;
    $("#delete-entry").hidden = false;
    $("#save-entry").textContent = "保存修改";
    $(".form-actions").classList.add("is-editing");
    updateActualDuration();

    const popover = $("#entry-popover");
    const rect = event.currentTarget?.getBoundingClientRect?.();
    const anchorX = event.clientX || rect?.right || window.innerWidth / 2;
    const anchorY = event.clientY || rect?.top || window.innerHeight / 2;
    popover.style.left = `${Math.max(16, Math.min(anchorX + 18, window.innerWidth - 326))}px`;
    popover.style.top = `${Math.max(16, Math.min(anchorY - 60, window.innerHeight - 536))}px`;
    popover.hidden = false;
    $("#activity").focus();
  }

  function closeEntry(clearSelection = true) {
    $("#entry-popover").hidden = true;
    state.dragAnchor = null;
    state.editingEntryId = null;
    state.activityAutoFilled = false;
    $("#delete-entry").hidden = true;
    $("#save-entry").textContent = "保存记录";
    $(".form-actions").classList.remove("is-editing");
    if (clearSelection) {
      state.selection = null;
      renderSheet();
    }
  }

  function renderEntryCategories() {
    $("#entry-category").innerHTML = state.categories.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("");
  }

  function applySleepActivityDefault() {
    const activity = $("#activity");
    const isSleepCategory = $("#entry-category").value === "睡觉";
    if (isSleepCategory && !activity.value.trim()) {
      activity.value = "睡觉";
      state.activityAutoFilled = true;
    } else if (!isSleepCategory && state.activityAutoFilled) {
      activity.value = "";
      state.activityAutoFilled = false;
    }
  }

  function updateActualDuration() {
    if (!state.selection) return;
    const base = (state.selection.end - state.selection.start + 1) * 30;
    const adjustment = Number($("#adjustment").value) || 0;
    $("#actual-duration").textContent = `实际统计：${durationLabel(base + adjustment)}`;
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!state.selection) return;
    const activity = $("#activity").value.trim();
    const category = $("#entry-category").value;
    if (!activity || !category) return;
    const editingIndex = state.editingEntryId
      ? state.entries.findIndex((entry) => entry.id === state.editingEntryId)
      : -1;
    const originalEntry = editingIndex >= 0 ? state.entries[editingIndex] : null;
    const date = originalEntry?.date || isoDate(getDays()[state.selection.day]);
    const updatedEntry = {
      id: originalEntry?.id || `${date.replaceAll("-", "")}-${String(Date.now()).slice(-6)}`,
      date,
      startTime: originalEntry?.startTime || slotToTime(state.selection.start),
      endTime: originalEntry?.endTime || slotToTime(state.selection.end + 1),
      activity,
      category,
      timeAdjustment: Number($("#adjustment").value) || 0,
      note: $("#note").value.trim(),
    };
    if (editingIndex >= 0) state.entries[editingIndex] = updatedEntry;
    else state.entries.push(updatedEntry);
    try {
      await saveWeek();
      toast(editingIndex >= 0 ? `已更新：${activity}` : `已记录：${activity}`);
      closeEntry();
    } catch (error) {
      if (editingIndex >= 0) state.entries[editingIndex] = originalEntry;
      else state.entries.pop();
      toast(error.message);
    }
  }

  async function deleteEntry() {
    const entryIndex = state.entries.findIndex((entry) => entry.id === state.editingEntryId);
    if (entryIndex < 0) return;
    const entry = state.entries[entryIndex];
    if (!window.confirm(`确定删除“${entry.activity}”吗？删除后无法在工具内撤销。`)) return;
    state.entries.splice(entryIndex, 1);
    try {
      await saveWeek();
      toast(`已删除：${entry.activity}`);
      closeEntry();
    } catch (error) {
      state.entries.splice(entryIndex, 0, entry);
      toast(error.message);
    }
  }

  function renderCategories() {
    $("#category-list").innerHTML = state.categories.map((item) => `<button class="category-chip ${state.editingCategory === item.name ? "is-editing" : ""}" type="button" data-category="${escapeHtml(item.name)}" title="编辑分类"><i style="background:${item.color}"></i><span>${escapeHtml(item.name)}</span><b aria-hidden="true">编辑</b></button>`).join("");
    $("#category-list").querySelectorAll(".category-chip").forEach((button) => {
      button.addEventListener("click", () => editCategory(button.dataset.category));
    });
    renderSwatches();
  }

  function renderSwatches() {
    $("#swatches").innerHTML = state.colors.map((color) => `<button type="button" class="${color === state.selectedCategoryColor ? "active" : ""}" data-color="${color}" style="background:${color}" aria-label="选择颜色 ${color}" title="${color}"></button>`).join("") + '<button type="button" class="color-add-button" id="show-color-input" aria-label="添加新颜色" title="添加新颜色">＋</button>';
    $("#swatches").querySelectorAll("[data-color]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedCategoryColor = button.dataset.color;
        renderSwatches();
      });
    });
    $("#show-color-input").addEventListener("click", () => {
      $("#custom-color-row").hidden = !$("#custom-color-row").hidden;
      $("#color-error").textContent = "";
      if (!$("#custom-color-row").hidden) $("#custom-color").focus();
    });
  }

  function editCategory(name) {
    const item = state.categories.find((category) => category.name === name);
    if (!item) return;
    state.editingCategory = item.name;
    state.selectedCategoryColor = item.color;
    $("#category-name").value = item.name;
    $("#category-name-label").textContent = "分类名称";
    $("#save-category").textContent = "保存修改";
    $("#save-category").disabled = false;
    $("#cancel-category").hidden = false;
    $("#custom-color-row").hidden = true;
    renderCategories();
  }

  function resetCategoryForm() {
    state.editingCategory = null;
    state.selectedCategoryColor = state.colors[0];
    $("#category-name").value = "";
    $("#category-name-label").textContent = "新分类";
    $("#save-category").textContent = "添加分类";
    $("#save-category").disabled = true;
    $("#cancel-category").hidden = true;
    $("#custom-color-row").hidden = true;
    $("#color-error").textContent = "";
    renderCategories();
  }

  async function saveCategory(event) {
    event.preventDefault();
    const name = $("#category-name").value.trim();
    if (!name) return;
    if (state.categories.some((item) => item.name === name && item.name !== state.editingCategory)) {
      toast("分类名称已存在。");
      return;
    }
    let rename = null;
    if (state.editingCategory) {
      const oldName = state.editingCategory;
      state.categories = state.categories.map((item) => item.name === oldName ? { name, color: state.selectedCategoryColor } : item);
      if (oldName !== name) {
        state.entries = state.entries.map((entry) => entry.category === oldName ? { ...entry, category: name } : entry);
        rename = { from: oldName, to: name };
      }
      toast(`已更新分类：${name}`);
    } else {
      state.categories.push({ name, color: state.selectedCategoryColor });
      toast(`已添加分类：${name}`);
    }
    try {
      await saveCategories(rename);
      resetCategoryForm();
      renderSheet();
    } catch (error) {
      toast(error.message);
      await initialize();
    }
  }

  async function addCustomColor() {
    const normalized = normalizeHexColor($("#custom-color").value);
    if (!normalized) {
      $("#color-error").textContent = "请输入如 #A1B2C3 的六位颜色代码";
      return;
    }
    if (!state.colors.includes(normalized)) state.colors.push(normalized);
    state.selectedCategoryColor = normalized;
    $("#custom-color").value = "#";
    $("#custom-color-row").hidden = true;
    $("#color-error").textContent = "";
    try {
      await saveCategories();
      renderSwatches();
      toast(`已添加颜色：${normalized}`);
    } catch (error) {
      toast(error.message);
      await initialize();
    }
  }

  async function moveWeek(offset) {
    state.weekStart.setDate(state.weekStart.getDate() + offset * 7);
    state.selection = null;
    closeEntry(false);
    try {
      await loadWeek();
      renderSheet();
    } catch (error) {
      toast(error.message);
    }
  }

  async function updateConfettiPreference(event) {
    const previous = state.confettiEnabled;
    state.confettiEnabled = event.currentTarget.checked;
    if (!state.confettiEnabled) clearSelectionCelebration();
    try {
      await savePreferences();
    } catch (error) {
      state.confettiEnabled = previous;
      event.currentTarget.checked = previous;
      toast(error.message);
    }
  }

  $("#prev-week").addEventListener("click", () => moveWeek(-1));
  $("#next-week").addEventListener("click", () => moveWeek(1));
  $("#this-week").addEventListener("click", async () => { state.weekStart = startOfWeek(new Date()); await loadWeek(); renderSheet(); });
  $("#close-entry").addEventListener("click", () => closeEntry());
  $("#cancel-entry").addEventListener("click", () => closeEntry());
  $("#delete-entry").addEventListener("click", deleteEntry);
  $("#entry-form").addEventListener("submit", saveEntry);
  $("#activity").addEventListener("input", () => { state.activityAutoFilled = false; });
  $("#entry-category").addEventListener("change", applySleepActivityDefault);
  $("#adjustment").addEventListener("input", updateActualDuration);
  $("#minus-adjustment").addEventListener("click", () => { $("#adjustment").value = String((Number($("#adjustment").value) || 0) - 5); updateActualDuration(); });
  $("#plus-adjustment").addEventListener("click", () => { $("#adjustment").value = String((Number($("#adjustment").value) || 0) + 5); updateActualDuration(); });
  $("#category-name").addEventListener("input", () => { $("#save-category").disabled = !$("#category-name").value.trim(); });
  $("#category-form").addEventListener("submit", saveCategory);
  $("#cancel-category").addEventListener("click", resetCategoryForm);
  $("#add-custom-color").addEventListener("click", addCustomColor);
  $("#custom-color").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addCustomColor(); } });
  $("#open-overview").addEventListener("click", openOverview);
  $("#confetti-toggle").addEventListener("change", updateConfettiPreference);
  $("#close-overview").addEventListener("click", closeOverview);
  $("#overview-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeOverview(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#overview-modal").hidden) closeOverview(); });
  document.addEventListener("pointermove", extendSelection);
  document.addEventListener("pointerup", finishSelection);

  async function initialize() {
    try {
      const [settings, preferences] = await Promise.all([
        api("/api/categories"),
        api("/api/preferences"),
      ]);
      state.categories = Array.isArray(settings.categories) ? settings.categories : DEFAULT_CATEGORIES;
      state.colors = mergeColors(settings.colors);
      state.selectedCategoryColor = state.colors[0];
      state.confettiEnabled = preferences.confettiEnabled === true;
      $("#confetti-toggle").checked = state.confettiEnabled;
      await loadWeek();
      renderSheet();
      renderCategories();
    } catch (error) {
      const message = document.createElement("div");
      message.className = "startup-error";
      message.textContent = "无法连接本地数据服务。请关闭此页面，然后双击 start.bat 启动工具。";
      document.body.prepend(message);
      toast(error.message);
    }
  }

  initialize();
})();
