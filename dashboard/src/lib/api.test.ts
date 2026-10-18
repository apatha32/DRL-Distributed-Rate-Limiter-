import { describe, expect, it } from 'vitest'
import { ApiNotConnectedError, errorMessage, normalizeApiBase, requireJson } from './api'

describe('requireJson', () => {
  it('passes JSON API responses through', () => {
    const res = { headers: { 'content-type': 'application/json' }, data: { ok: true } }
    expect(requireJson(res)).toBe(res)
  })

  it('rejects an HTML page (dashboard rewrite) with a clear message', () => {
    const html = { headers: { 'content-type': 'text/html; charset=utf-8' }, data: '<!doctype html>' }
    expect(() => requireJson(html)).toThrow(ApiNotConnectedError)
    try {
      requireJson(html)
    } catch (err) {
      expect(errorMessage(err)).toMatch(/VITE_API_URL/)
    }
  })
})

describe('normalizeApiBase', () => {
  it('adds https:// when the scheme is missing and trims trailing slashes', () => {
    expect(normalizeApiBase('drl-production.up.railway.app')).toBe('https://drl-production.up.railway.app')
    expect(normalizeApiBase(' https://api.example.com/ ')).toBe('https://api.example.com')
    expect(normalizeApiBase('http://localhost:8000')).toBe('http://localhost:8000')
    expect(normalizeApiBase('')).toBe('')
    expect(normalizeApiBase(undefined)).toBe('')
  })
})
