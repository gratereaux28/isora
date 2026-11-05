import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2 } from 'lucide-react';
import { useI18n } from './LocaleProvider';
import type { Language, LanguageChoice, MessageKey } from './i18n';

const choices: { value: LanguageChoice; label: MessageKey }[] = [
  { value: 'auto', label: 'settings.language.automatic' },
  { value: 'es', label: 'settings.language.spanish' },
  { value: 'en', label: 'settings.language.english' },
];
function Flag({ language }: { language: Language }) {
  return language === 'es' ? (
    <svg
      className="language-flag"
      viewBox="0 0 28 20"
      aria-hidden="true"
      data-flag="es"
    >
      <path fill="#aa151b" d="M0 0h28v20H0z" />
      <path fill="#f1bf00" d="M0 5h28v10H0z" />
      <path fill="#aa151b" d="M7 8h4v4a2 2 0 0 1-4 0z" />
      <path fill="#f7e9c5" d="M8 9h2v3H8z" />
    </svg>
  ) : (
    <svg
      className="language-flag"
      viewBox="0 0 28 20"
      aria-hidden="true"
      data-flag="en"
    >
      <path fill="#012169" d="M0 0h28v20H0z" />
      <path stroke="#fff" strokeWidth="5" d="m0 0 28 20m0-20L0 20" />
      <path stroke="#c8102e" strokeWidth="2" d="m0 0 28 20m0-20L0 20" />
      <path stroke="#fff" strokeWidth="7" d="M14 0v20M0 10h28" />
      <path stroke="#c8102e" strokeWidth="4" d="M14 0v20M0 10h28" />
    </svg>
  );
}
export function LanguageSelect({
  value,
  onChange,
}: {
  value: LanguageChoice;
  onChange: (value: LanguageChoice) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const selected = choices.findIndex((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const icon = (choice: LanguageChoice) =>
    choice === 'auto' ? (
      <Globe2 size={18} aria-hidden="true" />
    ) : (
      <Flag language={choice} />
    );
  const choose = (index: number) => {
    setOpen(false);
    onChange(choices[index].value);
  };
  return (
    <div
      className="language-select"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        id="language-choice"
        type="button"
        role="combobox"
        aria-labelledby="language-choice-label"
        aria-controls="language-options"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-activedescendant={
          open ? `language-option-${choices[active].value}` : undefined
        }
        data-value={value}
        onClick={() => {
          setActive(selected);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              !open
                ? selected
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? choices.length - 1
                    : (index +
                        (event.key === 'ArrowDown' ? 1 : -1) +
                        choices.length) %
                      choices.length,
            );
          } else if (open && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            choose(active);
          } else if (open && event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'Tab') setOpen(false);
        }}
      >
        {icon(value)}
        <span>{t(choices[selected].label)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="language-options"
          id="language-options"
          role="listbox"
          aria-labelledby="language-choice-label"
        >
          {choices.map((choice, index) => (
            <div
              key={choice.value}
              id={`language-option-${choice.value}`}
              role="option"
              aria-selected={choice.value === value}
              className={active === index ? 'active' : ''}
              onPointerMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                choose(index);
                button.current?.focus();
              }}
            >
              {icon(choice.value)}
              <span>{t(choice.label)}</span>
              {choice.value === value && <Check size={14} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
