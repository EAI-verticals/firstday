'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DocumentAnalysis } from '@/lib/onboarding/content-understanding';

export function IdentityDocumentReview({
  file,
  analysis,
  processing,
  purpose = 'identity',
}: {
  file: File;
  analysis: DocumentAnalysis | null;
  processing: boolean;
  purpose?: 'identity' | 'supporting';
}): React.ReactNode {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [previewError, setPreviewError] = useState('');
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let disposed = false;
    let destroyPdf: (() => void) | undefined;
    setFileUrl(url);
    setPdf(null);
    setPage(1);
    setPreviewError('');
    if (canvas.current) {
      canvas.current.width = 0;
      canvas.current.height = 0;
    }
    setRendering(file.type === 'application/pdf');
    if (file.type === 'application/pdf') {
      void (async () => {
        try {
          const pdfjs = await import('pdfjs-dist');
          const data = new Uint8Array(await file.arrayBuffer());
          if (disposed) return;
          pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.NEXT_PUBLIC_APP_BASE_PATH || ''}/pdf.worker.min.mjs`;
          const task = pdfjs.getDocument({ data });
          destroyPdf = () => {
            void task.destroy();
          };
          const document = await task.promise;
          if (!disposed) setPdf(document);
        } catch {
          if (!disposed) {
            setPreviewError(
              'Preview unavailable. Open the original document to view it.',
            );
            setRendering(false);
          }
        }
      })();
    }
    return () => {
      disposed = true;
      destroyPdf?.();
      URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => {
    if (!pdf) return;
    let disposed = false;
    let cancelRender: (() => void) | undefined;
    setRendering(true);
    void (async () => {
      try {
        const sheet = await pdf.getPage(page);
        if (disposed || !canvas.current) return;
        const natural = sheet.getViewport({ scale: 1 });
        const viewport = sheet.getViewport({
          scale: Math.min(2, 1100 / natural.width),
        });
        const target = canvas.current;
        target.width = viewport.width;
        target.height = viewport.height;
        const task = sheet.render({ canvas: target, viewport });
        cancelRender = () => task.cancel();
        await task.promise;
        if (!disposed) {
          setRendering(false);
          setPreviewError('');
        }
      } catch {
        if (!disposed) {
          setPreviewError(
            'This page could not be previewed. Open the original document.',
          );
          setRendering(false);
        }
      }
    })();
    return () => {
      disposed = true;
      cancelRender?.();
    };
  }, [pdf, page]);

  const fields = analysis?.scope === 'extraction' ? analysis.fields : undefined;
  return (
    <div className='ew-document-review'>
      <section className='ew-document-preview' aria-label='Document preview'>
        <header>
          <h3>Document preview</h3>
          {fileUrl && (
            <a href={fileUrl} target='_blank' rel='noopener noreferrer'>
              Open original ↗
            </a>
          )}
        </header>
        <p className='ew-preview-filename'>{file.name}</p>
        <div className='ew-preview-page' aria-busy={rendering}>
          {file.type === 'application/pdf' ? (
            <canvas
              ref={canvas}
              role='img'
              aria-label={`${file.name}, page ${page}`}
              hidden={!!previewError}
            />
          ) : (
            fileUrl && (
              // Keep employee-file blob previews in this browser, without an image proxy.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl}
                alt={`Preview of ${file.name}`}
                onError={() =>
                  setPreviewError(
                    'Preview unavailable. Open the original document.',
                  )
                }
              />
            )
          )}
          {rendering && <p role='status'>Loading preview…</p>}
          {previewError && <p role='status'>{previewError}</p>}
        </div>
        {pdf && pdf.numPages > 1 && (
          <nav className='ew-preview-pagination' aria-label='Document pages'>
            <button
              className='ob-button secondary'
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {pdf.numPages}
            </span>
            <button
              className='ob-button secondary'
              disabled={page === pdf.numPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
      <section
        className='ew-extracted-details'
        aria-label='Read from your document'
        aria-live='polite'
        aria-busy={processing}
      >
        <h3>Read from your document</h3>
        {processing ? (
          <p>Enterprise AI is reading your document…</p>
        ) : fields?.length ? (
          <>
            <p>Review these values against the original.</p>
            <dl>
              {fields.map((field, index) => (
                <div key={`${field.name}-${index}`}>
                  <dt>{field.name.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt>
                  <dd>
                    <strong>{field.value}</strong>
                    {field.confidence !== undefined && (
                      <span>
                        {Math.round(field.confidence * 100)}% confidence
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className='ew-muted'>
              {purpose === 'identity'
                ? 'Reading a document does not verify your identity.'
                : 'Reading a document does not approve it. Your employer must review the evidence.'}
            </p>
          </>
        ) : (
          <p>
            Select <strong>Read document</strong>. The document details will
            appear here.
          </p>
        )}
      </section>
    </div>
  );
}
