import type { TFn } from "@/i18n";
export function builderLabels(t: TFn) {
  return {
    prompt: t("checklists.prompt"), guidance: t("checklists.guidance"), type: t("checklists.type"), required: t("checklists.required"),
    min: t("checklists.min"), max: t("checklists.max"), unit: t("checklists.unit"), ccp: t("checklists.linkedCcp"), add: t("checklists.addItem"),
    remove: t("common.remove"), up: "↑", down: "↓", BOOLEAN: t("itemType.BOOLEAN"), NUMBER: t("itemType.NUMBER"), TEMPERATURE: t("itemType.TEMPERATURE"), TEXT: t("itemType.TEXT"), none: "–",
  };
}
