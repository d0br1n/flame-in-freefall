"use client";

// A dropdown that picks one option (the pattern of a select-only combobox): a pill button that
// opens a listbox popover. Keyboard: Enter, Space or the arrows open it; the arrows move; Enter
// or Space picks; Escape or Tab closes and gives focus back to the button. Each option can carry
// a second, quieter line.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export function Select({
  label,
  options,
  value,
  onChange,
  icon,
  buttonContent,
  className = "",
  menuClassName = "",
  testId,
  disabled = false,
}: {
  /** The accessible name of the control ("Cabin air"). */
  label: string;
  options: readonly SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  icon?: IconName;
  /** What the closed button shows; defaults to the chosen option's label. */
  buttonContent?: ReactNode;
  className?: string;
  menuClassName?: string;
  testId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const chosenIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const chosen = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  function show() {
    setActive(chosenIndex);
    setOpen(true);
  }

  function close(focusButton: boolean) {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }

  function pick(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    close(true);
  }

  function onButtonKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show();
    }
  }

  function onListKey(event: KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(last, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(last);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className={`relative min-w-0 ${className}`} data-testid={testId} data-value={value ?? ""}>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${chosen?.label ?? "none"}`}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={onButtonKey}
        className="inline-flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface pl-3 pr-3.5 text-[14px] font-semibold text-ink transition-colors duration-150 hover:border-control disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-11"
      >
        {icon ? <Icon name={icon} size="sm" className="text-ink-2" /> : null}
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">{buttonContent ?? chosen?.label ?? label}</span>
        <Icon name="chevron-down" size="sm" className={`text-ink-2 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
          className={`absolute right-0 top-[calc(100%+6px)] z-40 w-[20rem] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-1.5 shadow-pop outline-none ${menuClassName}`}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-value={option.value}
              onPointerEnter={() => setActive(index)}
              onClick={() => pick(index)}
              className={`grid cursor-pointer gap-0.5 rounded-sm px-3 py-2.5 ${index === active ? "bg-surface-sunk" : ""}`}
            >
              <span className="flex items-center justify-between gap-2 text-[14px] font-semibold text-ink">
                {option.label}
                {option.value === value ? <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" /> : null}
              </span>
              {option.hint ? <span className="text-[13px] leading-[16px] text-ink-2">{option.hint}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
