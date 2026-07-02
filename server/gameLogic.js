// ===== 게임 상수 =====

const CONCEPTS = ["청량", "힙합", "걸크러시", "레트로", "발라드", "락", "SF", "판타지"];

const TREND_POOL = [
  { concept: "청량", desc: "밝고 상쾌한 청량 컨셉이 다시 주목받고 있습니다." },
  { concept: "힙합", desc: "강렬한 힙합 기반 사운드가 차트를 휩쓸고 있습니다." },
  { concept: "걸크러시", desc: "당당하고 카리스마 있는 걸크러시 무드가 인기입니다." },
  { concept: "레트로", desc: "90년대 감성을 살린 레트로 콘셉트가 재조명받고 있습니다." },
  { concept: "발라드", desc: "감성적인 발라드 곡들이 스트리밍 상위권을 차지했습니다." },
  { concept: "락", desc: "밴드 사운드 기반의 락 컨셉 그룹들이 화제입니다." },
];

const ACTIONS = {
  scout: {
    label: "연습생 모집",
    desc: "새로운 연습생을 발굴합니다.",
    cost: { money: 5 },
  },
  train: {
    label: "연습생 트레이닝",
    desc: "선택한 연습생의 실력을 집중적으로 키웁니다.",
    cost: { money: 3 },
    needsTraineeTarget: true,
  },
  form_group: {
    label: "그룹 결성",
    desc: "연습생들을 모아 새 그룹을 만듭니다.",
    cost: { money: 10 },
    needsGroupForm: true,
  },
  sign_composer: {
    label: "작곡가 계약",
    desc: "유명 작곡가(비싸지만 고품질) 또는 신인 작곡가(저렴하지만 도박)를 계약합니다.",
    cost: {},
    needsComposerTier: true,
  },
  comeback: {
    label: "컴백/데뷔",
    desc: "그룹의 신곡을 발매하고 활동합니다. 계약된 작곡가가 있으면 함께 선택할 수 있습니다.",
    cost: { money: 15 },
    needsGroupTarget: true,
    optionalComposerTarget: true,
  },
  marketing: {
    label: "마케팅",
    desc: "SNS, 광고 등으로 그룹을 홍보합니다.",
    cost: { money: 8 },
    needsGroupTarget: true,
  },
  rest: {
    label: "휴식 제공",
    desc: "회사와 멤버들에게 휴식을 주어 리스크를 낮춥니다.",
    cost: { money: 0 },
  },
  invest: {
    label: "시설 투자",
    desc: "회사 인프라에 투자하여 장기적 평판을 올립니다.",
    cost: { money: 20 },
  },
};

const FIRST_NAMES = ["도윤", "서연", "하준", "지우", "민서", "예준", "수아", "시우", "지안", "채원", "은우", "다인"];
const LAST_NAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];

const COMPOSER_FIRST = ["Jay", "Min", "Alex", "Yuna", "Chris", "Dahye", "Sam", "Ari"];
const COMPOSER_LAST = ["Kim", "Park", "Lee", "Cho", "Wave", "Sound", "Beat", "Note"];

const SCANDAL_TYPES = [
  { label: "SNS 실수 논란", reputationPenalty: [5, 12], fandomPenalty: [5, 15] },
  { label: "무대 라이브 논란", reputationPenalty: [3, 8], fandomPenalty: [8, 20] },
  { label: "멤버 간 갈등설", reputationPenalty: [6, 14], fandomPenalty: [4, 10] },
  { label: "건강 악화로 인한 활동 차질", reputationPenalty: [2, 6], fandomPenalty: [10, 18] },
  { label: "연애설 논란", reputationPenalty: [4, 10], fandomPenalty: [6, 16] },
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const ROOM_CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 헷갈리는 0/O, 1/I 제외
function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[randInt(0, ROOM_CODE_CHARS.length - 1)];
  }
  return code;
}

function randomGrade() {
  const grades = ["S", "A", "B", "C"];
  const weights = [0.1, 0.3, 0.4, 0.2]; // S는 희귀하게
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < grades.length; i++) {
    acc += weights[i];
    if (r <= acc) return grades[i];
  }
  return "B";
}

const GRADE_SCORE = { S: 90, A: 75, B: 60, C: 45 };

function generateTrainee() {
  const name = LAST_NAMES[randInt(0, LAST_NAMES.length - 1)] + FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)];
  const stats = {
    vocal: randomGrade(),
    dance: randomGrade(),
    rap: randomGrade(),
    visual: randomGrade(),
    fanservice: randomGrade(),
    mental: randomGrade(),
  };
  return {
    id: "t_" + Date.now().toString(36) + randInt(100, 999),
    name,
    ...stats,
  };
}

function generateComposer(tier) {
  const name = COMPOSER_FIRST[randInt(0, COMPOSER_FIRST.length - 1)] + " " + COMPOSER_LAST[randInt(0, COMPOSER_LAST.length - 1)];
  const isFamous = tier === "famous";
  return {
    id: "c_" + Date.now().toString(36) + randInt(100, 999),
    name,
    tier: isFamous ? "famous" : "rookie",
    cost: isFamous ? 30 : 8,
    // 유명 작곡가: 안정적으로 높은 보너스 / 신인 작곡가: 저렴하지만 변동폭이 큰 도박
    successBonus: isFamous ? randInt(12, 22) : randInt(-15, 25),
    used: false,
  };
}

function pickTrend() {
  return TREND_POOL[randInt(0, TREND_POOL.length - 1)];
}

function traineeAvgScore(trainee) {
  const keys = ["vocal", "dance", "rap", "visual", "fanservice", "mental"];
  const sum = keys.reduce((acc, k) => acc + (GRADE_SCORE[trainee[k]] || 50), 0);
  return sum / keys.length;
}

function groupMentalScore(group, traineePool) {
  const members = group.memberIds
    .map((id) => traineePool.find((t) => t.id === id))
    .filter(Boolean);
  if (members.length === 0) return 60;
  return members.reduce((acc, m) => acc + (GRADE_SCORE[m.mental] || 50), 0) / members.length;
}

function groupAvgScore(group, traineePool) {
  const members = group.memberIds
    .map((id) => traineePool.find((t) => t.id === id))
    .filter(Boolean);
  if (members.length === 0) return 50;
  return members.reduce((acc, m) => acc + traineeAvgScore(m), 0) / members.length;
}

function upgradeGrade(grade) {
  const order = ["C", "B", "A", "S"];
  const idx = order.indexOf(grade);
  if (idx === -1 || idx === order.length - 1) return grade; // 이미 S면 그대로
  return order[idx + 1];
}

/**
 * 한 플레이어의 액션 하나를 처리해서 stat 변화량(delta)과
 * 계산에 쓰인 "원재료" 정보를 리턴한다. (AI는 이 원재료를 보고 이유를 설명함)
 *
 * 리턴값 중 아래 필드들은 존재할 때만 index.js에서 반영하면 됨:
 * - newTrainee: scout 시 새로 생성된 연습생
 * - traineeUpdate: train 시 성장한 연습생 { id, field, newGrade }
 * - newComposer: sign_composer 시 새로 계약된 작곡가
 * - composerUsedId: comeback 시 소모된 작곡가 id
 * - groupPopularityUpdate: comeback/marketing 시 그룹 인기 변화 { groupId, delta }
 * - scandal: comeback 시 병크가 터졌다면 { label, reputationPenalty, fandomPenalty }
 */
function resolveAction(player, action, trend) {
  const delta = { money: 0, reputation: 0, fandom: 0 };
  const facts = []; // AI에게 넘길 계산 근거들
  const type = action?.type;
  let newTrainee = null;
  let traineeUpdate = null;
  let newComposer = null;
  let composerUsedId = null;
  let groupPopularityUpdate = null;
  let scandal = null;

  if (!type || !ACTIONS[type]) {
    facts.push("이번 달에 별다른 활동을 하지 않았습니다.");
    return { delta, facts, newTrainee, traineeUpdate, newComposer, composerUsedId, groupPopularityUpdate, scandal };
  }

  const cost = ACTIONS[type].cost || {};
  if (cost.money) delta.money -= cost.money;

  switch (type) {
    case "scout": {
      newTrainee = generateTrainee();
      facts.push(`새 연습생 "${newTrainee.name}"을(를) 영입했습니다.`);
      break;
    }
    case "train": {
      const trainee = (player.trainees || []).find((t) => t.id === action.targetTraineeId);
      if (!trainee) {
        facts.push("트레이닝을 시도했지만 대상 연습생을 찾을 수 없었습니다.");
        break;
      }
      const statKeys = ["vocal", "dance", "rap", "visual", "fanservice", "mental"];
      const statOrder = { S: 3, A: 2, B: 1, C: 0 };
      const weakest = statKeys.reduce((a, b) => (statOrder[trainee[a]] <= statOrder[trainee[b]] ? a : b));
      const newGrade = upgradeGrade(trainee[weakest]);
      traineeUpdate = { id: trainee.id, field: weakest, newGrade };
      if (newGrade === trainee[weakest]) {
        facts.push(`"${trainee.name}"의 ${weakest} 능력은 이미 최고 등급(S)이라 트레이닝 효과가 크지 않았습니다.`);
      } else {
        facts.push(`"${trainee.name}"의 ${weakest} 능력이 ${trainee[weakest]}등급에서 ${newGrade}등급으로 성장했습니다.`);
      }
      break;
    }
    case "form_group": {
      facts.push(`새 그룹 "${action.groupName || "무명"}"을(를) 결성했습니다.`);
      break;
    }
    case "sign_composer": {
      const tier = action.tier === "famous" ? "famous" : "rookie";
      newComposer = generateComposer(tier);
      delta.money -= newComposer.cost;
      facts.push(
        tier === "famous"
          ? `유명 작곡가 "${newComposer.name}"과 고비용 계약을 체결했습니다.`
          : `신인 작곡가 "${newComposer.name}"과 저비용으로 계약했습니다 (결과는 도박적입니다).`
      );
      break;
    }
    case "comeback": {
      const group = (player.groups || []).find((g) => g.id === action.targetGroupId);
      if (!group) {
        facts.push("컴백을 시도했지만 대상 그룹을 찾을 수 없었습니다.");
        break;
      }
      const avgScore = groupAvgScore(group, player.trainees || []);
      const conceptMatch = group.concept === trend.concept;
      const trendBonus = conceptMatch ? 20 : -5;
      const randomness = randInt(-10, 15);

      let composerBonus = 0;
      const composer = action.composerId
        ? (player.composers || []).find((c) => c.id === action.composerId && !c.used)
        : null;
      if (composer) {
        composerBonus = composer.successBonus;
        composerUsedId = composer.id;
      }

      const popularityBonus = Math.min(15, Math.round((group.popularity || 0) / 10));
      const performance = avgScore + trendBonus + randomness + composerBonus + popularityBonus;

      const fandomGain = Math.max(0, Math.round(performance * 1.2));
      const repGain = Math.max(0, Math.round(performance * 0.4));
      const moneyGain = Math.max(0, Math.round(performance * 1.5));

      delta.fandom += fandomGain;
      delta.reputation += repGain;
      delta.money += moneyGain;
      groupPopularityUpdate = { groupId: group.id, delta: Math.round(performance * 0.5) };

      facts.push(
        `그룹 "${group.name}"(컨셉: ${group.concept}, 실력 평균 ${Math.round(avgScore)}점)이 컴백했습니다.`
      );
      facts.push(
        conceptMatch
          ? `이번 달 시장 트렌드(${trend.concept})와 그룹 컨셉이 일치해 유리했습니다.`
          : `이번 달 시장 트렌드는 ${trend.concept}였고, 그룹 컨셉(${group.concept})과는 맞지 않았습니다.`
      );
      if (composer) {
        facts.push(
          composer.tier === "famous"
            ? `유명 작곡가 "${composer.name}"의 곡이 안정적인 완성도를 더했습니다.`
            : composerBonus >= 0
            ? `신인 작곡가 "${composer.name}"의 실험적인 곡이 의외로 좋은 반응을 얻었습니다.`
            : `신인 작곡가 "${composer.name}"의 곡이 기대에 미치지 못했습니다.`
        );
      }
      if ((group.popularity || 0) > 0) {
        facts.push(`기존 그룹 인기도(${group.popularity})가 활동에 추가 탄력을 주었습니다.`);
      }
      facts.push(`최종 활동 점수는 약 ${Math.round(performance)}점으로 집계되었습니다.`);

      // ===== 병크 시스템: 멤버 멘탈 평균이 낮을수록, 활동을 많이 할수록 위험 =====
      const mentalScore = groupMentalScore(group, player.trainees || []);
      let scandalChance = 20 - (mentalScore - 60) * 0.4; // 멘탈 평균 60 기준 20%
      scandalChance = Math.max(5, Math.min(45, scandalChance));
      if (Math.random() * 100 < scandalChance) {
        const type_ = SCANDAL_TYPES[randInt(0, SCANDAL_TYPES.length - 1)];
        const repPenalty = randInt(type_.reputationPenalty[0], type_.reputationPenalty[1]);
        const fandomPenalty = randInt(type_.fandomPenalty[0], type_.fandomPenalty[1]);
        delta.reputation -= repPenalty;
        delta.fandom -= fandomPenalty;
        scandal = { label: type_.label, reputationPenalty: repPenalty, fandomPenalty };
        facts.push(
          `활동 도중 "${type_.label}"이(가) 발생하여 평판 -${repPenalty}, 팬덤 -${fandomPenalty}의 타격을 입었습니다. (멤버 평균 멘탈 등급이 낮을수록 이런 위험이 커집니다)`
        );
      }
      break;
    }
    case "marketing": {
      const group = (player.groups || []).find((g) => g.id === action.targetGroupId);
      const base = randInt(5, 20);
      delta.fandom += base;
      if (group) {
        groupPopularityUpdate = { groupId: group.id, delta: Math.round(base * 0.5) };
      }
      facts.push(
        group
          ? `그룹 "${group.name}"을 대상으로 마케팅을 진행했습니다.`
          : "마케팅을 진행했지만 대상 그룹이 불명확했습니다."
      );
      break;
    }
    case "rest": {
      facts.push("이번 달은 회사와 멤버들에게 휴식을 주어 리스크 관리에 집중했습니다.");
      delta.reputation += 1;
      break;
    }
    case "invest": {
      delta.reputation += 8;
      facts.push("회사 시설에 투자하여 장기적인 평판 기반을 다졌습니다.");
      break;
    }
  }

  return { delta, facts, newTrainee, traineeUpdate, newComposer, composerUsedId, groupPopularityUpdate, scandal };
}

/**
 * 연말(마지막 턴 종료) 시상식 수상자 산출.
 * players: [{ companyName, money, reputation, fandom, groups }]
 */
function computeYearEndAwards(players) {
  const allGroupsFlat = [];
  players.forEach((p) => {
    (p.groups || []).forEach((g) => {
      allGroupsFlat.push({ ...g, ownerCompany: p.companyName });
    });
  });

  const awards = {};

  if (allGroupsFlat.length > 0) {
    const bestGroup = [...allGroupsFlat].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    awards["올해의 그룹"] = `${bestGroup.name} (${bestGroup.ownerCompany})`;

    const rookieGroups = allGroupsFlat.filter((g) => (g.debutTurn || 0) >= 7);
    if (rookieGroups.length > 0) {
      const bestRookie = [...rookieGroups].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
      awards["올해의 신인"] = `${bestRookie.name} (${bestRookie.ownerCompany})`;
    }
  }

  const bestFandom = [...players].sort((a, b) => (b.fandom || 0) - (a.fandom || 0))[0];
  if (bestFandom) awards["올해의 팬덤"] = bestFandom.companyName;

  const bestCEO = [...players].sort(
    (a, b) => (b.money || 0) + (b.reputation || 0) * 2 + (b.fandom || 0) - ((a.money || 0) + (a.reputation || 0) * 2 + (a.fandom || 0))
  )[0];
  if (bestCEO) awards["올해의 CEO"] = bestCEO.companyName;

  const bestReputation = [...players].sort((a, b) => (b.reputation || 0) - (a.reputation || 0))[0];
  if (bestReputation) awards["올해의 엔터테인먼트"] = bestReputation.companyName;

  return awards;
}

module.exports = {
  CONCEPTS,
  TREND_POOL,
  ACTIONS,
  generateTrainee,
  generateComposer,
  pickTrend,
  resolveAction,
  traineeAvgScore,
  groupAvgScore,
  generateRoomCode,
  computeYearEndAwards,
};
