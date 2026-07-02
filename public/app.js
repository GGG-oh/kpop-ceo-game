// ===== Firebase 초기화 =====
firebase.initializeApp(window.FIREBASE_CONFIG);
const db = firebase.firestore();
const rtdb = firebase.database();
const API = window.API_BASE_URL;

// ===== 클라이언트용 액션 메타데이터 (서버 gameLogic.js의 ACTIONS와 동일하게 유지) =====
const ACTIONS = {
  scout: { label: "연습생 모집", desc: "새로운 연습생을 발굴합니다.", cost: "💰 5" },
  train: { label: "연습생 트레이닝", desc: "선택한 연습생의 실력을 키웁니다.", cost: "💰 3", needsTraineeTarget: true },
  form_group: { label: "그룹 결성", desc: "연습생들을 모아 새 그룹을 만듭니다.", cost: "💰 10", needsGroupForm: true },
  sign_composer: { label: "작곡가 계약", desc: "유명(고비용·안정) 또는 신인(저비용·도박) 작곡가를 계약합니다.", cost: "💰 8~30", needsComposerTier: true },
  comeback: { label: "컴백/데뷔", desc: "그룹의 신곡을 발매하고 활동합니다. 작곡가를 함께 쓸 수 있어요.", cost: "💰 15", needsGroupTarget: true, optionalComposerTarget: true },
  marketing: { label: "마케팅", desc: "SNS, 광고 등으로 그룹을 홍보합니다.", cost: "💰 8", needsGroupTarget: true },
  rest: { label: "휴식 제공", desc: "리스크를 낮추고 안정을 꾀합니다.", cost: "무료" },
  invest: { label: "시설 투자", desc: "장기적인 평판 기반을 다집니다.", cost: "💰 20" },
};

const CONCEPTS = ["청량", "힙합", "걸크러시", "레트로", "발라드", "락", "SF", "판타지"];

// ===== 로컬 상태 (방 ID / 플레이어 ID) =====
function getOrCreatePlayerId() {
  let id = localStorage.getItem("kceo_playerId");
  if (!id) {
    id = "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("kceo_playerId", id);
  }
  return id;
}
const myId = getOrCreatePlayerId();

let currentRoomId = null;
let STATE_REF = null;
let PLAYERS_REF = null;
let HISTORY_REF = null;

let selectedAction = null;
let latestPlayers = {};
let latestState = {};
let renderedTurnHistoryIds = new Set();
let unsubState = null;
let unsubPlayers = null;
let unsubHistory = null;

function setRoom(roomId) {
  currentRoomId = roomId;
  localStorage.setItem("kceo_roomId", roomId);
  const roomDoc = db.collection("rooms").doc(roomId);
  STATE_REF = roomDoc.collection("meta").doc("state");
  PLAYERS_REF = roomDoc.collection("players");
  HISTORY_REF = roomDoc.collection("turnHistory");

  renderedTurnHistoryIds = new Set();

  if (unsubState) unsubState();
  if (unsubPlayers) unsubPlayers();
  if (unsubHistory) unsubHistory();

  unsubState = STATE_REF.onSnapshot(onStateChange);
  unsubPlayers = PLAYERS_REF.onSnapshot(onPlayersChange);
  unsubHistory = HISTORY_REF.orderBy(firebase.firestore.FieldPath.documentId()).onSnapshot(onHistoryChange);

  document.getElementById("room-code-text").textContent = roomId;
  document.getElementById("join-room-badge").textContent = "ROOM " + roomId;
}

// ===== 홈으로 가기 (방 나가기) =====
async function leaveRoom() {
  const inGame = latestState.phase === "playing" || latestState.phase === "calculating" || latestState.phase === "scandal_response";
  const msg = inGame
    ? "게임이 진행 중입니다. 지금 나가면 다른 플레이어들이 다음 턴을 진행할 수 없게 됩니다. 그래도 홈으로 나가시겠습니까?"
    : "방에서 나가시겠습니까?";
  if (!confirm(msg)) return;

  try {
    if (currentRoomId && myId) {
      await fetch(`${API}/api/rooms/${currentRoomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: myId }),
      });
    }
  } catch (err) {
    console.error(err);
  }

  localStorage.removeItem("kceo_playerId");
  localStorage.removeItem("kceo_roomId");
  window.location.href = window.location.pathname;
}

document.getElementById("btn-home-waiting").addEventListener("click", leaveRoom);
document.getElementById("btn-home-game").addEventListener("click", leaveRoom);

// ===== 화면 전환 =====
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ===== 화면 0: 랜딩 (방 생성 / 코드 입장) =====
document.getElementById("btn-create-room").addEventListener("click", async () => {
  const errEl = document.getElementById("landing-error");
  errEl.textContent = "";
  try {
    const res = await fetch(`${API}/api/rooms`, { method: "POST" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "방 생성 실패");
    setRoom(data.roomId);
    showScreen("screen-join");
  } catch (err) {
    console.error(err);
    errEl.textContent = "방을 만들지 못했습니다. 다시 시도해주세요.";
  }
});

document.getElementById("btn-join-room").addEventListener("click", async () => {
  const code = document.getElementById("input-room-code").value.trim().toUpperCase();
  const errEl = document.getElementById("landing-error");
  errEl.textContent = "";
  if (!code) {
    errEl.textContent = "방 코드를 입력해주세요.";
    return;
  }
  await tryJoinRoomByCode(code, errEl);
});

async function tryJoinRoomByCode(code, errEl) {
  try {
    const res = await fetch(`${API}/api/rooms/${code}`);
    const data = await res.json();
    if (!data.ok) {
      errEl.textContent = "존재하지 않는 방 코드입니다.";
      return;
    }
    if (data.phase !== "waiting" && data.phase !== "starting") {
      errEl.textContent = "이미 시작된 게임입니다.";
      return;
    }
    if (data.playerCount >= 3) {
      errEl.textContent = "이미 3명이 입장한 방입니다.";
      return;
    }
    setRoom(code);
    showScreen("screen-join");
  } catch (err) {
    console.error(err);
    errEl.textContent = "방 확인에 실패했습니다. 다시 시도해주세요.";
  }
}

// ===== 화면 1: 이름/회사명 입력 =====
const joinBtn = document.getElementById("btn-join");
joinBtn.addEventListener("click", async () => {
  const name = document.getElementById("input-name").value.trim();
  const companyName = document.getElementById("input-company").value.trim();
  const errEl = document.getElementById("join-error");
  errEl.textContent = "";

  if (!name || !companyName) {
    errEl.textContent = "이름과 엔터테인먼트 이름을 모두 입력해주세요.";
    return;
  }
  if (!currentRoomId) {
    errEl.textContent = "방 정보가 없습니다. 처음부터 다시 시도해주세요.";
    return;
  }

  const existing = await PLAYERS_REF.doc(myId).get();
  if (!existing.exists) {
    const countSnap = await PLAYERS_REF.get();
    if (countSnap.size >= 3) {
      errEl.textContent = "이미 3명이 입장했습니다.";
      return;
    }
    await PLAYERS_REF.doc(myId).set({
      name,
      companyName,
      money: 100,
      reputation: 50,
      fandom: 0,
      trainees: [],
      groups: [],
      currentAction: null,
      actionSubmitted: false,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  setupPresence();
  joinBtn.disabled = true;
  showScreen("screen-waiting");
});

function setupPresence() {
  const presenceRef = rtdb.ref(`presence/${currentRoomId}/${myId}`);
  presenceRef.set({ online: true, lastSeen: Date.now() });
  presenceRef.onDisconnect().set({ online: false, lastSeen: Date.now() });
  window.addEventListener("beforeunload", () => {
    presenceRef.set({ online: false, lastSeen: Date.now() });
  });
}

// ===== 링크 복사 =====
document.getElementById("btn-copy-link").addEventListener("click", () => {
  const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
  navigator.clipboard.writeText(url);
  const btn = document.getElementById("btn-copy-link");
  const original = btn.textContent;
  btn.textContent = "복사됨!";
  setTimeout(() => (btn.textContent = original), 1500);
});

// ===== 게임 상태 실시간 구독 콜백 =====
function onStateChange(snap) {
  if (!snap.exists) return;
  latestState = snap.data();
  render();

  if (latestState.phase === "playing" || latestState.phase === "calculating" || latestState.phase === "scandal_response") {
    showScreen("screen-game");
  } else if (latestState.phase === "ended") {
    showScreen("screen-ending");
    renderEndingScreen();
  } else if (latestState.phase === "waiting" || latestState.phase === "starting") {
    PLAYERS_REF.doc(myId).get().then((d) => {
      if (d.exists) showScreen("screen-waiting");
    });
  }

  document.getElementById("loading-overlay").classList.toggle("hidden", latestState.phase !== "calculating");
  renderScandalOverlay();
}

// ===== 병크 대응 오버레이 =====
const SCANDAL_RESPONSES = [
  { type: "apology", label: "사과 발표", desc: "진정성 있게 사과합니다. 평판 타격은 줄지만 팬덤 이탈은 못 막아요." },
  { type: "legal", label: "법적 대응", desc: "단호하게 대응합니다. 성공하면 효과적이지만, 역풍이 불 수도 있어요." },
  { type: "suspend", label: "활동 중단", desc: "전면 자숙합니다. 평판은 지키지만 활동 공백에 비용도 듭니다." },
  { type: "push", label: "무대 강행", desc: "그대로 밀어붙입니다. 도박이지만 가끔 통하기도 해요." },
];

function renderScandalOverlay() {
  const overlay = document.getElementById("scandal-overlay");
  if (latestState.phase !== "scandal_response") {
    overlay.classList.add("hidden");
    return;
  }

  const pending = latestState.pendingScandals || [];
  const mine = pending.find((p) => p.playerId === myId);

  if (!mine) {
    // 내 병크는 없지만 다른 회사가 대응 중 → 로딩 오버레이로 안내
    const loadingOverlay = document.getElementById("loading-overlay");
    const waitingNames = pending.filter((p) => !p.resolved).map((p) => p.companyName).join(", ");
    document.getElementById("loading-text").textContent = waitingNames
      ? `${waitingNames}에서 병크 대응 중...`
      : "병크 대응 처리 중...";
    loadingOverlay.classList.remove("hidden");
    overlay.classList.add("hidden");
    return;
  }

  document.getElementById("loading-overlay").classList.add("hidden");

  if (mine.resolved) {
    // 내 대응은 끝났지만 다른 사람 대응 대기 중
    overlay.classList.add("hidden");
    const loadingOverlay = document.getElementById("loading-overlay");
    document.getElementById("loading-text").textContent = "다른 회사의 병크 대응을 기다리는 중...";
    loadingOverlay.classList.remove("hidden");
    return;
  }

  overlay.classList.remove("hidden");
  document.getElementById("scandal-title").textContent = mine.scandal.label;
  document.getElementById("scandal-desc").textContent = "어떻게 대응하시겠습니까?";

  const optionsWrap = document.getElementById("scandal-options");
  const outcomeWrap = document.getElementById("scandal-outcome");
  outcomeWrap.classList.add("hidden");
  optionsWrap.classList.remove("hidden");
  optionsWrap.querySelectorAll(".scandal-option-btn").forEach((b) => (b.disabled = false));

  if (!optionsWrap.dataset.rendered) {
    optionsWrap.innerHTML = SCANDAL_RESPONSES.map((r) => `
      <button class="scandal-option-btn" data-type="${r.type}">
        ${r.label}
        <div class="opt-desc">${r.desc}</div>
      </button>
    `).join("");
    optionsWrap.dataset.rendered = "1";

    optionsWrap.querySelectorAll(".scandal-option-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        optionsWrap.querySelectorAll(".scandal-option-btn").forEach((b) => (b.disabled = true));
        try {
          const res = await fetch(`${API}/api/rooms/${currentRoomId}/respond-scandal`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: myId, responseType: btn.dataset.type }),
          });
          const data = await res.json();
          if (data.ok) {
            optionsWrap.classList.add("hidden");
            outcomeWrap.textContent = data.outcome.note;
            outcomeWrap.classList.remove("hidden");
          }
        } catch (err) {
          console.error(err);
          optionsWrap.querySelectorAll(".scandal-option-btn").forEach((b) => (b.disabled = false));
        }
      });
    });
  }
}

function onPlayersChange(snap) {
  latestPlayers = {};
  snap.forEach((doc) => (latestPlayers[doc.id] = { id: doc.id, ...doc.data() }));
  render();

  if (latestState.phase === "waiting" && Object.keys(latestPlayers).length === 3) {
    fetch(`${API}/api/rooms/${currentRoomId}/start-game`, { method: "POST" }).catch(console.error);
  }
}

function onHistoryChange(snap) {
  const feed = document.getElementById("news-feed");
  snap.docChanges().forEach((change) => {
    if (change.type === "added" && !renderedTurnHistoryIds.has(change.doc.id)) {
      renderedTurnHistoryIds.add(change.doc.id);
      const data = change.doc.data();
      const item = document.createElement("div");
      item.className = "news-item";
      item.innerHTML = `<b>TURN ${change.doc.id}</b> — ${data.newsText || ""}`;
      feed.prepend(item);

      const me = latestPlayers[myId];
      if (me && data.reasoning && data.reasoning[me.companyName]) {
        const reasonItem = document.createElement("div");
        reasonItem.className = "news-item";
        reasonItem.innerHTML = `📊 ${data.reasoning[me.companyName]}`;
        feed.prepend(reasonItem);
      }
    }
  });
}

// ===== 렌더 총괄 =====
function render() {
  renderWaitingSlots();
  if (latestState.phase === "playing" || latestState.phase === "calculating" || latestState.phase === "scandal_response") {
    renderTopbar();
    renderRivals();
    renderAssets();
    renderActionPanel();
  }
}

function renderWaitingSlots() {
  const wrap = document.getElementById("waiting-slots");
  const players = Object.values(latestPlayers);
  wrap.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const p = players[i];
    const div = document.createElement("div");
    div.className = "slot" + (p ? " filled" : "");
    div.textContent = p ? p.companyName : "대기중";
    wrap.appendChild(div);
  }
}

function renderTopbar() {
  document.getElementById("turn-badge").textContent = `TURN ${latestState.currentTurn} / ${latestState.totalTurns}`;
  const trend = latestState.currentTrend;
  document.getElementById("trend-badge").textContent = trend ? `📈 ${trend.concept} 트렌드` : "";

  const me = latestPlayers[myId];
  if (me) {
    document.getElementById("my-stats").innerHTML = `
      <span>${me.companyName}</span>
      <span>💰 <b>${me.money ?? 0}</b></span>
      <span>⭐ <b>${me.reputation ?? 0}</b></span>
      <span>💗 <b>${me.fandom ?? 0}</b></span>
    `;
  }
}

function renderRivals() {
  const wrap = document.getElementById("rivals-panel");
  const others = Object.values(latestPlayers).filter((p) => p.id !== myId);
  wrap.innerHTML = `<h4>경쟁 엔터</h4>` + others.map((p) => `
    <div class="rival-card">
      <div class="name">${p.companyName}</div>
      <div class="stats">
        <span>💰${p.money ?? 0}</span><span>⭐${p.reputation ?? 0}</span><span>💗${p.fandom ?? 0}</span>
      </div>
    </div>
  `).join("");
}

function renderAssets() {
  const me = latestPlayers[myId];
  if (!me) return;

  const traineeWrap = document.getElementById("trainee-list");
  traineeWrap.innerHTML = (me.trainees || []).map((t) => `
    <div class="trainee-card">
      <div class="t-name">${t.name}</div>
      <div class="t-grades">
        <span>보컬${t.vocal}</span><span>댄스${t.dance}</span><span>랩${t.rap}</span>
        <span>비주얼${t.visual}</span><span>팬서비스${t.fanservice}</span><span>멘탈${t.mental}</span>
      </div>
    </div>
  `).join("") || `<p class="hint">아직 연습생이 없습니다.</p>`;

  const groupWrap = document.getElementById("group-list");
  groupWrap.innerHTML = (me.groups || []).map((g) => `
    <div class="group-card">
      <div class="g-name">${g.name}</div>
      <div class="g-concept">${g.concept} · 인기 ${g.popularity ?? 0}</div>
    </div>
  `).join("") || `<p class="hint">아직 그룹이 없습니다.</p>`;

  const composerWrap = document.getElementById("composer-list");
  if (composerWrap) {
    const composers = (me.composers || []).filter((c) => !c.used);
    composerWrap.innerHTML = composers.map((c) => `
      <div class="group-card">
        <div class="g-name">${c.name} ${c.tier === "famous" ? "⭐" : "🎲"}</div>
        <div class="g-concept">${c.tier === "famous" ? "유명 작곡가" : "신인 작곡가"} · 다음 컴백에 사용 가능</div>
      </div>
    `).join("") || `<p class="hint">계약된 작곡가가 없습니다.</p>`;
  }
}

// ===== 행동 선택 패널 =====
function renderActionPanel() {
  const me = latestPlayers[myId];
  if (!me) return;

  const alreadySubmitted = !!me.actionSubmitted;
  const panel = document.getElementById("action-panel");
  const submitBtn = document.getElementById("btn-submit-action");
  const waitingHint = document.getElementById("waiting-others");

  if (alreadySubmitted || latestState.phase === "calculating" || latestState.phase === "scandal_response") {
    panel.querySelectorAll(".action-card, .action-target-area input, .action-target-area select").forEach((el) => (el.style.pointerEvents = "none"));
    submitBtn.classList.add("hidden");
    waitingHint.classList.remove("hidden");
    return;
  } else {
    waitingHint.classList.add("hidden");
    submitBtn.classList.remove("hidden");
  }

  const listEl = document.getElementById("action-list");
  if (!listEl.dataset.rendered) {
    listEl.innerHTML = Object.entries(ACTIONS).map(([key, a]) => `
      <div class="action-card" data-type="${key}">
        <div class="a-label">${a.label}</div>
        <div class="a-desc">${a.desc}</div>
        <div class="a-cost">${a.cost}</div>
      </div>
    `).join("");
    listEl.dataset.rendered = "1";

    listEl.querySelectorAll(".action-card").forEach((card) => {
      card.addEventListener("click", () => {
        listEl.querySelectorAll(".action-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedAction = { type: card.dataset.type };
        renderActionTargetArea(card.dataset.type);
      });
    });
  }
}

function renderActionTargetArea(type) {
  const area = document.getElementById("action-target-area");
  const me = latestPlayers[myId];
  const meta = ACTIONS[type];
  area.innerHTML = "";
  const submitBtn = document.getElementById("btn-submit-action");
  submitBtn.disabled = false;

  if (meta.needsTraineeTarget) {
    const options = (me.trainees || []).map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
    area.innerHTML = `<select id="target-trainee">${options || "<option disabled>연습생이 없습니다</option>"}</select>`;
    if (!(me.trainees || []).length) submitBtn.disabled = true;
    document.getElementById("target-trainee")?.addEventListener("change", updateSelectedFromInputs);
    updateSelectedFromInputs();
  } else if (meta.needsComposerTier) {
    area.innerHTML = `
      <select id="target-composer-tier">
        <option value="famous">유명 작곡가 (💰30 · 고품질·안정)</option>
        <option value="rookie">신인 작곡가 (💰8 · 저비용·도박)</option>
      </select>
    `;
    document.getElementById("target-composer-tier")?.addEventListener("change", updateSelectedFromInputs);
    updateSelectedFromInputs();
  } else if (meta.needsGroupTarget) {
    const options = (me.groups || []).map((g) => `<option value="${g.id}">${g.name}</option>`).join("");
    let html = `<select id="target-group">${options || "<option disabled>그룹이 없습니다</option>"}</select>`;
    if (meta.optionalComposerTarget) {
      const availableComposers = (me.composers || []).filter((c) => !c.used);
      const composerOptions = availableComposers.map((c) => `<option value="${c.id}">${c.name} (${c.tier === "famous" ? "유명" : "신인"})</option>`).join("");
      html += `<select id="target-composer">
        <option value="">작곡가 없이 진행</option>
        ${composerOptions}
      </select>`;
    }
    area.innerHTML = html;
    if (!(me.groups || []).length) submitBtn.disabled = true;
    document.getElementById("target-group")?.addEventListener("change", updateSelectedFromInputs);
    document.getElementById("target-composer")?.addEventListener("change", updateSelectedFromInputs);
    updateSelectedFromInputs();
  } else if (meta.needsGroupForm) {
    const conceptOptions = CONCEPTS.map((c) => `<option value="${c}">${c}</option>`).join("");
    area.innerHTML = `
      <input id="target-groupname" type="text" placeholder="그룹 이름" maxlength="16" />
      <select id="target-concept">${conceptOptions}</select>
      <div class="member-pick" id="member-pick">
        ${(me.trainees || []).map((t) => `<span class="member-chip" data-id="${t.id}">${t.name}</span>`).join("") || "<span class='hint'>연습생이 없습니다</span>"}
      </div>
    `;
    document.getElementById("target-groupname")?.addEventListener("input", updateSelectedFromInputs);
    document.getElementById("target-concept")?.addEventListener("change", updateSelectedFromInputs);
    document.querySelectorAll(".member-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        chip.classList.toggle("picked");
        updateSelectedFromInputs();
      });
    });
    submitBtn.disabled = true;
  }
}

function updateSelectedFromInputs() {
  if (!selectedAction) return;
  const type = selectedAction.type;
  const meta = ACTIONS[type];
  const submitBtn = document.getElementById("btn-submit-action");

  if (meta.needsTraineeTarget) {
    const el = document.getElementById("target-trainee");
    selectedAction.targetTraineeId = el?.value;
  } else if (meta.needsComposerTier) {
    const el = document.getElementById("target-composer-tier");
    selectedAction.tier = el?.value || "rookie";
  } else if (meta.needsGroupTarget) {
    const el = document.getElementById("target-group");
    selectedAction.targetGroupId = el?.value;
    if (meta.optionalComposerTarget) {
      const composerEl = document.getElementById("target-composer");
      selectedAction.composerId = composerEl?.value || null;
    }
  } else if (meta.needsGroupForm) {
    const name = document.getElementById("target-groupname")?.value.trim();
    const concept = document.getElementById("target-concept")?.value;
    const pickedIds = Array.from(document.querySelectorAll(".member-chip.picked")).map((c) => c.dataset.id);
    selectedAction.groupName = name;
    selectedAction.concept = concept;
    selectedAction.memberIds = pickedIds;
    submitBtn.disabled = !(name && pickedIds.length > 0);
  }
}

document.getElementById("btn-submit-action").addEventListener("click", async () => {
  if (!selectedAction) return;
  const btn = document.getElementById("btn-submit-action");
  btn.disabled = true;
  btn.textContent = "제출 중...";
  try {
    await fetch(`${API}/api/rooms/${currentRoomId}/submit-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: myId, action: selectedAction }),
    });
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "이번 달 행동 확정";
  }
});

// ===== 엔딩 화면 =====
async function renderEndingScreen() {
  const snap = await PLAYERS_REF.get();
  const players = snap.docs.map((d) => d.data());

  const awards = latestState.yearEndAwards;
  const awardsWrap = document.getElementById("awards-section");
  if (awards && Object.keys(awards).length) {
    awardsWrap.innerHTML = Object.entries(awards).map(([title, winner]) => `
      <div class="award-card">
        <div class="award-title">🏆 ${title}</div>
        <div class="award-winner">${winner}</div>
      </div>
    `).join("");
  } else {
    awardsWrap.innerHTML = "";
  }

  const wrap = document.getElementById("ending-cards");
  wrap.innerHTML = players.map((p) => `
    <div class="ending-card">
      <h3>${p.companyName}</h3>
      <div class="final-stats">
        <span>💰 ${p.money ?? 0}</span><span>⭐ ${p.reputation ?? 0}</span><span>💗 ${p.fandom ?? 0}</span>
        <span>그룹 ${((p.groups || []).length)}개</span>
      </div>
      <p>${p.endingSummary || "결산 기사를 준비 중입니다..."}</p>
    </div>
  `).join("");
}

document.getElementById("btn-new-game").addEventListener("click", () => {
  localStorage.removeItem("kceo_playerId");
  localStorage.removeItem("kceo_roomId");
  window.location.href = window.location.pathname; // 쿼리스트링 제거하고 랜딩으로
});

// ===== 시작 시 자동 이어하기 처리 =====
(async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const codeFromUrl = urlParams.get("room")?.toUpperCase();
  const savedRoomId = localStorage.getItem("kceo_roomId");

  // 1) URL에 방 코드가 있으면 그 방으로 (공유 링크로 들어온 경우)
  if (codeFromUrl) {
    const res = await fetch(`${API}/api/rooms/${codeFromUrl}`).catch(() => null);
    const data = res ? await res.json() : null;
    if (data?.ok) {
      setRoom(codeFromUrl);
      const existing = await PLAYERS_REF.doc(myId).get();
      if (existing.exists) {
        setupPresence();
        // onStateChange가 알아서 적절한 화면으로 보냄
      } else {
        showScreen("screen-join");
      }
      return;
    }
  }

  // 2) 이전에 참여했던 방이 로컬에 저장돼 있으면 이어서
  if (savedRoomId) {
    const res = await fetch(`${API}/api/rooms/${savedRoomId}`).catch(() => null);
    const data = res ? await res.json() : null;
    if (data?.ok) {
      setRoom(savedRoomId);
      const existing = await PLAYERS_REF.doc(myId).get();
      if (existing.exists) {
        setupPresence();
        return;
      }
    }
  }

  // 3) 그 외엔 랜딩 화면 (새 게임 만들기 / 코드 입장)
  showScreen("screen-landing");
})();
