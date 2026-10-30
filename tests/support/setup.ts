// jsdom lacks the modal <dialog> methods UiDialog uses; this gives it the same open/close state a browser has.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.show ??= HTMLDialogElement.prototype.showModal
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement, value?: string) {
    this.removeAttribute('open')
    if (value !== undefined) this.returnValue = value
    this.dispatchEvent(new Event('close'))
  }
}
