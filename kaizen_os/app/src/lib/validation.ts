import { TaskStatus, UnitType } from '@prisma/client'

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

const VALID_STATUSES: TaskStatus[] = ['in_progress', 'not_started', 'completed', 'backlog']
const VALID_UNIT_TYPES: UnitType[] = ['THEME', 'ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS', 'TASK', 'VETO']

/**
 * Validate that a title is not empty or whitespace-only
 */
export function validateTitle(title: string | undefined | null): ValidationResult {
  const errors: ValidationError[] = []

  if (title === undefined || title === null) {
    errors.push({ field: 'title', message: 'Title is required' })
  } else if (title.trim() === '') {
    errors.push({ field: 'title', message: 'Title cannot be empty or whitespace only' })
  } else if (title.length > 255) {
    errors.push({ field: 'title', message: 'Title must be 255 characters or less' })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate unit type
 */
export function validateUnitType(unitType: string | undefined | null): ValidationResult {
  const errors: ValidationError[] = []

  if (!unitType) {
    errors.push({ field: 'unitType', message: 'Unit type is required' })
  } else if (!VALID_UNIT_TYPES.includes(unitType as UnitType)) {
    errors.push({
      field: 'unitType',
      message: `Invalid unit type: must be one of ${VALID_UNIT_TYPES.join(', ')}`,
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate status
 */
export function validateStatus(status: string | undefined | null): ValidationResult {
  const errors: ValidationError[] = []

  if (status && !VALID_STATUSES.includes(status as TaskStatus)) {
    errors.push({
      field: 'status',
      message: `Invalid status: must be one of ${VALID_STATUSES.join(', ')}`,
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate date format
 */
export function validateDate(date: unknown, fieldName: string): ValidationResult {
  const errors: ValidationError[] = []

  if (date !== undefined && date !== null) {
    const parsed = new Date(date as string | number | Date)
    if (isNaN(parsed.getTime())) {
      errors.push({ field: fieldName, message: `Invalid date format for ${fieldName}` })
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate positive integer
 */
export function validatePositiveInt(value: unknown, fieldName: string): ValidationResult {
  const errors: ValidationError[] = []

  if (value !== undefined && value !== null) {
    const num = Number(value)
    if (!Number.isInteger(num) || num <= 0) {
      errors.push({ field: fieldName, message: `${fieldName} must be a positive integer` })
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate card creation input
 */
export function validateCreateCard(data: {
  title?: string
  unitType?: string
  status?: string
  targetDate?: unknown
  startDate?: unknown
}): ValidationResult {
  const allErrors: ValidationError[] = []

  const titleResult = validateTitle(data.title)
  const unitTypeResult = validateUnitType(data.unitType)
  const statusResult = validateStatus(data.status)
  const targetDateResult = validateDate(data.targetDate, 'targetDate')
  const startDateResult = validateDate(data.startDate, 'startDate')

  allErrors.push(
    ...titleResult.errors,
    ...unitTypeResult.errors,
    ...statusResult.errors,
    ...targetDateResult.errors,
    ...startDateResult.errors
  )

  return { valid: allErrors.length === 0, errors: allErrors }
}

/**
 * Validate card update input
 */
export function validateUpdateCard(data: {
  title?: string
  status?: string
  targetDate?: unknown
  startDate?: unknown
  completionDate?: unknown
}): ValidationResult {
  const allErrors: ValidationError[] = []

  // Title is optional on update, but if provided must be valid
  if (data.title !== undefined) {
    const titleResult = validateTitle(data.title)
    allErrors.push(...titleResult.errors)
  }

  const statusResult = validateStatus(data.status)
  const targetDateResult = validateDate(data.targetDate, 'targetDate')
  const startDateResult = validateDate(data.startDate, 'startDate')
  const completionDateResult = validateDate(data.completionDate, 'completionDate')

  allErrors.push(
    ...statusResult.errors,
    ...targetDateResult.errors,
    ...startDateResult.errors,
    ...completionDateResult.errors
  )

  return { valid: allErrors.length === 0, errors: allErrors }
}

/**
 * Validate season creation input
 */
export function validateCreateSeason(data: {
  name?: string
  startDate?: unknown
  durationWeeks?: unknown
  utilityRate?: unknown
}): ValidationResult {
  const allErrors: ValidationError[] = []

  // Name validation
  if (!data.name || data.name.trim() === '') {
    allErrors.push({ field: 'name', message: 'Season name is required' })
  } else if (data.name.length > 100) {
    allErrors.push({ field: 'name', message: 'Season name must be 100 characters or less' })
  }

  // Start date validation
  if (!data.startDate) {
    allErrors.push({ field: 'startDate', message: 'Start date is required' })
  } else {
    const dateResult = validateDate(data.startDate, 'startDate')
    allErrors.push(...dateResult.errors)
  }

  // Duration weeks validation
  if (!data.durationWeeks) {
    allErrors.push({ field: 'durationWeeks', message: 'Duration weeks is required' })
  } else {
    const durationResult = validatePositiveInt(data.durationWeeks, 'durationWeeks')
    allErrors.push(...durationResult.errors)
  }

  // Utility rate validation (optional)
  if (data.utilityRate !== undefined && data.utilityRate !== null) {
    const rate = Number(data.utilityRate)
    if (isNaN(rate) || rate < 0 || rate > 168) {
      allErrors.push({ field: 'utilityRate', message: 'Utility rate must be between 0 and 168 hours per week' })
    }
  }

  return { valid: allErrors.length === 0, errors: allErrors }
}

/**
 * Format validation errors for API response
 */
export function formatValidationErrors(errors: ValidationError[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {}
  
  for (const error of errors) {
    if (!grouped[error.field]) {
      grouped[error.field] = []
    }
    grouped[error.field].push(error.message)
  }

  return grouped
}
