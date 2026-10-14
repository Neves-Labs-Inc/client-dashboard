import { useId } from "react";
import Select from "@/components/ui/select";
import type { ClientStatus, Mapping } from "@/lib/board-sync/board-sync";
import type { PmStatusOption } from "@/lib/pm-source/pm-source";
import {
  CLIENT_STATUS_LABEL,
  CLIENT_STATUSES,
  LINK_COPY,
  MAPPING_FIELD_PREFIX,
} from "@/lib/link-board";

const UNMAPPED_VALUE = "";

type ColumnMappingListProps = {
  options: PmStatusOption[];
  mapping: Mapping;
  onChange: (optionId: string, status: ClientStatus | null) => void;
  disabled?: boolean;
};

// The Columns fieldset's body: the helper text and one row per Status
// option (its name labelling a client-status select), or the no-Status
// line. It doesn't fetch, so any drawer can use it.
export default function ColumnMappingList({
  options,
  mapping,
  onChange,
  disabled = false,
}: ColumnMappingListProps): React.ReactNode {
  const idPrefix = useId();
  if (options.length === 0) {
    return (
      <p className="text-[13px]/5 text-fg-2">{LINK_COPY.noStatusColumn}</p>
    );
  }

  return (
    <>
      <ColumnMappingHelp />
      <div className="mt-3 flex flex-col gap-2">
        {options.map((option, index) => {
          const id = `${idPrefix}-${index}`;
          return (
            <div
              key={option.id}
              className="grid min-h-11 grid-cols-[minmax(0,1fr)_160px] items-center gap-3 md:min-h-9"
            >
              <label
                htmlFor={id}
                className="text-[13px]/5 wrap-anywhere text-fg"
              >
                {option.name}
              </label>
              <Select
                id={id}
                name={`${MAPPING_FIELD_PREFIX}${option.id}`}
                value={mapping[option.id] ?? UNMAPPED_VALUE}
                disabled={disabled}
                onChange={(event) =>
                  onChange(option.id, toClientStatus(event.target.value))
                }
              >
                <option value={UNMAPPED_VALUE}>Unmapped</option>
                {CLIENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CLIENT_STATUS_LABEL[status]}
                  </option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Also shown, alone, while the options load.
export function ColumnMappingHelp(): React.ReactNode {
  return <p className="text-[13px]/5 text-fg-2">{LINK_COPY.helper}</p>;
}

function toClientStatus(value: string): ClientStatus | null {
  return CLIENT_STATUSES.find((status) => status === value) ?? null;
}
