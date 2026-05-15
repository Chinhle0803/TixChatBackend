class WeatherTool {
  constructor() {
    this.name = 'weatherTool'
  }

  async execute() {
    return {
      available: false,
      reason: 'not_configured',
    }
  }
}

export default new WeatherTool()
