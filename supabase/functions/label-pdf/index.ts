// label-pdf — printable label sheets (A4, 3 x 8 grid = 24 labels/page).
//   { "type": "bins",     "ids": [...] }  -> QR of location_code + code beneath
//   { "type": "products", "ids": [...] }  -> Code128 of barcode (or SKU) + name
// Any authenticated active user may print labels.
import { AuthError, requireUser, serviceClient } from '../_shared/client.ts'
import { corsHeaders, fail, preflight } from '../_shared/cors.ts'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import QRCode from 'npm:qrcode@1.5.4'
import bwipjs from 'npm:bwip-js@4.5.1'

const PAGE = { w: 595.28, h: 841.89 }
const GRID = { cols: 3, rows: 8, marginX: 28, marginY: 34, gap: 8 }

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const type = body?.type as 'bins' | 'products'
    const ids = (body?.ids ?? []) as string[]

    if (type !== 'bins' && type !== 'products') {
      return fail('INVALID', 'type must be "bins" or "products"')
    }
    if (!Array.isArray(ids) || ids.length === 0) return fail('INVALID', 'ids must be a non-empty array')
    if (ids.length > 480) return fail('INVALID', 'at most 480 labels (20 pages) per request')

    const admin = serviceClient()
    const labels: { primary: string; secondary: string; payload: string }[] = []

    if (type === 'bins') {
      const { data, error } = await admin
        .from('bins')
        .select('id, location_code, code, capacity')
        .in('id', ids)
        .order('location_code')
      if (error) throw new Error(error.message)
      for (const b of data ?? []) {
        labels.push({
          primary: b.location_code,
          secondary: b.capacity ? `capacity ${b.capacity}` : 'bin',
          payload: b.location_code,
        })
      }
    } else {
      const { data, error } = await admin
        .from('products')
        .select('id, sku, name, barcode')
        .in('id', ids)
        .order('sku')
      if (error) throw new Error(error.message)
      for (const p of data ?? []) {
        labels.push({ primary: p.sku, secondary: p.name, payload: p.barcode || p.sku })
      }
    }

    if (labels.length === 0) return fail('NOT_FOUND', 'no matching records', undefined, 404)

    const pdf = await buildPdf(type, labels)
    return new Response(pdf, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="bintrack-${type}-labels.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code, err.message, undefined, err.status)
    return fail('LABEL_FAILED', (err as Error).message, undefined, 500)
  }
})

async function buildPdf(
  type: 'bins' | 'products',
  labels: { primary: string; secondary: string; payload: string }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`BinTrack ${type} labels`)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const monoBold = await doc.embedFont(StandardFonts.CourierBold)
  const sans = await doc.embedFont(StandardFonts.Helvetica)

  const cellW = (PAGE.w - GRID.marginX * 2 - GRID.gap * (GRID.cols - 1)) / GRID.cols
  const cellH = (PAGE.h - GRID.marginY * 2 - GRID.gap * (GRID.rows - 1)) / GRID.rows
  const perPage = GRID.cols * GRID.rows

  for (let i = 0; i < labels.length; i++) {
    if (i % perPage === 0) doc.addPage([PAGE.w, PAGE.h])
    const page = doc.getPage(doc.getPageCount() - 1)
    const slot = i % perPage
    const col = slot % GRID.cols
    const row = Math.floor(slot / GRID.cols)
    const x = GRID.marginX + col * (cellW + GRID.gap)
    const y = PAGE.h - GRID.marginY - (row + 1) * cellH - row * GRID.gap
    const label = labels[i]

    page.drawRectangle({
      x,
      y,
      width: cellW,
      height: cellH,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    })

    const image = await renderCode(doc, type, label.payload)
    if (image) {
      const maxImgH = type === 'bins' ? cellH - 30 : cellH - 34
      const scale = Math.min((cellW - 24) / image.width, maxImgH / image.height)
      const w = image.width * scale
      const h = image.height * scale
      page.drawImage(image, {
        x: x + (cellW - w) / 2,
        y: y + cellH - h - 8,
        width: w,
        height: h,
      })
    }

    page.drawText(fit(label.primary, 20), {
      x: x + 8,
      y: y + 14,
      size: 9,
      font: monoBold,
      color: rgb(0, 0, 0),
    })
    page.drawText(fit(label.secondary, 30), {
      x: x + 8,
      y: y + 5,
      size: 6.5,
      font: type === 'bins' ? mono : sans,
      color: rgb(0.4, 0.4, 0.4),
    })
  }

  return await doc.save()
}

async function renderCode(doc: PDFDocument, type: 'bins' | 'products', payload: string) {
  try {
    if (type === 'bins') {
      const png = await QRCode.toBuffer(payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      return await doc.embedPng(new Uint8Array(png))
    }
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: payload,
      scale: 3,
      height: 12,
      includetext: false,
    })
    return await doc.embedPng(new Uint8Array(png))
  } catch {
    return null // barcode rendering failed — the text under it still identifies the label
  }
}

function fit(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
