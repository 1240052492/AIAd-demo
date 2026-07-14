import { systemSettingService } from './system-setting.service'

export const DEFAULT_CREDIT_RULES = {
  registerBonus: 5,
  imageGeneration: 2,
  composition: 1,
  exportPng: 1,
  exportPdf: 2,
  exportSvg: 1,
  ocrValidation: 0,
  textCorrection: 0,
}

export type CreditRuleKey = keyof typeof DEFAULT_CREDIT_RULES

export class CreditRuleService {
  async getRules(): Promise<Record<CreditRuleKey, number>> {
    const stored = await systemSettingService.get('creditRules', DEFAULT_CREDIT_RULES)
    const merged = { ...DEFAULT_CREDIT_RULES, ...stored }
    return Object.fromEntries(
      Object.entries(merged).map(([key, value]) => {
        const parsed = Number(value)
        return [key, Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_CREDIT_RULES[key as CreditRuleKey]]
      }),
    ) as Record<CreditRuleKey, number>
  }

  async getCost(key: CreditRuleKey): Promise<number> {
    const rules = await this.getRules()
    return rules[key]
  }
}

export const creditRuleService = new CreditRuleService()
