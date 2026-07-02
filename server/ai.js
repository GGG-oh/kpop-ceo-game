const fetch = require("node-fetch");

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/**
 * NVIDIA NIM (OpenAI 호환) 챗 컴플리션 호출.
 * responseIsJson=true면 JSON.parse까지 시도해서 리턴.
 */
async function callAI(systemPrompt, userPrompt, { responseIsJson = false, temperature = 0.9 } = {}) {
  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NVIDIA API 오류 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || "";

  if (!responseIsJson) return text;

  // 코드블록(```json ... ```)으로 감싸져 오는 경우 제거
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[ai.js] JSON 파싱 실패, 원본 텍스트:", text);
    throw new Error("AI 응답을 JSON으로 파싱하지 못했습니다.");
  }
}

/**
 * 이번 턴 결과에 대한 "원인 설명 + 뉴스 문구"를 AI에게 요청.
 * playersFacts: [{ playerId, companyName, action, delta, facts }]
 */
async function generateTurnNarrative({ turn, trend, playersFacts }) {
  const system = `당신은 한국 K-POP 산업을 시뮬레이션하는 게임의 AI 진행자입니다.
플레이어들의 이번 달(턴) 활동 결과가 이미 숫자로 계산되어 주어집니다.
당신의 역할은 그 숫자를 "왜" 그런 결과가 나왔는지 설득력 있게 설명하고,
연예 매체 기사 톤의 짧은 뉴스 문구를 작성하는 것입니다.
절대로 주어진 숫자(delta)를 바꾸지 마세요. 오직 설명과 뉴스 문구만 생성합니다.
반드시 순수 JSON만 출력하세요. 다른 텍스트나 마크다운은 절대 포함하지 마세요.`;

  const userPayload = {
    턴: turn,
    이번달_시장트렌드: trend,
    플레이어별_활동결과: playersFacts.map((p) => ({
      회사명: p.companyName,
      행동: p.action?.type || "없음",
      계산근거: p.facts,
      스탯변화: p.delta,
    })),
  };

  const user = `다음 데이터를 바탕으로 JSON을 생성하세요.

${JSON.stringify(userPayload, null, 2)}

출력 형식(JSON):
{
  "companyReasoning": {
    "회사명1": "왜 이런 결과가 나왔는지 2~3문장으로 설명 (원인-결과 구조로, 게임 전략에 도움되게)",
    "회사명2": "...",
    "회사명3": "..."
  },
  "newsText": "이번 달 연예계 전체를 다루는 짧은 기사 형식 뉴스 (3~5문장, 플레이어 회사들의 활동을 자연스럽게 언급)"
}`;

  return callAI(system, user, { responseIsJson: true, temperature: 0.9 });
}

/**
 * 게임 종료 시 각 회사의 "역사 요약 기사"를 생성.
 */
async function generateEndingSummaries({ players }) {
  const system = `당신은 K-POP 엔터테인먼트 산업 전문 기자입니다.
각 회사의 1년간 활동 데이터를 보고, 그 회사만의 서사가 담긴 결산 기사를 작성합니다.
반드시 순수 JSON만 출력하세요.`;

  const user = `다음은 게임에 참여한 3개 회사의 최종 데이터입니다:

${JSON.stringify(players, null, 2)}

각 회사마다 5~7문장 분량의 "1년 결산 기사"를 작성하세요. 회사마다 서로 다른 개성과 서사를 담아주세요.

출력 형식(JSON):
{
  "회사명1": "결산 기사...",
  "회사명2": "결산 기사...",
  "회사명3": "결산 기사..."
}`;

  return callAI(system, user, { responseIsJson: true, temperature: 1.0 });
}

module.exports = { callAI, generateTurnNarrative, generateEndingSummaries };
