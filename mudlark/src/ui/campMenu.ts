// The camp menu: repair, fast travel and the garage (vehicles, upgrades, paint).
// It is a normal in-page dialog; the game passes in what to show and what to
// do when a button is clicked.

export interface MenuItem {
  title: string;
  detail: string;
  /** Text on the button, or null for no button (for example "installed"). */
  action: string | null;
  disabled?: boolean;
  onClick?: () => void;
}
export interface MenuSection {
  heading: string;
  items: MenuItem[];
}

export class CampMenu {
  private body: HTMLElement;
  private title: HTMLElement;
  onClose: () => void = () => {};

  constructor(private element: HTMLElement) {
    this.body = element.querySelector('.menu-body')!;
    this.title = element.querySelector('h2')!;
    element.querySelector('.menu-close')!.addEventListener('click', () => this.close());
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  open(title: string, sections: MenuSection[]): void {
    this.title.textContent = title;
    this.body.replaceChildren();
    for (const section of sections) {
      const h = document.createElement('h3');
      h.textContent = section.heading;
      this.body.append(h);
      for (const item of section.items) {
        const row = document.createElement('div');
        row.className = 'menu-row';
        const text = document.createElement('div');
        text.className = 'menu-text';
        const strong = document.createElement('strong');
        strong.textContent = item.title;
        const small = document.createElement('span');
        small.textContent = item.detail;
        text.append(strong, small);
        row.append(text);
        if (item.action) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = item.action;
          button.disabled = !!item.disabled;
          button.addEventListener('click', () => item.onClick?.());
          row.append(button);
        }
        this.body.append(row);
      }
    }
    this.element.hidden = false;
    document.exitPointerLock?.();
  }

  close(): void {
    if (!this.visible) return;
    this.element.hidden = true;
    this.onClose();
  }
}
