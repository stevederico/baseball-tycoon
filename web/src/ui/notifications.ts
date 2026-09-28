export type NotificationTone = 'info' | 'success' | 'warning' | 'error'

export interface NotificationItem {
  id: number
  message: string
  tone: NotificationTone
  time: number
  read: boolean
}

const MAX_TOASTS = 3
const MAX_INBOX = 40
const AUTO_DISMISS_MS = 5000

export function inferTone(message: string): NotificationTone {
  const lower = message.toLowerCase()
  if (/bankrupt|in the red|not enough|need \$|cannot|nothing to|fell short|will not lend/.test(lower)) return 'error'
  if (/^loss|fans say|ran out of cash|already|needs the|has to stay|nothing can be built|beyond the fence/.test(lower)) return 'warning'
  if (/^win|complete|built|signed|hired|borrowed|repaid|saved|is on!|turned/.test(lower)) return 'success'
  return 'info'
}

export class NotificationCenter {
  private readonly toastStack: HTMLElement
  private readonly inboxList: HTMLElement
  private readonly inboxPanel: HTMLElement
  private readonly badge: HTMLElement
  private readonly bellBtn: HTMLButtonElement
  private readonly items: NotificationItem[] = []
  private nextId = 1
  private inboxOpen = false

  constructor(
    toastStack: HTMLElement,
    inboxList: HTMLElement,
    inboxPanel: HTMLElement,
    badge: HTMLElement,
    bellBtn: HTMLButtonElement,
  ) {
    this.toastStack = toastStack
    this.inboxList = inboxList
    this.inboxPanel = inboxPanel
    this.badge = badge
    this.bellBtn = bellBtn

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.toggleInbox()
    })

    document.querySelector('#notif-clear')?.addEventListener('click', () => this.clearInbox())

    document.addEventListener('click', (e) => {
      if (!this.inboxOpen) return
      const target = e.target
      if (!(target instanceof Node)) return
      if (!this.inboxPanel.contains(target) && !this.bellBtn.contains(target)) {
        this.closeInbox()
      }
    })
  }

  push(message: string, tone?: NotificationTone, options?: { toast?: boolean }): void {
    if (!message) return
    const resolved = tone ?? inferTone(message)
    const item: NotificationItem = {
      id: this.nextId++,
      message,
      tone: resolved,
      time: Date.now(),
      read: this.inboxOpen,
    }
    this.items.unshift(item)
    if (this.items.length > MAX_INBOX) this.items.length = MAX_INBOX

    this.renderInbox()
    this.updateBadge()

    if (options?.toast !== false) this.showToast(item)
  }

  /** Replace the inbox with a season's saved news, without popping toasts. */
  reset(messages: string[]): void {
    this.items.length = 0
    this.toastStack.innerHTML = ''
    messages.slice(0, MAX_INBOX).forEach((message, i) => {
      this.items.push({
        id: this.nextId++,
        message,
        tone: inferTone(message),
        time: Date.now() - i * 1000,
        read: true,
      })
    })
    this.renderInbox()
    this.updateBadge()
  }

  toggleInbox(): void {
    if (this.inboxOpen) this.closeInbox()
    else this.openInbox()
  }

  private openInbox(): void {
    this.inboxOpen = true
    this.inboxPanel.classList.remove('hidden')
    this.bellBtn.classList.add('active')
    for (const item of this.items) item.read = true
    this.updateBadge()
    this.renderInbox()
  }

  private closeInbox(): void {
    this.inboxOpen = false
    this.inboxPanel.classList.add('hidden')
    this.bellBtn.classList.remove('active')
  }

  private clearInbox(): void {
    this.items.length = 0
    this.renderInbox()
    this.updateBadge()
  }

  private updateBadge(): void {
    const unread = this.items.filter((i) => !i.read).length
    if (unread > 0) {
      this.badge.textContent = unread > 9 ? '9+' : String(unread)
      this.badge.classList.remove('hidden')
    } else {
      this.badge.classList.add('hidden')
    }
  }

  private renderInbox(): void {
    if (this.items.length === 0) {
      this.inboxList.innerHTML = '<div class="notif-empty">No news yet.</div>'
      return
    }
    this.inboxList.innerHTML = this.items
      .map(
        (item) => `<div class="notif-inbox-item notif-inbox-${item.tone}${item.read ? '' : ' unread'}">
          <span class="notif-inbox-icon">${iconFor(item.tone)}</span>
          <span class="notif-inbox-text">${escapeHtml(item.message)}</span>
        </div>`,
      )
      .join('')
  }

  private showToast(item: NotificationItem): void {
    const el = document.createElement('div')
    el.className = `notification notification-${item.tone}`
    el.innerHTML = `
      <span class="notification-icon">${iconFor(item.tone)}</span>
      <span class="notification-text">${escapeHtml(item.message)}</span>
      <button type="button" class="notification-close" aria-label="Dismiss">×</button>
    `

    const dismiss = () => this.removeToast(el)
    el.querySelector('.notification-close')?.addEventListener('click', dismiss)

    this.toastStack.prepend(el)
    const toasts = this.toastStack.querySelectorAll('.notification')
    // Phones have room for one pop-up at a time.
    const limit = window.matchMedia('(max-width: 760px)').matches ? 1 : MAX_TOASTS
    if (toasts.length > limit) {
      toasts[toasts.length - 1]?.remove()
    }

    requestAnimationFrame(() => el.classList.add('show'))
    window.setTimeout(() => {
      if (el.isConnected) dismiss()
    }, AUTO_DISMISS_MS)
  }

  private removeToast(el: HTMLElement): void {
    el.classList.remove('show')
    el.classList.add('hide')
    window.setTimeout(() => el.remove(), 280)
  }
}

function iconFor(tone: NotificationTone): string {
  switch (tone) {
    case 'success': return '✓'
    case 'warning': return '!'
    case 'error': return '✕'
    default: return '●'
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}