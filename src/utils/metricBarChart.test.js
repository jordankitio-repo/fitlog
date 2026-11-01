import { describe, it, expect } from 'vitest'
import { metricBarData } from './metricBarChart'

const fallback = (a) => `metric(${a})`

describe('metricBarData', () => {
  it('a flat target draws a flat line', () => {
    const d = metricBarData({ history: [{ date: 'a', steps: 9000 }, { date: 'b', steps: 4000 }], valueKey: 'steps', label: 'Steps', target: 10000, fallback })
    expect(d.datasets[1].data).toEqual([10000, 10000])
  })
  it('per-row targets grade each bar against its own plan and step the line', () => {
    const history = [
      { date: 'a', steps: 9000, target: 9000 },
      { date: 'b', steps: null, target: 12000 },
      { date: 'c', steps: 9000, target: 12000 },
    ]
    const d = metricBarData({ history, valueKey: 'steps', label: 'Steps', target: 5000, fallback })
    expect(d.datasets[1].data).toEqual([9000, 12000, 12000])
    expect(d.datasets[1].stepped).toBe(true)
    // 100% of its plan vs 75% of its plan: different grades, same value.
    expect(d.datasets[0].backgroundColor[0]).not.toBe(d.datasets[0].backgroundColor[2])
  })
  it('a per-row series never falls back to the flat target', () => {
    const d = metricBarData({ history: [{ date: 'a', steps: 100, target: null }], valueKey: 'steps', label: 'Steps', target: 5000, fallback })
    expect(d.datasets).toHaveLength(1)
    expect(d.datasets[0].backgroundColor[0]).toBe('metric(1)')
  })
})
