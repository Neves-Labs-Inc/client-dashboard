import Field from "@/components/ui/field";
import FormError from "@/components/ui/form-error";
import Input from "@/components/ui/input";
import Panel from "@/components/ui/panel";

export default function DevFieldsPanel(): React.ReactNode {
  return (
    <Panel id="fields" title="Fields">
      <div className="flex max-w-sm flex-col gap-4 p-3">
        <Field label="Name">
          {(control) => <Input {...control} defaultValue="Acme Co" />}
        </Field>
        <Field label="Website" isOptional help="Shown to the Client.">
          {(control) => <Input {...control} placeholder="example.com" />}
        </Field>
        <Field label="Email" error="Enter a valid email.">
          {(control) => <Input {...control} defaultValue="not-an-email" />}
        </Field>
        <Field label="Locked">
          {(control) => <Input {...control} defaultValue="Disabled" disabled />}
        </Field>
        <FormError variant="banner">Couldn&apos;t save. Try again.</FormError>
      </div>
    </Panel>
  );
}
