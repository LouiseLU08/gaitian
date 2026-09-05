const state = {
  room: null,
  roomCode: parseRoomCode(),
  route: parseRoute(),
  create: defaultCreate(),
  editor: { availability: {}, activeDate: null },
  myNickname: "",
  myMemberCode: "",
  myMemberNo: 0,
  identityDraft: { nickname: "", memberCode: "", mode: "join" },
  identityState: "loading",
  publicBaseUrl: "",
  modal: null,
  toast: "",
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const TIME_VALUES = Array.from({ length: 49 }, (_, index) => index * 30);
const COLOR_LABELS = {
  "light-blue": "浅蓝",
  blue: "蓝色",
  "deep-blue": "深蓝",
  "light-green": "浅绿",
  green: "绿色",
  "deep-green": "深绿",
  "light-orange": "浅橙",
  orange: "橙色",
  "deep-orange": "深橙",
  "light-red": "浅红",
  red: "红色",
  "deep-red": "深红",
  "light-purple": "浅紫",
  purple: "紫色",
  "deep-purple": "深紫",
  "light-pink": "浅粉",
  pink: "粉色",
  "deep-pink": "深粉",
  "light-teal": "浅青",
  teal: "青色",
  "deep-teal": "深青",
  "light-gray": "浅灰",
  gray: "灰色",
  "deep-gray": "深灰",
};
const PRESETS = [
  { key: "full", label: "整天", start: "00:00", end: "24:00" },
  { key: "morning", label: "上午", start: "08:00", end: "12:00" },
  { key: "afternoon", label: "下午", start: "13:00", end: "18:00" },
  { key: "evening", label: "晚上", start: "19:00", end: "23:00" },
];

function parseRoomCode() {
  const match = location.pathname.match(/\/r\/([A-Z0-9]+)/);
  return match ? match[1] : "";
}

function parseRoute() {
  if (parseRoomCode()) {
    return "room";
  }
  // 首页及任何非房间链接都从“创建房间 / 房间码”入口开始。
  return "home";
}

function storageKey() {
  return state.roomCode
    ? `yueshijian_identity_${state.roomCode}`
    : "yueshijian_identity";
}

function loadMyIdentity() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      state.myNickname = parsed.nickname || "";
      state.myMemberCode = parsed.memberCode || "";
      state.myMemberNo = Number(parsed.memberNo || 0);
    } else {
      const legacy = localStorage.getItem(
        state.roomCode ? `yueshijian_nickname_${state.roomCode}` : "yueshijian_nickname"
      );
      if (legacy) {
        state.myNickname = legacy;
        state.myMemberCode = "";
      }
    }
  } catch (_) {
    state.myNickname = "";
    state.myMemberCode = "";
  }
}

function saveMyIdentity(code = state.roomCode) {
  try {
    if (code && state.myNickname && state.myMemberCode) {
      localStorage.setItem(
        `yueshijian_identity_${code}`,
        JSON.stringify({
          nickname: state.myNickname,
          memberCode: state.myMemberCode,
          memberNo: state.myMemberNo,
        })
      );
    }
  } catch (_) {
    // ignore storage errors
  }
}

function clearMyIdentity(roomKey = state.roomCode) {
  try {
    if (roomKey) {
      localStorage.removeItem(`yueshijian_identity_${roomKey}`);
    }
  } catch (_) {
    // ignore storage errors
  }
}

function defaultCreate() {
  const today = todayKey();
  return {
    topic: "",
    participantCount: 4,
    nickname: "",
    startDate: today,
    endDate: addDaysKey(today, 6),
    deadlineTime: "24:00",
  };
}

function todayKey() {
  return toKey(new Date());
}

function toKey(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDaysKey(key, days) {
  const dateValue = fromKey(key);
  dateValue.setDate(dateValue.getDate() + days);
  return toKey(dateValue);
}

function listDates(startKey, endKey) {
  const result = [];
  let current = fromKey(startKey);
  const end = fromKey(endKey);
  while (current <= end) {
    result.push(toKey(current));
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function formatDate(key, includeYear = false) {
  const dateValue = fromKey(key);
  const prefix = includeYear ? `${dateValue.getFullYear()}年` : "";
  return `${prefix}${dateValue.getMonth() + 1}月${dateValue.getDate()}日 ${WEEKDAYS[dateValue.getDay()]}`;
}

function formatRange(startKey, endKey) {
  if (startKey === endKey) {
    return formatDate(startKey, true);
  }
  return `${formatDate(startKey, true)} 至 ${formatDate(endKey)}`;
}

function formatTimeLabel(minutes) {
  if (minutes === 1440) {
    return "24:00";
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function durationText(minutes) {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseError(error) {
  if (error && typeof error === "object" && error.error) {
    return error.error;
  }
  return "请求没有成功，请稍后再试";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseError(data));
  }
  return data;
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true);
  }
  return new Promise((resolve) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    resolve(copied);
  });
}

function showToast(message) {
  state.toast = message;
  render();
  if (message) {
    window.setTimeout(() => {
      if (state.toast === message) {
        state.toast = "";
        render();
      }
    }, 3200);
  }
}

function roomShareUrl(code) {
  const base = state.publicBaseUrl || location.origin;
  return `${base}/r/${code}`;
}

function statusMeta(status) {
  const map = {
    filling: { label: "填写中", className: "chip-blue" },
    deciding: { label: "待选择", className: "chip-green" },
    coordinating: { label: "协调中", className: "chip-amber" },
    need_round: { label: "需新一轮", className: "chip-red" },
    scheduled: { label: "已确定", className: "chip-green" },
  };
  return map[status] || { label: status, className: "chip-blue" };
}

function participantName(room = state.room) {
  const matchNo = state.myMemberNo;
  if (!state.myMemberNo && !state.myMemberCode) {
    return undefined;
  }
  return (room.participants || []).find(
    (item) =>
      (matchNo && item.memberNo === matchNo) ||
      (!matchNo && item.nickname === state.myNickname)
  );
}

function currentAvailability() {
  return state.editor.availability || {};
}

function currentDates() {
  if (state.roomCode && state.room) {
    return [state.room.startDate, state.room.endDate];
  }
  return [state.create.startDate, state.create.endDate];
}

function availabilityToList() {
  const result = [];
  const [startDate, endDate] = currentDates();
  for (const itemDate of listDates(startDate, endDate)) {
    for (const slot of currentAvailability()[itemDate] || []) {
      result.push({ date: itemDate, start: slot.start, end: slot.end });
    }
  }
  return result;
}

function minutesValue(text) {
  const [hours, minutes] = text.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizeDaySlots(slots) {
  const parsed = (slots || [])
    .map((slot) => ({
      start: minutesValue(slot.start),
      end: minutesValue(slot.end),
    }))
    .filter((slot) => slot.end > slot.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const slot of parsed) {
    if (merged.length && slot.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, slot.end);
    } else {
      merged.push({ ...slot });
    }
  }
  return merged.map((slot) => ({
    start: formatTimeLabel(slot.start),
    end: formatTimeLabel(slot.end),
  }));
}

function setDaySlots(itemDate, slots) {
  const normalized = normalizeDaySlots(slots);
  if (normalized.length) {
    currentAvailability()[itemDate] = normalized;
  } else {
    delete currentAvailability()[itemDate];
  }
}

function daySlotsFor(itemDate) {
  return currentAvailability()[itemDate] || [];
}

function slotCovers(daySlots, startMin, endMin) {
  return daySlots.some(
    (slot) =>
      minutesValue(slot.start) <= startMin && endMin <= minutesValue(slot.end)
  );
}

function addRange(itemDate, startMin, endMin) {
  const slots = daySlotsFor(itemDate).map((slot) => ({
    start: minutesValue(slot.start),
    end: minutesValue(slot.end),
  }));
  slots.push({ start: startMin, end: endMin });
  setDaySlots(itemDate, slots.map((slot) => ({
    start: formatTimeLabel(slot.start),
    end: formatTimeLabel(slot.end),
  })));
}

function removeRange(itemDate, startMin, endMin) {
  const result = [];
  for (const slot of daySlotsFor(itemDate)) {
    const slotStart = minutesValue(slot.start);
    const slotEnd = minutesValue(slot.end);
    if (endMin <= slotStart || startMin >= slotEnd) {
      result.push({ start: slotStart, end: slotEnd });
      continue;
    }
    if (slotStart < startMin) {
      result.push({ start: slotStart, end: startMin });
    }
    if (slotEnd > endMin) {
      result.push({ start: endMin, end: slotEnd });
    }
  }
  setDaySlots(itemDate, result.map((slot) => ({
    start: formatTimeLabel(slot.start),
    end: formatTimeLabel(slot.end),
  })));
}

function setRangeSelection(itemDate, startMin, endMin, selected) {
  if (selected) {
    addRange(itemDate, startMin, endMin);
  } else {
    removeRange(itemDate, startMin, endMin);
  }
}

function currentDeadline() {
  if (state.roomCode && state.room) {
    return {
      date: state.room.endDate,
      time: state.room.endTime || "24:00",
    };
  }
  return {
    date: state.create.endDate,
    time: state.create.deadlineTime || "24:00",
  };
}

function deadlineEndMinute(itemDate) {
  const deadline = currentDeadline();
  if (itemDate === deadline.date) {
    return Math.max(0, Math.min(24 * 60, minutesValue(deadline.time)));
  }
  return 24 * 60;
}

function cellTimesForDate(itemDate) {
  const end = deadlineEndMinute(itemDate);
  const result = [];
  for (let minutes = 0; minutes < end; minutes += 30) {
    result.push(formatTimeLabel(minutes));
  }
  return result;
}

function cellSelected(itemDate, timeText) {
  const start = minutesValue(timeText);
  return slotCovers(daySlotsFor(itemDate), start, start + 30);
}

function toggleTimeCell(itemDate, timeText) {
  const start = minutesValue(timeText);
  const end = start + 30;
  if (cellSelected(itemDate, timeText)) {
    removeRange(itemDate, start, end);
  } else {
    addRange(itemDate, start, end);
  }
  render();
}

function rangeFullySelected(itemDate, startMin, endMin) {
  for (let minutes = startMin; minutes < endMin; minutes += 30) {
    if (!cellSelected(itemDate, formatTimeLabel(minutes))) {
      return false;
    }
  }
  return true;
}

function toggleRangeForDate(itemDate, key) {
  const end = deadlineEndMinute(itemDate);
  if (key === "clear") {
    removeRange(itemDate, 0, end);
    render();
    return;
  }
  const presets = {
    full: [0, end],
    morning: [8 * 60, Math.min(12 * 60, end)],
    afternoon: [13 * 60, Math.min(18 * 60, end)],
    evening: [19 * 60, end],
  };
  const range = presets[key];
  if (!range || range[1] <= range[0]) {
    return;
  }
  if (rangeFullySelected(itemDate, range[0], range[1])) {
    removeRange(itemDate, range[0], range[1]);
  } else {
    addRange(itemDate, range[0], range[1]);
  }
  render();
}

function toggleDateCategory(key) {
  const [startDate, endDate] = currentDates();
  const allDates = listDates(startDate, endDate);
  const qualifying = allDates.filter((itemDate) => {
    const weekday = fromKey(itemDate).getDay();
    if (key === "weekend") {
      return weekday === 0 || weekday === 6;
    }
    if (key === "workday") {
      return weekday >= 1 && weekday <= 5;
    }
    return false;
  });
  if (!qualifying.length) {
    return;
  }
  const allFull = qualifying.every((itemDate) => {
    const end = deadlineEndMinute(itemDate);
    return rangeFullySelected(itemDate, 0, end);
  });
  for (const itemDate of qualifying) {
    const end = deadlineEndMinute(itemDate);
    if (allFull) {
      removeRange(itemDate, 0, end);
    } else {
      addRange(itemDate, 0, end);
    }
  }
  render();
}

function clearAvailabilityAll() {
  state.editor.availability = {};
  render();
}

function activeCalendarDate() {
  const [startDate, endDate] = currentDates();
  const dates = listDates(startDate, endDate);
  if (dates.includes(state.editor.activeDate)) {
    return state.editor.activeDate;
  }
  return dates[0] || "";
}

function prunePastDeadline() {
  const deadline = currentDeadline();
  const end = minutesValue(deadline.time);
  if (end < 24 * 60 && daySlotsFor(deadline.date).length) {
    removeRange(deadline.date, end, 24 * 60);
  }
}

function totalSelectedCells() {
  let minutes = 0;
  for (const itemDate of Object.values(currentAvailability())) {
    for (const slot of itemDate) {
      minutes += minutesValue(slot.end) - minutesValue(slot.start);
    }
  }
  return Math.round(minutes / 30);
}

function setDateRange(startKey, endKey) {
  if (state.roomCode) {
    return;
  }
  if (startKey > endKey) {
    endKey = startKey;
  }
  state.create.startDate = startKey;
  state.create.endDate = endKey;
  const allowed = new Set(listDates(startKey, endKey));
  for (const itemDate of Object.keys(state.editor.availability)) {
    if (!allowed.has(itemDate)) {
      delete state.editor.availability[itemDate];
    }
  }
  state.editor.activeDate = startKey;
  prunePastDeadline();
  render();
}

function selectOptions(kind, selectedValue = "") {
  const values = kind === "start" ? TIME_VALUES.slice(0, -1) : TIME_VALUES.slice(1);
  return values
    .map((minutes) => {
      const text = formatTimeLabel(minutes);
      const selected = text === selectedValue ? " selected" : "";
      return `<option value="${text}"${selected}>${text}</option>`;
    })
    .join("");
}

function editorMarkup() {
  const [startDate, endDate] = currentDates();
  if (!startDate || !endDate || startDate > endDate) {
    return `<div class="empty-hint">请先选择 DDL</div>`;
  }
  const dates = listDates(startDate, endDate);
  const activeDate = activeCalendarDate();
  const cells = cellTimesForDate(activeDate);
  const selected = totalSelectedCells();
  return `
    <div class="calendar-toolbar">
      <div class="calendar-status">已选 ${selected} 个 30 分钟</div>
    </div>
    <div class="calendar-date-row">
      ${dates
        .map(
          (itemDate) => `
            <button
              class="calendar-date-chip ${itemDate === activeDate ? "active" : ""}"
              data-action="select-date"
              data-date="${itemDate}"
            >
              <span class="date-chip-day">${esc(formatShortDate(itemDate))}</span>
              <span class="date-chip-week">${esc(formatWeekday(itemDate))}</span>
            </button>
          `
        )
        .join("")}
    </div>
    <div class="calendar-day-toolbar">
      <div class="calendar-day-title">${esc(formatDate(activeDate))}</div>
      <div class="quick-btn-group">
        <button class="btn btn-sm btn-soft" data-action="toggle-day-range" data-date="${activeDate}" data-key="full">整天</button>
        <button class="btn btn-sm btn-ghost btn-time-range" data-action="toggle-day-range" data-date="${activeDate}" data-key="morning">
          <span class="quick-btn-label">上午</span>
          <span class="quick-btn-note">08:00-12:00</span>
        </button>
        <button class="btn btn-sm btn-ghost btn-time-range" data-action="toggle-day-range" data-date="${activeDate}" data-key="afternoon">
          <span class="quick-btn-label">下午</span>
          <span class="quick-btn-note">13:00-18:00</span>
        </button>
        <button class="btn btn-sm btn-ghost btn-time-range" data-action="toggle-day-range" data-date="${activeDate}" data-key="evening">
          <span class="quick-btn-label">晚上</span>
          <span class="quick-btn-note">19:00-23:00</span>
        </button>
        <button class="btn btn-sm btn-ghost" data-action="toggle-day-range" data-date="${activeDate}" data-key="clear">清空当天</button>
        <button class="btn btn-sm btn-ghost" data-action="toggle-date-category" data-key="weekend">周末</button>
        <button class="btn btn-sm btn-ghost" data-action="toggle-date-category" data-key="workday">工作日</button>
      </div>
    </div>
    <div class="time-cell-grid">
      ${cells
        .map((timeText) => {
          const selectedCell = cellSelected(activeDate, timeText);
          return `
            <button
              class="time-slot ${selectedCell ? "on" : ""}"
              data-action="toggle-time"
              data-date="${activeDate}"
              data-time="${timeText}"
              aria-pressed="${selectedCell}"
            >
              ${esc(timeText)} - ${esc(formatTimeLabel(minutesValue(timeText) + 30))}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function formatShortDate(key) {
  const dateValue = fromKey(key);
  return `${dateValue.getMonth() + 1}/${dateValue.getDate()}`;
}

function formatWeekday(key) {
  return WEEKDAYS[fromKey(key).getDay()];
}

function nicknameInputMarkup(placeholder = "你的昵称") {
  return `
    <div class="field">
      <label for="nickname">昵称</label>
      <input id="nickname" value="${esc(state.myNickname)}" data-model="myNickname" placeholder="${esc(placeholder)}" maxlength="20">
    </div>
  `;
}

function roomMetaMarkup(room) {
  const status = statusMeta(room.status);
  return `
    <div class="room-head">
      <div>
        <div class="room-meta">房间码 ${room.code}</div>
        <h1 class="room-title">${esc(room.topic)}</h1>
        <div class="room-meta">由 <strong>${esc(room.creator)}</strong> 发起 · 第 ${room.round} 轮</div>
      </div>
      <div class="room-actions">
        <span class="chip ${status.className}">${status.label}</span>
        <button class="btn btn-sm btn-ghost" data-action="copy-link">复制链接</button>
        <button class="btn btn-sm btn-ghost" data-action="copy-code">复制房间码</button>
        ${
          state.myNickname === room.creator && state.myMemberCode
            ? `<button class="btn btn-sm btn-ghost" data-action="open-member-codes">成员访问码</button>`
            : ""
        }
        ${
          room.status === "need_round" && state.myNickname === room.creator
            ? `<button class="btn btn-sm btn-amber" data-action="open-new-round">发起新一轮</button>`
            : ""
        }
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-cell">
        <span class="k">参与人数</span>
        <span class="v">${room.filledCount} / ${room.participantCount}</span>
      </div>
      <div class="meta-cell">
        <span class="k">约定截止</span>
        <span class="v">${esc(formatDate(room.endDate, true))} ${esc(room.endTime || "24:00")}</span>
      </div>
      <div class="meta-cell">
        <span class="k">DDL</span>
        <span class="v">${esc(formatDate(room.endDate, true))}</span>
      </div>
      <div class="meta-cell">
        <span class="k">创建者</span>
        <span class="v">${esc(room.creator)}</span>
      </div>
    </div>
  `;
}

function shareCodeMarkup(room) {
  return `
    <div class="code-box">
      <div>
        <div class="small muted">房间码</div>
        <div class="code-value">${room.code}</div>
      </div>
      <div class="share-line">
        <div class="small muted">房间链接</div>
        ${esc(roomShareUrl(room.code))}
      </div>
      <button class="btn btn-blue" data-action="copy-link">复制链接</button>
    </div>
  `;
}

function participantsMarkup(room) {
  const list = room.participants || [];
  return `
    <div class="section">
      <div class="section-title">参与者</div>
      <div class="tool-panel panel-pad">
        ${
          list.length
            ? list
                .map((participant) => {
                  const isMe =
                    (state.myMemberNo && participant.memberNo === state.myMemberNo) ||
                    participant.nickname === state.myNickname;
                  const slotCount = participant.availability.length;
                  return `
                    <div class="participant-row">
                      <span class="avatar avatar-${esc(participant.color || "gray")}">${esc(
                        participant.nickname.slice(0, 1)
                      )}</span>
                      <div>
                        <div class="participant-name">
                          ${esc(participant.nickname)} <span class="member-tag">#${participant.memberNo} ${esc(
                            COLOR_LABELS[participant.color] || participant.color || ""
                          )}</span>
                          ${participant.isCreator ? '<span class="chip chip-green">发起人</span>' : ""}
                          ${isMe ? '<span class="chip chip-blue">我</span>' : ""}
                        </div>
                      </div>
                      <div class="spacer"></div>
                      <div class="participant-detail">
                        ${
                          participant.filled
                            ? `已填写 ${slotCount} 段空闲`
                            : "等待填写"
                        }
                      </div>
                    </div>
                  `;
                })
                .join("")
            : `<div class="empty-hint">等待其他人通过链接加入</div>`
        }
      </div>
    </div>
  `;
}

function myScheduleFormMarkup(room) {
  const me = participantName(room);
  const endDate = currentDates()[1];
  const showSubmit = !room.chosen;
  const countLabel = room.filledCount < room.participantCount ? "填写我的时间" : "更新我的时间";
  return `
    <div class="section">
      <div class="slots-head">
        <div>
          <div class="section-title">${countLabel}</div>
        </div>
      </div>
      <div class="tool-panel panel-pad">
        <div class="member-card">
          <span class="avatar avatar-${esc(me ? me.color : "gray")}">${esc(
            (state.myNickname || "?").slice(0, 1)
          )}</span>
          <div>
            <div class="participant-name">
              ${esc(state.myNickname)}
              ${me ? `<span class="chip chip-blue">#${me.memberNo} ${esc(COLOR_LABELS[me.color] || me.color)}</span>` : ""}
            </div>
            <div class="small muted">我的访问码：${esc(state.myMemberCode)}</div>
          </div>
          <div class="spacer"></div>
          <button class="btn btn-sm btn-ghost" data-action="copy-member-code">复制访问码</button>
        </div>
        <div class="grid-2">
          <div class="field">
            <label>DDL</label>
            <div class="muted small">${esc(formatDate(endDate, true))} ${esc(room.endTime || "24:00")}</div>
          </div>
          <div class="field">
            <label>换设备</label>
            <div class="muted small">用昵称 + 访问码即可恢复身份</div>
          </div>
        </div>
        ${editorMarkup()}
        ${
          me && me.filled
            ? `<div class="alert alert-info mt-8">已收到 ${esc(me.nickname)} 的时间</div>`
            : ""
        }
        ${
          showSubmit
            ? `<button class="btn btn-primary btn-block mt-8" data-action="respond">确认我的时间</button>`
            : ""
        }
      </div>
    </div>
  `;
}

function planMarkup(plan, room, extraClass = "") {
  return `
    <div class="plan-card ${extraClass}">
      <div class="plan-time">
        <div class="plan-date">${esc(formatDate(plan.date))}</div>
        <div class="plan-range">${esc(plan.start)} - ${esc(plan.end)}</div>
      </div>
      <div class="plan-detail">
        <div>${esc(durationText(plan.minutes))} · ${plan.availableCount}/${room.participantCount} 人可到</div>
        ${
          plan.unavailable && plan.unavailable.length
            ? `<div class="small muted">差 ${esc(plan.unavailable.join("、"))}</div>`
            : `<div class="small muted">全员可到</div>`
        }
      </div>
      <div class="plan-actions"></div>
    </div>
  `;
}

function renderApp() {
  const app = document.getElementById("app");
  if (state.roomCode && !state.room) {
    app.innerHTML = `<div class="loading">正在读取房间…</div>`;
    return;
  }
  if (state.roomCode) {
    if (state.identityState === "loading") {
      app.innerHTML = `<div class="loading">正在读取房间…</div>`;
      return;
    }
    if (state.identityState === "needed") {
      app.innerHTML = identifyPageMarkup(state.room);
      return;
    }
    app.innerHTML = roomMarkup(state.room);
    return;
  }
  if (state.route === "create") {
    app.innerHTML = createPageMarkup();
    return;
  }
  if (state.route === "join") {
    app.innerHTML = joinPageMarkup();
    return;
  }
  app.innerHTML = landingMarkup();
}

function peopleLogoMarkup(size = 34) {
  return `
    <svg class="people-logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#e85d04"/>
      <g fill="#ffffff">
        <circle cx="32" cy="15" r="4.3"/>
        <rect x="26.5" y="24" width="11" height="17" rx="5.5"/>
        <circle cx="18" cy="29" r="3.4"/>
        <rect x="13" y="37" width="10" height="15" rx="5"/>
        <circle cx="46" cy="29" r="3.4"/>
        <rect x="41" y="37" width="10" height="15" rx="5"/>
      </g>
    </svg>
  `;
}

function topbarMarkup(showBack = false) {
  return `
    <div class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="/">${peopleLogoMarkup(30)}<span>改天见</span></a>
        ${
          showBack
            ? `<a class="btn btn-sm btn-ghost" href="/">返回</a>`
            : ""
        }
      </div>
    </div>
  `;
}

function landingMarkup() {
  return `
    <main class="landing">
      <div class="landing-inner">
        <div class="landing-logo">${peopleLogoMarkup(96)}</div>
        <h1 class="landing-name">改天见</h1>
        <p class="landing-tagline">改天？哪一天？就这天！</p>
        <div class="landing-options">
          <button class="landing-option" data-action="go-create">
            <span class="landing-option-title">创建房间</span>
            <span class="landing-option-desc">发起约定并邀请朋友</span>
          </button>
          <button class="landing-option" data-action="go-join">
            <span class="landing-option-title">房间码</span>
            <span class="landing-option-desc">输入房间码加入约定</span>
          </button>
        </div>
        <p class="landing-foot">约饭、开会、游戏，都可以</p>
      </div>
      ${toastMarkup()}
    </main>
  `;
}

function joinPageMarkup() {
  return `
    ${topbarMarkup(true)}
    <main class="join-page">
      <div class="tool-panel panel-pad join-card">
        <div class="join-logo">${peopleLogoMarkup(52)}</div>
        <h1>加入房间</h1>
        <div class="field">
          <label for="room-code">房间码</label>
          <input id="room-code" data-room-join maxlength="6" placeholder="6 位房间码" autocomplete="off">
        </div>
        <button class="btn btn-primary btn-block" data-action="join-room">进入房间</button>
      </div>
      ${toastMarkup()}
    </main>
  `;
}

function identifyPageMarkup(room) {
  const draft = state.identityDraft;
  const returning = draft.mode === "return";
  return `
    ${topbarMarkup(true)}
    <main class="join-page">
      <div class="tool-panel panel-pad join-card">
        <div class="join-logo">${peopleLogoMarkup(52)}</div>
        <h1>进入房间</h1>
        <div class="room-meta">${esc(room.topic)} · 房间码 ${room.code}</div>
        <div class="alert alert-info mt-8">已有 ${room.filledCount} / ${room.participantCount} 人填写时间</div>
        <div class="quick-btn-group mt-8">
          <button class="btn btn-sm ${returning ? "btn-ghost" : "btn-soft"}" data-action="identity-mode" data-mode="join">首次加入</button>
          <button class="btn btn-sm ${returning ? "btn-soft" : "btn-ghost"}" data-action="identity-mode" data-mode="return">找回身份</button>
        </div>
        <div class="field">
          <label for="identity-nickname">你的昵称</label>
          <input id="identity-nickname" value="${esc(draft.nickname || state.myNickname)}" data-model="identityNickname" maxlength="20" placeholder="昵称">
        </div>
        ${
          returning
            ? `<div class="field">
                <label for="identity-code">成员访问码</label>
                <input id="identity-code" value="${esc(draft.memberCode)}" data-model="identityMemberCode" maxlength="6" placeholder="6 位访问码">
              </div>
              <div class="small muted">访问码可在发起人的成员列表里找回</div>`
            : `<div class="small muted">首次加入会自动分配颜色、编号和访问码</div>`
        }
        <button class="btn btn-primary btn-block mt-8" data-action="identify-submit">${returning ? "恢复我的身份" : "加入房间"}</button>
      </div>
      ${toastMarkup()}
    </main>
  `;
}

function roomMarkup(room) {
  const isScheduled = Boolean(room.chosen);
  const bodyParts = [];
  bodyParts.push(roomMetaMarkup(room));
  bodyParts.push(shareCodeMarkup(room));
  bodyParts.push(participantsMarkup(room));

  if (isScheduled) {
    bodyParts.push(chosenMarkup(room));
  } else {
    if (room.status === "filling") {
      bodyParts.push(`<div class="alert alert-info">已有 ${room.filledCount} / ${room.participantCount} 人填写时间</div>`);
    }
    if (!isScheduled) {
      bodyParts.push(myScheduleFormMarkup(room));
    }
    if (room.status === "deciding") {
      bodyParts.push(decidingMarkup(room));
    }
    if (room.status === "coordinating" || room.status === "need_round") {
      bodyParts.push(coordinatingMarkup(room));
    }
  }

  return `
    ${topbarMarkup()}
    <div class="container">
      ${bodyParts.join("")}
      ${toastMarkup()}
      ${modalMarkup()}
    </div>
  `;
}

function createPageMarkup() {
  const create = state.create;
  const presets = datePresetsMarkup();
  const canCreate = availabilityToList().length > 0;
  return `
    ${topbarMarkup(true)}
    <main class="container">
      <div class="page-title">
        <h1>创建房间</h1>
        <p>先写主题、DDL 和自己的空闲时间，填好后再把链接发给其他人</p>
      </div>
      <div class="tool-panel panel-pad">
        <div class="two-col">
          <div>
            <div class="section-title mb-16">约定信息</div>
            <div class="field">
              <label for="topic">要做什么</label>
              <textarea id="topic" maxlength="80" data-model="topic" placeholder="例如：周五晚的游戏局 / 本周项目复盘">${esc(
                create.topic
              )}</textarea>
            </div>
            <div class="grid-2">
              <div class="field">
                <label>一共几人</label>
                <div class="number-control">
                  <button data-action="dec-count" aria-label="减少人数">−</button>
                  <input type="number" min="2" max="20" value="${create.participantCount}" data-model="participantCount" aria-label="人数">
                  <button data-action="inc-count" aria-label="增加人数">+</button>
                </div>
              </div>
              <div class="field">
                <label for="nickname">你的昵称</label>
                <input id="nickname" value="${esc(create.nickname)}" data-model="nickname" maxlength="20" placeholder="昵称">
              </div>
            </div>
            <div class="section-sub" style="margin-top:14px">DDL</div>
            <div class="quick-btn-group mb-16">${presets}</div>
            <div class="grid-2">
              <div class="field">
                <label for="endDate">日期</label>
                <input id="endDate" type="date" value="${create.endDate}" min="${todayKey()}" data-model="endDate">
              </div>
              <div class="field">
                <label for="deadlineTime">时间</label>
                <select id="deadlineTime" data-model="deadlineTime">${selectOptions("end", create.deadlineTime)}</select>
              </div>
            </div>
          </div>
          <div>
            <div class="section-title mb-16">我的空闲时间（必填）</div>
            ${editorMarkup()}
            <button
              class="btn btn-primary btn-block mt-8"
              data-action="create-room"
              ${canCreate ? "" : "disabled"}
            >确认并创建房间</button>
          </div>
        </div>
      </div>
      ${toastMarkup()}
      ${modalMarkup()}
    </main>
  `;
}

function datePresetsMarkup() {
  const today = todayKey();
  const items = [
    { key: "today", label: "今天", start: today, end: today },
    { key: "tomorrow", label: "明天", start: addDaysKey(today, 1), end: addDaysKey(today, 1) },
    { key: "week", label: "本周内", start: today, end: addDaysKey(today, (6 - fromKey(today).getDay()) % 7) },
    { key: "week7", label: "未来 7 天", start: today, end: addDaysKey(today, 6) },
  ];
  return items
    .map(
      (item) => `
        <button class="btn btn-sm ${state.create.endDate === item.end ? "btn-soft" : "btn-ghost"}" data-action="date-preset" data-preset="${item.key}">${item.label}</button>
      `
    )
    .join("");
}

function decidingMarkup(room) {
  const plans = room.plans || [];
  return `
    <div class="section">
      <div class="section-title">重合方案</div>
      <div class="alert alert-success mt-8">${plans.length} 个全员可约时段</div>
      <div class="mt-8">
        ${
          plans.length
            ? plans
                .map(
                  (plan) => `
                    <div class="plan-card current">
                      <div class="plan-time">
                        <div class="plan-date">${esc(formatDate(plan.date))}</div>
                        <div class="plan-range">${esc(plan.start)} - ${esc(plan.end)}</div>
                      </div>
                      <div class="plan-detail">
                        <div>${esc(durationText(plan.minutes))}</div>
                        <div class="small muted">全员可到</div>
                      </div>
                      <div class="plan-actions">
                        ${
                          state.myNickname
                            ? `<button class="btn btn-primary btn-sm" data-action="choose-plan" data-plan="${plan.id}">选择这个时间</button>`
                            : `<button class="btn btn-primary btn-sm" data-action="choose-plan" data-plan="${plan.id}">选择</button>`
                        }
                      </div>
                    </div>
                  `
                )
                .join("")
            : `<div class="empty-hint">暂时没有可显示的重合时间</div>`
        }
      </div>
    </div>
  `;
}

function coordinatingMarkup(room) {
  const candidate = room.activeCandidate;
  const me = participantName(room);
  const isBlocker = me && candidate && candidate.unavailable.includes(me.nickname);
  return `
    <div class="section">
      <div class="section-title">缺少全员重合</div>
      ${
        candidate
          ? `
      <div class="alert alert-warn mt-8">
        当前可协调备选：${candidate.availableCount}/${room.participantCount} 人可到，差 ${esc(
              candidate.unavailable.join("、")
            )}
      </div>
      <div class="plan-card current">
        <div class="plan-time">
          <div class="plan-date">${esc(formatDate(candidate.date))}</div>
          <div class="plan-range">${esc(candidate.start)} - ${esc(candidate.end)}</div>
        </div>
        <div class="plan-detail">
          <div>${esc(durationText(candidate.minutes))}</div>
          <div class="small muted">若 ${esc(candidate.unavailable.join("、"))} 可调整，将生成新方案</div>
        </div>
        <div class="plan-actions">
          ${
              isBlocker
              ? `
                <button class="btn btn-primary btn-sm" data-action="adjust-plan" data-plan="${candidate.id}">我可以调整</button>
                <button class="btn btn-ghost btn-sm" data-action="skip-plan">这个时段不行</button>
              `
              : state.myNickname === room.creator
                ? `<button class="btn btn-ghost btn-sm" data-action="skip-plan">排除这个备选</button>`
                : `<span class="small muted">等待相关参与者回应</span>`
          }
        </div>
      </div>
        `
          : `
      <div class="alert alert-danger mt-8">所有可协调备选都已排除，需要重新开始一轮</div>
      ${
        state.myNickname === room.creator
          ? `<button class="btn btn-amber" data-action="open-new-round">发起新一轮</button>`
          : `<span class="small muted">等待发起人发起新一轮</span>`
      }
        `
      }
    </div>
  `;
}

function chosenMarkup(room) {
  const chosen = room.chosen;
  const memo = scheduledMemoText(room);
  return `
    <div class="section">
      <div class="alert alert-success">
        <div class="section-title" style="margin:0">约定时间已确定</div>
        <div class="scheduled-memo mt-8">${esc(memo)}</div>
        <div class="small muted mt-8">由 ${esc(chosen.chosenBy)} 选择</div>
        <div class="scheduled-actions">
          <button class="btn btn-primary btn-sm" data-action="copy-memo">复制备忘</button>
          <button class="btn btn-ghost btn-sm" data-action="copy-link">复制房间链接</button>
          <button class="btn btn-amber btn-sm" data-action="again-create">再约一次</button>
        </div>
      </div>
    </div>
  `;
}

function scheduledMemoText(room) {
  const chosen = room.chosen;
  const words = [
    "",
    "",
    "两个",
    "三个",
    "四个",
    "五个",
    "六个",
    "七个",
    "八个",
    "九个",
    "十个",
    "十一个",
    "十二个",
    "十三个",
    "十四个",
    "十五个",
    "十六个",
    "十七个",
    "十八个",
    "十九个",
    "二十个",
  ];
  const people = words[room.participantCount] || `${room.participantCount} 个`;
  return `【改天见】${room.topic}：我们${people} ${formatDate(chosen.date)} ${chosen.start} - ${chosen.end} 见吧！`;
}

function toastMarkup() {
  return state.toast ? `<div class="toast">${esc(state.toast)}</div>` : "";
}

function modalMarkup() {
  if (!state.modal) {
    return "";
  }
  const modal = state.modal;
  if (modal.kind === "new-round") {
    return `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h2>发起新一轮</h2>
          <div class="grid-2">
            <div class="field">
              <label for="round-end">新的 DDL 日期</label>
              <input id="round-end" type="date" value="${modal.endDate || state.room.endDate}" min="${todayKey()}" data-round-date="end">
            </div>
            <div class="field">
              <label for="round-time">DDL 时间</label>
              <select id="round-time" data-round-time>${selectOptions("end", modal.endTime || state.room.endTime || "24:00")}</select>
            </div>
          </div>
          <div class="small muted">主题和人数保持不变，所有人的时间会清空后重新填写。</div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-action="close-modal">取消</button>
            <button class="btn btn-amber" data-action="confirm-new-round">发起新一轮</button>
          </div>
        </div>
      </div>
    `;
  }
  if (modal.kind === "member-codes") {
    return `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h2>成员访问码</h2>
          <div class="member-code-list">
            ${(modal.members || [])
              .map(
                (member) => `
                  <div class="participant-row">
                    <span class="avatar avatar-${esc(member.color || "gray")}">${esc(
                      member.nickname.slice(0, 1)
                    )}</span>
                    <div class="participant-name">
                      ${esc(member.nickname)}
                      <span class="member-tag">#${member.memberNo}</span>
                    </div>
                    <div class="spacer"></div>
                    <div class="member-code-value">${esc(member.memberCode || "未分配")}</div>
                  </div>
                `
              )
              .join("")}
          </div>
          <div class="small muted">访问码用于本人换设备恢复身份；请只分享给本人。</div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-action="close-modal">关闭</button>
          </div>
        </div>
      </div>
    `;
  }
  return "";
}

function render() {
  renderApp();
}

async function refreshRoom() {
  if (!state.roomCode) {
    return;
  }
  const data = await api(`/api/room/${state.roomCode}`);
  adoptRoom(data);
}

function adoptRoom(data) {
  state.room = data;
  state.lastRoomKey = JSON.stringify(data);
  syncEditorWithMe();
  render();
}

async function pollRoom() {
  if (!state.roomCode || state.lastRoomKey === undefined) {
    return;
  }
  try {
    const data = await api(`/api/room/${state.roomCode}`);
    const key = JSON.stringify(data);
    if (key !== state.lastRoomKey) {
      adoptRoom(data);
    }
  } catch (_) {
    // keep the current view when the server is briefly unavailable
  }
}

function syncEditorWithMe() {
  const me = participantName();
  if (me && me.hasMemberCode && !Object.keys(state.editor.availability).length) {
    state.editor.availability = {};
    for (const slot of me.availability || []) {
      const daySlots = state.editor.availability[slot.date] || [];
      daySlots.push({ start: slot.start, end: slot.end });
      state.editor.availability[slot.date] = daySlots;
    }
  }
}

async function loadRoom() {
  loadMyIdentity();
  const config = await api("/api/config");
  state.publicBaseUrl = (config.publicBaseUrl || "").replace(/\/+$/, "");
  const data = await api(`/api/room/${state.roomCode}`);
  state.lastRoomKey = JSON.stringify(data);
  state.room = data;
  state.editor = { availability: {}, activeDate: null };
  const me = participantName();
  const identityStillValid =
    me &&
    (state.myMemberCode || me.hasMemberCode) &&
    me.nickname === state.myNickname;
  state.identityState =
    identityStillValid ? "ready" : data.chosen ? "ready" : "needed";
  if (state.identityState === "ready") {
    syncEditorWithMe();
  } else {
    state.editor = { availability: {}, activeDate: null };
  }
  render();
  window.setInterval(pollRoom, 15000);
}

async function actionCreateRoom() {
  const availability = availabilityToList();
  if (!availability.length) {
    showToast("请先在日历中选择你的空闲时间");
    return;
  }
  try {
    const room = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        topic: state.create.topic,
        participantCount: Number(state.create.participantCount),
        nickname: state.create.nickname,
        startDate: state.create.startDate,
        endDate: state.create.endDate,
        endTime: state.create.deadlineTime,
        availability,
      }),
    });
    state.myNickname = room.creator;
    state.myMemberCode = room.creatorMemberCode || "";
    state.myMemberNo = 1;
    saveMyIdentity(room.code);
    state.identityState = "ready";
    location.href = `/r/${room.code}`;
  } catch (error) {
    showToast(error.message);
  }
}

async function actionIdentify() {
  const draft = state.identityDraft;
  const nickname = (draft.nickname || state.myNickname || "").trim();
  if (!nickname) {
    showToast("请填写昵称");
    return;
  }
  try {
    const identity = await api(`/api/room/${state.roomCode}/identify`, {
      method: "POST",
      body: JSON.stringify({
        nickname,
        memberCode: draft.memberCode.trim().toUpperCase(),
      }),
    });
    state.myNickname = identity.nickname;
    state.myMemberCode = identity.memberCode;
    state.myMemberNo = Number(identity.memberNo || 0);
    state.identityDraft = { nickname: identity.nickname, memberCode: "", mode: "join" };
    saveMyIdentity();
    state.identityState = "ready";
    state.editor = { availability: {}, activeDate: null };
    await refreshRoom();
  } catch (error) {
    showToast(error.message);
  }
}

async function actionShowMemberCodes() {
  if (!state.myMemberCode) {
    showToast("请先完成身份确认");
    return;
  }
  try {
    const data = await api(`/api/room/${state.roomCode}/member_codes`, {
      method: "POST",
      body: JSON.stringify({
        nickname: state.myNickname,
        memberCode: state.myMemberCode,
      }),
    });
    state.modal = { kind: "member-codes", members: data.members || [] };
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function actionRespond() {
  if (!state.myMemberCode) {
    showToast("请先完成身份确认");
    return;
  }
  try {
    const room = await api(`/api/room/${state.roomCode}/respond`, {
      method: "POST",
      body: JSON.stringify({
        nickname: state.myNickname,
        memberCode: state.myMemberCode,
        availability: availabilityToList(),
      }),
    });
    state.lastRoomKey = JSON.stringify(room);
    adoptRoom(room);
    saveMyIdentity();
    state.editor.availability = {};
    syncEditorWithMe();
    render();
    showToast("时间已保存");
  } catch (error) {
    showToast(error.message);
  }
}

async function actionChoosePlan(planId) {
  if (!state.myMemberCode) {
    showToast("请先完成身份确认");
    return;
  }
  try {
    const room = await api(`/api/room/${state.roomCode}/choose`, {
      method: "POST",
      body: JSON.stringify({
        nickname: state.myNickname,
        memberCode: state.myMemberCode,
        planId,
      }),
    });
    state.lastRoomKey = JSON.stringify(room);
    adoptRoom(room);
    render();
    showToast("时间已确定");
  } catch (error) {
    showToast(error.message);
  }
}

async function actionAdjustPlan(planId) {
  try {
    const room = await api(`/api/room/${state.roomCode}/adjust`, {
      method: "POST",
      body: JSON.stringify({
        nickname: state.myNickname,
        memberCode: state.myMemberCode,
        planId,
      }),
    });
    state.lastRoomKey = JSON.stringify(room);
    adoptRoom(room);
    render();
    showToast("已加入该时段");
  } catch (error) {
    showToast(error.message);
  }
}

async function actionSkipPlan() {
  try {
    const room = await api(`/api/room/${state.roomCode}/skip`, {
      method: "POST",
      body: JSON.stringify({
        nickname: state.myNickname,
        memberCode: state.myMemberCode,
      }),
    });
    state.lastRoomKey = JSON.stringify(room);
    adoptRoom(room);
    render();
    showToast("已排除当前备选");
  } catch (error) {
    showToast(error.message);
  }
}

async function actionNewRound(confirm = false) {
  if (!confirm) {
    state.modal = {
      kind: "new-round",
      endDate: state.room.endDate,
      endTime: state.room.endTime || "24:00",
    };
    render();
    return;
  }
  try {
    const room = await api(`/api/room/${state.roomCode}/new_round`, {
      method: "POST",
      body: JSON.stringify({
        nickname: state.room.creator,
        memberCode: state.myMemberCode,
        startDate: todayKey(),
        endDate: state.modal.endDate,
        endTime: state.modal.endTime,
      }),
    });
    state.modal = null;
    state.lastRoomKey = JSON.stringify(room);
    adoptRoom(room);
    state.editor = { availability: {}, activeDate: null };
    render();
    showToast("新一轮已发起");
  } catch (error) {
    showToast(error.message);
  }
}

async function actionCopy(kind) {
  const room = state.room;
  let text = "";
  if (kind === "copy-link") {
    text = roomShareUrl(room.code);
  } else if (kind === "copy-code") {
    text = room.code;
  } else if (kind === "copy-member-code") {
    text = state.myMemberCode;
  } else if (kind === "copy-memo") {
    text = scheduledMemoText(room);
  } else {
    text = `【改天见】${room.topic}\n房间码：${room.code}\n链接：${roomShareUrl(room.code)}`;
  }
  const copied = await copyText(text);
  showToast(copied ? "已复制" : "复制失败，请手动复制");
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  const action = target.dataset.action;
  const itemDate = target.dataset.date;
  if (action === "inc-count") {
    state.create.participantCount = Math.min(20, Number(state.create.participantCount || 2) + 1);
    render();
    return;
  }
  if (action === "dec-count") {
    state.create.participantCount = Math.max(2, Number(state.create.participantCount || 2) - 1);
    render();
    return;
  }
  if (action === "date-preset") {
    const preset = datePresets().find((item) => item.key === target.dataset.preset);
    if (preset) {
      setDateRange(preset.start, preset.end);
    }
    return;
  }
  if (action === "toggle-time" && itemDate && target.dataset.time) {
    toggleTimeCell(itemDate, target.dataset.time);
    return;
  }
  if (action === "select-date" && itemDate) {
    state.editor.activeDate = itemDate;
    render();
    return;
  }
  if (action === "toggle-day-range" && itemDate) {
    toggleRangeForDate(itemDate, target.dataset.key);
    return;
  }
  if (action === "toggle-date-category") {
    toggleDateCategory(target.dataset.key);
    return;
  }
  if (action === "clear-all") {
    clearAvailabilityAll();
    return;
  }
  if (action === "go-create") {
    state.route = "create";
    render();
    return;
  }
  if (action === "go-join") {
    state.route = "join";
    render();
    return;
  }
  if (action === "create-room") {
    actionCreateRoom();
    return;
  }
  if (action === "join-room") {
    const codeInput = document.querySelector("[data-room-join]");
    const code = (codeInput ? codeInput.value : "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      showToast("请输入 6 位房间码");
      return;
    }
    location.href = `/r/${code}`;
    return;
  }
  if (action === "identity-mode") {
    state.identityDraft.mode = target.dataset.mode;
    render();
    return;
  }
  if (action === "identify-submit") {
    actionIdentify();
    return;
  }
  if (action === "open-member-codes") {
    actionShowMemberCodes();
    return;
  }
  if (action === "respond") {
    actionRespond();
    return;
  }
  if (action === "choose-plan") {
    actionChoosePlan(target.dataset.plan);
    return;
  }
  if (action === "adjust-plan") {
    actionAdjustPlan(target.dataset.plan);
    return;
  }
  if (action === "skip-plan") {
    actionSkipPlan();
    return;
  }
  if (action === "again-create") {
    location.href = "/";
    return;
  }
  if (
    action === "copy-link" ||
    action === "copy-code" ||
    action === "copy-invite" ||
    action === "copy-memo" ||
    action === "copy-member-code"
  ) {
    actionCopy(target.dataset.action);
    return;
  }
  if (action === "open-new-round") {
    actionNewRound(false);
    return;
  }
  if (action === "confirm-new-round") {
    actionNewRound(true);
    return;
  }
  if (action === "close-modal") {
    state.modal = null;
    render();
    return;
  }
}

function handleInput(event) {
  const target = event.target;
  const model = target.dataset.model;
  if (model) {
    if (model === "identityNickname") {
      state.identityDraft.nickname = target.value;
    } else if (model === "identityMemberCode") {
      state.identityDraft.memberCode = target.value;
    } else if (state.roomCode && state.identityState !== "needed") {
      state.myNickname = target.value;
    } else {
      if (model !== "dayStart" && model !== "dayEnd") {
        state.create[model] = target.value;
      }
    }
  }
}

function handleChange(event) {
  const target = event.target;
  const model = target.dataset.model;
  if (!state.roomCode && model === "participantCount") {
    const value = Math.min(20, Math.max(2, Number(target.value) || 2));
    state.create.participantCount = value;
    target.value = value;
  }
  if (!state.roomCode && model === "endDate") {
    const today = todayKey();
    const picked = target.value || state.create.endDate;
    setDateRange(today, picked < today ? today : picked);
    return;
  }
  if (!state.roomCode && model === "deadlineTime") {
    state.create.deadlineTime = target.value;
    prunePastDeadline();
    render();
    return;
  }
  if (target.dataset.roundDate) {
    state.modal[`${target.dataset.roundDate}Date`] = target.value;
  }
  if (target.dataset.roundTime) {
    state.modal.endTime = target.value;
  }
}

function datePresets() {
  const today = todayKey();
  return [
    { key: "today", label: "今天", start: today, end: today },
    { key: "tomorrow", label: "明天", start: addDaysKey(today, 1), end: addDaysKey(today, 1) },
    { key: "week", label: "本周内", start: today, end: addDaysKey(today, (6 - fromKey(today).getDay()) % 7) },
    { key: "week7", label: "未来 7 天", start: today, end: addDaysKey(today, 6) },
  ];
}

document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);

async function init() {
  try {
    if (state.roomCode) {
      await loadRoom();
    } else {
      const config = await api("/api/config");
      state.publicBaseUrl = (config.publicBaseUrl || "").replace(/\/+$/, "");
      render();
    }
  } catch (error) {
    document.getElementById("app").innerHTML = `
      <div class="container">
        <div class="tool-panel panel-pad">
          <h1>${error.message}</h1>
          <a class="btn btn-primary" href="/">回到首页</a>
        </div>
      </div>
    `;
  }
}

init();
