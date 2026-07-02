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
  comeback: {
    label: "컴백/데뷔",
    desc: "그룹의 신곡을 발매하고 활동합니다.",
    cost: { money: 15 },
    needsGroupTarget: true,
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

function pickTrend() {
  return TREND_POOL[randInt(0, TREND_POOL.length - 1)];
}

function traineeAvgScore(trainee) {
  const keys = ["vocal", "dance", "rap", "visual", "fanservice", "mental"];
  const sum = keys.reduce((acc, k) => acc + (GRADE_SCORE[trainee[k]] || 50), 0);
  return sum / keys.length;
}

function groupAvgScore(group, traineePool) {
  const members = group.memberIds
    .map((id) => traineePool.find((t) => t.id === id))
    .filter(Boolean);
  if (members.length === 0) return 50;
  return members.reduce((acc, m) => acc + traineeAvgScore(m), 0) / members.length;
}

/**
 * 한 플레이어의 액션 하나를 처리해서 stat 변화량(delta)과
 * 계산에 쓰인 "원재료" 정보를 리턴한다. (AI는 이 원재료를 보고 이유를 설명함)
 */
function resolveAction(player, action, trend) {
  const delta = { money: 0, reputation: 0, fandom: 0 };
  const facts = []; // AI에게 넘길 계산 근거들
  const type = action?.type;

  if (!type || !ACTIONS[type]) {
    facts.push("이번 달에 별다른 활동을 하지 않았습니다.");
    return { delta, facts };
  }

  const cost = ACTIONS[type].cost || {};
  if (cost.money) delta.money -= cost.money;

  switch (type) {
    case "scout": {
      facts.push("새 연습생을 영입하기 위해 비용을 지출했습니다.");
      break;
    }
    case "train": {
      facts.push("연습생 트레이닝에 투자했습니다.");
      break;
    }
    case "form_group": {
      facts.push(`새 그룹 "${action.groupName || "무명"}"을(를) 결성했습니다.`);
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
      const performance = avgScore + trendBonus + randomness;

      const fandomGain = Math.max(0, Math.round(performance * 1.2));
      const repGain = Math.max(0, Math.round(performance * 0.4));
      const moneyGain = Math.max(0, Math.round(performance * 1.5));

      delta.fandom += fandomGain;
      delta.reputation += repGain;
      delta.money += moneyGain;

      facts.push(
        `그룹 "${group.name}"(컨셉: ${group.concept}, 실력 평균 ${Math.round(avgScore)}점)이 컴백했습니다.`
      );
      facts.push(
        conceptMatch
          ? `이번 달 시장 트렌드(${trend.concept})와 그룹 컨셉이 일치해 유리했습니다.`
          : `이번 달 시장 트렌드는 ${trend.concept}였고, 그룹 컨셉(${group.concept})과는 맞지 않았습니다.`
      );
      facts.push(`최종 활동 점수는 약 ${Math.round(performance)}점으로 집계되었습니다.`);
      break;
    }
    case "marketing": {
      const group = (player.groups || []).find((g) => g.id === action.targetGroupId);
      const base = randInt(5, 20);
      delta.fandom += base;
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

  return { delta, facts };
}

module.exports = {
  CONCEPTS,
  TREND_POOL,
  ACTIONS,
  generateTrainee,
  pickTrend,
  resolveAction,
  traineeAvgScore,
  groupAvgScore,
  generateRoomCode,
};
