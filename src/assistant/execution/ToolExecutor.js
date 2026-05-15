import config from '../../config/index.js'

class ToolExecutor {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry
  }

  async execute(plan = {}, executionContext = {}) {
    const steps = Array.isArray(plan?.steps) ? plan.steps.slice(0, config.assistantMaxToolSteps) : []
    const toolOutputs = {}
    const trace = []

    for (const step of steps) {
      const tool = this.toolRegistry?.[step.tool]
      if (!tool) {
        trace.push({ tool: step.tool, ok: false, error: 'tool_not_found' })
        continue
      }

      const startedAt = Date.now()
      try {
        const result = await tool.execute(step.args || {}, {
          ...executionContext,
          toolOutputs,
        })
        toolOutputs[step.tool] = result
        trace.push({
          tool: step.tool,
          ok: true,
          durationMs: Date.now() - startedAt,
        })
      } catch (error) {
        toolOutputs[step.tool] = {
          available: false,
          reason: error?.message || 'tool_execution_failed',
        }
        trace.push({
          tool: step.tool,
          ok: false,
          durationMs: Date.now() - startedAt,
          error: error?.message || 'tool_execution_failed',
        })
      }
    }

    return { toolOutputs, trace }
  }
}

export default ToolExecutor
