import type { Candidate, ChangeType } from "./types";

const HEADER: Record<Exclude<ChangeType, "none">, string> = {
  new_listing: "新物件",
  price_drop: "降價",
  relisted: "重新上架",
  became_candidate: "成為候選",
  material_listing_change: "物件更新",
  review_change: "評估更新",
};

const SCORE_LEVEL_ZH: Record<Candidate["score_level"], string> = {
  strong: "強力推薦",
  normal: "一般",
  loose: "寬鬆",
  reject: "拒絕",
};

const PHOTO_REVIEW_ZH: Record<Candidate["photo_review"], string> = {
  acceptable: "可接受",
  needs_review: "待確認",
  poor: "不佳",
};

const APPLIANCE_REVIEW_ZH: Record<Candidate["appliance_review"], string> = {
  complete: "完整",
  partial: "部分",
  missing: "缺少",
};

const APPLIANCE_ZH: Record<string, string> = {
  air_conditioner: "冷氣",
  refrigerator: "冰箱",
  washing_machine: "洗衣機",
  water_heater: "熱水器",
};

const SOURCE_LABEL: Record<Candidate["listing_identity"]["source"], string> = {
  "591": "591",
  nearyou: "NearYou",
};

function zhAppliances(list: readonly string[]): string {
  return list.map((a) => APPLIANCE_ZH[a] ?? a).join("、");
}

export interface RenderInput {
  event_type: Exclude<ChangeType, "none">;
  candidate: Candidate;
  price_drop?: { previous: number; current: number };
}

export function renderMessage(input: RenderInput): string {
  const { event_type, candidate, price_drop } = input;
  const c = candidate;
  const header = `[${HEADER[event_type]}] ${c.district} ${c.layout.split("房")[0]}房 NT$${fmt(c.rent_price)}`;

  const lines: string[] = [header, "", `標題：${c.title}`];

  if (event_type === "price_drop" && price_drop) {
    lines.push(`租金：NT$${fmt(price_drop.current)}/月 (原 NT$${fmt(price_drop.previous)})`);
  } else {
    lines.push(`租金：NT$${fmt(c.rent_price)}/月`);
  }

  lines.push(
    `區域：${c.district}`,
    `格局：${c.layout}`,
    `坪數：${c.area_ping ?? "?"} 坪`,
    `樓層：${c.floor ?? "?"}`,
    `預算分級：${SCORE_LEVEL_ZH[c.score_level]}`,
    `照片評估：${PHOTO_REVIEW_ZH[c.photo_review]}`,
    `家電評估：${APPLIANCE_REVIEW_ZH[c.appliance_review]}`,
  );

  if (c.appliances_seen.length > 0) lines.push(`已見：${zhAppliances(c.appliances_seen)}`);
  if (c.appliances_missing_or_unknown.length > 0)
    lines.push(`未確認：${zhAppliances(c.appliances_missing_or_unknown)}`);

  if (c.recommendation_reason) lines.push(`推薦理由：${c.recommendation_reason}`);
  if (c.concerns.length > 0) lines.push(`注意事項：${c.concerns.join("；")}`);

  if (c.photo_review === "poor") lines.push("⚠ 高度警示：照片狀況不佳，建議手動確認");

  lines.push(
    `${SOURCE_LABEL[c.listing_identity.source]}：${c.listing_identity.source_url}`,
  );

  // Notifier self-attribution as the final line. Provided by the agent —
  // server does not hardcode a model name.
  if (c.notifier_signature) lines.push("", `— ${c.notifier_signature}`);

  return lines.join("\n");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
