import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

/**
 * Exports the chat panel and (optionally) the artifact/dashboard panel
 * as a nicely formatted PDF.
 */
export async function exportToPDF(
  chatEl: HTMLElement,
  artifactEl: HTMLElement | null,
): Promise<void> {
  const PDF_WIDTH = 210   // A4 width in mm
  const PDF_HEIGHT = 297  // A4 height in mm
  const MARGIN = 10       // mm

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const usableW = PDF_WIDTH - MARGIN * 2

  const captureOptions = {
    scale: 2,
    useCORS: true,
    backgroundColor: null,        // preserve the element's own background
    logging: false,
    allowTaint: true,
  }

  // ── Helper ─────────────────────────────────────────────────────────────────
  function addPageHeader(pdf: jsPDF, label: string, pageNum: number) {
    pdf.setFontSize(7)
    pdf.setTextColor(120, 128, 153)
    pdf.text(`BI Tool  •  ${label}  •  Page ${pageNum}`, MARGIN, 6)
    pdf.text(new Date().toLocaleString(), PDF_WIDTH - MARGIN, 6, { align: 'right' })
    // thin rule
    pdf.setDrawColor(31, 41, 55)
    pdf.setLineWidth(0.2)
    pdf.line(MARGIN, 8, PDF_WIDTH - MARGIN, 8)
  }

  function addImageToPage(
    pdf: jsPDF,
    canvas: HTMLCanvasElement,
    pageNum: number,
    label: string,
  ) {
    addPageHeader(pdf, label, pageNum)

    const imgData = canvas.toDataURL('image/png')
    const canvasAspect = canvas.height / canvas.width
    const imgH = usableW * canvasAspect
    const maxH = PDF_HEIGHT - MARGIN * 2 - 10   // 10 mm reserved for header

    if (imgH <= maxH) {
      // Fits on one page
      pdf.addImage(imgData, 'PNG', MARGIN, 12, usableW, imgH)
    } else {
      // Split across multiple pages
      const sourceHeightPerPage = Math.floor((canvas.width * maxH) / usableW)
      let yOffset = 0
      let first = true

      while (yOffset < canvas.height) {
        if (!first) {
          pdf.addPage()
          pageNum++
          addPageHeader(pdf, label, pageNum)
        }
        first = false

        const sliceH = Math.min(sourceHeightPerPage, canvas.height - yOffset)
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = sliceH
        const ctx = sliceCanvas.getContext('2d')!
        ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        const sliceImg = sliceCanvas.toDataURL('image/png')
        const renderH = (sliceH / canvas.width) * usableW
        pdf.addImage(sliceImg, 'PNG', MARGIN, 12, usableW, renderH)
        yOffset += sliceH
      }
    }
  }

  // ── Capture chat panel ─────────────────────────────────────────────────────
  const chatCanvas = await html2canvas(chatEl, captureOptions)
  addImageToPage(pdf, chatCanvas, 1, 'Chat')

  // ── Capture artifact / dashboard panel ────────────────────────────────────
  if (artifactEl) {
    pdf.addPage()

    // The dashboard lives inside an <iframe> — we capture the outer wrapper
    // (which shows the iframe chrome + title bar) as a best-effort.
    const artifactCanvas = await html2canvas(artifactEl, captureOptions)
    addImageToPage(pdf, artifactCanvas, 2, 'Dashboard')
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  pdf.save(`bi-tool-export-${timestamp}.pdf`)
}
