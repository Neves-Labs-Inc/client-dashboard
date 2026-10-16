import { useId } from "react";

type RadioCardOption<T extends string> = {
  value: T;
  label: string;
  // Decorative: the label carries the meaning.
  icon?: React.ReactNode;
};

type RadioCardGroupProps<T extends string> = {
  legend: string;
  name: string;
  value: T;
  options: RadioCardOption<T>[];
  onChange: (value: T) => void;
};

// Native radios inside label cards: they work before hydration, and the
// arrow keys move between them. The checked radio takes [data-autofocus], so
// a Drawer opens with focus on the group.
export default function RadioCardGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: RadioCardGroupProps<T>): React.ReactNode {
  const groupId = useId();

  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-1.5 text-[13px]/[18px] font-semibold text-fg">
        {legend}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const isChecked = option.value === value;
          return (
            <label
              key={option.value}
              htmlFor={`${groupId}-${option.value}`}
              className="flex h-11 cursor-pointer items-center gap-1.5 rounded-[3px] border border-line-input bg-bg px-3 text-[13px]/5 text-fg transition-[border-color,transform] duration-(--dur-instant) hover:border-fg-2 active:scale-[0.98] has-[:checked]:border-accent has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent motion-reduce:active:scale-100 md:h-9 pointer-coarse:h-11"
            >
              <input
                id={`${groupId}-${option.value}`}
                type="radio"
                name={name}
                value={option.value}
                checked={isChecked}
                onChange={() => onChange(option.value)}
                data-autofocus={isChecked || undefined}
                className="peer sr-only"
              />
              {option.icon}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
