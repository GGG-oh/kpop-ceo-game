require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const { db, admin } = require("./firebaseAdmin");
const {
  ACTIONS,
  generateTrainee,
  pickTrend,
  resolveAction,
  resolveScandalResponse,
  generateRoomCode,
  computeYearEndAwards,
} = require("./gameLogic");
const { generateTurnNarrative, generateEndingSummaries } = require("./ai");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const TOTAL_TURNS = 12; // 1년 고정

function roomRefs(roomId) {
  const roomDoc = db.collection("rooms").doc(roomId);
  return {
    roomDoc,
    stateRef: roomDoc.collection("meta").doc("state"),
    playersRef: roomDoc.collection("players"),
    historyRef: roomDoc.collection("turnHistory"),
  };
}

// ===== 방 생성 =====
app.post("/api/rooms", async (req, res) => {
  try {
    let roomId;
    let attempts = 0;
    while (attempts < 5) {
      roomId = generateRoomCode();
      const { roomDoc } = roomRefs(roomId);
      const snap = await roomDoc.get();
      if (!snap.exists) break;
      attempts++;
    }

    const { stateRef } = roomRefs(roomId);
    await stateRef.set({
      phase: "waiting",
      currentTurn: 0,
      totalTurns: TOTAL_TURNS,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ ok: true, roomId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== 방 존재 확인 (코드로 입장 시 검증) =====
app.get("/api/rooms/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { stateRef, playersRef } = roomRefs(roomId);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      return res.status(404).json({ ok: false, error: "존재하지 않는 방 코드입니다." });
    }
    const playersSnap = await playersRef.get();
    res.json({
      ok: true,
      phase: stateSnap.data().phase,
      playerCount: playersSnap.size,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== 게임 시작: 3번째 플레이어가 입장하면 클라이언트가 이 API를 호출 =====
app.post("/api/rooms/:roomId/start-game", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { stateRef, playersRef } = roomRefs(roomId);

    const claimed = await db.runTransaction(async (tx) => {
      const stateDoc = await tx.get(stateRef);
      if (!stateDoc.exists) return false;
      const phase = stateDoc.data().phase;
      if (phase && phase !== "waiting") return false;
      tx.set(stateRef, { phase: "starting" }, { merge: true });
      return true;
    });

    if (!claimed) {
      return res.json({ ok: true, alreadyStarted: true });
    }

    const playersSnap = await playersRef.get();
    if (playersSnap.size < 3) {
      await stateRef.set({ phase: "waiting" }, { merge: true });
      return res.status(400).json({ ok: false, error: "플레이어가 아직 3명이 아닙니다." });
    }

    const trend = pickTrend();

    const batch = db.batch();
    playersSnap.forEach((doc) => {
      const starterTrainees = [generateTrainee(), generateTrainee()];
      batch.update(doc.ref, {
        trainees: starterTrainees,
        groups: [],
        composers: [],
        money: 100,
        reputation: 50,
        fandom: 0,
        currentAction: null,
        actionSubmitted: false,
      });
    });
    await batch.commit();

    await stateRef.set({
      phase: "playing",
      currentTurn: 1,
      totalTurns: TOTAL_TURNS,
      currentTrend: trend,
    }, { merge: true });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== 플레이어가 이번 턴 행동을 제출 =====
app.post("/api/rooms/:roomId/submit-action", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { playerId, action } = req.body;
    if (!playerId || !action?.type) {
      return res.status(400).json({ ok: false, error: "playerId와 action이 필요합니다." });
    }
    if (!ACTIONS[action.type]) {
      return res.status(400).json({ ok: false, error: "알 수 없는 action.type 입니다." });
    }

    const { stateRef, playersRef } = roomRefs(roomId);

    await playersRef.doc(playerId).update({
      currentAction: action,
      actionSubmitted: true,
    });

    const playersSnap = await playersRef.get();
    const allSubmitted =
      playersSnap.size === 3 && playersSnap.docs.every((d) => d.data().actionSubmitted);

    if (allSubmitted) {
      const shouldProcess = await db.runTransaction(async (tx) => {
        const stateDoc = await tx.get(stateRef);
        if (stateDoc.data().phase !== "playing") return false;
        tx.update(stateRef, { phase: "calculating" });
        return true;
      });

      if (shouldProcess) {
        res.json({ ok: true, processing: true });
        processTurn(roomId).catch((err) => {
          console.error("[processTurn] 실패:", err);
          stateRef.update({ phase: "playing", lastError: err.message });
        });
        return;
      }
    }

    res.json({ ok: true, processing: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== 병크 대응 제출 =====
app.post("/api/rooms/:roomId/respond-scandal", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { playerId, responseType } = req.body;
    if (!playerId || !["apology", "legal", "suspend", "push"].includes(responseType)) {
      return res.status(400).json({ ok: false, error: "playerId와 올바른 responseType이 필요합니다." });
    }

    const { stateRef, playersRef } = roomRefs(roomId);

    const result = await db.runTransaction(async (tx) => {
      const stateDoc = await tx.get(stateRef);
      const state = stateDoc.data();
      if (state.phase !== "scandal_response") return { error: "지금은 병크 대응 단계가 아닙니다." };

      const pending = state.pendingScandals || [];
      const idx = pending.findIndex((p) => p.playerId === playerId && !p.resolved);
      if (idx === -1) return { error: "대응할 병크가 없습니다." };

      const outcome = resolveScandalResponse(pending[idx].scandal, responseType);
      pending[idx] = { ...pending[idx], resolved: true, responseType, outcome };

      tx.update(stateRef, { pendingScandals: pending });

      const playerRef = playersRef.doc(playerId);
      tx.update(playerRef, {
        reputation: admin.firestore.FieldValue.increment(-outcome.reputationPenalty),
        fandom: admin.firestore.FieldValue.increment(-outcome.fandomPenalty),
        money: admin.firestore.FieldValue.increment(outcome.moneyDelta || 0),
      });

      const allResolved = pending.every((p) => p.resolved);
      return { ok: true, outcome, allResolved, turn: state.currentTurn, totalTurns: state.totalTurns };
    });

    if (result.error) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    res.json({ ok: true, outcome: result.outcome });

    if (result.allResolved) {
      advanceOrEnd(roomId, result.turn, result.totalTurns).catch((err) => {
        console.error("[advanceOrEnd] 실패:", err);
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== 턴 계산 (내부 함수) =====
async function processTurn(roomId) {
  const { stateRef, playersRef, historyRef } = roomRefs(roomId);

  const stateSnap = await stateRef.get();
  const state = stateSnap.data();
  const trend = state.currentTrend;
  const turn = state.currentTurn;
  const totalTurns = state.totalTurns || TOTAL_TURNS;

  const playersSnap = await playersRef.get();
  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const perPlayer = players.map((player) => {
    const {
      delta,
      facts,
      newTrainee,
      traineeUpdate,
      newComposer,
      composerUsedId,
      groupPopularityUpdate,
      scandal,
    } = resolveAction(player, player.currentAction, trend);
    return {
      playerId: player.id,
      companyName: player.companyName,
      action: player.currentAction,
      delta,
      facts,
      newTrainee,
      traineeUpdate,
      newComposer,
      composerUsedId,
      groupPopularityUpdate,
      scandal,
    };
  });

  let narrative;
  try {
    narrative = await generateTurnNarrative({ turn, trend, playersFacts: perPlayer });
  } catch (err) {
    console.error("[processTurn] AI 내러티브 생성 실패, 기본 텍스트로 대체:", err.message);
    narrative = {
      companyReasoning: Object.fromEntries(
        perPlayer.map((p) => [p.companyName, p.facts.join(" ")])
      ),
      newsText: "이번 달 연예계는 각 회사의 다양한 행보로 분주했습니다.",
    };
  }

  const batch = db.batch();
  perPlayer.forEach((p) => {
    const playerRef = playersRef.doc(p.playerId);
    const player = players.find((pl) => pl.id === p.playerId);

    let newTrainees = player.trainees || [];
    if (p.newTrainee) {
      newTrainees = [...newTrainees, p.newTrainee];
    }
    if (p.traineeUpdate) {
      newTrainees = newTrainees.map((t) =>
        t.id === p.traineeUpdate.id ? { ...t, [p.traineeUpdate.field]: p.traineeUpdate.newGrade } : t
      );
    }

    let newComposers = player.composers || [];
    if (p.newComposer) {
      newComposers = [...newComposers, p.newComposer];
    }
    if (p.composerUsedId) {
      newComposers = newComposers.map((c) => (c.id === p.composerUsedId ? { ...c, used: true } : c));
    }

    let newGroups = player.groups || [];
    if (p.action?.type === "form_group" && p.action.groupName && Array.isArray(p.action.memberIds)) {
      newGroups = [
        ...newGroups,
        {
          id: "g_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: p.action.groupName,
          concept: p.action.concept || "청량",
          memberIds: p.action.memberIds,
          debutTurn: turn,
          popularity: 0,
        },
      ];
    }
    if (p.groupPopularityUpdate) {
      newGroups = newGroups.map((g) =>
        g.id === p.groupPopularityUpdate.groupId
          ? { ...g, popularity: Math.max(0, (g.popularity || 0) + p.groupPopularityUpdate.delta) }
          : g
      );
    }

    // 병크 페널티는 여기서 반영하지 않는다 (대응 선택 후 별도 반영됨)
    batch.update(playerRef, {
      money: admin.firestore.FieldValue.increment(p.delta.money || 0),
      reputation: admin.firestore.FieldValue.increment(p.delta.reputation || 0),
      fandom: admin.firestore.FieldValue.increment(p.delta.fandom || 0),
      trainees: newTrainees,
      composers: newComposers,
      groups: newGroups,
      currentAction: null,
      actionSubmitted: false,
      lastReasoning: narrative.companyReasoning?.[p.companyName] || "",
    });
  });
  await batch.commit();

  await historyRef.doc(String(turn)).set({
    trend,
    newsText: narrative.newsText,
    reasoning: narrative.companyReasoning,
    results: Object.fromEntries(perPlayer.map((p) => [p.playerId, { delta: p.delta, facts: p.facts }])),
  });

  const scandalPlayers = perPlayer.filter((p) => p.scandal);

  if (scandalPlayers.length > 0) {
    const pendingScandals = scandalPlayers.map((p) => ({
      playerId: p.playerId,
      companyName: p.companyName,
      scandal: p.scandal,
      resolved: false,
    }));
    await stateRef.update({ phase: "scandal_response", pendingScandals });
    return;
  }

  await advanceOrEnd(roomId, turn, totalTurns);
}

// ===== 턴 진행 마무리: 다음 턴으로 넘어가거나 게임 종료 처리 =====
async function advanceOrEnd(roomId, turn, totalTurns) {
  const { stateRef, playersRef } = roomRefs(roomId);

  if (turn >= totalTurns) {
    const finalPlayersSnap = await playersRef.get();
    const finalPlayers = finalPlayersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const awards = computeYearEndAwards(finalPlayers);

    let endings = {};
    try {
      endings = await generateEndingSummaries({ players: finalPlayers, awards });
    } catch (err) {
      console.error("[advanceOrEnd] 엔딩 생성 실패:", err.message);
    }

    const batch2 = db.batch();
    finalPlayers.forEach((p) => {
      batch2.update(playersRef.doc(p.id), {
        endingSummary: endings[p.companyName] || "",
      });
    });
    await batch2.commit();

    await stateRef.update({ phase: "ended", yearEndAwards: awards, pendingScandals: [] });
  } else {
    await stateRef.update({
      phase: "playing",
      currentTurn: turn + 1,
      currentTrend: pickTrend(),
      pendingScandals: [],
    });
  }
}

// ===== 방 나가기 (플레이어가 스스로 퇴장) =====
app.post("/api/rooms/:roomId/leave", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ ok: false, error: "playerId가 필요합니다." });
    }
    const { playersRef } = roomRefs(roomId);
    await playersRef.doc(playerId).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== 방 삭제 (게임 끝난 뒤 정리용, 선택사항) =====
app.post("/api/rooms/:roomId/delete", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { playersRef, historyRef, stateRef, roomDoc } = roomRefs(roomId);

    const playersSnap = await playersRef.get();
    const batch = db.batch();
    playersSnap.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    const historySnap = await historyRef.get();
    const batch2 = db.batch();
    historySnap.forEach((d) => batch2.delete(d.ref));
    await batch2.commit();

    await stateRef.delete();
    await roomDoc.delete();

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
