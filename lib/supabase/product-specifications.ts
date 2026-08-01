import { supabase } from './client'

export type SpecificationInput = { label: string; value: string }
export type ProductSpecification = SpecificationInput & {
  id: string
  product_id: string
  sort_order: number
  updated_at: string
  // This is temporary diagnostic metadata. It lets a browser save attempt be
  // traced through the database and into the separate static site build.
  save_attempt_id: string | null
}

export function normalizeSpecificationRows(rows: SpecificationInput[]) {
  const populatedRows = rows
    .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter((row) => row.label !== '' || row.value !== '')

  if (populatedRows.some((row) => !row.label || !row.value)) {
    throw new Error('Each specification needs both a label and a value, or remove the incomplete row.')
  }

  return populatedRows.map((row, sort_order) => ({ ...row, sort_order }))
}

export async function fetchProductSpecifications(productId: string) {
  return supabase
    .from('product_specifications')
    .select('id,product_id,label,value,sort_order,updated_at,save_attempt_id')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
}

export async function replaceProductSpecifications(productId: string, rows: SpecificationInput[], saveAttemptId?: string) {
  const normalizedRows = normalizeSpecificationRows(rows)
  const payload = normalizedRows.map((row) => ({
    ...row,
    product_id: productId,
    save_attempt_id: saveAttemptId ?? null,
  }))
  console.log('[Hydro Blasters MNL] Specification save transaction', { saveAttemptId, stage: 'C. rows sent to Supabase', rows: payload })

  const { data: deletedRows, error: deleteError } = await supabase
    .from('product_specifications')
    .delete()
    .eq('product_id', productId)
    .select('id')
  if (deleteError) throw deleteError
  console.log('[Hydro Blasters MNL] Specification save transaction', { saveAttemptId, stage: 'delete result', rows: deletedRows ?? [] })

  let insertedRows: ProductSpecification[] = []
  if (payload.length > 0) {
    const { data, error } = await supabase
      .from('product_specifications')
      .insert(payload)
      .select('id,product_id,label,value,sort_order,updated_at,save_attempt_id')
    if (error) throw error
    insertedRows = (data ?? []) as ProductSpecification[]
  }
  console.log('[Hydro Blasters MNL] Specification save transaction', { saveAttemptId, stage: 'insert result', rows: insertedRows })

  const { data: verifiedRows, error: verifyError } = await fetchProductSpecifications(productId)
  if (verifyError) throw verifyError
  const verified = (verifiedRows ?? []) as ProductSpecification[]
  console.log('[Hydro Blasters MNL] Specification save transaction', { saveAttemptId, stage: 'D. immediate database readback', rows: verified })

  const matches = verified.length === payload.length && verified.every((row, index) =>
    row.label === payload[index].label && row.value === payload[index].value && row.sort_order === payload[index].sort_order,
  )
  if (!matches) throw new Error('Supabase did not return the exact specification rows that were submitted. The catalogue was not marked ready to publish.')
  return verified
}
