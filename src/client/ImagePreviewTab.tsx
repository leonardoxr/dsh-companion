// Images tab: optional dsh-better-sidebar integration.
//
// Soft dependency by design: this module never imports dsh-better-sidebar at
// runtime or build time. When the sidebar plugin is present its client half
// publishes the 'betterSidebar' Cordis service; we restate the minimal tab
// registration contract locally (the documented soft-dependency pattern) so
// the tab simply disappears when the sidebar is absent.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'

export const IMAGE_PREVIEW_TAB_ID = 'dsh-companion:image-preview'

/** Structural view of one durable image reference found in the folded session log. */
interface PreviewImage {
  readonly attachmentId: string
  readonly mediaType: string
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly name?: string
}

/** Local restatement of the slice of the better-sidebar tab contract we use. */
interface SidebarTabDescriptor {
  id: string
  title: string | (() => string)
  order?: number
  single?: boolean
  component: (props: ImagePreviewTabProps) => ReactNode
}

interface SidebarServiceLike {
  registerTab(descriptor: SidebarTabDescriptor): () => void
}

/** Props better-sidebar hands every registered tab component. */
export interface ImagePreviewTabProps {
  ctx: Context
  scope: { readonly sessionId: string }
  visible: boolean
}

/** Structural slice of the session face we consume (snapshot + readAttachment). */
interface SessionFaceLike {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
  readAttachment(attachmentId: string): Promise<
    { ok: true; value: { attachment: PreviewImage; data: Uint8Array } } |
    { ok: false; error: { code: string; message: string } }
  >
}

type CacheEntry =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string }

const EMPTY_SNAPSHOT: unknown = { nodes: [] }

/** Read the optional sidebar service off the context without a hard dependency. */
export function sidebarOf(ctx: Context): SidebarServiceLike | undefined {
  const candidate = (ctx as { betterSidebar?: unknown }).betterSidebar
  if (!candidate || typeof candidate !== 'object') return undefined
  if (typeof (candidate as SidebarServiceLike).registerTab !== 'function') return undefined
  return candidate as SidebarServiceLike
}

function isAttachmentRef(value: unknown): value is PreviewImage {
  return typeof value === 'object' && value !== null
    && typeof (value as PreviewImage).attachmentId === 'string'
}

/** Content-block image arm (user/steering/context/tool-result content). */
function asContentImageBlock(value: unknown): PreviewImage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if ((value as { type?: unknown }).type !== 'image') return undefined
  const attachment = (value as { attachment?: unknown }).attachment
  return isAttachmentRef(attachment) ? attachment : undefined
}

/**
 * Collect unique image attachments from one conversation snapshot, in
 * timeline order: user/steering/context content blocks, assistant image
 * blocks, and tool-result content (e.g. a read_image tool result).
 */
export function collectPreviewImages(snapshot: unknown): PreviewImage[] {
  const nodes = (snapshot as { nodes?: unknown } | null | undefined)?.nodes
  if (!Array.isArray(nodes)) return []
  const seen = new Set<string>()
  const images: PreviewImage[] = []
  const record = (attachment: unknown): void => {
    if (!isAttachmentRef(attachment)) return
    if (seen.has(attachment.attachmentId)) return
    seen.add(attachment.attachmentId)
    images.push(attachment)
  }
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const kind = (node as { kind?: unknown }).kind
    if (kind === 'assistant') {
      const blocks = (node as { blocks?: unknown }).blocks
      if (!Array.isArray(blocks)) continue
      for (const block of blocks) {
        if (typeof block === 'object' && block !== null && (block as { kind?: unknown }).kind === 'image') {
          record((block as { attachment?: unknown }).attachment)
        }
      }
    } else if (kind === 'user' || kind === 'steering' || kind === 'context' || kind === 'tool-result') {
      const content = (node as { content?: unknown }).content
      if (!Array.isArray(content)) continue
      for (const block of content) record(asContentImageBlock(block))
    }
  }
  return images
}

function formatDimensions(image: PreviewImage): string {
  return image.width > 0 && image.height > 0
    ? String(image.width) + '\u00d7' + String(image.height)
    : '\u2014'
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '\u2014'
  if (bytes < 1024) return String(bytes) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** Copy RPC bytes into an exact-size ArrayBuffer accepted by Blob in every TS lib. */
function toBlobPart(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export function ImagePreviewTab({ ctx, scope, visible }: ImagePreviewTabProps) {
  const session = useMemo<SessionFaceLike | null>(() => {
    const sessions = (ctx as { sessions?: { binding?(sessionId: string): { session: SessionFaceLike } | undefined } }).sessions
    return sessions?.binding?.(scope.sessionId)?.session ?? null
  }, [ctx, scope.sessionId])

  const subscribe = useCallback(
    (listener: () => void) => session?.subscribe(listener) ?? (() => {}),
    [session],
  )
  const getSnapshot = useCallback(() => session?.getSnapshot() ?? EMPTY_SNAPSHOT, [session])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const images = useMemo(() => collectPreviewImages(snapshot), [snapshot])
  const imagesRef = useRef(images)
  imagesRef.current = images
  const imageKey = images.map(image => image.attachmentId).join('\n')

  const cacheRef = useRef(new Map<string, CacheEntry>())
  const [, bump] = useReducer(count => count + 1, 0)
  const [selectedId, setSelectedId] = useState<string>()
  const [retryTick, setRetryTick] = useState(0)

  // Release blob URLs when the session face changes or the tab unmounts.
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      for (const entry of cache.values()) if (entry.status === 'ready') URL.revokeObjectURL(entry.url)
      cache.clear()
    }
  }, [session])

  // Fetch missing attachments lazily while the tab is visible.
  useEffect(() => {
    if (!session || !visible) return
    const pending = imagesRef.current.filter(image => !cacheRef.current.has(image.attachmentId))
    if (pending.length === 0) return
    let cancelled = false
    for (const image of pending) cacheRef.current.set(image.attachmentId, { status: 'loading' })
    bump()
    void Promise.all(pending.map(async image => {
      try {
        const result = await session.readAttachment(image.attachmentId)
        if (cancelled) return
        if (result.ok) {
          const mediaType = result.value.attachment.mediaType || 'image/png'
          const url = URL.createObjectURL(new Blob([toBlobPart(result.value.data)], { type: mediaType }))
          cacheRef.current.set(image.attachmentId, { status: 'ready', url })
        } else {
          cacheRef.current.set(image.attachmentId, { status: 'error', message: result.error.message })
        }
      } catch (cause) {
        if (cancelled) return
        cacheRef.current.set(image.attachmentId, { status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      }
      if (!cancelled) bump()
    }))
    return () => { cancelled = true }
  }, [session, visible, imageKey, retryTick])

  // Close the lightbox on Escape.
  useEffect(() => {
    if (selectedId === undefined) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setSelectedId(undefined) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  const retry = useCallback(() => {
    for (const [id, entry] of cacheRef.current) if (entry.status === 'error') cacheRef.current.delete(id)
    setRetryTick(tick => tick + 1)
  }, [])

  if (!session) {
    return <div className="dsc-img-tab"><div className="dsc-img-empty">Select a conversation to browse its images.</div></div>
  }
  if (images.length === 0) {
    return (
      <div className="dsc-img-tab">
        <div className="dsc-img-empty">
          <b>No images yet</b>
          <span>Attachments you send and images the model reads appear here.</span>
        </div>
      </div>
    )
  }

  const selectedEntry = selectedId !== undefined ? cacheRef.current.get(selectedId) : undefined
  const selectedImage = selectedId !== undefined ? images.find(image => image.attachmentId === selectedId) : undefined

  return (
    <div className="dsc-img-tab">
      <div className="dsc-img-count">{images.length} image{images.length === 1 ? '' : 's'} in this conversation</div>
      <div className="dsc-img-grid">
        {images.map(image => {
          const entry = cacheRef.current.get(image.attachmentId)
          return (
            <figure
              className="dsc-img-tile"
              key={image.attachmentId}
              onClick={() => { if (entry?.status === 'ready') setSelectedId(image.attachmentId) }}
            >
              {entry?.status === 'ready'
                ? <img className="dsc-img-thumb" src={entry.url} alt={image.name || 'Image attachment'} loading="lazy" draggable={false} />
                : (
                  <div className={'dsc-img-thumb ' + (entry?.status === 'error' ? 'dsc-img-broken' : 'dsc-img-loading')}>
                    {entry?.status === 'error'
                      ? <span title={entry.message} onClick={event => { event.stopPropagation(); retry() }}>Retry</span>
                      : <span>Loading...</span>}
                  </div>
                )}
              <figcaption className="dsc-img-meta">
                <span>{image.name || 'Image'}</span>
                <span>{formatDimensions(image) + ' \u00b7 ' + formatBytes(image.bytes)}</span>
              </figcaption>
            </figure>
          )
        })}
      </div>
      {selectedId !== undefined && selectedEntry?.status === 'ready' && (
        <div className="dsc-img-lightbox" role="dialog" aria-modal="true" onClick={() => setSelectedId(undefined)}>
          <div className="dsc-img-lightbox-bar">
            <span>
              {selectedImage
                ? (selectedImage.name || 'Image') + ' \u2014 ' + formatDimensions(selectedImage) + ' \u00b7 ' + formatBytes(selectedImage.bytes)
                : ''}
            </span>
            <button className="dsc-img-close" type="button" onClick={() => setSelectedId(undefined)}>Close</button>
          </div>
          <img
            src={selectedEntry.url}
            alt={selectedImage?.name || 'Image attachment'}
            draggable={false}
            onClick={event => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

const STYLE_ID = 'dsh-companion/image-preview'
const STYLE_LINES = [
  '.dsc-img-tab{box-sizing:border-box;height:100%;overflow:auto;padding:14px;color:var(--dsw-alias-label-primary,#111);font-size:13px;line-height:18px}',
  '.dsc-img-tab *{box-sizing:border-box}',
  '.dsc-img-count{margin-bottom:10px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}',
  '.dsc-img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}',
  '.dsc-img-tile{margin:0;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-elevated,#fff);cursor:pointer;display:flex;flex-direction:column;min-width:0}',
  '.dsc-img-tile:hover{border-color:var(--dsw-alias-accent-primary,#4c7dff)}',
  '.dsc-img-thumb{width:100%;height:112px;display:block;object-fit:cover;background:var(--dsw-alias-bg-layer-2,#f3f3f3)}',
  '.dsc-img-thumb.dsc-img-loading,.dsc-img-thumb.dsc-img-broken{display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#888);font-size:11px;text-align:center;padding:6px}',
  '.dsc-img-thumb.dsc-img-broken{cursor:pointer;color:var(--dsw-alias-label-danger,#d44)}',
  '.dsc-img-meta{display:flex;flex-direction:column;gap:1px;padding:6px 8px;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));font-size:11px;color:var(--dsw-alias-label-secondary,#555)}',
  '.dsc-img-meta span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;color:inherit}',
  '.dsc-img-empty{display:flex;flex-direction:column;gap:4px;align-items:flex-start;margin-top:32px;color:var(--dsw-alias-label-tertiary,#777)}',
  '.dsc-img-empty b{color:var(--dsw-alias-label-primary,#111);font-size:14px}',
  '.dsc-img-lightbox{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.74);padding:44px 20px 24px;display:flex;align-items:center;justify-content:center}',
  '.dsc-img-lightbox img{max-width:min(1100px,100%);max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,.55)}',
  '.dsc-img-lightbox-bar{position:absolute;top:12px;left:18px;right:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff;font-size:12px}',
  '.dsc-img-close{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;border-radius:7px;padding:5px 12px;font-size:12px;cursor:pointer}',
  '.dsc-img-close:hover{background:rgba(255,255,255,.22)}',
]

/**
 * Register the Images tab when the optional dsh-better-sidebar service is
 * present; styles live and die with the registration effect (HMR-safe).
 */
export function registerImagePreviewTab(ctx: Context): void {
  const sidebar = sidebarOf(ctx)
  if (!sidebar) return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-companion'
    tag.dataset.pluginCss = STYLE_ID
    tag.textContent = STYLE_LINES.join('\n')
    document.head.append(tag)
    const disposeTab = sidebar.registerTab({
      id: IMAGE_PREVIEW_TAB_ID,
      title: () => 'Images',
      order: 55,
      single: true,
      component: ImagePreviewTab,
    })
    return () => {
      disposeTab()
      tag.remove()
    }
  }, 'dsh-companion: image preview tab')
}
