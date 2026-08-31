import {
  mergeImagesSideBySide,
  urlToImageFile,
  type BroadcastShareResult,
} from './designBroadcast'
import { fetchCrmCustomers, whatsappDigits } from './crmCustomers'
import { supabase } from './supabase'
import type { CrmCustomer, DesignCatalog } from './database.types'

/** @deprecated use CrmCustomer from database.types / fetchCrmCustomers */
export type CatalogCustomerStub = {
  id: string
  name: string
  whatsapp: string
}

export function toCatalogCustomerStub(c: CrmCustomer): CatalogCustomerStub {
  return { id: c.id, name: c.name, whatsapp: c.whatsapp_number }
}

export async function loadCatalogCustomers(): Promise<CatalogCustomerStub[]> {
  const rows = await fetchCrmCustomers()
  return rows.map(toCatalogCustomerStub)
}

export function catalogShareCaption(designNo: number, jfgNo: string) {
  return `Design No. ${designNo} | JFG ${jfgNo}`
}

export async function fetchDesignCatalog(): Promise<DesignCatalog[]> {
  const { data, error } = await supabase
    .from('design_catalog')
    .select('*')
    .order('design_no', { ascending: false })
  if (error) throw error
  return (data as DesignCatalog[]) ?? []
}

/** Next suggested design_no = max existing + 1 (falls back to sequence default of 1). */
export async function nextCatalogDesignNo(): Promise<number> {
  const { data, error } = await supabase
    .from('design_catalog')
    .select('design_no')
    .order('design_no', { ascending: false })
    .limit(1)
  if (error) throw error
  const max = data?.[0]?.design_no
  return typeof max === 'number' ? max + 1 : 1
}

export async function uploadCatalogImage(
  file: File,
  kind: 'design' | 'matching',
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${kind}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('design-catalog-images').upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) throw error
  const { data } = supabase.storage.from('design-catalog-images').getPublicUrl(path)
  return data.publicUrl
}

export async function insertDesignCatalog(row: {
  design_no: number
  jfg_no: string
  design_image_url: string
  matching_image_url: string | null
  notes: string | null
  created_by: string | null
}): Promise<void> {
  const { error } = await supabase.from('design_catalog').insert(row)
  if (error) throw error
}

export async function updateDesignCatalog(
  id: string,
  patch: {
    jfg_no?: string
    notes?: string | null
    design_image_url?: string
    matching_image_url?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('design_catalog').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteDesignCatalog(id: string): Promise<void> {
  const { error } = await supabase.from('design_catalog').delete().eq('id', id)
  if (error) throw error
}

/**
 * Share catalog image(s) + caption via Web Share API.
 * Optional phone opens wa.me text fallback when native file share is unavailable.
 * Matching image may be null for bulk-added designs.
 */
export async function shareCatalogDesign(args: {
  caption: string
  designImageUrl: string
  matchingImageUrl: string | null
  phone?: string | null
}): Promise<BroadcastShareResult> {
  const { caption, designImageUrl, matchingImageUrl, phone } = args
  const phoneDigits = phone ? whatsappDigits(phone) : ''
  const waTextUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(caption)}`
    : `https://wa.me/?text=${encodeURIComponent(caption)}`

  if (!navigator.share) {
    window.open(waTextUrl, '_blank', 'noopener,noreferrer')
    return 'fallback-text'
  }

  try {
    const designFile = await urlToImageFile(designImageUrl, 'design.jpg')
    if (matchingImageUrl) {
      const matchingFile = await urlToImageFile(matchingImageUrl, 'matching.jpg')
      const dual = { title: 'Design Catalog', text: caption, files: [designFile, matchingFile] }
      if (navigator.canShare?.(dual)) {
        await navigator.share(dual)
        return 'shared'
      }

      const combined = await mergeImagesSideBySide(
        designImageUrl,
        matchingImageUrl,
        'design-catalog.jpg',
      )
      const one = { title: 'Design Catalog', text: caption, files: [combined] }
      if (navigator.canShare?.(one)) {
        await navigator.share(one)
        return 'shared'
      }
    } else {
      const one = { title: 'Design Catalog', text: caption, files: [designFile] }
      if (navigator.canShare?.(one)) {
        await navigator.share(one)
        return 'shared'
      }
    }

    await navigator.share({ title: 'Design Catalog', text: caption })
    return 'fallback-text'
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    try {
      await navigator.share({ title: 'Design Catalog', text: caption })
      return 'fallback-text'
    } catch (e2) {
      if (e2 instanceof DOMException && e2.name === 'AbortError') return 'cancelled'
      window.open(waTextUrl, '_blank', 'noopener,noreferrer')
      return 'unsupported'
    }
  }
}
