import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;
const LINK_PREFIX = "https://starview.invalid/open/";

type Props = { url: string; onOpen: (path: string) => void };
function Page({ pdf, number, width, themed, onOpen, onJump }: { pdf: PDFDocumentProxy; number: number; width: number; themed: boolean; onOpen: Props["onOpen"]; onJump: (page: number) => void }) {
  const article = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width, height: width * 1.414 });
  const [links, setLinks] = useState<{ id: string; path?: string; url?: string; page?: number; rect: number[]; label: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!article.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "600px" });
    observer.observe(article.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    let layer: TextLayer | undefined;
    setReady(false); setError(""); setLinks([]);
    void (async () => {
      const page = await pdf.getPage(number);
      if (cancelled || !canvas.current || !text.current) return;
      const scale = width / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const surface = canvas.current;
      surface.width = Math.floor(viewport.width * ratio); surface.height = Math.floor(viewport.height * ratio);
      setSize({ width: viewport.width, height: viewport.height });
      const context = surface.getContext("2d");
      if (!context) throw new Error("Unable to render this PDF");
      const style = getComputedStyle(surface);
      const background = style.getPropertyValue("--document-background").trim() || "#191d26";
      const foreground = style.getPropertyValue("--document-foreground").trim() || "#e4e8f1";
      render = page.render({ canvas: surface, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0], ...(themed ? { pageColors: { background, foreground } } : {}) });
      await render.promise;
      if (cancelled || !text.current) return;
      text.current.replaceChildren();
      text.current.style.setProperty("--total-scale-factor", String(scale));
      text.current.style.setProperty("--scale-round-x", "1px");
      text.current.style.setProperty("--scale-round-y", "1px");
      layer = new TextLayer({ textContentSource: await page.getTextContent(), container: text.current, viewport });
      await layer.render();
      const annotations = await page.getAnnotations();
      if (cancelled) return;
      const targets = await Promise.all(annotations.map(async item => {
        const rect = [...viewport.convertToViewportPoint(item.rect[0], item.rect[1]), ...viewport.convertToViewportPoint(item.rect[2], item.rect[3])];
        if (typeof item.url === "string" && item.url.startsWith(LINK_PREFIX)) {
          const path = decodeURIComponent(item.url.slice(LINK_PREFIX.length));
          return { id: item.id, path, rect, label: `Open ${path}` };
        }
        if (typeof item.url === "string" && /^https?:\/\//.test(item.url)) return { id: item.id, url: item.url, rect, label: item.url };
        if (item.dest) {
          try {
            const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
            if (destination?.[0] !== undefined) {
              const page = (typeof destination[0] === "number" ? destination[0] : await pdf.getPageIndex(destination[0])) + 1;
              return { id: item.id, page, rect, label: `Go to page ${page}` };
            }
          } catch { /* Unresolvable PDF destinations remain plain text. */ }
        }
        return null;
      }));
      if (!cancelled) { setLinks(targets.filter(item => item !== null)); setReady(true); }
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not render this page"); });
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); };
  }, [pdf, number, width, themed, visible]);
  return <article ref={article} data-page={number} className={`pdf-page ${ready ? "page-ready" : "page-loading"} ${themed ? "themed" : "original"}`} aria-label={`Page ${number}`} style={{ width: visible ? size.width : width, height: visible ? size.height : width * 1.414 }}>
    {!ready && !error && <div className="page-skeleton" role="status"><span className="loading-orbit"/><span>Rendering page {number}…</span></div>}
    <canvas ref={canvas} style={{ width: size.width, height: size.height }} aria-label={`Rendered PDF page ${number}`} />
    <div ref={text} className="textLayer" />
    <div className="pdf-links">{links.map(link => {
      const [x1, y1, x2, y2] = link.rect;
      const style = { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
      return link.url ? <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={link.label} title={link.label} style={style} /> : <button key={link.id} aria-label={link.label} title={link.label} style={style} onClick={() => { if (link.path) onOpen(link.path); else if (link.page) onJump(link.page); }} />;
    })}</div>
    {error && <p className="error" role="alert">{error}</p>}
  </article>;
}
export default function PdfPreview({ url, onOpen }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(350);
  const [error, setError] = useState("");
  const [themed, setThemed] = useState(true);
  useEffect(() => {
    const task = getDocument({ url });
    let active = true;
    setPdf(null); setError("");
    task.promise.then(document => { if (active) setPdf(document); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load this PDF"); });
    return () => { active = false; void task.destroy(); };
  }, [url]);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(160, Math.min(760, Math.floor(entries[0].contentRect.width)))));
    observer.observe(target); return () => observer.disconnect();
  }, []);
  return <div className="pdf-reader" ref={container}>
    {error ? <p className="error" role="alert">{error}</p> : !pdf ? <div className="document-skeleton" role="status"><span className="loading-orbit"/>Opening document…<div className="skeleton-lines"/></div> : <>
      <div className="reader-caption"><span>{pdf.numPages} {pdf.numPages === 1 ? "page" : "pages"}</span><button aria-pressed={!themed} onClick={() => setThemed(!themed)}>{themed ? "Original colors" : "Match workspace"}</button></div>
      {Array.from({ length: pdf.numPages }, (_, index) => <Page key={index} pdf={pdf} number={index + 1} width={width} themed={themed} onOpen={onOpen} onJump={page => container.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })} />)}
    </>}
  </div>;
}
