import { supabase } from './supabase'

const DIN_IMAGE_BUCKETS = ['din-images', 'sample-designs'] as const

function isBucketMissingError(error: { message?: string; statusCode?: string | number }): boolean {
  const message = (error.message ?? '').toLowerCase()
  return message.includes('bucket not found') || String(error.statusCode) === '404'
}

/** Upload DIN/design reference images; falls back if primary bucket is missing. */
export async function uploadDinStorageObject(
  path: string,
  file: File,
  options?: { contentType?: string },
): Promise<string> {
  const contentType = options?.contentType ?? (file.type || undefined)
  let lastError: { message?: string; statusCode?: string | number } | null = null

  for (const bucket of DIN_IMAGE_BUCKETS) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType,
    })
    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      return data.publicUrl
    }
    lastError = error
    if (!isBucketMissingError(error)) throw error
  }

  throw lastError ?? new Error('DIN image storage is not configured')
}
