export const normalizeExecutionPlan = (plan = {}) => ({
  steps: Array.isArray(plan?.steps) ? plan.steps.filter((step) => step?.tool) : [],
  responseMode: String(plan?.responseMode || 'summary').trim(),
})
