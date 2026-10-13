import { useId } from "react";
import FormError from "@/components/ui/form-error";

type FieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

type FieldProps = {
  label: string;
  isOptional?: boolean;
  help?: string;
  error?: string;
  children: (control: FieldControlProps) => React.ReactNode;
};

export default function Field({
  label,
  isOptional = false,
  help,
  error,
  children,
}: FieldProps): React.ReactNode {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy =
    [error && errorId, help && helpId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col">
      <label
        htmlFor={id}
        className="mb-1.5 text-[13px]/[18px] font-semibold text-fg"
      >
        {label}
        {isOptional && (
          <span className="font-normal text-fg-2"> (optional)</span>
        )}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error && <FormError id={errorId}>{error}</FormError>}
      {help && (
        <p id={helpId} className="mt-1.5 text-[13px]/5 text-fg-2">
          {help}
        </p>
      )}
    </div>
  );
}
