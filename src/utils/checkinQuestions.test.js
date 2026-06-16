import { describe, it, expect } from 'vitest'
import {
  blankValue, isAnswerEmpty, validateAnswers, buildAnswers, formatAnswer, parseOptions,
  DEFAULT_QUESTIONS, QUESTION_TYPES,
} from './checkinQuestions'

describe('blankValue', () => {
  it('starts ratings mid-scale and everything else empty', () => {
    expect(blankValue('rating', { max: 10 })).toBe(5)
    expect(blankValue('rating', { max: 5 })).toBe(3)
    expect(blankValue('boolean')).toBe(null)
    expect(blankValue('number')).toBe('')
    expect(blankValue('text')).toBe('')
    expect(blankValue('select')).toBe('')
  })
})

describe('isAnswerEmpty', () => {
  it('treats unset booleans and blank text/number as empty, 0/false as answered', () => {
    expect(isAnswerEmpty('boolean', null)).toBe(true)
    expect(isAnswerEmpty('boolean', false)).toBe(false)
    expect(isAnswerEmpty('text', '   ')).toBe(true)
    expect(isAnswerEmpty('number', '')).toBe(true)
    expect(isAnswerEmpty('rating', 7)).toBe(false)
  })
})

describe('validateAnswers', () => {
  const qs = [
    { id: 'a', type: 'text', required: true },
    { id: 'b', type: 'boolean', required: true },
    { id: 'c', type: 'text', required: false },
  ]
  it('flags only required-and-empty answers', () => {
    expect(validateAnswers(qs, { a: '', b: null, c: '' })).toEqual(['a', 'b'])
    expect(validateAnswers(qs, { a: 'hi', b: false, c: '' })).toEqual([])
  })
})

describe('buildAnswers', () => {
  it('snapshots prompt/type/config/value per question', () => {
    const qs = [{ id: 'q1', prompt: 'Sleep?', type: 'rating', config: { max: 10 } }]
    expect(buildAnswers(qs, { q1: 8 })).toEqual([
      { question_id: 'q1', prompt: 'Sleep?', type: 'rating', config: { max: 10 }, value: 8 },
    ])
  })
  it('records null for an unanswered question', () => {
    const qs = [{ id: 'q1', prompt: 'Notes', type: 'text', config: {} }]
    expect(buildAnswers(qs, {})[0].value).toBe(null)
  })
})

describe('formatAnswer', () => {
  it('renders each type for the coach review', () => {
    expect(formatAnswer({ type: 'rating', value: 7, config: { max: 10 } })).toBe('7/10')
    expect(formatAnswer({ type: 'boolean', value: true })).toBe('Yes')
    expect(formatAnswer({ type: 'boolean', value: false })).toBe('No')
    expect(formatAnswer({ type: 'number', value: 6.5, config: { unit: 'hrs' } })).toBe('6.5 hrs')
    expect(formatAnswer({ type: 'text', value: 'travel week' })).toBe('travel week')
    expect(formatAnswer({ type: 'text', value: '' })).toBe('—')
  })
})

describe('parseOptions', () => {
  it('splits, trims, and drops blanks', () => {
    expect(parseOptions('Low, Medium ,, High')).toEqual(['Low', 'Medium', 'High'])
    expect(parseOptions('')).toEqual([])
  })
})

describe('DEFAULT_QUESTIONS / QUESTION_TYPES', () => {
  it('default set mirrors the legacy 4 fields', () => {
    expect(DEFAULT_QUESTIONS.map(q => q.type)).toEqual(['rating', 'rating', 'text', 'text'])
    expect(DEFAULT_QUESTIONS.filter(q => q.required)).toHaveLength(2)
  })
  it('offers the five supported types', () => {
    expect(QUESTION_TYPES.map(t => t.type)).toEqual(['rating', 'boolean', 'number', 'text', 'select'])
  })
})
