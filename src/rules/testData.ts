/**
 * Test fixtures: load the real data files from disk rather than mock them.
 *
 * The whole point of the rules engine is that it fires on the shipped `data/rules.json`,
 * so the tests read that file. Node only — the browser build never imports this.
 *
 * Owned by Agent RUL.
 */

import { readFileSync } from 'node:fs'
import {
  validatePatientModel,
  validateProducts,
  validateRules,
  validateSubstances,
  type PilSimData,
} from '../data/load'

function readJson(name: string): unknown {
  const url = new URL(`../../data/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

let cached: PilSimData | null = null

export function loadDataFromDisk(): PilSimData {
  if (cached) return cached
  cached = {
    substances: validateSubstances(readJson('substances.json')),
    products: validateProducts(readJson('products.json')),
    rules: validateRules(readJson('rules.json')),
    patientModel: validatePatientModel(readJson('patient_model.json')),
  }
  return cached
}
